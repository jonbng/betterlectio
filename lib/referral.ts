// Referral finalize client (background-side).
//
// Called after a freshly-installed extension successfully QR-auths for the
// first time. POSTs to the `referral-finalize` Supabase edge function with
// `credentials: 'include'` so the `bl_ref` cookie (set by `referral-click`
// on the same `*.supabase.co` origin) gets sent. The cookie is what links
// the click to this install — the function uses it to look up the row and
// stamp `students.referred_by`.
//
// Once we've made an attempt for a given student we never retry — the
// edge function is the source of truth for whether attribution succeeded,
// and re-calling on every page load would just spam the endpoint with
// `no_cookie` responses. The flag is keyed by studentId because a single
// browser can authenticate as different Lectio users over time.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ATTEMPTED_KEY_PREFIX = 'bl-referral-finalize-attempted:';

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
      headers: {
        Authorization: `Bearer ${accessToken}`,
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
    // — let the next session try again. `wasFirstInstall` is one-shot
    // so this is the only retry shot we get.
    return null;
  }

  // Server responded → outcome is deterministic. Mark attempted before
  // parsing so a 500 response (which clears the cookie server-side) is
  // recorded as a final attempt. This avoids re-banging the endpoint.
  await markAttempted(studentId);

  if (!resp.ok) return null;
  try {
    return (await resp.json()) as FinalizeResponse;
  } catch {
    return null;
  }
}
