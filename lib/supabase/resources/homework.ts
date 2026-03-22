import type { Tables } from '@/database.types';
import { cachedQuery, mutate } from '../client';

type HomeworkEntry = Tables<'homework_entries'>;
type StudentHomework = Tables<'student_homework'>;

export function getHomework(schoolId: string) {
  return cachedQuery<HomeworkEntry[]>({
    schoolId,
    table: 'homework_entries',
    order: { column: 'lesson_date', ascending: true },
  });
}

export function getStudentHomework(schoolId: string, studentId: string) {
  return cachedQuery<StudentHomework[]>({
    schoolId,
    table: 'student_homework',
    filters: [{ column: 'student_id', op: 'eq', value: studentId }],
  });
}

export function markHomeworkDone(schoolId: string, homeworkId: string, studentId: string, isDone: boolean) {
  return mutate({
    table: 'student_homework',
    method: 'upsert',
    data: {
      homework_id: homeworkId,
      student_id: studentId,
      is_done: isDone,
      done_updated_at: new Date().toISOString(),
    },
    schoolId,
    invalidates: ['student_homework'],
  });
}
