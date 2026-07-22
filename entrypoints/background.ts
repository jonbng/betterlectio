import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import type {
  SupabaseMessage,
  SupabaseResponse,
  Filter,
  TableName,
} from '@/lib/supabase/messages';
import { invalidateTable, writeCache, cacheKey, queryFingerprint } from '@/lib/supabase/cache';
import { capture, captureException, identify, getDistinctId, isLectioStudentDistinctId, loadOptOutFlag } from '@/lib/posthog';
import { queueLifecycleEvent } from '@/lib/posthog-lifecycle';
import { maybeFinalizeReferral } from '@/lib/referral';

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
let cachedDistinctId: string | null = null;
let cachedAnalyticsIdentity:
  | {
      distinctId: string;
      properties: {
        name: string;
        school_id: number;
        class_name: string | null;
        extension_version: string;
      };
    }
  | null = null;
const UNINSTALL_URL_BASE = 'https://betterlectio.dk/uninstall';
let lastUninstallStudentId: string | null = null;

async function runReferralFinalize(opts: {
  studentId: string;
  schoolId?: string;
  accessToken: string;
  distinctId?: string;
}): Promise<void> {
  try {
    const result = await maybeFinalizeReferral({
      studentId: opts.studentId,
      schoolId: opts.schoolId,
      accessToken: opts.accessToken,
      extensionVersion: browser.runtime.getManifest().version,
    });
    if (!result?.attributed) return;

    // Side-channel through extension storage. We can't broadcast via
    // `tabs.sendMessage` reliably here because:
    //   1. `tabs.query({ url: '*://*.lectio.dk/*' })` needs `tabs` perm
    //      or matching host_permissions, neither of which we have.
    //   2. We don't have any other way to enumerate Lectio tabs.
    // Content scripts subscribe to `browser.storage.onChanged` for this
    // key and pop the toast. The flag carries a `ts` so a subsequent
    // identical attribution from elsewhere (shouldn't happen, but
    // defensive) doesn't fire a duplicate toast.
    const payload = {
      ts: Date.now(),
      studentId: opts.studentId,
      referrerName: result.referrerName ?? null,
      referrerStudentId: result.referrerStudentId ?? null,
    };
    try {
      await browser.storage.local.set({
        'bl-referral-toast-pending': payload,
      });
    } catch (err) {
      console.warn('[BetterLectio] Referral toast handoff failed:', err);
    }
  } catch (err) {
    console.warn('[BetterLectio] Referral finalize failed:', err);
  }
}

function setUninstallUrlForStudent(studentId: string): void {
  if (!studentId || lastUninstallStudentId === studentId) return;
  try {
    const url = `${UNINSTALL_URL_BASE}?u=${encodeURIComponent(studentId)}`;
    const api = browser.runtime.setUninstallURL?.bind(browser.runtime);
    if (!api) return;
    const result = api(url) as unknown;
    if (result && typeof (result as Promise<void>).then === 'function') {
      (result as Promise<void>).catch(() => {});
    }
    lastUninstallStudentId = studentId;
  } catch {
    // Non-critical
  }
}

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

// supabase-js loads the persisted session asynchronously after createClient,
// AND `getSession()` happily returns the cached session even if its access
// token has expired — `autoRefreshToken: true` schedules refreshes via an
// in-memory timer, which doesn't survive MV3 service worker restarts. Result:
// the first query after a long idle goes out with an expired Bearer header,
// PostgREST treats it as anon, and every RLS-gated read silently returns
// nothing. So before each query/mutate we (1) wait for the initial storage
// restoration once, then (2) refresh the access token if it's expired or
// about to expire. Cheap when the token is fresh; correct when it isn't.
let initialRestorePromise: Promise<void> | null = null;

async function ensureSessionReady(): Promise<void> {
  if (!initialRestorePromise) {
    initialRestorePromise = (async () => {
      try {
        await getSupabase().auth.getSession();
      } catch {
        // Non-critical
      }
    })();
  }
  await initialRestorePromise;

  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) return;
    const nowSec = Math.floor(Date.now() / 1000);
    if (session.expires_at && session.expires_at <= nowSec + 30) {
      await supabase.auth.refreshSession();
    }
  } catch {
    // If refresh fails (revoked refresh_token, network), let the query run
    // anyway — its RLS-denied result will surface to the caller, which can
    // trigger ensureSupabaseSession() to redo the QR flow.
  }
}

