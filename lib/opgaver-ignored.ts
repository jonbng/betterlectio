/**
 * Shared helpers for reading the "ignored missing" opgaver set.
 * Written to by OpgaverPage, read by forside components to filter out ignored assignments.
 */

const MISSING_IGNORED_PREFIX = 'bl-opgaver-ignored-missing-';
const LEGACY_MISSING_IGNORED_PREFIX = 'il-opgaver-ignored-missing-';

export function getExerciseIdFromUrl(url: string): string | null {
  const match = url.match(/exerciseid=(\d+)/i);
  return match?.[1] || null;
}

/** Load the set of ignored missing exercise IDs from localStorage */
export function loadIgnoredMissingIds(schoolId: string): Set<string> {
  try {
    const key = `${MISSING_IGNORED_PREFIX}${schoolId}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
    // Fallback to legacy key
    const legacyKey = `${LEGACY_MISSING_IGNORED_PREFIX}${schoolId}`;
    const legacyRaw = localStorage.getItem(legacyKey);
    if (legacyRaw) {
      const arr = JSON.parse(legacyRaw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {
    // ignore
  }
  return new Set();
}

/** Add an exercise ID to the ignored set in localStorage */
export function addIgnoredMissingId(schoolId: string, exerciseId: string): void {
  const ids = loadIgnoredMissingIds(schoolId);
  ids.add(exerciseId);
  try {
    localStorage.setItem(`${MISSING_IGNORED_PREFIX}${schoolId}`, JSON.stringify([...ids]));
  } catch {
    // ignore storage errors
  }
}
