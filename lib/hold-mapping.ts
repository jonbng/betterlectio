// ── Hold Mapping System ─────────────────────────────────────────────────
// Resolves Lectio hold codes into shared subject mappings, per-hold exceptions,
// and ignored non-academic groups that should never clutter user settings.

const STORAGE_KEY = 'bl-hold-mappings';
const LEGACY_STORAGE_KEY = 'il-hold-mappings';
const STORE_VERSION = 2;
const UNMAPPED_HUE = 235;

// ── Types ───────────────────────────────────────────────────────────────

export interface SubjectMapping {
  kind: 'subject';
  subjectKey: string;
  subjectAbbrev: string;
  defaultName: string;
  displayName: string;
  autoGuessed: boolean;
  colorHue: number | null;
  icon: string | null;
  sampleHoldCode: string | null;
}

export interface HoldOverride {
  kind: 'override';
  holdCode: string;
  holdelementId: string | null;
  subjectAbbrev: string | null;
  defaultName: string;
  displayName: string;
  autoGuessed: boolean;
  colorHue: number | null;
  icon: string | null;
}

export interface HoldMappingRow {
  id: string;
  kind: 'subject' | 'override';
  codeLabel: string;
  displayName: string;
  autoGuessed: boolean;
  colorHue: number | null;
  effectiveHue: number;
  description: string;
  sortLabel: string;
}

interface HoldMappingStore {
  version: 2;
  schoolId: string;
  subjects: Record<string, SubjectMapping>;
  holdOverrides: Record<string, HoldOverride>;
  updatedAt: number;
}

type HoldClassification = 'ignored' | 'subject' | 'override' | 'fallback';

interface HoldDescriptor {
  holdCode: string;
  prefix: string | null;
  subjectToken: string | null;
  suffix: string;
  classification: HoldClassification;
  subjectKey: string | null;
  subjectName: string | null;
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

const SUBJECT_NAME_LOOKUP = new Map<string, string>();
for (const displayName of Object.values(SUBJECT_DICTIONARY)) {
  SUBJECT_NAME_LOOKUP.set(normalizeKey(displayName), displayName);
}

// Semantic default hues for common subjects.
// These are used when no user override is set, so "Standard" feels intentional.
const SUBJECT_DEFAULT_HUES: Record<string, number> = {
  [normalizeKey('Dansk')]: 8,
  [normalizeKey('Engelsk')]: 218,
  [normalizeKey('Tysk')]: 52,
  [normalizeKey('Fransk')]: 330,
  [normalizeKey('Spansk')]: 15,
  [normalizeKey('Latin')]: 358,

  [normalizeKey('Historie')]: 34,
  [normalizeKey('Religion')]: 285,
  [normalizeKey('Samfundsfag')]: 200,
  [normalizeKey('Filosofi')]: 272,
  [normalizeKey('Psykologi')]: 312,
  [normalizeKey('Idéhistorie')]: 300,
  [normalizeKey('Kultur- og samfundsfag')]: 186,
  [normalizeKey('Oldtidskundskab')]: 40,

  [normalizeKey('Matematik')]: 235,
  [normalizeKey('Fysik')]: 248,
  [normalizeKey('Kemi')]: 175,
  [normalizeKey('Biologi')]: 132,
  [normalizeKey('Geografi')]: 95,
  [normalizeKey('Naturvidenskab')]: 145,
  [normalizeKey('Naturgeografi')]: 88,
  [normalizeKey('Bioteknologi')]: 160,
  [normalizeKey('Astronomi')]: 260,

  [normalizeKey('Informatik')]: 248,
  [normalizeKey('Teknologi')]: 205,
  [normalizeKey('Design')]: 342,
  [normalizeKey('Mediefag')]: 318,
  [normalizeKey('Billedkunst')]: 355,
  [normalizeKey('Musik')]: 292,
  [normalizeKey('Dramatik')]: 25,
  [normalizeKey('Idræt')]: 118,
  [normalizeKey('Erhvervsøkonomi')]: 65,

  [normalizeKey('Almen sprogforståelse')]: 48,
  [normalizeKey('Almen studieforberedelse')]: 188,
  [normalizeKey('Studieretningsprojekt')]: 280,
  [normalizeKey('Studieretningsopgave')]: 300,
};

const IGNORED_HOLD_PATTERNS = [
  /^alle\b/i,
  /\belever\b/i,
  /\blærere\b/i,
  /\bkost(?:elever|tutor|lærere|skole)?\b/i,
  /\blæsekursus\b/i,
  /\budvalg\b/i,
  /\bråd\b/i,
  /\bguider\b/i,
  /\bbuddies\b/i,
  /\bfrivillig(?:hedskæmpere)?\b/i,
  /\byoga\b/i,
  /\bintro\b/i,
  /\bledelsen\b/i,
  /\bsamarbejdsudvalg\b/i,
  /\balumneråd\b/i,
  /\bskolerådet\b/i,
  /\bkor\b/i,
  /\bai-udvalg\b/i,
];

// ── Curated Color Palette ───────────────────────────────────────────────
// Hand-picked hues that produce vibrant, distinct oklch colors.
// Used for default hash assignment and the settings color picker.
export const CURATED_HUES = [
  0,    // Red
  15,   // Coral
  28,   // Vermilion
  40,   // Orange
  52,   // Apricot
  65,   // Amber
  80,   // Yellow-green
  95,   // Lime
  118,  // Leaf
  132,  // Green
  145,  // Emerald
  160,  // Mint
  175,  // Teal
  188,  // Cyan
  200,  // Sky
  218,  // Azure
  235,  // Blue
  248,  // Cobalt
  258,  // Indigo
  280,  // Violet
  295,  // Purple
  312,  // Fuchsia
  330,  // Pink
  342,  // Magenta rose
  355,  // Rose
];

// ── In-memory cache ─────────────────────────────────────────────────────

let cachedStore: HoldMappingStore | null = null;

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeKey(value: string): string {
  return normalizeWhitespace(value).toLocaleLowerCase('da');
}

function hashToHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CURATED_HUES[Math.abs(hash) % CURATED_HUES.length];
}

