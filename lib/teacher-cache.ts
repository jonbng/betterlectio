const TEACHER_CACHE_KEY = 'il-teacher-names';
const TEACHER_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const inflightTeacherLoads = new Map<string, Promise<TeacherCache | null>>();

export interface TeacherInfo {
  fullName: string;
  abbrev: string;
}

export interface TeacherCache {
  byId: Record<string, TeacherInfo>; // teacherId (without T prefix) → info
  byAbbrev: Record<string, string>; // abbrev → fullName
  schoolId: string;
  cachedAt: number;
}

export function getCachedTeachers(schoolId: string): TeacherCache | null {
  try {
    const stored = localStorage.getItem(TEACHER_CACHE_KEY);
    if (!stored) return null;
    const cache: TeacherCache = JSON.parse(stored);
    if (cache.schoolId !== schoolId) return null;
    if (Date.now() - cache.cachedAt > TEACHER_CACHE_TTL) return null;
    return cache;
  } catch {
    return null;
  }
}

function saveTeacherCache(cache: TeacherCache): void {
  try {
    localStorage.setItem(TEACHER_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Fetch all teachers from FindSkema.aspx?type=laerer and build the name cache.
 * Returns cached data if available and fresh.
 */
export async function loadTeacherNames(schoolId: string): Promise<TeacherCache | null> {
  const cached = getCachedTeachers(schoolId);
  if (cached) return cached;

  const inflight = inflightTeacherLoads.get(schoolId);
  if (inflight) return inflight;

  const request = (async () => {
    try {
      const response = await fetch(
        `${window.location.origin}/lectio/${schoolId}/FindSkema.aspx?type=laerer`,
        { credentials: 'include' },
      );
      if (!response.ok) return null;

      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const byId: Record<string, TeacherInfo> = {};
      const byAbbrev: Record<string, string> = {};

      // Parse: <a data-lectioContextCard='T123'>Full Name (AB)</a>
      doc.querySelectorAll('a[data-lectioContextCard^="T"]').forEach(link => {
        const id = link.getAttribute('data-lectioContextCard')!.slice(1);
        const text = link.textContent?.trim() || '';
        const match = text.match(/^(.+?)\s*\(([^)]+)\)$/);
        if (match) {
          const fullName = match[1].trim();
          const abbrev = match[2].trim();
          byId[id] = { fullName, abbrev };
          byAbbrev[abbrev] = fullName;
        }
      });

      if (Object.keys(byId).length === 0) return null;

      const cache: TeacherCache = { byId, byAbbrev, schoolId, cachedAt: Date.now() };
      saveTeacherCache(cache);
      return cache;
    } catch {
      return null;
    } finally {
      inflightTeacherLoads.delete(schoolId);
    }
  })();

  inflightTeacherLoads.set(schoolId, request);
  return request;
}

/**
 * Look up a teacher's full name by their abbreviation.
 */
export function getTeacherName(cache: TeacherCache, abbrev: string): string | null {
  return cache.byAbbrev[abbrev] ?? null;
}

/**
 * Look up a teacher's context card ID (e.g. "T12345") by their abbreviation.
 */
export function getTeacherContextCardId(cache: TeacherCache, abbrev: string): string | null {
  for (const [id, info] of Object.entries(cache.byId)) {
    if (info.abbrev === abbrev) return `T${id}`;
  }
  return null;
}

/**
 * Replace teacher initials with full names in the DOM.
 * Targets <span data-lectioContextCard="T..."> elements.
 */
export function replaceTeacherInitialsInDOM(cache: TeacherCache, container: HTMLElement): number {
  const spans = container.querySelectorAll<HTMLElement>('span[data-lectioContextCard^="T"]');
  let count = 0;

  spans.forEach(span => {
    const id = span.getAttribute('data-lectioContextCard')!.slice(1);
    const entry = cache.byId[id];
    if (entry) {
      span.textContent = entry.fullName;
      span.title = entry.abbrev;
      count++;
    }
  });

  return count;
}
