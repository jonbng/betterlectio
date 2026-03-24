import type { Tables } from '@/database.types';
import { cachedQuery, sendRpc } from '../client';
import { invalidateTable } from '../cache';

type Lesson = Tables<'lessons'>;
type LessonMapping = Tables<'lesson_mappings'>;
type SchoolLessonMapping = Tables<'school_lesson_mappings'>;
type UserLessonOverride = Tables<'user_lesson_overrides'>;

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

export function getSchoolLessonMappings(schoolId: string) {
  return cachedQuery<SchoolLessonMapping[]>({
    schoolId,
    table: 'school_lesson_mappings',
    filters: [
      { column: 'school_id', op: 'eq', value: Number(schoolId) },
      { column: 'deleted_at', op: 'is', value: null },
    ],
    order: { column: 'canonical_key', ascending: true },
  });
}

export function getUserLessonOverrides(schoolId: string, studentId: string) {
  return cachedQuery<UserLessonOverride[]>({
    schoolId,
    table: 'user_lesson_overrides',
    filters: [
      { column: 'student_id', op: 'eq', value: studentId },
      { column: 'deleted_at', op: 'is', value: null },
    ],
    order: { column: 'updated_at', ascending: false },
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

export async function getStudentLessonMappingsV2(schoolId: string, studentId: string) {
  const resp = await sendRpc('get_student_lesson_mappings_v2', {
    p_school_id: Number(schoolId),
    p_student_id: studentId,
  });
  if (!resp.ok) throw new Error(resp.error ?? 'RPC failed');
  return resp.data as {
    canonical_key: string;
    default_color_hue: number | null;
    default_icon: string | null;
    default_name: string;
    override_color_hue: number | null;
    override_display_name: string | null;
    override_icon: string | null;
    display_color_hue: number | null;
    display_icon: string | null;
    display_name: string;
    is_overridden: boolean;
    mapping_id: string;
    override_id: string | null;
    school_id: number;
    student_id: string | null;
    updated_at: string;
  }[];
}

export interface LessonMappingV2Row {
  canonical_key: string;
  default_color_hue: number | null;
  default_icon: string | null;
  default_name: string;
  override_color_hue: number | null;
  override_display_name: string | null;
  override_icon: string | null;
  display_color_hue: number | null;
  display_icon: string | null;
  display_name: string;
  is_overridden: boolean;
  mapping_id: string;
  override_id: string | null;
  school_id: number;
  student_id: string | null;
  updated_at: string;
}

async function invalidateLessonMappingCaches(schoolId: string) {
  await Promise.all([
    invalidateTable(schoolId, 'school_lesson_mappings'),
    invalidateTable(schoolId, 'user_lesson_overrides'),
  ]);
}

export async function upsertUserLessonOverrideV2(
  schoolId: string,
  studentId: string,
  data: {
    canonicalKey: string;
    defaultName: string;
    defaultColorHue?: number | null;
    displayName?: string | null;
    colorHue?: number | null;
    icon?: string | null;
    lastModifiedBy?: string | null;
    clientUpdatedAt?: string | null;
  },
  opts?: { invalidate?: boolean },
) {
  const resp = await sendRpc('upsert_user_lesson_override_v2', {
    p_school_id: Number(schoolId),
    p_student_id: studentId,
    p_canonical_key: data.canonicalKey,
    p_default_name: data.defaultName,
    p_default_color_hue: data.defaultColorHue ?? null,
    p_display_name: data.displayName ?? null,
    p_color_hue: data.colorHue ?? null,
    p_icon: data.icon ?? null,
    p_last_modified_by: data.lastModifiedBy ?? null,
    p_client_updated_at: data.clientUpdatedAt ?? null,
  });
  if (!resp.ok) throw new Error(resp.error ?? 'RPC failed');
  if (opts?.invalidate !== false) {
    await invalidateLessonMappingCaches(schoolId);
  }
  return resp.data as LessonMappingV2Row[];
}

export async function resetUserLessonOverrideV2(
  schoolId: string,
  studentId: string,
  canonicalKey: string,
  lastModifiedBy = 'extension',
) {
  const resp = await sendRpc('reset_user_lesson_override_v2', {
    p_school_id: Number(schoolId),
    p_student_id: studentId,
    p_canonical_key: canonicalKey,
    p_last_modified_by: lastModifiedBy,
    p_client_updated_at: new Date().toISOString(),
  });
  if (!resp.ok) throw new Error(resp.error ?? 'RPC failed');
  await invalidateLessonMappingCaches(schoolId);
}