function getCurrentSchoolId(): string {
  const match = window.location.pathname.match(/\/lectio\/(\d+)\//);
  return match?.[1] ?? '';
}

function createFreshStore(schoolId: string): HoldMappingStore {
  return {
    version: STORE_VERSION,
    schoolId,
    subjects: {},
    holdOverrides: {},
    updatedAt: Date.now(),
  };
}

function loadStore(): HoldMappingStore {
  if (cachedStore && cachedStore.schoolId === getCurrentSchoolId()) {
    return cachedStore;
  }

  const schoolId = getCurrentSchoolId();

  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!localStorage.getItem(STORAGE_KEY) && raw) {
      localStorage.setItem(STORAGE_KEY, raw);
    }
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<HoldMappingStore> & { schoolId?: string; version?: number };
      if (parsed.schoolId === schoolId) {
        if (parsed.version === STORE_VERSION && parsed.subjects && parsed.holdOverrides) {
          const hydrated: HoldMappingStore = {
            version: STORE_VERSION,
            schoolId,
            subjects: parsed.subjects,
            holdOverrides: parsed.holdOverrides,
            updatedAt: parsed.updatedAt ?? Date.now(),
          };
          cachedStore = hydrated;
          return hydrated;
        }
      }
    }
  } catch {
    // Ignore parse errors
  }

  const fresh = createFreshStore(schoolId);
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

// ── Classification ─────────────────────────────────────────────────────

function looksLikeAcademicPrefix(prefix: string): boolean {
  return /^\d+(?:[a-zæøå]+(?:\d+[a-zæøå]*)?)$/i.test(prefix);
}

function isIgnoredHold(holdCode: string): boolean {
  const normalized = normalizeWhitespace(holdCode);
  return IGNORED_HOLD_PATTERNS.some((pattern) => pattern.test(normalized));
}

function lookupSubjectAbbrev(abbrev: string): string | null {
  return SUBJECT_DICTIONARY[abbrev.toLocaleLowerCase('da')] ?? null;
}

function lookupSubjectName(value: string): string | null {
  return SUBJECT_NAME_LOOKUP.get(normalizeKey(value)) ?? null;
}

function getSubjectKey(subjectName: string): string {
  return normalizeKey(subjectName);
}

function getDefaultSubjectHue(subjectKey: string): number {
  return SUBJECT_DEFAULT_HUES[subjectKey] ?? hashToHue(subjectKey);
}

