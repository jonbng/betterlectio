import { toast } from 'sonner';
import { getSession } from '@/lib/supabase/client';
import {
  getUserSettingsRow,
  upsertUserSettings,
  getUserSchoolThemes,
  upsertUserSchoolTheme,
} from '@/lib/supabase/resources';
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
import { isNonActionableSupabaseError } from '@/lib/supabase-error-noise';
import type { Json } from '@/database.types';

const SYNCED_AT_KEY = 'bl-settings-synced-at';
const THEME_SYNCED_AT_KEY = 'bl-themes-synced-at';
const SETTINGS_HYDRATED_AT_KEY = 'bl-settings-hydrated-at';
const THEMES_HYDRATED_AT_KEY = 'bl-themes-hydrated-at';
const FEATURE_SETTINGS_KEY = 'bl-feature-settings';

const DEBOUNCE_MS = 500;
// Skip a fresh GET when this user was hydrated recently. Focus and visible
// lifecycle events use this persisted stamp as their only refresh throttle.
const HYDRATE_TTL_MS = 5 * 60_000;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let themePushTimer: ReturnType<typeof setTimeout> | null = null;
let pageHideHooked = false;

interface HydrationRequestCoordinator {
  run(force: boolean, createRequest: () => Promise<boolean>): Promise<boolean>;
}

/**
 * Coalesces normal hydrations while allowing a force refresh to supersede an
 * older request. Only the promise that is still active may clear the guard.
 */
export function createHydrationRequestCoordinator(): HydrationRequestCoordinator {
  let activeRequest: Promise<boolean> | null = null;

  return {
    run(force, createRequest) {
      if (!force && activeRequest) return activeRequest;

      const request = createRequest();
      const guardedRequest = request.finally(() => {
        if (activeRequest === guardedRequest) activeRequest = null;
      });
      activeRequest = guardedRequest;
      return guardedRequest;
    },
  };
}

const settingsHydrationRequests = createHydrationRequestCoordinator();
const themeHydrationRequests = createHydrationRequestCoordinator();

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

export function hydrateSettingsFromSupabase(force = false): Promise<boolean> {
  return settingsHydrationRequests.run(force, async () => {
    const ctx = await getSyncContext();
    if (!ctx) return false;

    // Skip the GET when we recently hydrated this user.
    if (!force && isHydrateFresh(SETTINGS_HYDRATED_AT_KEY, ctx.supabaseId)) {
      return false;
    }

    try {
      // A due hydration must not be satisfied from the cached previous read.
      const row = await getUserSettingsRow(ctx.supabaseId, { bypassCache: true });
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
      if (!isNonActionableSupabaseError(error)) {
        captureException(error, getDistinctId(ctx.studentId), {
          source: 'settings-sync',
          phase: 'hydrate',
          school_id: ctx.schoolId,
        });
      }
      return false;
    }
  });
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
    if (!isNonActionableSupabaseError(error)) {
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

export function hydrateSchoolThemesFromSupabase(force = false): Promise<boolean> {
  return themeHydrationRequests.run(force, async () => {
    const ctx = await getSyncContext();
    if (!ctx) return false;

    if (!force && isHydrateFresh(THEMES_HYDRATED_AT_KEY, ctx.supabaseId)) {
      return false;
    }

    try {
      // A due hydration must not be satisfied from the cached previous read.
      const rows = await getUserSchoolThemes(ctx.supabaseId, { bypassCache: true });
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
      if (!isNonActionableSupabaseError(error)) {
        captureException(error, getDistinctId(ctx.studentId), {
          source: 'settings-sync',
          phase: 'hydrate-themes',
          school_id: ctx.schoolId,
        });
      }
      return false;
    }
  });
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
    if (!isNonActionableSupabaseError(error)) {
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

// ── Foreground refresh lifecycle ───────────────────────────────────

function refreshSettingsAndThemes(): void {
  void hydrateSettingsFromSupabase().catch(() => {});
  void hydrateSchoolThemesFromSupabase().catch(() => {});
}

/**
 * Refresh settings after a tab returns to the foreground. Hydration stamps
 * are persisted per user, so these listeners never create background polling
 * and normally do no network work within the five-minute freshness window.
 */
export function installSettingsHydrationLifecycle(
  refresh: () => void = refreshSettingsAndThemes,
): () => void {
  const refreshWhenVisible = () => {
    if (document.visibilityState !== 'visible') return;
    refresh();
  };

  window.addEventListener('focus', refreshWhenVisible);
  document.addEventListener('visibilitychange', refreshWhenVisible);

  return () => {
    window.removeEventListener('focus', refreshWhenVisible);
    document.removeEventListener('visibilitychange', refreshWhenVisible);
  };
}
