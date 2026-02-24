// ── Hold Mapping System ─────────────────────────────────────────────────
// Maps Lectio hold codes ("1x HI") to human-readable subject names ("Historie").
// Auto-guesses from a built-in Danish subject dictionary; users can override.

const STORAGE_KEY = 'il-hold-mappings';

// ── Types ───────────────────────────────────────────────────────────────

export interface HoldMapping {
  holdCode: string;
  holdelementId: string | null;
  subjectAbbrev: string;
  displayName: string;
  autoGuessed: boolean;
  colorHue: number | null;
  icon: string | null;
}

interface HoldMappingStore {
  version: number;
  schoolId: string;
  mappings: Record<string, HoldMapping>;
  updatedAt: number;
}

// ── Subject Dictionary ──────────────────────────────────────────────────
// Case-insensitive lookup from common Danish subject abbreviations.

const SUBJECT_DICTIONARY: Record<string, string> = {
  hi: 'Historie',
  ma: 'Matematik',
  da: 'Dansk',
  en: 'Engelsk',
  fy: 'Fysik',
  ke: 'Kemi',
  ty: 'Tysk',
  sa: 'Samfundsfag',
  id: 'Idræt',
  bi: 'Biologi',
  ge: 'Geografi',
  mu: 'Musik',
  bk: 'Billedkunst',
  re: 'Religion',
  fr: 'Fransk',
  sp: 'Spansk',
  fi: 'Filosofi',
  ps: 'Psykologi',
  me: 'Mediefag',
  dr: 'Dramatik',
  nv: 'Naturvidenskab',
  ol: 'Oldtidskundskab',
  la: 'Latin',
  it: 'Informatik',
  de: 'Design',
  bt: 'Bioteknologi',
  er: 'Erhvervsøkonomi',
  ng: 'Naturgeografi',
  if: 'Idéhistorie',
  ap: 'Almen sprogforståelse',
  at: 'Almen studieforberedelse',
  srp: 'Studieretningsprojekt',
  sro: 'Studieretningsopgave',
  ks: 'Kultur- og samfundsfag',
  tek: 'Teknologi',
  as: 'Astronomi',
  mat: 'Matematik',
  fys: 'Fysik',
  sam: 'Samfundsfag',
  bio: 'Biologi',
  geo: 'Geografi',
  inf: 'Informatik',
  his: 'Historie',
  dan: 'Dansk',
  eng: 'Engelsk',
};

// ── Curated Color Palette ───────────────────────────────────────────────
// Hand-picked hues that produce vibrant, distinct oklch colors.
// Used for default hash assignment and the settings color picker.
export const CURATED_HUES = [
  15,   // Coral
  40,   // Orange
  65,   // Amber
  95,   // Lime
  145,  // Emerald
  175,  // Teal
  200,  // Sky
  235,  // Blue
  265,  // Indigo
  295,  // Purple
  330,  // Pink
  355,  // Rose
];

// ── In-memory cache ─────────────────────────────────────────────────────

let cachedStore: HoldMappingStore | null = null;

function getCurrentSchoolId(): string {
  const match = window.location.pathname.match(/\/lectio\/(\d+)\//);
  return match?.[1] ?? '';
}

function loadStore(): HoldMappingStore {
  if (cachedStore && cachedStore.schoolId === getCurrentSchoolId()) {
    return cachedStore;
  }

  const schoolId = getCurrentSchoolId();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as HoldMappingStore;
      if (parsed.schoolId === schoolId && parsed.version === 1) {
        cachedStore = parsed;
        return parsed;
      }
      // School mismatch — clear and start fresh
    }
  } catch {
    // Ignore parse errors
  }

  const fresh: HoldMappingStore = {
    version: 1,
    schoolId,
    mappings: {},
    updatedAt: Date.now(),
  };
  cachedStore = fresh;
  return fresh;
}

function saveStore(store: HoldMappingStore): void {
  store.updatedAt = Date.now();
  cachedStore = store;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage errors
  }
}

// ── Abbreviation extraction ─────────────────────────────────────────────

/**
 * Extract the subject abbreviation from a hold code.
 * "1x HI"        → "HI"
 * "1g Ty 4"      → "Ty"
 * "1x sa"        → "sa"
 * "kostelever…"  → "kostelever…"
 */
function extractSubjectAbbrev(holdCode: string): string {
  // Strip leading class prefix like "1x ", "2g ", "1a ", etc.
  const stripped = holdCode.replace(/^\d+[a-zA-Z]\s+/, '');
  if (!stripped) return holdCode;

  // Take the first word (handles "Ty 4", "sa", "HI")
  const firstWord = stripped.split(/\s+/)[0];
  return firstWord || stripped;
}

/**
 * Look up a subject abbreviation in the dictionary.
 * Returns the display name or null if not found.
 */
