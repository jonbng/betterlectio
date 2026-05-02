import { toast } from 'sonner';
import { getSession } from '@/lib/supabase/client';
import {
  getUserSettingsRow,
  upsertUserSettings,
  getUserSchoolThemes,
  upsertUserSchoolTheme,
} from '@/lib/supabase/resources';
import { onTableChange, subscribe, unsubscribe } from '@/lib/supabase/realtime';
import {
  applySettingsSideEffects,
  FeatureSettingsSchema,
  getSettings,
  saveSettings,
  withSyncSuppressed,
} from '@/lib/settings-storage';
import {
  applyThemePreferenceToDocument,
  getSchoolIdFromCurrentUrl,
  getThemePreferenceForSchool,
  saveThemePreferenceForSchool,
} from '@/lib/theme-storage';
import { capture, captureException, getDistinctId } from '@/lib/posthog';
import { getLoggedInUserId } from '@/lib/profile-cache';
import { t } from '@/lib/i18n';
import type { Json } from '@/database.types';

const SYNCED_AT_KEY = 'bl-settings-synced-at';
const THEME_SYNCED_AT_KEY = 'bl-themes-synced-at';
const SETTINGS_HYDRATED_AT_KEY = 'bl-settings-hydrated-at';
const THEMES_HYDRATED_AT_KEY = 'bl-themes-hydrated-at';
const FEATURE_SETTINGS_KEY = 'bl-feature-settings';

const DEBOUNCE_MS = 500;
// Skip the bootstrap GET if we hydrated within this window. Realtime
// subscription covers cross-device updates while a tab is open; the only
// regression is a fresh tab on device B within the TTL after a change on
// device A — next page load past TTL fixes it.
const HYDRATE_TTL_MS = 30 * 60_000;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let themePushTimer: ReturnType<typeof setTimeout> | null = null;
let pageHideHooked = false;

let hydratePromise: Promise<boolean> | null = null;
let hydrateThemesPromise: Promise<boolean> | null = null;

function isAuthOwnershipError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /\bunauthorized\b/i.test(message);
}

interface SyncContext {
  schoolId: string;
  studentId: string;
  supabaseId: string;
}

async function getSyncContext(): Promise<SyncContext | null> {
  const schoolId = getSchoolIdFromCurrentUrl();
  const studentId = getLoggedInUserId();
  if (!schoolId || !studentId) return null;

  try {
    const { ensureSupabaseSession } = await import('@/lib/supabase/session');
    await ensureSupabaseSession(schoolId, 'settings-sync', studentId);
  } catch {
    // Fall through and let the auth gate below catch a missing session.
  }

  const session = await getSession();
  if (!session?.user_id) return null;

  return { schoolId, studentId, supabaseId: session.user_id };
}

function readSyncedAt(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeSyncedAt(key: string, isoTime: string): void {
  try {
    localStorage.setItem(key, isoTime);
  } catch {
    // Ignore storage errors.
  }
}

function hydrateKey(prefix: string, supabaseId: string): string {
  return `${prefix}:${supabaseId}`;
}

function isHydrateFresh(prefix: string, supabaseId: string): boolean {
  try {
    const raw = localStorage.getItem(hydrateKey(prefix, supabaseId));
    if (!raw) return false;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return false;
    return Date.now() - parsed < HYDRATE_TTL_MS;
  } catch {
    return false;
  }
}

function stampHydrate(prefix: string, supabaseId: string): void {
  try {
    localStorage.setItem(hydrateKey(prefix, supabaseId), String(Date.now()));
  } catch {
    // Ignore storage errors.
  }
}

function ensurePageHideFlush(): void {
  if (pageHideHooked) return;
  pageHideHooked = true;
  window.addEventListener('pagehide', () => {
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
      void pushSettingsNow().catch(() => {});
    }
    if (themePushTimer) {
      clearTimeout(themePushTimer);
      themePushTimer = null;
      void pushCurrentSchoolThemeNow().catch(() => {});
    }
  });
}

function showReloadToast(): void {
  toast(t('settings.reloadToast'), {
    action: {
      label: t('settings.reload'),
      onClick: () => window.location.reload(),
    },
    duration: 8000,
  });
}

// ── Settings hydrate ────────────────────────────────────────────────

