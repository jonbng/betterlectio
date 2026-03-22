import type { Tables } from '@/database.types';
import { cachedQuery, sendRpc } from '../client';

type Lesson = Tables<'lessons'>;
type LessonMapping = Tables<'lesson_mappings'>;

export function getLessons(schoolId: string, weekKey: string) {
  return cachedQuery<Lesson[]>({
    schoolId,
    table: 'lessons',
    filters: [{ column: 'week_key', op: 'eq', value: weekKey }],
    order: { column: 'lesson_date', ascending: true },
  });
}

export function getLessonMappings(schoolId: string) {
  return cachedQuery<LessonMapping[]>({
    schoolId,
    table: 'lesson_mappings',
    filters: [{ column: 'gym_id', op: 'eq', value: schoolId }],
  });
}

export async function getStudentLessonMappings(gymId: string, studentId: string) {
  const resp = await sendRpc('get_student_lesson_mappings', {
    p_gym_id: gymId,
    p_student_id: studentId,
  });
  if (!resp.ok) throw new Error(resp.error ?? 'RPC failed');
  return resp.data as {
    default_color: string;
    display_color: string;
    display_name: string;
    full_name: string;
    is_overwritten: boolean;
    mapping_id: string;
    original_string: string;
  }[];
}
