import type { Tables, TablesUpdate } from '@/database.types';
import { cachedQuery, mutate } from '../client';

type Student = Tables<'students'>;

export function getStudent(schoolId: string, studentId: string) {
  return cachedQuery<Student>({
    schoolId,
    table: 'students',
    filters: [{ column: 'id', op: 'eq', value: studentId }],
    single: true,
  });
}

export function updateStudent(schoolId: string, studentId: string, data: TablesUpdate<'students'>) {
  return mutate({
    table: 'students',
    method: 'update',
    data: data as Record<string, unknown>,
    filters: [{ column: 'id', op: 'eq', value: studentId }],
    schoolId,
  });
}
