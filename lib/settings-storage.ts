import { z } from 'zod';
import { syncOptOutToExtensionStorage } from '@/lib/posthog';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isSupportedLocale } from '@/lib/i18n/locales';
import { setLocale } from '@/lib/i18n/state';

const SETTINGS_KEY = 'bl-feature-settings';
const LEGACY_SETTINGS_KEY = 'il-feature-settings';
const SETTINGS_VERSION = 1;

// Define nested schemas separately so we can use them for defaults
const VisualSettingsSchema = z.object({
  darkMode: z.boolean().default(false),
});

const InterfaceSettingsSchema = z.object({
  language: z
    .enum(SUPPORTED_LOCALES as unknown as [string, ...string[]])
    .default(DEFAULT_LOCALE),
});

const ScheduleSettingsSchema = z.object({
  todayHighlight: z.boolean().default(true),
  currentTimeIndicator: z.boolean().default(true),
  currentTimeLabel: z.boolean().default(false),
  countdownBar: z.boolean().default(true),
  subjectColors: z.boolean().default(false),
  endOfModuleEffect: z.boolean().default(true),
  opgaveDeadlines: z.boolean().default(false),
});

const BehaviorSettingsSchema = z.object({
  messagesAutoRedirect: z.boolean().default(true),
  continueToLastSchool: z.boolean().default(true),
  disableSignature: z.boolean().default(false),
  analyticsOptOut: z.boolean().default(false),
  activityViewMode: z.enum(['modal', 'sheet']).default('modal'),
  opgaveViewMode: z.enum(['modal', 'sheet']).default('sheet'),
});

// Note: pictureCaching is always enabled to avoid Lectio rate limiting
const DataSettingsSchema = z.object({
  starredPeople: z.boolean().default(false),
  recentSearches: z.boolean().default(false),
});

const SidebarSettingsSchema = z.object({
  showForside: z.boolean().default(true),
  showSkema: z.boolean().default(true),
  showElever: z.boolean().default(true),
  showOpgaver: z.boolean().default(true),
  showLektier: z.boolean().default(true),
  showBeskeder: z.boolean().default(true),
  showKarakterer: z.boolean().default(true),
  showFravaer: z.boolean().default(true),
  showStudieplan: z.boolean().default(true),
  showDokumenter: z.boolean().default(true),
  showModulregnskaber: z.boolean().default(true),
  showSpoergeskema: z.boolean().default(true),
  showUVBeskrivelser: z.boolean().default(true),
  showFindSkema: z.boolean().default(true),
  showAendringer: z.boolean().default(true),
});

// Default values for each category - needed because Zod doesn't recursively apply defaults
const DEFAULT_VISUAL = VisualSettingsSchema.parse({});
const DEFAULT_INTERFACE = InterfaceSettingsSchema.parse({});
const DEFAULT_SCHEDULE = ScheduleSettingsSchema.parse({});
const DEFAULT_BEHAVIOR = BehaviorSettingsSchema.parse({});
const DEFAULT_DATA = DataSettingsSchema.parse({});
const DEFAULT_SIDEBAR = SidebarSettingsSchema.parse({});

/**
 * Feature settings schema with Zod validation.
 * All settings default to true (enabled) for backward compatibility.
 */
export const FeatureSettingsSchema = z.object({
  version: z.number().default(SETTINGS_VERSION),
  visual: VisualSettingsSchema.default(DEFAULT_VISUAL),
  interface: InterfaceSettingsSchema.default(DEFAULT_INTERFACE),
  schedule: ScheduleSettingsSchema.default(DEFAULT_SCHEDULE),
  behavior: BehaviorSettingsSchema.default(DEFAULT_BEHAVIOR),
  data: DataSettingsSchema.default(DEFAULT_DATA),
  sidebar: SidebarSettingsSchema.default(DEFAULT_SIDEBAR),
});

export type FeatureSettings = z.infer<typeof FeatureSettingsSchema>;

/**
 * Settings that require a page reload to take effect.
 * These are checked by content scripts that run at document_start.
 */
export const SETTINGS_REQUIRING_RELOAD = [
  'schedule.todayHighlight',
  'schedule.currentTimeIndicator',
  'schedule.currentTimeLabel',
  'schedule.subjectColors',
] as const;

