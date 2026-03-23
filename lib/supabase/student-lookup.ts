import { useMemo } from 'preact/hooks';
import type { Tables } from '@/database.types';
import { useQuery } from './hooks';

type Student = Tables<'students'>;

/** Hook that fetches all students from the same school. Returns a Map for O(1) lookups. */
export function useSchoolStudents(schoolId: string) {
  const { data: students, isLoading } = useQuery<Student[]>({
    schoolId,
    table: 'students',
    filters: [{ column: 'school_id', op: 'eq', value: Number(schoolId) }],
  });

  const studentsMap = useMemo(() => {
    if (!students) return null;
    const map = new Map<string, Student>();
    for (const s of students) {
      map.set(s.id, s);
    }
    return map;
  }, [students]);

  return { students, studentsMap, isLoading };
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

/** Format ISO date (YYYY-MM-DD) to Danish format like "9. jan 2008" */
export function formatDanishBirthdate(isoDate: string): string {
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const [year, month, day] = isoDate.split('-');
  const monthName = MONTHS[parseInt(month, 10) - 1] || month;
  return `${parseInt(day, 10)}. ${monthName} ${year}`;
}