async function getAnalyticsIdentity(context?: {
  studentId?: string;
  schoolId?: string;
}): Promise<{
  distinctId: string;
  properties: {
    name: string;
    school_id: number;
    class_name: string | null;
    extension_version: string;
  };
} | undefined> {
  if (
    cachedAnalyticsIdentity
    && (!context?.studentId || cachedAnalyticsIdentity.distinctId === getDistinctId(context.studentId))
  ) {
    return cachedAnalyticsIdentity;
  }

  try {
    const supabase = getSupabase();
    let studentQuery = supabase
      .from('students')
      .select('id, name, class_name, school_id');

    if (context?.studentId) {
      studentQuery = studentQuery.eq('id', context.studentId);
    } else {
      const { data } = await supabase.auth.getSession();
      const supabaseUserId = data.session?.user?.id;
      if (!supabaseUserId) return undefined;
      studentQuery = studentQuery.eq('supabase_id', supabaseUserId);
    }

    if (context?.schoolId) {
      const schoolId = Number(context.schoolId);
      if (Number.isFinite(schoolId)) {
        studentQuery = studentQuery.eq('school_id', schoolId);
      }
    }

    const { data: studentRows, error } = await studentQuery.limit(1);
    const student = studentRows?.[0];
    const name = student?.name?.trim();
    if (error || !student?.id || !name) return undefined;

    const distinctId = getDistinctId(student.id);
    if (!isLectioStudentDistinctId(distinctId)) return undefined;

    const identity = {
      distinctId,
      properties: {
        name,
        school_id: student.school_id,
        class_name: student.class_name,
        extension_version: browser.runtime.getManifest().version,
      },
    };

    cachedDistinctId = distinctId;
    cachedAnalyticsIdentity = identity;
    setUninstallUrlForStudent(student.id);
    return identity;
  } catch {
    return undefined;
  }
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof (error as { message?: unknown })?.message === 'string') {
    return (error as { message: string }).message;
  }
  return '';
}

// Transient network failures ("Failed to fetch", offline, service-worker
// shutdown mid-request, blocker extensions, aborted requests, etc.) are not
// actionable bugs — they're noise. Supabase's SDK surfaces these as error
// objects with a `Failed to fetch` / `NetworkError` message, and posthog-node
// wraps them with a synthetic stack that all points at its own internals.
// Suppress them before they burn PostHog free-tier quota.
function isTransientNetworkError(error: unknown): boolean {
  const message = extractErrorMessage(error);
  if (!message) return false;
  return /failed to fetch|networkerror|network request failed|load failed|err_network|err_internet_disconnected|the user aborted|request aborted|signal is aborted/i.test(message);
}

// RPC ownership-check errors from our security-definer functions (lesson
// mapping + homework status upserts). These raise `'Unauthorized'` when
// `students.supabase_id != auth.uid()` for the targeted student/school —
// i.e. the session is stale or never owned this student. The content-
// script `sendRpc` now force-reauths and retries once on these, so every
// such error is either about to be recovered or represents a user who is
// logged out of Lectio (recovery impossible). Either way, not actionable.
function isAuthOwnershipError(error: unknown): boolean {
  const message = extractErrorMessage(error);
  if (!message) return false;
  return /\bunauthorized\b/i.test(message);
}

// Non-actionable PostgREST query-contract errors. The caller already receives
// the error via the query response and handles it (null fallback, retry, etc.).
// Reporting these as exceptions is noise — posthog-edge synthesizes an
// identical minified stack for every background-side capture, so a single
// chatty case (e.g. the old `.single()` path before commit 4cfd779, where
// first-render queries against not-yet-upserted student rows raised PGRST116)
// can swamp the error tracker and fingerprint-collide with genuinely
// actionable errors.
function isNonActionablePostgrestError(error: unknown): boolean {
  const code = typeof (error as { code?: unknown })?.code === 'string'
    ? (error as { code: string }).code
    : '';
  // PGRST116 = "Cannot coerce the result to a single JSON object" — query
  // returned the wrong row count for a single-row accessor.
  return code === 'PGRST116';
}

