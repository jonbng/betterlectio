// Shared classifier and labeller for failed Lectio HTTP requests.
//
// The content-script network monitor patches `fetch` and `XMLHttpRequest` and
// reports any lectio.dk response with status >= 400 to error tracking. Two
// problems came out of that:
//
//   1. Gateway/availability errors (502–504) are Lectio's infrastructure
//      failing, not our bug. Most land in its nightly maintenance window, so
//      forwarding them just buries real errors and burns error-tracking quota.
//   2. Lectio serves over HTTP/2, where `statusText` is always empty, so the old
//      `HTTP ${status} ${statusText}` message read `HTTP 503 ` with no endpoint.
//      Error tracking then grouped on the minified stack, which shifts on every
//      build, so each occurrence opened a fresh issue.
//
// This module is the ONE place that answers "report this HTTP status?" and
// "what stable message and fingerprint does it get?", so the two capture sites
// cannot diverge. Kept dependency-free so both the content script and tests can
// import it.

/**
 * Whether a failed Lectio HTTP response is worth reporting to error tracking.
 *
 * Client errors (4xx), HTTP 500, and less common 5xx statuses can flag a
 * request our own code got wrong, so we keep them. Only gateway/availability
 * failures (502–504) are unambiguously transient upstream noise.
 */
export function isReportableLectioHttpStatus(status: number): boolean {
  return status >= 400 && (status < 502 || status > 504);
}

/**
 * Final path segment of a URL, e.g. `SkemaNy.aspx` for
 * `/lectio/681/SkemaNy.aspx`. Stable across schools, where the numeric school
 * id earlier in the path is not.
 */
function lectioHttpEndpoint(rawUrl: string, base?: string): string {
  try {
    const path = new URL(rawUrl, base).pathname;
    return path.split('/').filter(Boolean).pop() || path || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Stable error message and fingerprint for a failed Lectio request. Carrying
 * the endpoint in the message and pinning `$exception_fingerprint` keeps
 * repeats of the same failure in one issue instead of one per occurrence.
 */
export function describeLectioHttpError(
  status: number,
  rawUrl: string,
  base?: string,
): { message: string; fingerprint: string } {
  const endpoint = lectioHttpEndpoint(rawUrl, base);
  return {
    message: `HTTP ${status} ${endpoint}`,
    fingerprint: `lectio-http:${status}:${endpoint}`,
  };
}
