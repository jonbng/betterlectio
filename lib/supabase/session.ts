// Content-script auth orchestration.
// Fetches QR data from Lectio (needs page cookies), then delegates
// all Supabase operations to the background script.

import type { SupabaseMessage, SupabaseResponse } from './messages';
import { fetchQrUrl } from '@/lib/profil-parser';

type AuthSource = 'bootstrap' | 'hold-mapping-sync' | 'unknown';

// Dedupe is keyed by `schoolId:studentId` (or `schoolId:` when unknown) so
// a later call that supplies a studentId doesn't reuse an earlier unchecked
// promise and skip the ownership validation on an existing stale session.
const inFlightAuthByKey = new Map<string, Promise<void>>();

async function send(msg: SupabaseMessage): Promise<SupabaseResponse> {
  const resp = await browser.runtime.sendMessage(msg);
  if (!resp) return { ok: false, error: 'Background not ready' };
  return resp;
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