export async function hydrateSettingsFromSupabase(force = false): Promise<boolean> {
  if (!force && hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    const ctx = await getSyncContext();
    if (!ctx) return false;

    // Skip the GET when we recently hydrated this user. Realtime keeps tabs
    // up to date in-session; bootstrap-on-every-page-load was redundant.
    if (!force && isHydrateFresh(SETTINGS_HYDRATED_AT_KEY, ctx.supabaseId)) {
      return false;
    }

    try {
      const row = await getUserSettingsRow(ctx.supabaseId);
      stampHydrate(SETTINGS_HYDRATED_AT_KEY, ctx.supabaseId);
      if (!row) {
        // No remote row yet — push current local state if it's been touched
        // (otherwise defaults are fine to leave unsaved).
        const localExists = (() => {
          try { return Boolean(localStorage.getItem(FEATURE_SETTINGS_KEY)); }
          catch { return false; }
        })();
        if (localExists) {
          schedulePushSettingsToSupabase();
        }
        return false;
      }

      const remoteUpdatedAt = Date.parse(row.updated_at);
      const localSyncedAt = readSyncedAt(SYNCED_AT_KEY);
      if (Number.isFinite(remoteUpdatedAt) && remoteUpdatedAt <= localSyncedAt) {
        return false;
      }

      const parsed = FeatureSettingsSchema.safeParse(row.settings);
      if (!parsed.success) {
        captureException(parsed.error, getDistinctId(ctx.studentId), {
          source: 'settings-sync',
          phase: 'hydrate',
          school_id: ctx.schoolId,
        });
        return false;
      }

      const prev = getSettings();
      let changed = false;
      let needsReload = false;

      withSyncSuppressed(() => {
        saveSettings(parsed.data);
        const result = applySettingsSideEffects(prev, parsed.data);
        changed = result.changed;
        needsReload = result.requiresReload;
      });

      writeSyncedAt(SYNCED_AT_KEY, row.updated_at);

      if (changed) {
        window.dispatchEvent(new CustomEvent('betterlectio:settings-hydrated'));
        const distinctId = getDistinctId(ctx.studentId);
        if (distinctId) {
          capture('settings synced from cloud', distinctId, {
            school_id: ctx.schoolId,
            required_reload: needsReload,
          });
        }
        if (needsReload) showReloadToast();
      }
      return changed;
    } catch (error) {
      if (!isAuthOwnershipError(error)) {
        captureException(error, getDistinctId(ctx.studentId), {
          source: 'settings-sync',
          phase: 'hydrate',
          school_id: ctx.schoolId,
        });
      }
      return false;
    }
  })();

  try {
    return await hydratePromise;
  } finally {
    hydratePromise = null;
  }
}

// ── Settings push (debounced) ───────────────────────────────────────