function analyzeHold(holdCode: string): HoldDescriptor {
  const normalizedHoldCode = normalizeWhitespace(holdCode);
  if (!normalizedHoldCode) {
    return {
      holdCode: '',
      prefix: null,
      subjectToken: null,
      suffix: '',
      classification: 'fallback',
      subjectKey: null,
      subjectName: null,
    };
  }

  if (isIgnoredHold(normalizedHoldCode)) {
    return {
      holdCode: normalizedHoldCode,
      prefix: null,
      subjectToken: null,
      suffix: '',
      classification: 'ignored',
      subjectKey: null,
      subjectName: null,
    };
  }

  const directSubjectName = lookupSubjectName(normalizedHoldCode);
  if (directSubjectName) {
    return {
      holdCode: normalizedHoldCode,
      prefix: null,
      subjectToken: normalizedHoldCode,
      suffix: '',
      classification: 'subject',
      subjectKey: getSubjectKey(directSubjectName),
      subjectName: directSubjectName,
    };
  }

  const match = normalizedHoldCode.match(/^(\S+)\s+(\S+)(.*)$/);
  if (!match) {
    return {
      holdCode: normalizedHoldCode,
      prefix: null,
      subjectToken: null,
      suffix: '',
      classification: 'fallback',
      subjectKey: null,
      subjectName: null,
    };
  }

  const [, prefix, subjectToken, suffix] = match;
  if (!looksLikeAcademicPrefix(prefix)) {
    return {
      holdCode: normalizedHoldCode,
      prefix,
      subjectToken,
      suffix,
      classification: 'fallback',
      subjectKey: null,
      subjectName: null,
    };
  }

  if (isIgnoredHold(`${prefix} ${subjectToken}${suffix}`)) {
    return {
      holdCode: normalizedHoldCode,
      prefix,
      subjectToken,
      suffix,
      classification: 'ignored',
      subjectKey: null,
      subjectName: null,
    };
  }

  const subjectName = lookupSubjectAbbrev(subjectToken);
  const trimmedSuffix = suffix.trim();
  if (subjectName && (trimmedSuffix === '' || /^\d+$/.test(trimmedSuffix))) {
    return {
      holdCode: normalizedHoldCode,
      prefix,
      subjectToken,
      suffix,
      classification: 'subject',
      subjectKey: getSubjectKey(subjectName),
      subjectName,
    };
  }

  return {
    holdCode: normalizedHoldCode,
    prefix,
    subjectToken,
    suffix,
    classification: 'override',
    subjectKey: null,
    subjectName: null,
  };
}

function upsertSubjectMapping(
  store: HoldMappingStore,
  subjectKey: string,
  candidate: Omit<SubjectMapping, 'kind' | 'subjectKey'>,
): boolean {
  const existing = store.subjects[subjectKey];
  if (!existing) {
    store.subjects[subjectKey] = {
      kind: 'subject',
      subjectKey,
      ...candidate,
    };
    return true;
  }

  let changed = false;

  if (!existing.subjectAbbrev || candidate.subjectAbbrev.length < existing.subjectAbbrev.length) {
    existing.subjectAbbrev = candidate.subjectAbbrev;
    changed = true;
  }

  if (!existing.sampleHoldCode && candidate.sampleHoldCode) {
    existing.sampleHoldCode = candidate.sampleHoldCode;
    changed = true;
  }

  if (!existing.icon && candidate.icon) {
    existing.icon = candidate.icon;
    changed = true;
  }

  if (existing.colorHue === null && candidate.colorHue !== null) {
    existing.colorHue = candidate.colorHue;
    changed = true;
  }

  if (!candidate.autoGuessed && existing.autoGuessed) {
    existing.displayName = candidate.displayName;
    existing.autoGuessed = false;
    changed = true;
  }

  return changed;
}

function upsertHoldOverride(
  store: HoldMappingStore,
  holdCode: string,
  candidate: Omit<HoldOverride, 'kind' | 'holdCode'>,
): boolean {
  const existing = store.holdOverrides[holdCode];
  if (!existing) {
    store.holdOverrides[holdCode] = {
      kind: 'override',
      holdCode,
      ...candidate,
    };
    return true;
  }

  let changed = false;

  if (!existing.holdelementId && candidate.holdelementId) {
    existing.holdelementId = candidate.holdelementId;
    changed = true;
  }

  if (!existing.subjectAbbrev && candidate.subjectAbbrev) {
    existing.subjectAbbrev = candidate.subjectAbbrev;
    changed = true;
  }

  if (!existing.icon && candidate.icon) {
    existing.icon = candidate.icon;
    changed = true;
  }

  if (existing.colorHue === null && candidate.colorHue !== null) {
    existing.colorHue = candidate.colorHue;
    changed = true;
  }

  if (!candidate.autoGuessed && existing.autoGuessed) {
    existing.displayName = candidate.displayName;
    existing.autoGuessed = false;
    changed = true;
  }

  return changed;
}

// ── Resolution ─────────────────────────────────────────────────────────