// Expired-JWT errors are a self-recovering auth-transition state, not a bug.
// `ensureSessionReady()` refreshes the access token before each query, but its
// catch block deliberately lets the request run anyway when the refresh fails
// (revoked refresh_token, network) — PostgREST then rejects it with "JWT
// expired" (code PGRST301). The next request re-auths via the QR flow, so this
// recovers on its own; reporting it just burns PostHog free-tier quota. Mirrors
// the PGRST116 / Unauthorized suppressions above.
function isExpiredJwtError(error: unknown): boolean {
  const code = typeof (error as { code?: unknown })?.code === 'string'
    ? (error as { code: string }).code
    : '';
  if (code === 'PGRST301') return true;
  const message = extractErrorMessage(error);
  if (!message) return false;
  return /\bjwt expired\b/i.test(message);
}

async function captureSupabaseError(
  error: unknown,
  context: {
    action: 'query' | 'mutate' | 'rpc' | 'auth';
    table?: string;
    method?: string;
    fn?: string;
    schoolId?: string;
    studentId?: string;
    source?: string;
    authStage?: string;
    authServerSchoolId?: string;
  },
): Promise<void> {
  try {
    if (isTransientNetworkError(error)) return;
    if (isNonActionablePostgrestError(error)) return;
    if (isExpiredJwtError(error)) return;
    if (context.action === 'rpc' && isAuthOwnershipError(error)) return;

    const identity = await getAnalyticsIdentity({
      studentId: context.studentId,
      schoolId: context.schoolId,
    });
    if (!identity) return;

    identify(identity.distinctId, identity.properties);
    captureException(error, identity.distinctId, {
      source: 'supabase-background',
      ...context,
    });
  } catch {
    // Never let analytics errors surface
  }
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
      case 'not.is': query = query.not(f.column, 'is', f.value); break;
      case 'like': query = query.like(f.column, f.value as string); break;
      case 'ilike': query = query.ilike(f.column, f.value as string); break;
    }
  }
  return query;
}

async function handleQuery(msg: Extract<SupabaseMessage, { type: 'bl-sb:query' }>): Promise<SupabaseResponse> {
  await ensureSessionReady();
  const supabase = getSupabase();
  let query: any = supabase.from(String(msg.table)).select(msg.select ?? '*');
  query = applyFilters(query, msg.filters);
  if (msg.order) {
    query = query.order(msg.order.column, { ascending: msg.order.ascending ?? true });
  }
  if (msg.limit) {
    query = query.limit(msg.limit);
  }
  if (msg.single) {
    query = query.maybeSingle();
  }

  const { data, error } = await query;
  if (error) {
    await captureSupabaseError(error, {
      action: 'query',
      table: String(msg.table),
    });
    return { ok: false, error: error.message };
  }
  return { ok: true, data };
}

async function handleMutate(msg: Extract<SupabaseMessage, { type: 'bl-sb:mutate' }>): Promise<SupabaseResponse> {
  await ensureSessionReady();
  const supabase = getSupabase();
  let query: any;

  switch (msg.method) {
    case 'insert':
      query = supabase.from(String(msg.table)).insert(msg.data!);
      break;
    case 'update':
      query = applyFilters(supabase.from(String(msg.table)).update(msg.data!), msg.filters);
      break;
    case 'upsert':
      query = supabase.from(String(msg.table)).upsert(msg.data!);
      break;
    case 'delete':
      query = applyFilters(supabase.from(String(msg.table)).delete(), msg.filters);
      break;
  }

  const { data, error } = await query.select();
  if (error) {
    await captureSupabaseError(error, {
      action: 'mutate',
      table: String(msg.table),
      method: msg.method,
    });
    return { ok: false, error: error.message };
  }
  return { ok: true, data };
}

