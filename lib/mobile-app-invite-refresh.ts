/** Five-minute, per-student freshness window for native-app installation state. */
export const MOBILE_APP_INVITE_REFRESH_TTL_MS = 5 * 60_000;

const REFRESH_KEY_PREFIX = 'bl-mobile-app-invite-last-refresh';

export interface PersistedTimestampStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface MobileAppInviteRefreshLifecycleOptions {
  schoolId: string;
  studentId: string;
  /** Must query the component's exact own-student cache entry bypassing cache. */
  refresh: () => void | Promise<unknown>;
  storage?: PersistedTimestampStorage;
  now?: () => number;
  window?: EventTarget;
  document?: EventTarget & { visibilityState?: string };
}

function refreshKey(schoolId: string, studentId: string): string {
  return `${REFRESH_KEY_PREFIX}:${schoolId}:${studentId}`;
}

/**
 * Refreshes a student's installation state on visible entry and foreground
 * returns. The timestamp lives in localStorage, so remounts and navigation
 * cannot bypass the five-minute throttle. This deliberately has no timer:
 * work occurs only when the user returns to a visible page.
 */
export function installMobileAppInviteRefreshLifecycle(
  options: MobileAppInviteRefreshLifecycleOptions,
): () => void {
  const refreshWindow = options.window ?? window;
  const refreshDocument = options.document ?? document;
  const storage = options.storage ?? localStorage;
  const now = options.now ?? Date.now;
  const key = refreshKey(options.schoolId, options.studentId);
  let active = true;

  const refreshIfVisibleAndDue = () => {
    if (!active || refreshDocument.visibilityState === 'hidden') return;

    const currentTime = now();
    try {
      const storedTimestamp = storage.getItem(key);
      const lastRefresh = storedTimestamp == null ? null : Number(storedTimestamp);
      if (lastRefresh != null && Number.isFinite(lastRefresh) && currentTime - lastRefresh < MOBILE_APP_INVITE_REFRESH_TTL_MS) {
        return;
      }
      // Stamp before beginning the async query: focus and visibility can fire
      // together, and the persisted stamp also dedupes another mounted tab.
      storage.setItem(key, String(currentTime));
    } catch {
      // A blocked localStorage must not leave the 24h students cache as the
      // source of truth. Continue with the visible foreground refresh.
    }

    try {
      void Promise.resolve(options.refresh()).catch(() => {});
    } catch {
      // The next foreground return can recover from a transient query error.
    }
  };

  const onForeground = () => refreshIfVisibleAndDue();
  refreshWindow.addEventListener('focus', onForeground);
  refreshDocument.addEventListener('visibilitychange', onForeground);
  refreshIfVisibleAndDue();

  return () => {
    active = false;
    refreshWindow.removeEventListener('focus', onForeground);
    refreshDocument.removeEventListener('visibilitychange', onForeground);
  };
}