/**
 * Feature dependencies - key depends on value being enabled.
 */
export const FEATURE_DEPENDENCIES: Record<string, string> = {
  'schedule.currentTimeIndicator': 'schedule.todayHighlight',
  'schedule.currentTimeLabel': 'schedule.todayHighlight',
};

/**
 * Get the current settings from localStorage.
 * Returns default settings if no settings exist or if parsing fails.
 */
export function getSettings(): FeatureSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY) ?? localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (!localStorage.getItem(SETTINGS_KEY) && stored) {
      localStorage.setItem(SETTINGS_KEY, stored);
    }
    if (!stored) {
      const defaults = FeatureSettingsSchema.parse({});
      console.log('[BetterLectio] No settings found, using defaults');
      return defaults;
    }

    const parsed = JSON.parse(stored);

    // Handle version migrations if needed
    if (parsed.version !== SETTINGS_VERSION) {
      return migrateSettings(parsed);
    }

    // Parse through Zod to apply defaults for any missing fields
    const settings = FeatureSettingsSchema.parse(parsed);
    return settings;
  } catch (err) {
    // Return defaults on any error
    console.error('[BetterLectio] Error loading settings, using defaults:', err);
    return FeatureSettingsSchema.parse({});
  }
}

/**
 * Save settings to localStorage.
 * Validates and ensures all defaults are applied before saving.
 */
export function saveSettings(settings: FeatureSettings): void {
  try {
    // Re-parse through Zod to ensure all fields have valid values
    // This fills in any missing fields with defaults
    const validated = FeatureSettingsSchema.parse({
      ...settings,
      version: SETTINGS_VERSION,
    });
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(validated));
    // Sync analytics opt-out to extension storage so background script can read it
    syncOptOutToExtensionStorage(validated.behavior.analyticsOptOut);
  } catch {
    // Ignore storage errors
  }

  // Sync to Supabase so settings follow the user across devices. Suppressed
  // when the write itself originated from a hydrate (avoids ping-pong) or
  // when called from a sync-aware test harness.
  if (syncSuppressionDepth === 0) {
    void import('@/lib/settings-sync')
      .then(({ schedulePushSettingsToSupabase }) => schedulePushSettingsToSupabase())
      .catch(() => {});
  }
}

// ── Sync suppression ────────────────────────────────────────────────
// Used by lib/settings-sync.ts so writes that originate from hydrating
// remote state don't bounce back as a push.

let syncSuppressionDepth = 0;

export function withSyncSuppressed<T>(fn: () => T): T {
  syncSuppressionDepth++;
  try {
    return fn();
  } finally {
    syncSuppressionDepth = Math.max(0, syncSuppressionDepth - 1);
  }
}

export function isSyncSuppressed(): boolean {
  return syncSuppressionDepth > 0;
}

/**
 * Update a single setting value.
 * @param category - The settings category (visual, schedule, pages, behavior, data, sidebar)
 * @param key - The setting key within the category
 * @param value - The new value
 */
export function updateSetting<
  K extends keyof Omit<FeatureSettings, 'version'>,
  Field extends keyof FeatureSettings[K],
>(
  category: K,
  key: Field,
  value: FeatureSettings[K][Field]
): void {
  const settings = getSettings();
  (settings[category] as Record<string, unknown>)[key as string] = value;
  saveSettings(settings);
}

/**
 * Check if a specific feature is enabled.
 * This is a quick synchronous check for use in content scripts.
 * @param category - The settings category
 * @param key - The setting key
 * @returns true if enabled, defaults to true if setting doesn't exist
 */
export function isFeatureEnabled(category: string, key: string): boolean {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY) ?? localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (!stored) return true; // Default enabled

    const settings = JSON.parse(stored);
    return settings[category]?.[key] ?? true;
  } catch {
    return true; // Default enabled on error
  }
}

/**
 * Reset all settings to defaults.
 */
export function resetSettings(): void {
  try {
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(LEGACY_SETTINGS_KEY);
  } catch {
    // Ignore errors
  }
}

/**
 * Clear all BetterLectio data (settings, starred, recents, cache).
 */