async function handleStorageUpload(
  msg: Extract<SupabaseMessage, { type: 'bl-sb:storage:upload' }>,
): Promise<SupabaseResponse> {
  await ensureSessionReady();
  const supabase = getSupabase();
  try {
    const binary = Uint8Array.from(atob(msg.dataBase64), (c) => c.charCodeAt(0));
    const { error } = await supabase.storage.from(msg.bucket).upload(msg.path, binary, {
      contentType: msg.contentType,
      upsert: msg.upsert ?? false,
    });
    if (error) {
      await captureSupabaseError(error, {
        action: 'mutate',
        method: 'storage_upload',
        table: msg.bucket,
      });
      return { ok: false, error: error.message };
    }
    return { ok: true, data: { path: msg.path } };
  } catch (err) {
    await captureSupabaseError(err, {
      action: 'mutate',
      method: 'storage_upload',
      table: msg.bucket,
    });
    return { ok: false, error: extractErrorMessage(err) || 'upload failed' };
  }
}

async function handleRpc(msg: Extract<SupabaseMessage, { type: 'bl-sb:rpc' }>): Promise<SupabaseResponse> {
  await ensureSessionReady();
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc(msg.fn as string, msg.args);
  if (error) {
    const studentId = typeof msg.args?.p_student_id === 'string' ? msg.args.p_student_id : undefined;
    const schoolId = typeof msg.args?.p_school_id === 'number'
      ? String(msg.args.p_school_id)
      : typeof msg.args?.schoolId === 'string'
        ? msg.args.schoolId
        : undefined;
    await captureSupabaseError(error, {
      action: 'rpc',
      fn: String(msg.fn),
      schoolId,
      studentId,
    });
    return { ok: false, error: error.message };
  }
  return { ok: true, data };
}

// ── Realtime subscriptions ──────────────────────────────────────────

const activeChannels = new Map<string, ReturnType<SupabaseClient['channel']>>();

