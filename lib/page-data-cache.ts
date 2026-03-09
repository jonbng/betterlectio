const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 1 week

interface CachedResult {
  hasData: boolean;
  fetchedAt: number;
}

function cacheKey(page: string): string {
  return `il-has-${page}`;
}

function scopedCacheKey(schoolId: string, page: string): string {
  return `${cacheKey(page)}:${schoolId}`;
}

/** Read cached result synchronously (returns null if expired/missing) */
export function getCachedPageHasData(schoolId: string, page: string): boolean | null {
  try {
    const raw = localStorage.getItem(scopedCacheKey(schoolId, page));
    if (!raw) return null;
    const cached: CachedResult = JSON.parse(raw);
    if (Date.now() - cached.fetchedAt > CACHE_TTL) return null;
    return cached.hasData;
  } catch {
    return null;
  }
}

/** Fetch a Lectio page and check if it has real data (no .noRecord element) */
async function fetchPageHasData(schoolId: string, path: string, page: string): Promise<boolean> {
  try {
    const url = new URL(`/lectio/${schoolId}/${path}`, window.location.origin).href;
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) return true; // assume data exists on error

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Lectio shows "Der er ingen data..." / "Eleven har ingen..." inside .noRecord when empty
    const noRecord = doc.querySelector('.noRecord');
    const hasData = !noRecord;

    try {
      const data: CachedResult = { hasData, fetchedAt: Date.now() };
      localStorage.setItem(scopedCacheKey(schoolId, page), JSON.stringify(data));
    } catch { /* ignore quota errors */ }

    return hasData;
  } catch {
    return true; // assume data exists on error
  }
}

/** Get whether page has data: from cache if fresh, otherwise fetch */
export async function getPageHasData(schoolId: string, path: string, page: string): Promise<boolean> {
  const cached = getCachedPageHasData(schoolId, page);
  if (cached !== null) return cached;
  return fetchPageHasData(schoolId, path, page);
}