function getSubjectDisplayName(store: HoldMappingStore, descriptor: HoldDescriptor): string {
  if (!descriptor.subjectKey || !descriptor.subjectName) return descriptor.holdCode;
  return store.subjects[descriptor.subjectKey]?.displayName ?? descriptor.subjectName;
}

function getSubjectHue(store: HoldMappingStore, descriptor: HoldDescriptor): number {
  if (!descriptor.subjectKey) return UNMAPPED_HUE;
  const subject = store.subjects[descriptor.subjectKey];
  if (subject?.colorHue !== null && subject?.colorHue !== undefined) {
    return subject.colorHue;
  }
  return getDefaultSubjectHue(descriptor.subjectKey);
}

function expandHoldLabel(descriptor: HoldDescriptor, subjectName: string): string {
  if (!descriptor.prefix || !subjectName.trim()) return subjectName.trim() || descriptor.holdCode;

  const trimmedSubjectName = subjectName.trim();
  if (trimmedSubjectName.toLocaleLowerCase('da').startsWith(`${descriptor.prefix.toLocaleLowerCase('da')} `)) {
    return trimmedSubjectName;
  }

  return `${descriptor.prefix} ${trimmedSubjectName}${descriptor.suffix}`;
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Get the display name for a hold code.
 * Returns the shared subject name, per-hold override, or raw hold code.
 */
export function getHoldDisplayName(holdCode: string): string {
  const store = loadStore();
  const descriptor = analyzeHold(holdCode);

  if (descriptor.classification === 'ignored' || descriptor.classification === 'fallback') {
    return descriptor.holdCode;
  }

  if (descriptor.classification === 'override') {
    return store.holdOverrides[descriptor.holdCode]?.displayName ?? descriptor.holdCode;
  }

  return getSubjectDisplayName(store, descriptor);
}

/**
 * Whether this hold currently resolves through a stored subject/override mapping.
 */
export function hasHoldMapping(holdCode: string): boolean {
  const store = loadStore();
  const descriptor = analyzeHold(holdCode);

  if (descriptor.classification === 'subject') {
    return !!descriptor.subjectKey && !!store.subjects[descriptor.subjectKey];
  }

  if (descriptor.classification === 'override') {
    return !!store.holdOverrides[descriptor.holdCode];
  }

  return false;
}

/**
 * Get a full hold label with class prefix preserved.
 * "1x MA" -> "1x Matematik", "1g Ty 4" -> "1g Tysk 4"
 */
export function getFullHoldDisplayName(holdCode: string): string {
  const store = loadStore();
  const descriptor = analyzeHold(holdCode);

  if (descriptor.classification !== 'subject') {
    return getHoldDisplayName(holdCode);
  }

  return expandHoldLabel(descriptor, getSubjectDisplayName(store, descriptor));
}

/**
 * Get the color hue for a hold code.
 * Shared subjects use a shared default hue across classes.
 */
export function getHoldHue(holdCode: string): number {
  const store = loadStore();
  const descriptor = analyzeHold(holdCode);

  if (descriptor.classification === 'subject') {
    return getSubjectHue(store, descriptor);
  }

  if (descriptor.classification === 'override') {
    const override = store.holdOverrides[descriptor.holdCode];
    if (override?.colorHue !== null && override?.colorHue !== undefined) {
      return override.colorHue;
    }
    return UNMAPPED_HUE;
  }

  return UNMAPPED_HUE;
}

/**
 * Register a hold code in the store.
 * Shared academic subjects are stored once; non-academic groups are ignored.
 */
export function registerHold(holdCode: string, holdelementId?: string | null): void {
  const store = loadStore();
  const descriptor = analyzeHold(holdCode);

  if (descriptor.classification === 'ignored' || descriptor.classification === 'fallback') {
    return;
  }

  if (descriptor.classification === 'subject' && descriptor.subjectKey && descriptor.subjectName) {
    const changed = upsertSubjectMapping(store, descriptor.subjectKey, {
      subjectAbbrev: descriptor.subjectToken ?? descriptor.subjectName,
      defaultName: descriptor.subjectName,
      displayName: descriptor.subjectName,
      autoGuessed: true,
      colorHue: null,
      icon: null,
      sampleHoldCode: descriptor.holdCode === descriptor.subjectName ? null : descriptor.holdCode,
    });
    if (changed) saveStore(store);
    return;
  }

  const changed = upsertHoldOverride(store, descriptor.holdCode, {
    holdelementId: holdelementId ?? null,
    subjectAbbrev: descriptor.subjectToken,
    defaultName: descriptor.holdCode,
    displayName: descriptor.holdCode,
    autoGuessed: true,
    colorHue: null,
    icon: null,
  });
  if (changed) saveStore(store);
}

/**
 * Scan the DOM for hold references and register them.
 * Targets:
 *   1. [data-tooltip] elements with "Hold: xxx" lines
 *   2. span[data-lectioContextCard^="HE"] hold spans
 */
export function scanDOMForHolds(root?: Element): void {
  const container = root ?? document;

  container.querySelectorAll('[data-tooltip]').forEach((el) => {
    const tooltip = el.getAttribute('data-tooltip') || '';
    const holdMatches = tooltip.match(/Hold:\s*(.+)/g);
    if (!holdMatches) return;

    for (const match of holdMatches) {
      const holdLine = match.replace(/^Hold:\s*/, '').trim();
      const holds = holdLine.split(',').map((hold) => hold.trim()).filter(Boolean);
      for (const hold of holds) {
        registerHold(hold);
      }
    }
  });

  container.querySelectorAll('span[data-lectioContextCard^="HE"]').forEach((el) => {
    const holdCode = el.textContent?.trim();
    const contextId = el.getAttribute('data-lectioContextCard') || null;
    if (holdCode) {
      registerHold(holdCode, contextId);
    }
  });
}

/**
 * Get all editable mappings for the settings UI.
 */
export function getAllHolds(): HoldMappingRow[] {
  const store = loadStore();

  const subjects = Object.values(store.subjects)
    .map<HoldMappingRow>((mapping) => ({
      id: mapping.subjectKey,
      kind: 'subject',
      codeLabel: mapping.sampleHoldCode ?? mapping.subjectAbbrev.toLocaleUpperCase('da'),
      displayName: mapping.displayName,
      autoGuessed: mapping.autoGuessed,
      colorHue: mapping.colorHue,
      effectiveHue: mapping.colorHue ?? getDefaultSubjectHue(mapping.subjectKey),
      description: mapping.sampleHoldCode
        ? `Gælder automatisk for fx ${mapping.sampleHoldCode}.`
        : 'Gælder automatisk på tværs af dine klasser.',
      sortLabel: mapping.displayName,
    }))
    .sort((a, b) => a.sortLabel.localeCompare(b.sortLabel, 'da'));

  const overrides = Object.values(store.holdOverrides)
    .map<HoldMappingRow>((mapping) => ({
      id: mapping.holdCode,
      kind: 'override',
      codeLabel: mapping.holdCode,
      displayName: mapping.displayName,
      autoGuessed: mapping.autoGuessed,
      colorHue: mapping.colorHue,
      effectiveHue: mapping.colorHue ?? UNMAPPED_HUE,
      description: 'Bruges kun når Lectio viser dette navn.',
      sortLabel: mapping.displayName,
    }))
    .sort((a, b) => a.sortLabel.localeCompare(b.sortLabel, 'da'));

  return [...subjects, ...overrides];
}

/**
 * Set a user override for a subject or hold exception display name.
 */
export function setHoldDisplayName(id: string, kind: HoldMappingRow['kind'], name: string): void {
  const store = loadStore();
  const trimmed = normalizeWhitespace(name);
  if (!trimmed) return;

  if (kind === 'subject') {
    const subject = store.subjects[id];
    if (!subject) return;
    subject.displayName = trimmed;
    subject.autoGuessed = trimmed === subject.defaultName;
    saveStore(store);
    return;
  }

  const override = store.holdOverrides[id];
  if (!override) return;
  override.displayName = trimmed;
  override.autoGuessed = trimmed === override.defaultName;
  saveStore(store);
}

/**
 * Set a user override for a subject or hold exception color hue.
 * Pass null to reset to the shared/default hash color.
 */
export function setHoldColorHue(id: string, kind: HoldMappingRow['kind'], hue: number | null): void {
  const store = loadStore();

  if (kind === 'subject') {
    const subject = store.subjects[id];
    if (!subject) return;
    subject.colorHue = hue;
    saveStore(store);
    return;
  }

  const override = store.holdOverrides[id];
  if (!override) return;
  override.colorHue = hue;
  saveStore(store);
}

/**
 * Reset all display names and color overrides to their defaults.
 */
export function resetAllMappings(): void {
  const store = loadStore();

  for (const subject of Object.values(store.subjects)) {
    subject.displayName = subject.defaultName;
    subject.autoGuessed = true;
    subject.colorHue = null;
  }

  for (const override of Object.values(store.holdOverrides)) {
    override.displayName = override.defaultName;
    override.autoGuessed = true;
    override.colorHue = null;
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

  spans.forEach((span) => {
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
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Ignore errors
  }
}