async function handleSubscribe(msg: Extract<SupabaseMessage, { type: 'bl-sb:subscribe' }>): Promise<SupabaseResponse> {
  if (activeChannels.has(msg.channel)) {
    return { ok: true };
  }

  // Realtime postgres_changes is RLS-gated — without a user JWT the websocket
  // connects anon and our row-scoped events get filtered out server-side. In
  // MV3 the service worker can spin up after createClient with a stale auth
  // state, so wait for the persisted session and push the access token onto
  // the realtime socket before subscribing.
  await ensureSessionReady();
  const supabase = getSupabase();
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) supabase.realtime.setAuth(token);
  } catch {
    // Fall through — channel will subscribe with whatever auth it has.
  }

  const channel = supabase
    .channel(msg.channel)
    .on(
      'postgres_changes' as any,
      {
        event: msg.event ?? '*',
        schema: 'public',
        table: String(msg.table),
        filter: msg.filter,
      },
      (_payload: any) => {
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

let inFlightAuth:
  | {
      key: string;
      promise: Promise<SupabaseResponse>;
      source: string;
      startedAt: number;
    }
  | null = null;

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

// NOTE: qrData.userId is the QR auth userId, NOT the Lectio elevid.
// Deduping by school is safer than using QR payload values, which can rotate
// between fetches and cause duplicate one-time magic-link consumption.
function getAuthDedupeKey(qrData?: { qrId: string; userId: string }, schoolId?: string): string {
  return qrData ? `qr:${schoolId ?? 'unknown'}` : `session:${schoolId ?? 'unknown'}`;
}

interface AuthAttemptResult {
  success: boolean;
  error?: string;
  authStage?: string;
  authServerSchoolId?: string;
  elevid?: string;
  wasFirstInstall?: boolean;
}

async function triggerSupabaseAuth(qrId: string, userId: string, schoolId?: string): Promise<AuthAttemptResult> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/verify-lectio-auth`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ qrId, userId, schoolId }),
  });

  if (!resp.ok) {
    const rawBody = await resp.text();
    try {
      const parsed = JSON.parse(rawBody) as { error?: string; stage?: string; schoolId?: string };
      return {
        success: false,
        error: `Serverfejl: ${rawBody}`,
        authStage: parsed.stage ?? 'edge-error',
        authServerSchoolId: parsed.schoolId,
      };
    } catch {
      return { success: false, error: `Serverfejl: ${rawBody}`, authStage: 'edge-error' };
    }
  }

  const { tokenHash, error, schoolId: serverSchoolId, elevid, wasFirstInstall } = await resp.json();
  if (error || !tokenHash) {
    return {
      success: false,
      error: error || 'Ingen token modtaget.',
      authStage: 'edge-response',
      authServerSchoolId: typeof serverSchoolId === 'string' ? serverSchoolId : undefined,
    };
  }

  const supabase = getSupabase();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  if (verifyError) {
    return {
      success: false,
      error: verifyError.message,
      authStage: 'verify-otp',
      authServerSchoolId: typeof serverSchoolId === 'string' ? serverSchoolId : undefined,
      elevid: typeof elevid === 'string' ? elevid : undefined,
    };
  }

  return {
    success: true,
    authStage: 'verify-otp',
    authServerSchoolId: typeof serverSchoolId === 'string' ? serverSchoolId : undefined,
    elevid: typeof elevid === 'string' ? elevid : undefined,
    wasFirstInstall: wasFirstInstall === true,
  };
}

async function getUsableSessionExpiry(): Promise<number | null> {
  try {
    const { data } = await getSupabase().auth.getSession();
    const expiresAt = data.session?.expires_at;
    if (!expiresAt) return null;
    return expiresAt > Date.now() / 1000 + 300 ? expiresAt : null;
  } catch {
    return null;
  }
}

/**
 * Verifies that the current Supabase session owns the student/school the
 * caller is acting on behalf of. Returns `true` if no validation is
 * requested, if ownership checks out, or if the DB lookup fails (we stay
 * permissive on transient errors to avoid cascading auth loops).
 *
 * Returns `false` only when we can confirm the session belongs to a
 * different Lectio user — in that case the caller should sign out the
 * stale session and re-authenticate via QR.
 */
async function isSessionOwnedByExpected(
  expectedStudentId: string | undefined,
  expectedSchoolId: string | undefined,
  qrUserPresent: boolean,
): Promise<boolean> {
  if (!expectedStudentId && !qrUserPresent) return true;

  try {
    const supabase = getSupabase();
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionUserId = sessionData.session?.user?.id;
    if (!sessionUserId) return false;

    if (expectedStudentId) {
      // Strong check: the student with this elevid must be linked to the
      // current Supabase auth user (and optionally to the expected school).
      let query = supabase
        .from('students')
        .select('id')
        .eq('id', expectedStudentId)
        .eq('supabase_id', sessionUserId);

      if (expectedSchoolId) {
        const schoolIdNum = Number(expectedSchoolId);
        if (Number.isFinite(schoolIdNum)) {
          query = query.eq('school_id', schoolIdNum);
        }
      }

      const { data, error } = await query.limit(1);
      if (error) {
        console.warn('[BetterLectio] Could not validate session ownership:', error.message);
        return true; // transient DB error — stay permissive
      }
      if (!data?.length) {
        console.log('[BetterLectio] Existing Supabase session does not own expected student, reauthenticating');
        return false;
      }
      return true;
    }

    // Legacy check used when only qrData is available: verify *some* student
    // row exists for this auth user. This protects against completely stale
    // sessions even when the caller did not pass an expected studentId.
    const { data: studentRows, error: studentLookupError } = await supabase
      .from('students')
      .select('id')
      .eq('supabase_id', sessionUserId)
      .limit(1);

    if (studentLookupError) {
      console.warn('[BetterLectio] Could not validate existing Supabase session owner:', studentLookupError.message);
      return true;
    }
    if (!studentRows?.length) {
      console.log('[BetterLectio] Existing Supabase session belongs to a different Lectio user, reauthenticating');
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

async function runEnsureSupabaseSession(
  qrData?: { qrId: string; userId: string },
  schoolId?: string,
  source = 'unknown',
  expectedStudentId?: string,
): Promise<SupabaseResponse> {
  try {
    const supabase = getSupabase();
    const existingSessionExpiry = await getUsableSessionExpiry();
    if (existingSessionExpiry) {
      const ownershipOk = await isSessionOwnedByExpected(
        expectedStudentId,
        schoolId,
        !!qrData?.userId,
      );
      if (ownershipOk) {
        await browser.storage.local.remove(REAUTH_KEY);
        return { ok: true, session: { expires_at: existingSessionExpiry } };
      }
      // Session is stale for the caller's Lectio user. Sign it out so any
      // subsequent reauth (or short-circuit below) sees a clean slate — if
      // we skipped this, the `sessionExpiryAfterSignout` fallback further
      // down would accept the stale session again when no qrData is given.
      await supabase.auth.signOut().catch(() => {});
    }

    const { data } = await supabase.auth.getSession();
    if (data.session && qrData?.userId) {
      await supabase.auth.signOut().catch(() => {});
    }

    const sessionExpiryAfterSignout = qrData ? null : await getUsableSessionExpiry();
    if (sessionExpiryAfterSignout && !qrData) {
      await browser.storage.local.remove(REAUTH_KEY);
      return { ok: true, session: { expires_at: sessionExpiryAfterSignout } };
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
        const inFlightSessionExpiry = await getUsableSessionExpiry();
        if (inFlightSessionExpiry) {
          return { ok: true, session: { expires_at: inFlightSessionExpiry } };
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
      // Use the real elevid from the edge function — qrData.userId is the QR auth userId, NOT the elevid
      const studentId = result.elevid;
      if (result.success) {
        await setFailures({ count: 0, lastAttempt: 0 });
        await browser.storage.local.remove(REAUTH_KEY);
        const { data: newData } = await supabase.auth.getSession();
        const identity = await getAnalyticsIdentity({ studentId, schoolId });
        if (identity) {
          identify(identity.distinctId, identity.properties);
          capture('supabase auth succeeded', identity.distinctId, {
            school_id: schoolId,
            source,
            auth_stage: result.authStage,
            auth_server_school_id: result.authServerSchoolId,
          });
        }
        // Referral attribution — only on this very first auth, gated by the
        // edge function's wasFirstInstall flag (which is true exactly when
        // it just stamped extension_installed_at). Best-effort, never fails
        // the auth flow.
        if (studentId && result.wasFirstInstall && newData.session?.access_token) {
          void runReferralFinalize({
            studentId,
            schoolId,
            accessToken: newData.session.access_token,
            distinctId: identity?.distinctId,
          });
        }
        return { ok: true, session: newData.session ? { expires_at: newData.session.expires_at! } : null };
      }

      const recoveredSessionExpiry = await getUsableSessionExpiry();
      if (recoveredSessionExpiry) {
        await setFailures({ count: 0, lastAttempt: 0 });
        await browser.storage.local.remove(REAUTH_KEY);
        const identity = await getAnalyticsIdentity({ studentId, schoolId });
        if (identity) {
          identify(identity.distinctId, identity.properties);
          capture('supabase auth succeeded', identity.distinctId, {
            school_id: schoolId,
            source,
            auth_stage: 'verify-otp-recovered',
            auth_server_school_id: result.authServerSchoolId,
            recovered_from_error: result.error,
          });
        }
        return { ok: true, session: { expires_at: recoveredSessionExpiry } };
      }

      // Don't count transient QR errors as failures (race conditions, expired QR)
      const isTransient = result.error?.includes('QR code') || result.error?.includes('elevid');
      if (!isTransient) {
        const failures = await getFailures();
        await setFailures({ count: failures.count + 1, lastAttempt: Date.now() });
        const identity = await getAnalyticsIdentity({ studentId, schoolId });
        await captureSupabaseError(new Error(result.error ?? 'Unknown auth failure'), {
          action: 'auth',
          schoolId,
          studentId,
          source,
          authStage: result.authStage,
          authServerSchoolId: result.authServerSchoolId,
        });
        if (identity) {
          identify(identity.distinctId, identity.properties);
          capture('supabase auth failed', identity.distinctId, {
            error: result.error,
            failure_count: failures.count + 1,
            school_id: schoolId,
            source,
            auth_stage: result.authStage,
            auth_server_school_id: result.authServerSchoolId,
          });
        }
      }
      console.warn('[BetterLectio] Auto Supabase auth failed:', result.error);
      return { ok: false, error: result.error };
    } finally {
      await clearLock();
    }
  } catch (err) {
    console.warn('[BetterLectio] Auto Supabase auth error:', err);
    await clearLock().catch(() => {});
    await captureSupabaseError(err, {
      action: 'auth',
      schoolId,
      source,
      authStage: 'ensure-session',
    });
    return { ok: false, error: String(err) };
  }
}

async function ensureSupabaseSession(
  qrData?: { qrId: string; userId: string },
  schoolId?: string,
  source = 'unknown',
  expectedStudentId?: string,
): Promise<SupabaseResponse> {
  const dedupeKey = getAuthDedupeKey(qrData, schoolId);
  if (inFlightAuth && inFlightAuth.key === dedupeKey) {
    return inFlightAuth.promise;
  }

  const promise = runEnsureSupabaseSession(
    qrData,
    schoolId,
    source,
    expectedStudentId,
  ).finally(() => {
    if (inFlightAuth?.promise === promise) {
      inFlightAuth = null;
    }
  });

  inFlightAuth = {
    key: dedupeKey,
    promise,
    source,
    startedAt: Date.now(),
  };

  return promise;
}

// ── Auth state listener ─────────────────────────────────────────────

function initAuthStateListener(): void {
  try {
    const supabase = getSupabase();
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        cachedDistinctId = null;
        cachedAnalyticsIdentity = null;
        lastUninstallStudentId = null;
        browser.storage.local.set({ [REAUTH_KEY]: true }).catch(() => {});
      }
    });
  } catch {
    // Non-critical
  }
}

function initLifecycleTracking(): void {
  try {
    browser.runtime.onInstalled.addListener((details) => {
      void queueLifecycleEvent(
        details.reason === 'update' ? 'extension updated' : 'extension installed',
        {
          extension_version: browser.runtime.getManifest().version,
          previous_version: details.previousVersion,
          install_reason: details.reason,
        },
      );
    });
  } catch {
    // Non-critical
  }
}

// ── Background entry ────────────────────────────────────────────────

export default defineBackground(() => {
  console.log('[BetterLectio] Background script loaded');

  // Load analytics opt-out flag from extension storage (no localStorage in service workers)
  loadOptOutFlag();

  // Capture uncaught errors in the background/service worker
  self.addEventListener('error', (e) => {
    const id = cachedDistinctId;
    if (!id) return;
    const err =
      e.error instanceof Error
        ? e.error
        : typeof e.error === 'string'
          ? new Error(e.error)
          : new Error(typeof e.message === 'string' && e.message ? e.message : 'worker error');
    captureException(err, id, {
      source: 'background',
      error_filename: e.filename || undefined,
      error_lineno: e.lineno || undefined,
      error_colno: e.colno || undefined,
    });
  });
  self.addEventListener('unhandledrejection', (e) => {
    const id = cachedDistinctId;
    if (!id) return;
    captureException(e.reason, id, { source: 'background-unhandledrejection' });
  });

  initLifecycleTracking();
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

      case 'bl-sb:storage:upload':
        handleStorageUpload(msg).then(sendResponse).catch(() => sendResponse({ ok: false }));
        return true;

      // ── Realtime ────────────────────────────────────────────────
      case 'bl-sb:subscribe':
        handleSubscribe(msg).then(sendResponse).catch(() => sendResponse({ ok: false }));
        return true;

      case 'bl-sb:unsubscribe':
        sendResponse(handleUnsubscribe(msg));
        return false;

      // ── Auth ────────────────────────────────────────────────────
      case 'bl-sb:auth:ensure':
        ensureSupabaseSession(
          msg.qrData,
          msg.schoolId,
          msg.source,
          msg.expectedStudentId,
        ).then(sendResponse).catch(() => sendResponse({ ok: false }));
        return true;

      case 'bl-sb:auth:session': {
        const supabase = getSupabase();
        supabase.auth.getSession().then(({ data }) => {
          sendResponse({
            ok: true,
            session: data.session ? {
              expires_at: data.session.expires_at!,
              user_id: data.session.user?.id ?? null,
            } : null,
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
