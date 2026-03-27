import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Tables } from '@/database.types';
import { useQuery } from './hooks';
import { invalidateTable } from './cache';

export type Student = Tables<'students'>;
export type StudentsMap = Map<string, Student>;

const ADOPTION_SCHOOL_THRESHOLD = 30;
const ADOPTION_CLASS_THRESHOLD = 5;

const STUDENTS_REFRESH_KEY_PREFIX = 'bl-students-last-refresh';
const STUDENTS_REFRESH_TTL_MS = 30_000;

/** Hook that fetches all students from the same school. Returns a Map for O(1) lookups. */
export function useSchoolStudents(
  schoolId: string,
  opts?: { refreshOnMount?: boolean },
) {
  const [refreshReady, setRefreshReady] = useState(!opts?.refreshOnMount);

  useEffect(() => {
    let cancelled = false;

    if (!opts?.refreshOnMount) {
      setRefreshReady(true);
      return;
    }

    setRefreshReady(false);
    invalidateStudentsCacheIfStale(schoolId)
      .catch(() => false)
      .finally(() => {
        if (!cancelled) setRefreshReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [schoolId, opts?.refreshOnMount]);

  const { data: students, isLoading } = useQuery<Student[]>({
    schoolId,
    table: 'students',
    filters: [{ column: 'school_id', op: 'eq', value: Number(schoolId) }],
    enabled: refreshReady,
  });

  const studentsMap = useMemo(() => {
    if (!students) return null;
    const map = new Map<string, Student>();
    for (const s of students) {
      map.set(s.id, s);
    }
    return map;
  }, [students]);

  return { students, studentsMap, isLoading: !refreshReady || isLoading };
}

/** Hook that checks BetterLectio adoption counts for skip-profile-step logic. */
export function useAdoptionCounts(
  schoolId: string,
  className: string | null,
): { schoolCount: number | null; classCount: number | null; isLoading: boolean } {
  const { data: schoolStudents, isLoading: schoolLoading } = useQuery<Pick<Student, 'id'>[]>({
    schoolId,
    table: 'students',
    select: 'id',
    filters: [
      { column: 'school_id', op: 'eq', value: Number(schoolId) },
      { column: 'has_extension', op: 'eq', value: true },
    ],
    enabled: Boolean(schoolId),
  });

  const { data: classStudents, isLoading: classLoading } = useQuery<Pick<Student, 'id'>[]>({
    schoolId,
    table: 'students',
    select: 'id',
    filters: [
      { column: 'school_id', op: 'eq', value: Number(schoolId) },
      { column: 'has_extension', op: 'eq', value: true },
      { column: 'class_name', op: 'eq', value: className! },
    ],
    enabled: Boolean(schoolId) && Boolean(className),
  });

  return {
    schoolCount: schoolStudents ? schoolStudents.length : null,
    classCount: className ? (classStudents ? classStudents.length : null) : null,
    isLoading: schoolLoading || (Boolean(className) && classLoading),
  };
}

export { ADOPTION_SCHOOL_THRESHOLD, ADOPTION_CLASS_THRESHOLD };

export async function invalidateStudentsCacheIfStale(
  schoolId: string,
  maxAgeMs: number = STUDENTS_REFRESH_TTL_MS,
): Promise<boolean> {
  const storageKey = `${STUDENTS_REFRESH_KEY_PREFIX}:${schoolId}`;
  const now = Date.now();

  try {
    const raw = localStorage.getItem(storageKey);
    const lastRefresh = raw ? Number(raw) : 0;
    if (Number.isFinite(lastRefresh) && now - lastRefresh < maxAgeMs) {
      return false;
    }

    await invalidateTable(schoolId, 'students');
    localStorage.setItem(storageKey, String(now));
    return true;
  } catch {
    return false;
  }
}

export function getPreferredStudentPictureUrl(
  student: Pick<Student, 'custom_pfp_url' | 'lectio_pfp_url'> | null | undefined,
  fallbackPictureUrl?: string | null,
): string | null {
  return student?.custom_pfp_url || student?.lectio_pfp_url || fallbackPictureUrl || null;
}

export function getPreferredStudentDisplayName(
  student: Pick<Student, 'name' | 'lectio_first_name' | 'lectio_last_name'> | null | undefined,
  fallbackName: string,
): string {
  const preferredName = student?.name?.trim();
  if (preferredName) return preferredName;

  const lectioName = [student?.lectio_first_name, student?.lectio_last_name]
    .map((part) => part?.trim() || '')
    .filter(Boolean)
    .join(' ');
  return lectioName || fallbackName;
}

export function getStudentNameAliases(
  student: Pick<Student, 'name' | 'lectio_first_name' | 'lectio_last_name'> | null | undefined,
  fallbackName?: string | null,
): string[] {
  const aliases = new Set<string>();

  const addAlias = (value?: string | null) => {
    const trimmed = value?.trim();
    if (trimmed) aliases.add(trimmed);
  };

  addAlias(fallbackName);
  addAlias(student?.name);
  addAlias(student?.lectio_first_name);
  addAlias(student?.lectio_last_name);

  const lectioFullName = [student?.lectio_first_name, student?.lectio_last_name]
    .map((part) => part?.trim() || '')
    .filter(Boolean)
    .join(' ');
  addAlias(lectioFullName);

  return [...aliases];
}

/** Strip the type prefix (e.g. "S") from a PersonCard ID to get the raw Lectio elevid. Returns null for non-student types. */
export function getStudentIdFromPersonId(personId: string): string | null {
  if (!personId || personId.length < 2) return null;
  const prefix = personId[0];
  if (prefix !== 'S') return null;
  const numericPart = personId.slice(1);
  // Some IDs have additional prefix chars (SC, etc.) — only strip single-char student prefix
  if (!/^\d+$/.test(numericPart)) return null;
  return numericPart;
}

/** Resolve a student row from either a raw student ID or a PersonCard/context-card ID like "S727..." */
export function getStudentFromLookupId(
  studentsMap: StudentsMap | null | undefined,
  lookupId: string | null | undefined,
): Student | null {
  if (!studentsMap || !lookupId) return null;
  const studentId = /^\d+$/.test(lookupId) ? lookupId : getStudentIdFromPersonId(lookupId);
  if (!studentId) return null;
  return studentsMap.get(studentId) || null;
}

export function getPictureUrlFromLookupId(
  studentsMap: StudentsMap | null | undefined,
  lookupId: string | null | undefined,
  fallbackPictureUrl?: string | null,
): string | null {
  return getPreferredStudentPictureUrl(
    getStudentFromLookupId(studentsMap, lookupId),
    fallbackPictureUrl,
  );
}

export function getDisplayNameFromLookupId(
  studentsMap: StudentsMap | null | undefined,
  lookupId: string | null | undefined,
  fallbackName: string,
): string {
  return getPreferredStudentDisplayName(
    getStudentFromLookupId(studentsMap, lookupId),
    fallbackName,
  );
}

export function getNameAliasesFromLookupId(
  studentsMap: StudentsMap | null | undefined,
  lookupId: string | null | undefined,
  fallbackName?: string | null,
): string[] {
  return getStudentNameAliases(
    getStudentFromLookupId(studentsMap, lookupId),
    fallbackName,
  );
}

/** Format ISO date (YYYY-MM-DD) to Danish format like "9. jan 2008" */
export function formatDanishBirthdate(isoDate: string): string {
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const [year, month, day] = isoDate.split('-');
  const monthName = MONTHS[parseInt(month, 10) - 1] || month;
  return `${parseInt(day, 10)}. ${monthName} ${year}`;
}
