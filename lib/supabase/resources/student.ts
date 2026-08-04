import type { Database, Tables, TablesUpdate } from '@/database.types';
import { cachedQuery, mutate, sendRpc } from '../client';

type Student = Tables<'students'>;
export type PublicStudentProfile = Database['public']['Functions']['get_student_profile']['Returns'][number];

export async function getStudentProfile(studentId: string): Promise<PublicStudentProfile | null> {
  const response = await sendRpc('get_student_profile', { p_student_id: studentId });
  if (!response.ok) throw new Error(response.error ?? 'Profile query failed');
  const rows = Array.isArray(response.data) ? response.data : [];
  return (rows[0] as PublicStudentProfile | undefined) ?? null;
}

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
