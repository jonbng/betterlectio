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

export type StudentBulkRow = Pick<
  Student,
  | 'id'
  | 'name'
  | 'lectio_first_name'
  | 'lectio_last_name'
  | 'custom_pfp_url'
  | 'extension_installed_at'
  | 'app_installed_at'
>;

export function getStudentsBySchool(schoolId: string) {
  return cachedQuery<StudentBulkRow[]>({
    schoolId,
    table: 'students',
    select: 'id,name,lectio_first_name,lectio_last_name,custom_pfp_url,extension_installed_at,app_installed_at',
    filters: [{ column: 'school_id', op: 'eq', value: Number(schoolId) }],
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
