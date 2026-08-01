// Shared classifier for non-actionable Supabase errors.
//
// Supabase auth-transition and transport errors are self-recovering states,
// not bugs. Reporting them to PostHog just burns free-tier quota and — because
// posthog-edge synthesizes a near-identical minified stack for each capture
// site — fans a single moment out into several colliding error-tracking
// fingerprints. This module is the ONE place that decides "don't report this",
// so the guard can't silently diverge across the codebase again (it previously
// lived as three separate `isAuthOwnershipError` copies that only matched
// `unauthorized`, letting "JWT expired" through everywhere but the background
// worker).
//
// Kept dependency-free so it's safe to import from content scripts, the MV3
// service worker, and shared libs alike.

export function extractSupabaseErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof (error as { message?: unknown })?.message === 'string') {
    return (error as { message: string }).message;
  }
  return '';
}

function errorCode(error: unknown): string {
  return typeof (error as { code?: unknown })?.code === 'string'
    ? (error as { code: string }).code
    : '';
}

// RPC ownership-check errors from our security-definer functions (lesson
// mapping + homework status upserts). These raise `'Unauthorized'` when
// `students.supabase_id != auth.uid()` for the targeted student/school — i.e.
// the session is stale or never owned this student. The content-script
// `sendRpc` force-reauths and retries once on these, so anything escaping to a
// capture site is either about to be recovered or a user logged out of Lectio
// (recovery impossible). Either way, not actionable.
export function isAuthOwnershipError(error: unknown): boolean {
  const message = extractSupabaseErrorMessage(error);
  if (!message) return false;
  return /\bunauthorized\b/i.test(message);
}

// Expired-JWT errors are a self-recovering auth-transition state, not a bug.
// `ensureSessionReady()` refreshes the access token before each query, but its
// catch block deliberately lets the request run anyway when the refresh fails
// (revoked refresh_token, network) — PostgREST then rejects it with "JWT
// expired" (code PGRST301). The next request re-auths via the QR flow, so this
// recovers on its own; reporting it just burns PostHog free-tier quota.
export function isExpiredJwtError(error: unknown): boolean {
  if (errorCode(error) === 'PGRST301') return true;
  const message = extractSupabaseErrorMessage(error);
  if (!message) return false;
  return /\bjwt expired\b/i.test(message);
}

// Transient network failures ("Failed to fetch", offline, service-worker
// shutdown mid-request, blocker extensions, aborted requests, etc.) are not
// actionable bugs — they're noise. Supabase's SDK surfaces these as error
// objects with a `Failed to fetch` / `NetworkError` message, and posthog-node
// wraps them with a synthetic stack that all points at its own internals.
export function isTransientNetworkError(error: unknown): boolean {
  const message = extractSupabaseErrorMessage(error);
  if (!message) return false;
  return /failed to fetch|networkerror|network request failed|load failed|err_network|err_internet_disconnected|the user aborted|request aborted|signal is aborted/i.test(
    message,
  );
}

// The union guard: true for any Supabase error that is not worth reporting —
// unauthorized ownership rejections, expired JWTs (incl. PGRST301), and
// transient network failures. Use this at capture sites that report Supabase
// errors from the content script / sync libs.
export function isNonActionableSupabaseError(error: unknown): boolean {
  return (
    isTransientNetworkError(error) ||
    isExpiredJwtError(error) ||
    isAuthOwnershipError(error)
  );
}