async function pushSettingsNow(): Promise<void> {
  const ctx = await getSyncContext();
  if (!ctx) return;

  const settings = getSettings();
  const clientUpdatedAt = new Date().toISOString();

  try {
    const result = await upsertUserSettings({
      settings: settings as unknown as Json,
      clientUpdatedAt,
      schemaVersion: settings.version ?? 1,
      supabaseId: ctx.supabaseId,
    });
    if (result?.updated_at) writeSyncedAt(SYNCED_AT_KEY, result.updated_at);
    stampHydrate(SETTINGS_HYDRATED_AT_KEY, ctx.supabaseId);
  } catch (error) {
    if (!isAuthOwnershipError(error)) {
      captureException(error, getDistinctId(ctx.studentId), {
        source: 'settings-sync',
        phase: 'push',
        school_id: ctx.schoolId,
      });
      const distinctId = getDistinctId(ctx.studentId);
      if (distinctId) {
        capture('settings sync failed', distinctId, {
          school_id: ctx.schoolId,
          phase: 'push',
          error_message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

export function schedulePushSettingsToSupabase(): void {
  ensurePageHideFlush();
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushSettingsNow();
  }, DEBOUNCE_MS);
}

// ── Theme hydrate ───────────────────────────────────────────────────

export async function hydrateSchoolThemesFromSupabase(force = false): Promise<boolean> {
  if (!force && hydrateThemesPromise) return hydrateThemesPromise;

  hydrateThemesPromise = (async () => {
    const ctx = await getSyncContext();
    if (!ctx) return false;

    if (!force && isHydrateFresh(THEMES_HYDRATED_AT_KEY, ctx.supabaseId)) {
      return false;
    }

    try {
      const rows = await getUserSchoolThemes(ctx.supabaseId);
      stampHydrate(THEMES_HYDRATED_AT_KEY, ctx.supabaseId);
      if (rows.length === 0) {
        const localPref = getThemePreferenceForSchool(ctx.schoolId);
        if (localPref.themeId !== 'default') {
          schedulePushCurrentSchoolThemeToSupabase();
        }
        return false;
      }

      const localSyncedAt = readSyncedAt(THEME_SYNCED_AT_KEY);
      let activeChanged = false;
      let latestUpdatedAt = '';

      for (const row of rows) {
        const remoteUpdatedAt = Date.parse(row.updated_at);
        if (!Number.isFinite(remoteUpdatedAt)) continue;
        if (!latestUpdatedAt || remoteUpdatedAt > Date.parse(latestUpdatedAt)) {
          latestUpdatedAt = row.updated_at;
        }
        if (remoteUpdatedAt <= localSyncedAt) continue;

        const local = getThemePreferenceForSchool(row.school_id);
        if (local.themeId === row.theme_id) continue;

        withSyncSuppressed(() => {
          saveThemePreferenceForSchool(row.school_id, { themeId: row.theme_id as never });
        });
        if (row.school_id === ctx.schoolId) {
          activeChanged = true;
        }
      }

      if (latestUpdatedAt) writeSyncedAt(THEME_SYNCED_AT_KEY, latestUpdatedAt);

      if (activeChanged) {
        applyThemePreferenceToDocument(getThemePreferenceForSchool(ctx.schoolId));
      }
      return activeChanged;
    } catch (error) {
      if (!isAuthOwnershipError(error)) {
        captureException(error, getDistinctId(ctx.studentId), {
          source: 'settings-sync',
          phase: 'hydrate-themes',
          school_id: ctx.schoolId,
        });
      }
      return false;
    }
  })();

  try {
    return await hydrateThemesPromise;
  } finally {
    hydrateThemesPromise = null;
  }
}

// ── Theme push (debounced, current school only) ─────────────────────

async function pushCurrentSchoolThemeNow(): Promise<void> {
  const ctx = await getSyncContext();
  if (!ctx) return;

  const pref = getThemePreferenceForSchool(ctx.schoolId);
  const clientUpdatedAt = new Date().toISOString();

  try {
    const result = await upsertUserSchoolTheme({
      schoolId: ctx.schoolId,
      themeId: pref.themeId,
      clientUpdatedAt,
      supabaseId: ctx.supabaseId,
    });
    if (result?.updated_at) writeSyncedAt(THEME_SYNCED_AT_KEY, result.updated_at);
    stampHydrate(THEMES_HYDRATED_AT_KEY, ctx.supabaseId);
  } catch (error) {
    if (!isAuthOwnershipError(error)) {
      captureException(error, getDistinctId(ctx.studentId), {
        source: 'settings-sync',
        phase: 'push-theme',
        school_id: ctx.schoolId,
      });
      const distinctId = getDistinctId(ctx.studentId);
      if (distinctId) {
        capture('settings sync failed', distinctId, {
          school_id: ctx.schoolId,
          phase: 'push-theme',
          error_message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

export function schedulePushCurrentSchoolThemeToSupabase(): void {
  ensurePageHideFlush();
  if (themePushTimer) clearTimeout(themePushTimer);
  themePushTimer = setTimeout(() => {
    themePushTimer = null;
    void pushCurrentSchoolThemeNow();
  }, DEBOUNCE_MS);
}

// ── Realtime subscription ───────────────────────────────────────────

export async function subscribeToSettingsRealtime(): Promise<() => void> {
  const ctx = await getSyncContext();
  if (!ctx) return () => {};

  const settingsChannel = `user-settings:${ctx.supabaseId}`;
  const themesChannel = `user-school-themes:${ctx.supabaseId}`;

  // Pass the same `user:<uid>` cache namespace we use for cachedQuery so the
  // background's postgres_changes handler invalidates the right cache slot.
  // Otherwise it would invalidate a school-scoped slot we never wrote to,
  // and storage.onChanged would never fire.
  const cacheNs = `user:${ctx.supabaseId}`;
  void subscribe({
    channel: settingsChannel,
    table: 'user_settings',
    schoolId: cacheNs,
    filter: `supabase_id=eq.${ctx.supabaseId}`,
  });
  void subscribe({
    channel: themesChannel,
    table: 'user_school_themes',
    schoolId: cacheNs,
    filter: `supabase_id=eq.${ctx.supabaseId}`,
  });

  // Cache invalidations from postgres_changes flow through storage.onChanged
  // and onTableChange. The first hydrate populates the cache so subsequent
  // invalidations have something to remove (and thus fire the listener).
  const offSettings = onTableChange('user_settings', () => {
    void hydrateSettingsFromSupabase(true);
  });
  const offThemes = onTableChange('user_school_themes', () => {
    void hydrateSchoolThemesFromSupabase(true);
  });

  return () => {
    offSettings();
    offThemes();
    void unsubscribe(settingsChannel);
    void unsubscribe(themesChannel);
  };
}
