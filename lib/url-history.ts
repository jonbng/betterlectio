// Lightweight per-tab URL breadcrumb trail used to enrich error reports.
//
// Stored in sessionStorage so it survives same-tab navigations (each Lectio
// page is a fresh document, so memory state is lost), but is scoped per tab.

const URL_HISTORY_KEY = 'bl-url-history';
const MAX_HISTORY = 5;

/**
 * Push the current URL onto the recent-URLs list. Consecutive duplicates are
 * skipped so a reload does not waste a slot.
 */
export function pushUrlToHistory(url: string = window.location.href): void {
  try {
    const raw = sessionStorage.getItem(URL_HISTORY_KEY);
    const prev: string[] = raw ? JSON.parse(raw) : [];
    if (prev[0] === url) return;
    const next = [url, ...prev.filter((u) => u !== url)].slice(0, MAX_HISTORY);
    sessionStorage.setItem(URL_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Non-critical
  }
}

/**
 * Get the most recent URLs this tab visited, newest first. Does not include
 * the current page unless it was pushed already.
 */
export function getRecentUrls(count: number = 3): string[] {
  try {
    const raw = sessionStorage.getItem(URL_HISTORY_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.slice(0, count) : [];
  } catch {
    return [];
  }
}