export function clearAllData(): void {
  try {
    // Get all localStorage keys
    const keys = Object.keys(localStorage);

    // Remove all BetterLectio storage prefixes (new + legacy)
    for (const key of keys) {
      if (key.startsWith('bl-') || key.startsWith('il-')) {
        localStorage.removeItem(key);
      }
    }

    // Also remove version info
    localStorage.removeItem('betterlectio_version_info');
  } catch {
    // Ignore errors
  }
}

/**
 * Check if a setting requires a page reload to take effect.
 */
export function requiresReload(category: string, key: string): boolean {
  const settingPath = `${category}.${key}`;
  return SETTINGS_REQUIRING_RELOAD.includes(settingPath as typeof SETTINGS_REQUIRING_RELOAD[number]);
}

/**
 * Get the dependency for a setting (if any).
 * @returns The setting path that this setting depends on, or null if no dependency
 */
export function getSettingDependency(category: string, key: string): string | null {
  const settingPath = `${category}.${key}`;
  return FEATURE_DEPENDENCIES[settingPath] || null;
}

/**
 * Check if a setting's dependency is satisfied.
 */
export function isDependencySatisfied(category: string, key: string): boolean {
  const dependency = getSettingDependency(category, key);
  if (!dependency) return true;

  const [depCategory, depKey] = dependency.split('.');
  return isFeatureEnabled(depCategory, depKey);
}

/**
 * Migrate settings from an older version.
 * Currently just returns defaults, but can be extended for future migrations.
 */
function migrateSettings(old: unknown): FeatureSettings {
  // For now, just parse with defaults (will fill in any missing fields)
  // In the future, we can handle specific migrations based on old.version
  return FeatureSettingsSchema.parse(old);
}

/**
 * Apply the live side effects of a settings change. Used by both the local
 * edit path (SettingsModal) and the cross-device hydrate path so they can't
 * drift apart.
 *
 * Side effects intentionally exclude PostHog `setting changed` capture and
 * person-property updates — those are the per-user-action concern of the
 * caller, not of the storage layer.
 */
export function applySettingsSideEffects(
  prev: FeatureSettings,
  next: FeatureSettings,
): { changed: boolean; requiresReload: boolean } {
  let changed = false;
  let requiresReload = false;

  if (prev.visual?.darkMode !== next.visual?.darkMode) {
    changed = true;
    document.documentElement.classList.toggle('dark', Boolean(next.visual?.darkMode));
  }

  if (prev.interface?.language !== next.interface?.language) {
    changed = true;
    if (isSupportedLocale(next.interface?.language)) {
      setLocale(next.interface.language);
    }
  }

  if (prev.schedule?.opgaveDeadlines !== next.schedule?.opgaveDeadlines) {
    changed = true;
    window.dispatchEvent(new CustomEvent('betterlectio:opgaveDeadlinesToggled'));
  }

  if (prev.behavior?.analyticsOptOut !== next.behavior?.analyticsOptOut) {
    changed = true;
    syncOptOutToExtensionStorage(Boolean(next.behavior?.analyticsOptOut));
  }

  // Detect any change that requires a page reload (current-time indicator,
  // subject colors, today highlight, current-time label).
  for (const path of SETTINGS_REQUIRING_RELOAD) {
    const [category, key] = path.split('.') as [
      keyof FeatureSettings,
      string,
    ];
    const a = (prev[category] as Record<string, unknown> | undefined)?.[key];
    const b = (next[category] as Record<string, unknown> | undefined)?.[key];
    if (a !== b) {
      requiresReload = true;
      changed = true;
      break;
    }
  }

  // Sidebar/data/schedule toggles that don't have direct DOM side effects
  // still count as "changed" so the hydrator can fire its event.
  if (!changed) {
    if (
      JSON.stringify(prev.sidebar) !== JSON.stringify(next.sidebar) ||
      JSON.stringify(prev.data) !== JSON.stringify(next.data) ||
      JSON.stringify(prev.schedule) !== JSON.stringify(next.schedule) ||
      JSON.stringify(prev.behavior) !== JSON.stringify(next.behavior)
    ) {
      changed = true;
    }
  }

  return { changed, requiresReload };
}