function lookupSubject(abbrev: string): string | null {
  return SUBJECT_DICTIONARY[abbrev.toLowerCase()] ?? null;
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Get the display name for a hold code.
 * Returns the user-set or auto-guessed name, or the raw holdCode as fallback.
 */
export function getHoldDisplayName(holdCode: string): string {
  const store = loadStore();
  const mapping = store.mappings[holdCode];
  if (mapping) return mapping.displayName;

  // Try to auto-guess without persisting (for holds not yet registered)
  const abbrev = extractSubjectAbbrev(holdCode);
  const guessed = lookupSubject(abbrev);
  return guessed ?? holdCode;
}

/**
 * Get the color hue for a hold code.
 * Returns user override or deterministic hash default.
 */
export function getHoldHue(holdCode: string): number {
  const store = loadStore();
  const mapping = store.mappings[holdCode];
  if (mapping?.colorHue !== null && mapping?.colorHue !== undefined) {
    return mapping.colorHue;
  }

  // Deterministic hash — picks from curated palette for nicer defaults
  let hash = 0;
  for (let i = 0; i < holdCode.length; i++) {
    hash = holdCode.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CURATED_HUES[Math.abs(hash) % CURATED_HUES.length];
}

/**
 * Register a hold code in the store.
 * If the hold already exists and was user-edited, it is not overwritten.
 */
export function registerHold(holdCode: string, holdelementId?: string | null): void {
  const store = loadStore();

  const existing = store.mappings[holdCode];
  if (existing) {
    // Update holdelementId if we have a better one
    if (holdelementId && !existing.holdelementId) {
      existing.holdelementId = holdelementId;
      saveStore(store);
    }
    return;
  }

  const abbrev = extractSubjectAbbrev(holdCode);
  const guessed = lookupSubject(abbrev);

  store.mappings[holdCode] = {
    holdCode,
    holdelementId: holdelementId ?? null,
    subjectAbbrev: abbrev,
    displayName: guessed ?? holdCode,
    autoGuessed: true,
    colorHue: null,
    icon: null,
  };

  saveStore(store);
}

/**
 * Scan the DOM for hold references and register them.
 * Targets:
 *   1. [data-tooltip] elements with "Hold: xxx" lines
 *   2. span[data-lectioContextCard^="HE"] hold spans
 */
export function scanDOMForHolds(root?: Element): void {
  const container = root ?? document;

  // 1. Tooltip-based holds (schedule bricks, forside)
  container.querySelectorAll('[data-tooltip]').forEach(el => {
    const tooltip = el.getAttribute('data-tooltip') || '';
    const holdMatches = tooltip.match(/Hold:\s*(.+)/g);
    if (holdMatches) {
      for (const match of holdMatches) {
        const holdLine = match.replace(/^Hold:\s*/, '').trim();
        // Can contain comma-separated holds
        const holds = holdLine.split(',').map(h => h.trim()).filter(Boolean);
        for (const hold of holds) {
          registerHold(hold);
        }
      }
    }
  });

  // 2. Hold spans with context card IDs
  container.querySelectorAll('span[data-lectioContextCard^="HE"]').forEach(el => {
    const holdCode = el.textContent?.trim();
    const contextId = el.getAttribute('data-lectioContextCard') || null;
    if (holdCode) {
      registerHold(holdCode, contextId);
    }
  });
}

/**
 * Get all hold mappings sorted by holdCode.
 */
export function getAllHolds(): HoldMapping[] {
  const store = loadStore();
  return Object.values(store.mappings).sort((a, b) =>
    a.holdCode.localeCompare(b.holdCode, 'da'),
  );
}

/**
 * Set a user override for a hold's display name.
 */
export function setHoldDisplayName(holdCode: string, name: string): void {
  const store = loadStore();
  const mapping = store.mappings[holdCode];
  if (!mapping) return;

  mapping.displayName = name;
  mapping.autoGuessed = false;
  saveStore(store);
}

/**
 * Set a user override for a hold's color hue.
 * Pass null to reset to the hash default.
 */
export function setHoldColorHue(holdCode: string, hue: number | null): void {
  const store = loadStore();
  const mapping = store.mappings[holdCode];
  if (!mapping) return;

  mapping.colorHue = hue;
  saveStore(store);
}

/**
 * Reset all display names to auto-guessed values.
 */
export function resetAllMappings(): void {
  const store = loadStore();
  for (const mapping of Object.values(store.mappings)) {
    const guessed = lookupSubject(mapping.subjectAbbrev);
    mapping.displayName = guessed ?? mapping.holdCode;
    mapping.autoGuessed = true;
    mapping.colorHue = null;
  }
  saveStore(store);
}

/**
 * Replace hold codes with display names in the DOM.
 * Targets <span data-lectioContextCard="HE..."> elements (schedule bricks, etc.).
 * Returns the number of replacements made.
 */
export function replaceHoldCodesInDOM(container: Element): number {
  const spans = container.querySelectorAll<HTMLElement>('span[data-lectioContextCard^="HE"]');
  let count = 0;

  spans.forEach(span => {
    const holdCode = span.textContent?.trim();
    if (!holdCode) return;

    const displayName = getHoldDisplayName(holdCode);
    if (displayName !== holdCode) {
      span.textContent = displayName;
      span.title = holdCode;
      count++;
    }
  });

  return count;
}

/**
 * Clear the entire hold mapping store.
 */
export function clearHoldMappings(): void {
  cachedStore = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore errors
  }
}
