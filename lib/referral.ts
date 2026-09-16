// Referral finalize client (background-side).
//
// Called after a freshly-installed extension successfully QR-auths for the
// first time. POSTs to the `referral-finalize` Supabase edge function with
// `credentials: 'include'` so the `bl_ref` cookie (set by `referral-click`
// on the same `*.supabase.co` origin) gets sent. The cookie is what links
// the click to this install — the function uses it to look up the row and
// stamp `students.referred_by`.
//
// Once we've received a parsed 2xx outcome for a student we never retry —
// the edge function is the source of truth for whether attribution succeeded,
// and re-calling on every page load would just spam the endpoint with
// `no_cookie` responses. Transport, timeout, and server failures remain
// retryable. The flag is keyed by studentId because a single browser can
// authenticate as different Lectio users over time.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const ATTEMPTED_KEY_PREFIX = 'bl-referral-finalize-attempted:';
const FINALIZE_TIMEOUT_MS = 10_000;

interface FinalizeResponse {
  attributed: boolean;
  reason?: string;
  referrerStudentId?: string;
  referrerName?: string | null;
}

function attemptedKey(studentId: string): string {
  return `${ATTEMPTED_KEY_PREFIX}${studentId}`;
}

async function alreadyAttempted(studentId: string): Promise<boolean> {
  try {
    const r = await browser.storage.local.get(attemptedKey(studentId));
    return !!r[attemptedKey(studentId)];
  } catch {
    return false;
  }
}

async function markAttempted(studentId: string): Promise<void> {
  try {
    await browser.storage.local.set({ [attemptedKey(studentId)]: Date.now() });
  } catch {
    // Non-critical.
  }
}

export async function maybeFinalizeReferral(opts: {
  studentId: string;
  schoolId: number | string | undefined;
  accessToken: string;
  extensionVersion: string;
}): Promise<FinalizeResponse | null> {
  const { studentId, schoolId, accessToken, extensionVersion } = opts;
  if (!studentId || !accessToken) return null;
  if (await alreadyAttempted(studentId)) return null;

  let resp: Response;
  try {
    resp = await fetch(`${SUPABASE_URL}/functions/v1/referral-finalize`, {
      method: 'POST',
      credentials: 'include',
      signal: AbortSignal.timeout(FINALIZE_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentId,
        schoolId: typeof schoolId === 'string' ? Number(schoolId) || null : schoolId ?? null,
        extensionVersion,
      }),
    });
  } catch {
    // Genuine network error (offline, DNS, abort). The server didn't
    // hear from us, so nothing changed server-side. Don't mark attempted
    // — let the next ensure-session call try again.
    return null;
  }

  if (!resp.ok) return null;
  try {
    const result = (await resp.json()) as FinalizeResponse;
    // Only a parsed 2xx attribution/rejection is definitive. 5xx, disabled
    // feature responses, and malformed bodies remain retryable.
    await markAttempted(studentId);
    return result;
  } catch {
    return null;
  }
}
