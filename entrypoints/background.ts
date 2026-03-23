import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import type {
  SupabaseMessage,
  SupabaseResponse,
  Filter,
  TableName,
} from '@/lib/supabase/messages';
import { invalidateTable, writeCache, cacheKey, queryFingerprint } from '@/lib/supabase/cache';
import { capture, getDistinctId } from '@/lib/posthog';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// ── Supabase client (background-only) ───────────────────────────────

const extensionStorage = {
  async getItem(key: string): Promise<string | null> {
    const result = await browser.storage.local.get(key);
    return (result[key] as string) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    await browser.storage.local.set({ [key]: value });
  },
  async removeItem(key: string): Promise<void> {
    await browser.storage.local.remove(key);
  },
};

let client: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (client) return client;
  client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: extensionStorage,
      detectSessionInUrl: false,
      autoRefreshToken: true,
      persistSession: true,
    },
  });
  return client;
}

// ── Generic query builder ───────────────────────────────────────────

function applyFilters(
  query: any,
  filters?: Filter[],
): any {
  if (!filters) return query;
  for (const f of filters) {
    switch (f.op) {
      case 'eq': query = query.eq(f.column, f.value); break;
      case 'neq': query = query.neq(f.column, f.value); break;
      case 'gt': query = query.gt(f.column, f.value); break;
      case 'gte': query = query.gte(f.column, f.value); break;
      case 'lt': query = query.lt(f.column, f.value); break;
      case 'lte': query = query.lte(f.column, f.value); break;
      case 'in': query = query.in(f.column, f.value as unknown[]); break;
      case 'is': query = query.is(f.column, f.value); break;
      case 'like': query = query.like(f.column, f.value as string); break;
      case 'ilike': query = query.ilike(f.column, f.value as string); break;
    }
  }
  return query;
}

