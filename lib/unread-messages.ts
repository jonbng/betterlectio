/**
 * Unread message count for sidebar badge.
 * Fetches forside.aspx and parses the "N ulæste" text from the Beskeder dashboard widget.
 * Falls back to checking `notification-dot` in current DOM for instant boolean detection.
 */

const CACHE_KEY = 'bl-unread-messages';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CachedUnread {
  count: number;
  schoolId: string;
  fetchedAt: number;
}

/** Check if current page DOM has Lectio's notification-dot (instant, no fetch) */
export function hasNotificationDot(): boolean {
  return document.querySelector('.notification-dot') !== null;
}

/** Read cached unread count */
export function getCachedUnreadCount(schoolId: string): number | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedUnread = JSON.parse(raw);
    if (cached.schoolId !== schoolId) return null;
    if (Date.now() - cached.fetchedAt > CACHE_TTL) return null;
    return cached.count;
  } catch {
    return null;
  }
}

function saveCachedUnreadCount(schoolId: string, count: number): void {
  const data: CachedUnread = { count, schoolId, fetchedAt: Date.now() };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch { /* ignore quota errors */ }
}

/** Parse unread count from forside HTML document */
function parseUnreadFromDoc(doc: Document): number {
  // There are multiple .dashboardLinkHeaderInfoText on forside (one per dashboard section).
  // Only the Beskeder one contains "N ulæste", so search all of them.
  const allInfoTexts = doc.querySelectorAll('.dashboardLinkHeaderInfoText');
  for (const el of allInfoTexts) {
    const match = el.textContent?.match(/(\d+)\s*ulæste/);
    if (match) return parseInt(match[1], 10);
  }
  return 0;
}

// In-flight deduplication
let inflight: Promise<number> | null = null;

/** Fetch unread count from forside.aspx */
export async function fetchUnreadCount(schoolId: string): Promise<number> {
  // If on forside, parse from current DOM
  if (window.location.pathname.toLowerCase().includes('forside')) {
    const count = parseUnreadFromDoc(document);
    saveCachedUnreadCount(schoolId, count);
    return count;
  }

  // Deduplicate concurrent fetches
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const url = new URL(`/lectio/${schoolId}/forside.aspx`, window.location.origin).href;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) return 0;
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const count = parseUnreadFromDoc(doc);
      saveCachedUnreadCount(schoolId, count);
      return count;
    } catch {
      return 0;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Get unread count: from cache if fresh, otherwise fetch */
export async function getUnreadCount(schoolId: string): Promise<number> {
  const cached = getCachedUnreadCount(schoolId);
  if (cached !== null) return cached;
  return fetchUnreadCount(schoolId);
}

/** Update the unread count from an authoritative source (e.g. BeskederPage thread list).
 *  Saves to cache and dispatches a custom event so sidebar + page title stay in sync. */
export function broadcastUnreadCount(schoolId: string, count: number): void {
  saveCachedUnreadCount(schoolId, count);
  window.dispatchEvent(new CustomEvent('betterlectio:unreadCount', { detail: { count } }));
}
