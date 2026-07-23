// Content-script auth orchestration.
// Fetches QR data from Lectio (needs page cookies), then delegates
// all Supabase operations to the background script.

import type { SupabaseMessage, SupabaseResponse } from './messages';
import { fetchQrUrl } from '@/lib/profil-parser';

type AuthSource =
  | 'bootstrap'
  | 'hold-mapping-sync'
  | 'settings-sync'
  | 'rpc-unauthorized-retry'
  | 'website-login'
  | 'unknown';

// Dedupe is keyed by `schoolId:studentId` (or `schoolId:` when unknown) so
// a later call that supplies a studentId doesn't reuse an earlier unchecked
// promise and skip the ownership validation on an existing stale session.
const inFlightAuthByKey = new Map<string, Promise<void>>();

// Separate dedupe for forced reauth — it actively signs out the current
// session, so it must never share a promise with the permissive
// `ensureSupabaseSession` path. Keyed by `schoolId:studentId` so the
// 40-upsert seed loop (or any parallel RPC burst) collapses to one reauth.
const inFlightForceReauth = new Map<string, Promise<boolean>>();

// Cooldown between failed force-reauth attempts. Prevents QR fetch storms
// when the user is logged out of Lectio and recovery will keep failing.
const FORCE_REAUTH_FAILURE_COOLDOWN_MS = 60_000;
const forceReauthFailureAt = new Map<string, number>();

async function send(msg: SupabaseMessage): Promise<SupabaseResponse> {
  const resp = await browser.runtime.sendMessage(msg);
  if (!resp) return { ok: false, error: 'Background not ready' };
  return resp;
}

/** Current background session metadata, or null if signed out. */
export async function getSupabaseSessionMeta(): Promise<{
  expires_at: number;
  user_id?: string | null;
} | null> {
  const resp = await send({ type: 'bl-sb:auth:session' });
  if (!resp.ok || !resp.session) return null;
  return resp.session;
}

/**
 * Ensures a valid Supabase session exists. Runs silently — never throws.
 * Safe to call fire-and-forget from any content script.
 *
 * When `studentId` (raw Lectio elevid) is provided, the background will
 * additionally verify that any existing session is actually owned by that
 * student. Stale sessions from a previously logged-in Lectio user are
 * signed out and a fresh QR-based reauth is attempted.
 */
export async function ensureSupabaseSession(
  schoolId: string,
  source: AuthSource = 'unknown',
  studentId?: string,
): Promise<void> {
  const dedupeKey = `${schoolId}:${studentId ?? ''}`;
  const existing = inFlightAuthByKey.get(dedupeKey);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    try {
      // Quick path: delegate to the background, which will return ok
      // immediately if the existing session is both valid AND owned by the
      // expected student. No QR fetch needed in that common case.
      const quick = await send({
        type: 'bl-sb:auth:ensure',
        schoolId,
        expectedStudentId: studentId,
        source,
      });
      if (quick?.ok) return;

      // Fetch QR data from Lectio (requires page cookies — must run in content script)
      const qrUrl = await fetchQrUrl(schoolId);
      if (!qrUrl) {
        console.warn('[BetterLectio] Auto Supabase auth: could not fetch QR URL');
        return;
      }

      const url = new URL(qrUrl);
      const userId = url.searchParams.get('userId');
      const qrId = url.searchParams.get('QrId');
      if (!userId || !qrId) {
        console.warn('[BetterLectio] Auto Supabase auth: invalid QR URL format');
        return;
      }

      // Keep all Supabase auth in one background request so the one-time
      // magic link is only generated and consumed once per school.
      const result = await send({
        type: 'bl-sb:auth:ensure',
        schoolId,
        expectedStudentId: studentId,
        qrData: { qrId, userId },
        source,
      });

      if (!result.ok) {
        console.warn('[BetterLectio] Auto Supabase auth failed:', result.error);
      }
    } catch (err) {
      console.warn('[BetterLectio] Auto Supabase auth error:', err);
    }
  })().finally(() => {
    if (inFlightAuthByKey.get(dedupeKey) === promise) {
      inFlightAuthByKey.delete(dedupeKey);
    }
  });

  inFlightAuthByKey.set(dedupeKey, promise);
  return promise;
}

/**
 * Force a fresh Supabase auth cycle. Signs out the current session and
 * runs the full QR flow, validating ownership of the expected student.
 *
 * Used as recovery when a security-definer RPC returns "Unauthorized" —
 * i.e. the existing session does not actually own the student the caller
 * is acting on (stale session from a previous Lectio user, or students
 * row without matching `supabase_id`).
 *
 * Returns `true` only when the reauth succeeded. Deduped and rate-limited
 * per `schoolId:studentId` so repeated RPC failures (e.g. the seed loop
 * or multiple concurrent mutations) trigger at most one reauth, and
 * repeated failures back off for a minute before trying again.
 */
export async function forceReauthenticate(
  schoolId: string,
  source: AuthSource = 'unknown',
  studentId?: string,
): Promise<boolean> {
  const key = `${schoolId}:${studentId ?? ''}`;

  const lastFailure = forceReauthFailureAt.get(key) ?? 0;
  if (Date.now() - lastFailure < FORCE_REAUTH_FAILURE_COOLDOWN_MS) {
    return false;
  }

  const existing = inFlightForceReauth.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<boolean> => {
    try {
      // Sign out the stale session so `ensureSupabaseSession` doesn't
      // short-circuit on the (broken) existing session. Errors here are
      // non-fatal — the subsequent ensure call will detect a missing
      // session and run the QR flow regardless.
      await send({ type: 'bl-sb:auth:signout' });
    } catch {
      // Non-critical
    }

    let qrUrl: string | null;
    try {
      qrUrl = await fetchQrUrl(schoolId);
    } catch {
      return false;
    }
    if (!qrUrl) return false;

    let qrId: string | null;
    let userId: string | null;
    try {
      const url = new URL(qrUrl);
      qrId = url.searchParams.get('QrId');
      userId = url.searchParams.get('userId');
    } catch {
      return false;
    }
    if (!qrId || !userId) return false;

    try {
      const result = await send({
        type: 'bl-sb:auth:ensure',
        schoolId,
        expectedStudentId: studentId,
        qrData: { qrId, userId },
        source,
      });
      return result.ok === true;
    } catch {
      return false;
    }
  })();

  inFlightForceReauth.set(key, promise);

  try {
    const ok = await promise;
    if (ok) {
      forceReauthFailureAt.delete(key);
    } else {
      forceReauthFailureAt.set(key, Date.now());
    }
    return ok;
  } finally {
    if (inFlightForceReauth.get(key) === promise) {
      inFlightForceReauth.delete(key);
    }
  }
}
