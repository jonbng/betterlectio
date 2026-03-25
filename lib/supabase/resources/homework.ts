import type { Tables } from '@/database.types';
import { cachedQuery, mutate, sendRpc } from '../client';
import { invalidateTable } from '../cache';

type HomeworkEntry = Tables<'homework_entries'>;
type StudentHomework = Tables<'student_homework'>;

export function getHomework(schoolId: string) {
  return cachedQuery<HomeworkEntry[]>({
    schoolId,
    table: 'homework_entries',
    filters: [{ column: 'school_id', op: 'eq', value: Number(schoolId) }],
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

export async function upsertStudentHomeworkStatus(
  schoolId: string,
  studentId: string,
  entryId: string,
  isDone: boolean,
  lastModifiedBy = 'extension',
  clientUpdatedAt = new Date().toISOString(),
  entry?: {
    displayDate: string;
    hold: string;
    itemsJson: unknown[];
    lessonDate: string;
    note: string | null;
    room: string | null;
    teacher: string | null;
    title: string | null;
  },
) {
  const resp = await sendRpc('upsert_student_homework_status', {
    p_school_id: Number(schoolId),
    p_student_id: studentId,
    p_entry_id: entryId,
    p_is_done: isDone,
    p_client_updated_at: clientUpdatedAt,
    p_last_modified_by: lastModifiedBy,
    p_display_date: entry?.displayDate ?? null,
    p_hold: entry?.hold ?? null,
    p_items_json: entry?.itemsJson ?? null,
    p_lesson_date: entry?.lessonDate ?? null,
    p_note: entry?.note ?? null,
    p_room: entry?.room ?? null,
    p_teacher: entry?.teacher ?? null,
    p_title: entry?.title ?? null,
  });

  if (!resp.ok) throw new Error(resp.error ?? 'RPC failed');

  await Promise.all([
    invalidateTable(schoolId, 'homework_entries'),
    invalidateTable(schoolId, 'student_homework'),
  ]);

  return resp.data;
}
