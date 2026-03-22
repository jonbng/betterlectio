import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import type { SupabaseMessage, SupabaseResponse } from '@/lib/supabase-messages';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// ── Supabase client (background-only) ───────────────────────────────────

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

// ── Auth logic (moved from supabase-session.ts / supabase-auth.ts) ──────

const LOCK_KEY = 'bl-supabase-auth-lock';
const FAILURES_KEY = 'bl-supabase-auth-failures';
const REAUTH_KEY = 'bl-supabase-needs-reauth';
const LOCK_TTL_MS = 120_000;

interface FailureState { count: number; lastAttempt: number }

function getBackoffMs(failures: number): number {
  if (failures <= 0) return 0;
  if (failures === 1) return 5 * 60_000;
  if (failures === 2) return 15 * 60_000;
  return 60 * 60_000;
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

async function triggerSupabaseAuth(qrId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/verify-lectio-auth`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ qrId, userId }),
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

async function ensureSupabaseSession(qrData?: { qrId: string; userId: string }): Promise<SupabaseResponse> {
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

    if (await isLocked()) return { ok: false, error: 'Lock active.' };

    await setLock();
    try {
      const result = await triggerSupabaseAuth(qrData.qrId, qrData.userId);
      if (result.success) {
        await setFailures({ count: 0, lastAttempt: 0 });
        await browser.storage.local.remove(REAUTH_KEY);
        const { data: newData } = await supabase.auth.getSession();
        return { ok: true, session: newData.session ? { expires_at: newData.session.expires_at! } : null };
      }
      const failures = await getFailures();
      await setFailures({ count: failures.count + 1, lastAttempt: Date.now() });
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

// ── Auth state listener ─────────────────────────────────────────────────

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

// ── Background entry ────────────────────────────────────────────────────

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

  // Handle Supabase messages from content scripts
  browser.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (response?: any) => void) => {
    if (!message?.type?.startsWith('bl-supabase-')) return false;

    const msg = message as SupabaseMessage;

    if (msg.type === 'bl-supabase-ensure-session') {
      ensureSupabaseSession(msg.qrData).then(sendResponse).catch(() => sendResponse({ ok: false }));
      return true; // async response
    }

    if (msg.type === 'bl-supabase-get-session') {
      const supabase = getSupabase();
      supabase.auth.getSession().then(({ data }) => {
        sendResponse({
          ok: true,
          session: data.session ? { expires_at: data.session.expires_at! } : null,
        } satisfies SupabaseResponse);
      }).catch(() => sendResponse({ ok: false } satisfies SupabaseResponse));
      return true;
    }

    if (msg.type === 'bl-supabase-sign-out') {
      const supabase = getSupabase();
      supabase.auth.signOut().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }

    return false;
  });
});
