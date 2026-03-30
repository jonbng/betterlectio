import { getCachedProfile } from './profile-cache';
import { resolveClassId } from './resolve-class-id';
import { fetchMembersFromUrls } from './members-fetch';

const CACHE_KEY = 'bl-my-teachers';
const LEGACY_CACHE_KEY = 'il-my-teachers';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface MyTeachersCache {
  teacherIds: string[]; // e.g. ["T1234567890", "T9876543210"]
  schoolId: string;
  cachedAt: number;
}

/** Get cached teacher IDs if fresh */
function getCached(schoolId: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY) ?? localStorage.getItem(LEGACY_CACHE_KEY);
    if (!raw) return null;
    if (!localStorage.getItem(CACHE_KEY)) {
      localStorage.setItem(CACHE_KEY, raw);
    }
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
 * Get the logged-in student's teacher IDs by fetching their class members page.
 * Returns a Set of IDs like "T1234567890" matching FindSkema item IDs.
 * Results are cached for 24 hours.
 */
export async function getMyTeacherIds(schoolId: string): Promise<Set<string>> {
  const cached = getCached(schoolId);
  if (cached && cached.size > 0) return cached;

  try {
    const profile = getCachedProfile();
    if (!profile?.className) return new Set();

    const klasseId = await resolveClassId(schoolId, profile.className);
    if (!klasseId) return new Set();

    const membersUrl = new URL(
      `/lectio/${schoolId}/subnav/members.aspx`,
      window.location.origin,
    );
    membersUrl.searchParams.set('klasseid', klasseId);
    membersUrl.searchParams.set('showteachers', '1');
    membersUrl.searchParams.set('reporttype', 'withpics');

    const members = await fetchMembersFromUrls([membersUrl.href]);
    const teacherIds = new Set(
      members.filter(m => m.type === 'T').map(m => m.id),
    );

    if (teacherIds.size > 0) {
      saveCache(teacherIds, schoolId);
    }
    return teacherIds;
  } catch {
    return new Set();
  }
}