async function handleQuery(msg: Extract<SupabaseMessage, { type: 'bl-sb:query' }>): Promise<SupabaseResponse> {
  const supabase = getSupabase();
  let query = supabase.from(msg.table).select(msg.select ?? '*');
  query = applyFilters(query, msg.filters);
  if (msg.order) {
    query = query.order(msg.order.column, { ascending: msg.order.ascending ?? true });
  }
  if (msg.limit) {
    query = query.limit(msg.limit);
  }
  if (msg.single) {
    query = query.single();
  }

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

async function handleMutate(msg: Extract<SupabaseMessage, { type: 'bl-sb:mutate' }>): Promise<SupabaseResponse> {
  const supabase = getSupabase();
  let query: any;

  switch (msg.method) {
    case 'insert':
      query = supabase.from(msg.table).insert(msg.data!);
      break;
    case 'update':
      query = applyFilters(supabase.from(msg.table).update(msg.data!), msg.filters);
      break;
    case 'upsert':
      query = supabase.from(msg.table).upsert(msg.data!);
      break;
    case 'delete':
      query = applyFilters(supabase.from(msg.table).delete(), msg.filters);
      break;
  }

  const { data, error } = await query.select();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

async function handleRpc(msg: Extract<SupabaseMessage, { type: 'bl-sb:rpc' }>): Promise<SupabaseResponse> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc(msg.fn as string, msg.args);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

// ── Realtime subscriptions ──────────────────────────────────────────

const activeChannels = new Map<string, ReturnType<SupabaseClient['channel']>>();

function handleSubscribe(msg: Extract<SupabaseMessage, { type: 'bl-sb:subscribe' }>): SupabaseResponse {
  if (activeChannels.has(msg.channel)) {
    return { ok: true };
  }

  const supabase = getSupabase();
  const channel = supabase
    .channel(msg.channel)
    .on(
      'postgres_changes',
      {
        event: msg.event ?? '*',
        schema: 'public',
        table: msg.table,
        filter: msg.filter,
      },
      (_payload) => {
        // Invalidate cache for this table — storage.onChanged will notify content scripts
        invalidateTable(msg.schoolId, msg.table).catch(() => {});
      },
    )
    .subscribe();

  activeChannels.set(msg.channel, channel);
  return { ok: true };
}

function handleUnsubscribe(msg: Extract<SupabaseMessage, { type: 'bl-sb:unsubscribe' }>): SupabaseResponse {
  const channel = activeChannels.get(msg.channel);
  if (channel) {
    const supabase = getSupabase();
    supabase.removeChannel(channel);
    activeChannels.delete(msg.channel);
  }
  return { ok: true };
}

// ── Auth logic ──────────────────────────────────────────────────────

const LOCK_KEY = 'bl-supabase-auth-lock';
const FAILURES_KEY = 'bl-supabase-auth-failures';
const REAUTH_KEY = 'bl-supabase-needs-reauth';
const LOCK_TTL_MS = 30_000; // 30s — edge function should finish well within this

interface FailureState { count: number; lastAttempt: number }

function getBackoffMs(failures: number): number {
  if (failures <= 0) return 0;
  if (failures === 1) return 15_000;      // 15s
  if (failures === 2) return 60_000;      // 1 min
  if (failures === 3) return 5 * 60_000;  // 5 min
  return 15 * 60_000;                     // 15 min cap
}

async function getFailures(): Promise<FailureState> {
  const result = await browser.storage.local.get(FAILURES_KEY);
  return (result[FAILURES_KEY] as FailureState) ?? { count: 0, lastAttempt: 0 };
}

async function setFailures(state: FailureState): Promise<void> {
  await browser.storage.local.set({ [FAILURES_KEY]: state });
}

async function isLocked(): Promise<boolean> {
  const result = await browser.storage.local.get(LOCK_KEY);
  const lockTime = result[LOCK_KEY] as number | undefined;
  if (!lockTime) return false;
  return Date.now() - lockTime < LOCK_TTL_MS;
}

async function setLock(): Promise<void> {
  await browser.storage.local.set({ [LOCK_KEY]: Date.now() });
}

async function clearLock(): Promise<void> {
  await browser.storage.local.remove(LOCK_KEY);
}

async function triggerSupabaseAuth(qrId: string, userId: string, schoolId?: string): Promise<{ success: boolean; error?: string }> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/verify-lectio-auth`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ qrId, userId, schoolId }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    return { success: false, error: `Serverfejl: ${body}` };
  }

  const { tokenHash, error } = await resp.json();
  if (error || !tokenHash) {
    return { success: false, error: error || 'Ingen token modtaget.' };
  }

  const supabase = getSupabase();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  if (verifyError) {
    return { success: false, error: verifyError.message };
  }

  return { success: true };
}

async function ensureSupabaseSession(qrData?: { qrId: string; userId: string }, schoolId?: string): Promise<SupabaseResponse> {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    if (data.session?.expires_at && data.session.expires_at > Date.now() / 1000 + 300) {
      await browser.storage.local.remove(REAUTH_KEY);
      return { ok: true, session: { expires_at: data.session.expires_at } };
    }

    if (!qrData) {
      return { ok: false, error: 'No QR data provided and session expired.' };
    }

    const reauthResult = await browser.storage.local.get(REAUTH_KEY);
    const needsReauth = !!reauthResult[REAUTH_KEY];

    if (!needsReauth) {
      const failures = await getFailures();
      const backoff = getBackoffMs(failures.count);
      if (backoff > 0 && Date.now() - failures.lastAttempt < backoff) {
        return { ok: false, error: 'Backoff active.' };
      }
    }

    // If another auth attempt is in progress, wait for it to finish
    // instead of immediately giving up (handles page reload during auth)
    if (await isLocked()) {
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2000));
        // Check if the other attempt succeeded
        const { data: checkData } = await supabase.auth.getSession();
        if (checkData.session?.expires_at && checkData.session.expires_at > Date.now() / 1000 + 300) {
          return { ok: true, session: { expires_at: checkData.session.expires_at } };
        }
        if (!(await isLocked())) break; // lock released, we can try
      }
      if (await isLocked()) {
        return { ok: false, error: 'Auth in progress' };
      }
    }

    await setLock();
    try {
      const result = await triggerSupabaseAuth(qrData.qrId, qrData.userId, schoolId);
      if (result.success) {
        await setFailures({ count: 0, lastAttempt: 0 });
        await browser.storage.local.remove(REAUTH_KEY);
        const { data: newData } = await supabase.auth.getSession();
        capture('supabase auth succeeded', getDistinctId(qrData.userId));
        return { ok: true, session: newData.session ? { expires_at: newData.session.expires_at! } : null };
      }
      // Don't count transient QR errors as failures (race conditions, expired QR)
      const isTransient = result.error?.includes('QR code') || result.error?.includes('elevid');
      if (!isTransient) {
        const failures = await getFailures();
        await setFailures({ count: failures.count + 1, lastAttempt: Date.now() });
        capture('supabase auth failed', getDistinctId(qrData.userId), {
          error: result.error,
          failure_count: failures.count + 1,
        });
      }
      console.warn('[BetterLectio] Auto Supabase auth failed:', result.error);
      return { ok: false, error: result.error };
    } finally {
      await clearLock();
    }
  } catch (err) {
    console.warn('[BetterLectio] Auto Supabase auth error:', err);
    await clearLock().catch(() => {});
    return { ok: false, error: String(err) };
  }
}

// ── Auth state listener ─────────────────────────────────────────────

function initAuthStateListener(): void {
  try {
    const supabase = getSupabase();
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        browser.storage.local.set({ [REAUTH_KEY]: true }).catch(() => {});
      }
    });
  } catch {
    // Non-critical
  }
}

// ── Background entry ────────────────────────────────────────────────

export default defineBackground(() => {
  console.log('[BetterLectio] Background script loaded');

  initAuthStateListener();

  // Handle extension icon click
  const actionApi = browser.action ?? (browser as any).browserAction;
  actionApi?.onClicked.addListener(async (tab: { id?: number }) => {
    if (!tab.id) return;
    try {
      await browser.tabs.sendMessage(tab.id, { action: 'openSettings' });
    } catch {
      await browser.tabs.create({ url: 'https://www.lectio.dk/' });
    }
  });

  // Handle all Supabase messages from content scripts
  browser.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (response?: any) => void) => {
    if (!message?.type?.startsWith('bl-sb:')) return false;

    const msg = message as SupabaseMessage;

    switch (msg.type) {
      // ── Data operations ─────────────────────────────────────────
      case 'bl-sb:query':
        handleQuery(msg).then(sendResponse).catch(() => sendResponse({ ok: false }));
        return true;

      case 'bl-sb:mutate':
        handleMutate(msg).then(sendResponse).catch(() => sendResponse({ ok: false }));
        return true;

      case 'bl-sb:rpc':
        handleRpc(msg).then(sendResponse).catch(() => sendResponse({ ok: false }));
        return true;

      // ── Realtime ────────────────────────────────────────────────
      case 'bl-sb:subscribe':
        sendResponse(handleSubscribe(msg));
        return false;

      case 'bl-sb:unsubscribe':
        sendResponse(handleUnsubscribe(msg));
        return false;

      // ── Auth ────────────────────────────────────────────────────
      case 'bl-sb:auth:ensure':
        ensureSupabaseSession(msg.qrData, msg.schoolId).then(sendResponse).catch(() => sendResponse({ ok: false }));
        return true;

      case 'bl-sb:auth:session': {
        const supabase = getSupabase();
        supabase.auth.getSession().then(({ data }) => {
          sendResponse({
            ok: true,
            session: data.session ? { expires_at: data.session.expires_at! } : null,
          } satisfies SupabaseResponse);
        }).catch(() => sendResponse({ ok: false } satisfies SupabaseResponse));
        return true;
      }

      case 'bl-sb:auth:signout': {
        const supabase = getSupabase();
        supabase.auth.signOut().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
        return true;
      }

      default:
        return false;
    }
  });
});
