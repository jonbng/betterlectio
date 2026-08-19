// Escape hatch that renders Lectio without BetterLectio's redesigns when a
// native flow is misbehaving under our wrapper. Activated from the sidebar
// footer. Stays active for 60 minutes (auto-expiry) or until the user presses
// the floating re-enable button injected by `content.tsx`.
//
// Stored in localStorage so the bypass applies across all open Lectio tabs —
// if the redesign is broken on one page it's likely broken everywhere, and a
// per-tab flag forced users to re-arm in every tab.

const BYPASS_KEY = 'bl-bypass-redesigns';

// A 5-minute window forced users to re-arm mid-session, so one broken session
// counted as several presses (~2.65 per user) and made the escape hatch feel
// unreliable. 60 minutes covers a normal continuous session while still
// auto-recovering so the redesign returns after the user moves on.
export const BYPASS_DURATION_MS = 60 * 60 * 1000;

interface BypassState {
  activatedAt: number;
}

function readState(): BypassState | null {
  try {
    const raw = localStorage.getItem(BYPASS_KEY);
    if (!raw) return null;
    if (raw === '1') {
      // Legacy sessionStorage format — migrate to current shape.
      return { activatedAt: Date.now() };
    }
    const parsed = JSON.parse(raw) as Partial<BypassState> | null;
    if (!parsed || typeof parsed.activatedAt !== 'number') return null;
    return { activatedAt: parsed.activatedAt };
  } catch {
    return null;
  }
}

function writeState(state: BypassState): void {
  try {
    localStorage.setItem(BYPASS_KEY, JSON.stringify(state));
  } catch {
    // Non-critical — feature just no-ops if storage is unavailable.
  }
}

function clearState(): void {
  try {
    localStorage.removeItem(BYPASS_KEY);
  } catch {
    // Non-critical
  }
}

/**
 * Returns true if the bypass is armed and hasn't expired. Safe to call from
 * `document_start` and `document_idle`. Side effect: clears the flag if it
 * has expired so subsequent loads don't re-check the timestamp forever.
 */
export function isBypassActive(): boolean {
  const state = readState();
  if (!state) return false;
  if (Date.now() - state.activatedAt >= BYPASS_DURATION_MS) {
    clearState();
    return false;
  }
  return true;
}

/**
 * Arm the bypass. The next page load (and the following 5 minutes) will skip
 * BetterLectio rendering until the user manually re-enables or the timer
 * expires. Caller is expected to reload immediately after.
 */
export function armBypass(): void {
  writeState({ activatedAt: Date.now() });
}

/** Clear the bypass immediately. Caller should reload to re-render the page. */
export function disableBypass(): void {
  clearState();
}

/**
 * Milliseconds remaining on the active bypass, or 0 if not active. Use to
 * drive a countdown UI on the re-enable button.
 */
export function getBypassRemainingMs(): number {
  const state = readState();
  if (!state) return 0;
  const remaining = BYPASS_DURATION_MS - (Date.now() - state.activatedAt);
  return remaining > 0 ? remaining : 0;
}
