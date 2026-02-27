const CACHE_KEY = 'il-my-teachers';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface MyTeachersCache {
  teacherIds: string[]; // e.g. ["T1234567890", "T9876543210"]
  schoolId: string;
  cachedAt: number;
}

/** Get cached teacher IDs if fresh */
function getCached(schoolId: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: MyTeachersCache = JSON.parse(raw);
    if (cached.schoolId !== schoolId) return null;
    if (Date.now() - cached.cachedAt > CACHE_TTL) return null;
    return new Set(cached.teacherIds);
  } catch {
    return null;
  }
}

function saveCache(teacherIds: Set<string>, schoolId: string): void {
  const data: MyTeachersCache = {
    teacherIds: [...teacherIds],
    schoolId,
    cachedAt: Date.now(),
  };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

/**
 * Extract unique teacher IDs from a schedule page's bricks.
 * Scans all `span[data-lectiocontextcard^="T"]` inside schedule bricks.
 */
function parseTeacherIdsFromDoc(doc: Document): Set<string> {
  const ids = new Set<string>();
  const spans = doc.querySelectorAll('.s2skemabrik span[data-lectiocontextcard^="T"]');
  spans.forEach(span => {
    const id = span.getAttribute('data-lectiocontextcard');
    if (id) ids.add(id);
  });
  return ids;
}

/**
 * Get the logged-in student's teacher IDs by fetching their schedule page.
 * Returns a Set of IDs like "T1234567890" matching FindSkema item IDs.
 * Results are cached for 24 hours.
 */
export async function getMyTeacherIds(schoolId: string): Promise<Set<string>> {
  const cached = getCached(schoolId);
  if (cached && cached.size > 0) return cached;

  try {
    const url = new URL(`/lectio/${schoolId}/SkemaNy.aspx`, window.location.origin).href;
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) return new Set();

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const ids = parseTeacherIdsFromDoc(doc);

    if (ids.size > 0) {
      saveCache(ids, schoolId);
    }
    return ids;
  } catch {
    return new Set();
  }
}
