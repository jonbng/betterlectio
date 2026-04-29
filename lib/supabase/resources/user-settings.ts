import type { Tables, Json } from '@/database.types';
import { cachedQuery, sendRpc } from '../client';
import { invalidateTable } from '../cache';

type UserSettingsRow = Tables<'user_settings'>;
type UserSchoolThemeRow = Tables<'user_school_themes'>;

export interface UpsertUserSettingsResult {
  settings: Json;
  schema_version: number;
  updated_at: string;
}

export interface UpsertUserSchoolThemeResult {
  school_id: string;
  theme_id: string;
  updated_at: string;
}

// Cache namespace for user-scoped tables — settings/themes are keyed on
// auth.uid(), not a school. Using a `user:<uid>` namespace keeps the
// existing schoolId-keyed cache invalidations isolated per user.
function userNamespace(supabaseId: string): string {
  return `user:${supabaseId}`;
}

// ── Feature settings (single jsonb blob, keyed on auth.uid()) ───────

export function getUserSettingsRow(supabaseId: string) {
  return cachedQuery<UserSettingsRow | null>({
    schoolId: userNamespace(supabaseId),
    table: 'user_settings',
    filters: [{ column: 'supabase_id', op: 'eq', value: supabaseId }],
    single: true,
  });
}

export async function upsertUserSettings(args: {
  settings: Json;
  clientUpdatedAt: string;
  schemaVersion: number;
  supabaseId: string;
}): Promise<UpsertUserSettingsResult | null> {
  const resp = await sendRpc('upsert_user_settings', {
    p_settings: args.settings,
    p_client_updated_at: args.clientUpdatedAt,
    p_schema_version: args.schemaVersion,
  });
  if (!resp.ok) throw new Error(resp.error ?? 'RPC failed');
  await invalidateTable(userNamespace(args.supabaseId), 'user_settings');
  const rows = (resp.data ?? []) as UpsertUserSettingsResult[];
  return rows[0] ?? null;
}

// ── Per-school theme ────────────────────────────────────────────────

export function getUserSchoolThemes(supabaseId: string) {
  return cachedQuery<UserSchoolThemeRow[]>({
    schoolId: userNamespace(supabaseId),
    table: 'user_school_themes',
    filters: [{ column: 'supabase_id', op: 'eq', value: supabaseId }],
  });
}

export async function upsertUserSchoolTheme(args: {
  schoolId: string;
  themeId: string;
  clientUpdatedAt: string;
  supabaseId: string;
}): Promise<UpsertUserSchoolThemeResult | null> {
  const resp = await sendRpc('upsert_user_school_theme', {
    p_school_id: args.schoolId,
    p_theme_id: args.themeId,
    p_client_updated_at: args.clientUpdatedAt,
  });
  if (!resp.ok) throw new Error(resp.error ?? 'RPC failed');
  await invalidateTable(userNamespace(args.supabaseId), 'user_school_themes');
  const rows = (resp.data ?? []) as UpsertUserSchoolThemeResult[];
  return rows[0] ?? null;
}

export type { UserSettingsRow, UserSchoolThemeRow };
