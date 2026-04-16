// One-shot escape hatch that renders the next page load with BetterLectio
// redesigns suppressed. The user arms this from the sidebar footer when a
// native Lectio flow is misbehaving under our custom wrapper; the flag is
// consumed by `content.tsx` on the very next load so the tab returns to the
// normal BetterLectio UI after a single navigation.
//
// Stored in sessionStorage so the flag is scoped to the current tab and
// auto-clears when the tab closes — matches the pattern in `lib/url-history.ts`.

const BYPASS_KEY = 'bl-bypass-redesigns';

/**
 * Read-only check. Returns true if the user armed the bypass before this load.
 * Safe to call from both `document_start` (hide-flash) and `document_idle`
 * (content.tsx) — the flag is only cleared by `consumeBypass()`.
 */
export function isBypassActive(): boolean {
  try {
    return sessionStorage.getItem(BYPASS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Arm the bypass for the next page load in this tab. Caller is expected to
 * trigger a reload immediately after.
 */
export function armBypassForNextLoad(): void {
  try {
    sessionStorage.setItem(BYPASS_KEY, '1');
  } catch {
    // Non-critical — if sessionStorage is unavailable the feature just no-ops.
  }
}

/**
 * Clear the flag. Called by `content.tsx` after it has already honoured the
 * bypass on the current load, so the following navigation / reload brings
 * BetterLectio back automatically.
 */
export function consumeBypass(): void {
  try {
    sessionStorage.removeItem(BYPASS_KEY);
  } catch {
    // Non-critical
  }
}
