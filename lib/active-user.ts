export const ACTIVE_WINDOW_DAYS = 14;
const ACTIVE_WINDOW_MS = ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export type ActivityFields = {
  last_seen_at?: string | null;
  extension_installed_at?: string | null;
  extension_uninstalled_at?: string | null;
};

/**
 * A student counts as "active" when their most recent signal of life — the daily
 * `last_seen_at` heartbeat, or `extension_installed_at` as a fallback for fresh
 * installs that haven't pinged yet — is within ACTIVE_WINDOW_DAYS and they
 * haven't uninstalled.
 */
export function isActiveStudent(s: ActivityFields | null | undefined, now = Date.now()): boolean {
  if (!s) return false;
  if (s.extension_uninstalled_at) return false;
  const ts = s.last_seen_at ?? s.extension_installed_at;
  if (!ts) return false;
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return false;
  return now - t <= ACTIVE_WINDOW_MS;
}
