export interface LastSchool {
  id: string;
  name: string;
  url: string;
  lastUsed: number;
}

const LAST_SCHOOL_KEY = "bl-last-school";
const LEGACY_LAST_SCHOOL_KEY = "il-last-school";

export function getLastSchool(): LastSchool | null {
  try {
    const stored = localStorage.getItem(LAST_SCHOOL_KEY) ?? localStorage.getItem(LEGACY_LAST_SCHOOL_KEY);
    if (!localStorage.getItem(LAST_SCHOOL_KEY) && stored) {
      localStorage.setItem(LAST_SCHOOL_KEY, stored);
    }
    if (!stored) return null;
    return JSON.parse(stored) as LastSchool;
  } catch {
    return null;
  }
}

export function saveLastSchool(school: Omit<LastSchool, "lastUsed">): void {
  const data: LastSchool = {
    ...school,
    lastUsed: Date.now(),
  };
  localStorage.setItem(LAST_SCHOOL_KEY, JSON.stringify(data));
}

export function parseSchoolFromUrl(url: string): { id: string } | null {
  const match = url.match(/\/lectio\/(\d+)\//);
  if (!match) return null;
  return { id: match[1] };
}

// ── School display name cache (sync, per school) ────────────────────
// Mirrors the Supabase `schools.display_name` (or `.name`) into localStorage
// so the sidebar can render the correct school label synchronously on every
// page load — avoiding the async `browser.storage.local` roundtrip used by
// `useQuery` / `cachedQuery`.

const SCHOOL_DISPLAY_NAME_KEY_PREFIX = "bl-school-display-name:";

export function getCachedSchoolDisplayName(schoolId: string): string | null {
  try {
    return localStorage.getItem(`${SCHOOL_DISPLAY_NAME_KEY_PREFIX}${schoolId}`);
  } catch {
    return null;
  }
}

export function cacheSchoolDisplayName(schoolId: string, name: string): void {
  if (!schoolId || !name) return;
  try {
    const key = `${SCHOOL_DISPLAY_NAME_KEY_PREFIX}${schoolId}`;
    if (localStorage.getItem(key) !== name) {
      localStorage.setItem(key, name);
    }
  } catch {
    // Ignore storage errors.
  }
}
