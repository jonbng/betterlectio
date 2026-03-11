import {
  DEFAULT_THEME_PREFERENCE,
  THEME_PRESETS,
  type ThemePreference,
  type ThemePresetId,
} from "@/lib/theme-presets";

const SCHOOL_THEME_KEY = "bl-school-themes-v1";
const LEGACY_SCHOOL_THEME_KEY = "il-school-themes-v1";

type SchoolThemeMap = Record<string, ThemePreference>;

function isValidThemeId(value: unknown): value is ThemePresetId {
  return typeof value === "string" && THEME_PRESETS.some((preset) => preset.id === value);
}

function normalizeThemePreference(value: unknown): ThemePreference {
  const parsed = value as Partial<ThemePreference> | null | undefined;
  return {
    themeId: isValidThemeId(parsed?.themeId)
      ? parsed.themeId
      : DEFAULT_THEME_PREFERENCE.themeId,
  };
}

function readThemeMap(): SchoolThemeMap {
  try {
    const stored = localStorage.getItem(SCHOOL_THEME_KEY) ?? localStorage.getItem(LEGACY_SCHOOL_THEME_KEY);
    if (!localStorage.getItem(SCHOOL_THEME_KEY) && stored) {
      localStorage.setItem(SCHOOL_THEME_KEY, stored);
    }
    if (!stored) return {};
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    const cleaned: SchoolThemeMap = {};
    for (const [schoolId, value] of Object.entries(parsed)) {
      cleaned[schoolId] = normalizeThemePreference(value);
    }
    return cleaned;
  } catch {
    return {};
  }
}

function writeThemeMap(next: SchoolThemeMap): void {
  try {
    localStorage.setItem(SCHOOL_THEME_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota/private mode errors.
  }
}

export function getThemePreferenceForSchool(schoolId: string | null): ThemePreference {
  if (!schoolId) return DEFAULT_THEME_PREFERENCE;
  const map = readThemeMap();
  return map[schoolId] ?? DEFAULT_THEME_PREFERENCE;
}

export function saveThemePreferenceForSchool(
  schoolId: string | null,
  preference: ThemePreference,
): void {
  if (!schoolId) return;
  const map = readThemeMap();
  map[schoolId] = normalizeThemePreference(preference);
  writeThemeMap(map);
}

export function getSchoolIdFromCurrentUrl(): string | null {
  return window.location.pathname.match(/\/lectio\/(\d+)\//)?.[1] ?? null;
}

export function applyThemePreferenceToDocument(preference: ThemePreference): void {
  const root = document.documentElement;
  root.dataset.ilTheme = preference.themeId;
  delete root.dataset.ilAccent;
}

export function applyThemeForSchool(schoolId: string | null): ThemePreference {
  const preference = getThemePreferenceForSchool(schoolId);
  applyThemePreferenceToDocument(preference);
  return preference;
}

