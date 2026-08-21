import { looksLikeAcademicClassPrefix } from './class-name';

const STORAGE_KEY = 'bl-hold-mappings';
const LEGACY_STORAGE_KEY = 'il-hold-mappings';
const STORE_VERSION = 3;
const UNMAPPED_HUE = 235;

export interface LessonMapping {
  kind: 'mapping';
  canonicalKey: string;
  defaultName: string;
  displayName: string;
  autoGuessed: boolean;
  colorHue: number | null;
  icon: string | null;
  sampleHoldCode: string | null;
}

export interface HoldMappingRow {
  id: string;
  kind: 'mapping';
  codeLabel: string;
  displayName: string;
  autoGuessed: boolean;
  colorHue: number | null;
  effectiveHue: number;
  description: string;
  sortLabel: string;
}

export interface LessonMappingSnapshot extends LessonMapping {
  defaultColorHue: number;
}

export interface SupabaseLessonMappingRow {
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

interface HoldMappingStore {
  version: 3;
  schoolId: string;
  mappings: Record<string, LessonMapping>;
  updatedAt: number;
}

interface LegacySubjectMapping {
  subjectAbbrev?: string;
  defaultName?: string;
  displayName?: string;
  autoGuessed?: boolean;
  colorHue?: number | null;
  icon?: string | null;
  sampleHoldCode?: string | null;
}

interface LegacyHoldOverride {
  holdCode?: string;
  subjectAbbrev?: string | null;
  defaultName?: string;
  displayName?: string;
  autoGuessed?: boolean;
  colorHue?: number | null;
  icon?: string | null;
}

interface LegacyHoldMappingStore {
  version?: number;
  schoolId?: string;
  subjects?: Record<string, LegacySubjectMapping>;
  holdOverrides?: Record<string, LegacyHoldOverride>;
  updatedAt?: number;
}

type HoldClassification = 'ignored' | 'mapping' | 'fallback';

interface HoldDescriptor {
  holdCode: string;
  prefix: string | null;
  suffix: string;
  classification: HoldClassification;
  canonicalKey: string | null;
  defaultName: string | null;
}

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
  frb: 'Fransk',
  frf: 'Fransk',
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
  bro: 'Brobygning',
  er: 'Erhvervsøkonomi',
  eø: 'Erhvervsøkonomi',
  ng: 'Naturgeografi',
  if: 'Informatik',
  ap: 'Almen sprogforståelse',
  at: 'Almen studieforberedelse',
  srp: 'Studieretningsprojekt',
  sro: 'Studieretningsopgave',
  ks: 'Kultur- og samfundsfag',
  ti: 'Teknologi',
  tk: 'Teknikfag',
  ih: 'Idéhistorie',
  st: 'Studievejledning',
  kt: 'Klassens time',
  ff: 'Fælles fagligt',
  tek: 'Teknologi',
  as: 'Astronomi',
  kit: 'Kommunikation/IT',
  mat: 'Matematik',
  pro: 'Programmering',
  fys: 'Fysik',
  pu: 'Produktudvikling',
  sam: 'Samfundsfag',
  skr: 'Skriftlige opgaver',
  ss: 'Statistik',
  bio: 'Biologi',
  geo: 'Geografi',
  inf: 'Informatik',
  his: 'Historie',
  dan: 'Dansk',
  eng: 'Engelsk',
  vø: 'Virksomhedsøkonomi',
};

const SUBJECT_NAME_LOOKUP = new Map<string, string>();
const SUBJECT_CANONICAL_KEY_BY_NAME = new Map<string, string>();
for (const [alias, displayName] of Object.entries(SUBJECT_DICTIONARY)) {
  const normalizedName = normalizeKey(displayName);
  SUBJECT_NAME_LOOKUP.set(normalizedName, displayName);
  if (!SUBJECT_CANONICAL_KEY_BY_NAME.has(normalizedName)) {
    SUBJECT_CANONICAL_KEY_BY_NAME.set(normalizedName, alias);
  }
}

const SUBJECT_DEFAULT_HUES: Record<string, number> = {
  da: 8,
  en: 218,
  ty: 52,
  fr: 330,
  sp: 15,
  la: 358,

  hi: 34,
  re: 285,
  sa: 200,
  fi: 272,
  ps: 312,
  if: 248,
  st: 286,
  kt: 24,
  ff: 172,
  ks: 186,
  ol: 40,

  ma: 235,
  fy: 248,
  ke: 175,
  bi: 132,
  ge: 95,
  nv: 145,
  ng: 88,
  bt: 160,
  as: 260,

  it: 248,
  ti: 205,
  de: 342,
  me: 318,
  bk: 355,
  mu: 292,
  dr: 25,
  id: 118,
  er: 65,
  vø: 72,
  ss: 225,
  tk: 210,
  kit: 305,
  pro: 242,
  pu: 22,
  skr: 12,
  bro: 155,

  ap: 48,
  at: 188,
  srp: 280,
  sro: 300,
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

export const CURATED_HUES = [
  0,
  8,
  15,
  22,
  28,
  34,
  40,
  48,
  52,
  65,
  72,
  80,
  88,
  95,
  108,
  118,
  132,
  145,
  160,
  172,
  175,
  186,
  188,
  200,
  205,
  210,
  218,
  225,
  235,
  242,
  248,
  258,
  272,
  280,
  286,
  295,
  300,
  305,
  312,
  318,
  330,
  336,
  342,
  355,
];

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
    mappings: {},
    updatedAt: Date.now(),
  };
}

function getCanonicalKeyForSubjectName(subjectName: string): string | null {
  return SUBJECT_CANONICAL_KEY_BY_NAME.get(normalizeKey(subjectName)) ?? null;
}

function resolveCanonicalLesson(value: string): { canonicalKey: string; defaultName: string } | null {
  const normalizedValue = normalizeKey(value);
  const subjectNameFromAlias = SUBJECT_DICTIONARY[normalizedValue];
  if (subjectNameFromAlias) {
    return {
      canonicalKey: getCanonicalKeyForSubjectName(subjectNameFromAlias) ?? normalizedValue,
      defaultName: subjectNameFromAlias,
    };
  }

  const subjectNameFromFullName = SUBJECT_NAME_LOOKUP.get(normalizedValue);
  if (!subjectNameFromFullName) return null;

  return {
    canonicalKey: getCanonicalKeyForSubjectName(subjectNameFromFullName) ?? normalizedValue,
    defaultName: subjectNameFromFullName,
  };
}

function migrateLegacyStore(parsed: LegacyHoldMappingStore, schoolId: string): HoldMappingStore {
  const nextStore = createFreshStore(schoolId);

  const upsertMapping = (candidate: Omit<LessonMapping, 'kind' | 'canonicalKey'> & { canonicalKey: string }) => {
    const existing = nextStore.mappings[candidate.canonicalKey];
    if (!existing) {
      nextStore.mappings[candidate.canonicalKey] = {
        kind: 'mapping',
        canonicalKey: candidate.canonicalKey,
        defaultName: candidate.defaultName,
        displayName: candidate.displayName,
        autoGuessed: candidate.autoGuessed,
        colorHue: candidate.colorHue,
        icon: candidate.icon,
        sampleHoldCode: candidate.sampleHoldCode,
      };
      return;
    }

    if (!existing.sampleHoldCode && candidate.sampleHoldCode) {
      existing.sampleHoldCode = candidate.sampleHoldCode;
    }
    if (!existing.icon && candidate.icon) {
      existing.icon = candidate.icon;
    }
    if (existing.colorHue === null && candidate.colorHue !== null) {
      existing.colorHue = candidate.colorHue;
    }
    if (!candidate.autoGuessed && existing.autoGuessed) {
      existing.displayName = candidate.displayName;
      existing.autoGuessed = false;
    }
  };

  for (const mapping of Object.values(parsed.subjects ?? {})) {
    const resolved = resolveCanonicalLesson(mapping.subjectAbbrev ?? mapping.defaultName ?? mapping.displayName ?? '');
    if (!resolved) continue;
    upsertMapping({
      canonicalKey: resolved.canonicalKey,
      defaultName: mapping.defaultName ?? resolved.defaultName,
      displayName: mapping.displayName ?? mapping.defaultName ?? resolved.defaultName,
      autoGuessed: mapping.autoGuessed ?? true,
      colorHue: mapping.colorHue ?? null,
      icon: mapping.icon ?? null,
      sampleHoldCode: mapping.sampleHoldCode ?? null,
    });
  }

  for (const override of Object.values(parsed.holdOverrides ?? {})) {
    const resolved = resolveCanonicalLesson(override.subjectAbbrev ?? override.holdCode ?? override.defaultName ?? override.displayName ?? '');
    if (!resolved) continue;
    upsertMapping({
      canonicalKey: resolved.canonicalKey,
      defaultName: resolved.defaultName,
      displayName: override.displayName ?? override.defaultName ?? resolved.defaultName,
      autoGuessed: override.autoGuessed ?? true,
      colorHue: override.colorHue ?? null,
      icon: override.icon ?? null,
      sampleHoldCode: override.holdCode ?? null,
    });
  }

  nextStore.updatedAt = parsed.updatedAt ?? Date.now();
  return nextStore;
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
      const parsed = JSON.parse(raw) as Partial<HoldMappingStore> & LegacyHoldMappingStore;
      if (parsed.schoolId === schoolId) {
        if (parsed.version === STORE_VERSION && parsed.mappings) {
          const hydrated: HoldMappingStore = {
            version: STORE_VERSION,
            schoolId,
            mappings: parsed.mappings,
            updatedAt: parsed.updatedAt ?? Date.now(),
          };
          cachedStore = hydrated;
          return hydrated;
        }

        const migrated = migrateLegacyStore(parsed, schoolId);
        saveStore(migrated);
        return migrated;
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

function isIgnoredHold(holdCode: string): boolean {
  const normalized = normalizeWhitespace(holdCode);
  return IGNORED_HOLD_PATTERNS.some((pattern) => pattern.test(normalized));
}

function stripSubjectLevelSuffix(token: string): string {
  return token.replace(/(?:-[a-zæøå]+|\/[a-zæøå0-9])$/i, '');
}

function getDefaultHue(canonicalKey: string): number {
  return SUBJECT_DEFAULT_HUES[canonicalKey] ?? hashToHue(canonicalKey);
}

function isAutoDetectableSubjectSuffix(subjectToken: string, suffix: string): boolean {
  if (suffix === '' || /^\d+$/.test(suffix)) {
    return true;
  }

  if (subjectToken.toLocaleLowerCase('da') === 'st') {
    return /^[a-zæøå]{1,4}$/i.test(suffix);
  }

  return false;
}

function resolveStandaloneSubject(holdCode: string): HoldDescriptor | null {
  const direct = resolveCanonicalLesson(holdCode);
  if (direct) {
    return {
      holdCode,
      prefix: null,
      suffix: '',
      classification: 'mapping',
      canonicalKey: direct.canonicalKey,
      defaultName: direct.defaultName,
    };
  }

  const match = holdCode.match(/^(\S+)(.*)$/);
  if (!match) return null;

  const [, token, suffix] = match;
  const strippedToken = stripSubjectLevelSuffix(token);
  const resolved = resolveCanonicalLesson(strippedToken);
  const trimmedSuffix = suffix.trim();
  if (!resolved || !isAutoDetectableSubjectSuffix(strippedToken, trimmedSuffix)) {
    return null;
  }

  return {
    holdCode,
    prefix: null,
    suffix,
    classification: 'mapping',
    canonicalKey: resolved.canonicalKey,
    defaultName: resolved.defaultName,
  };
}

function analyzeHold(holdCode: string): HoldDescriptor {
  const normalizedHoldCode = normalizeWhitespace(holdCode);
  if (!normalizedHoldCode) {
    return {
      holdCode: '',
      prefix: null,
      suffix: '',
      classification: 'fallback',
      canonicalKey: null,
      defaultName: null,
    };
  }

  if (isIgnoredHold(normalizedHoldCode)) {
    return {
      holdCode: normalizedHoldCode,
      prefix: null,
      suffix: '',
      classification: 'ignored',
      canonicalKey: null,
      defaultName: null,
    };
  }

  const standalone = resolveStandaloneSubject(normalizedHoldCode);
  if (standalone) return standalone;

  const match = normalizedHoldCode.match(/^(\S+)\s+(\S+)(.*)$/);
  if (!match) {
    return {
      holdCode: normalizedHoldCode,
      prefix: null,
      suffix: '',
      classification: 'fallback',
      canonicalKey: null,
      defaultName: null,
    };
  }

  const [, prefix, subjectToken, suffix] = match;
  if (!looksLikeAcademicClassPrefix(prefix)) {
    return {
      holdCode: normalizedHoldCode,
      prefix,
      suffix,
      classification: 'fallback',
      canonicalKey: null,
      defaultName: null,
    };
  }

  const normalizedSubjectToken = stripSubjectLevelSuffix(subjectToken);
  const resolved = resolveCanonicalLesson(normalizedSubjectToken);
  const trimmedSuffix = suffix.trim();
  if (resolved && isAutoDetectableSubjectSuffix(normalizedSubjectToken, trimmedSuffix)) {
    return {
      holdCode: normalizedHoldCode,
      prefix,
      suffix,
      classification: 'mapping',
      canonicalKey: resolved.canonicalKey,
      defaultName: resolved.defaultName,
    };
  }

  return {
    holdCode: normalizedHoldCode,
    prefix,
    suffix,
    classification: 'fallback',
    canonicalKey: null,
    defaultName: null,
  };
}

function upsertMapping(
  store: HoldMappingStore,
  canonicalKey: string,
  candidate: Omit<LessonMapping, 'kind' | 'canonicalKey'>,
): boolean {
  const existing = store.mappings[canonicalKey];
  if (!existing) {
    store.mappings[canonicalKey] = {
      kind: 'mapping',
      canonicalKey,
      ...candidate,
    };
    return true;
  }

  let changed = false;

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

function getDisplayName(store: HoldMappingStore, descriptor: HoldDescriptor): string {
  if (!descriptor.canonicalKey || !descriptor.defaultName) return descriptor.holdCode;
  return store.mappings[descriptor.canonicalKey]?.displayName ?? descriptor.defaultName;
}

function expandHoldLabel(descriptor: HoldDescriptor, displayName: string): string {
  const trimmedDisplayName = displayName.trim();
  if (!trimmedDisplayName) return descriptor.holdCode;

  if (!descriptor.prefix && !descriptor.suffix.trim()) {
    return trimmedDisplayName;
  }

  if (descriptor.prefix) {
    if (trimmedDisplayName.toLocaleLowerCase('da').startsWith(`${descriptor.prefix.toLocaleLowerCase('da')} `)) {
      return trimmedDisplayName;
    }
    return `${descriptor.prefix} ${trimmedDisplayName}${descriptor.suffix}`;
  }

  return `${trimmedDisplayName}${descriptor.suffix}`;
}

export function getCanonicalHoldKey(holdCode: string): string | null {
  const descriptor = analyzeHold(holdCode);
  return descriptor.classification === 'mapping' ? descriptor.canonicalKey : null;
}

export function getLessonMappingSnapshot(canonicalKey: string): LessonMappingSnapshot | null {
  const store = loadStore();
  const mapping = store.mappings[canonicalKey];
  if (!mapping) return null;
  return {
    ...mapping,
    defaultColorHue: getDefaultHue(mapping.canonicalKey),
  };
}

export function getAllLessonMappingSnapshots(): LessonMappingSnapshot[] {
  const store = loadStore();
  return Object.values(store.mappings)
    .map((mapping) => ({
      ...mapping,
      defaultColorHue: getDefaultHue(mapping.canonicalKey),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'da'));
}

export function applySupabaseLessonMappings(rows: SupabaseLessonMappingRow[]): boolean {
  const store = loadStore();
  let changed = false;

  for (const row of rows) {
    const canonicalKey = normalizeKey(row.canonical_key);
    const nextDefaultName = normalizeWhitespace(row.default_name);
    const nextDisplayName = normalizeWhitespace(row.display_name || row.default_name);
    const nextColorHue = row.override_color_hue ?? null;
    const nextIcon = row.override_icon ?? null;
    const existing = store.mappings[canonicalKey];

    if (!existing) {
      store.mappings[canonicalKey] = {
        kind: 'mapping',
        canonicalKey,
        defaultName: nextDefaultName,
        displayName: nextDisplayName,
        autoGuessed: nextDisplayName === nextDefaultName,
        colorHue: nextColorHue,
        icon: nextIcon,
        sampleHoldCode: null,
      };
      changed = true;
      continue;
    }

    if (
      existing.defaultName !== nextDefaultName ||
      existing.displayName !== nextDisplayName ||
      existing.autoGuessed !== (nextDisplayName === nextDefaultName) ||
      existing.colorHue !== nextColorHue ||
      existing.icon !== nextIcon
    ) {
      existing.defaultName = nextDefaultName;
      existing.displayName = nextDisplayName;
      existing.autoGuessed = nextDisplayName === nextDefaultName;
      existing.colorHue = nextColorHue;
      existing.icon = nextIcon;
      changed = true;
    }
  }

  if (changed) {
    saveStore(store);
  }

  return changed;
}

export function getHoldDisplayName(holdCode: string): string {
  const store = loadStore();
  const descriptor = analyzeHold(holdCode);

  if (descriptor.classification !== 'mapping') {
    return descriptor.holdCode;
  }

  return getDisplayName(store, descriptor);
}

export function hasHoldMapping(holdCode: string): boolean {
  const store = loadStore();
  const descriptor = analyzeHold(holdCode);
  return descriptor.classification === 'mapping' && !!descriptor.canonicalKey && !!store.mappings[descriptor.canonicalKey];
}

export function getFullHoldDisplayName(holdCode: string): string {
  const store = loadStore();
  const descriptor = analyzeHold(holdCode);

  if (descriptor.classification !== 'mapping') {
    return descriptor.holdCode;
  }

  return expandHoldLabel(descriptor, getDisplayName(store, descriptor));
}

export function getHoldHue(holdCode: string): number {
  const store = loadStore();
  const descriptor = analyzeHold(holdCode);

  if (descriptor.classification !== 'mapping' || !descriptor.canonicalKey) {
    return UNMAPPED_HUE;
  }

  const mapping = store.mappings[descriptor.canonicalKey];
  if (mapping?.colorHue !== null && mapping?.colorHue !== undefined) {
    return mapping.colorHue;
  }

  return getDefaultHue(descriptor.canonicalKey);
}

export function registerHold(holdCode: string, _holdelementId?: string | null): void {
  const store = loadStore();
  const descriptor = analyzeHold(holdCode);

  if (descriptor.classification !== 'mapping' || !descriptor.canonicalKey || !descriptor.defaultName) {
    return;
  }

  const changed = upsertMapping(store, descriptor.canonicalKey, {
    defaultName: descriptor.defaultName,
    displayName: descriptor.defaultName,
    autoGuessed: true,
    colorHue: null,
    icon: null,
    sampleHoldCode: descriptor.holdCode === descriptor.defaultName ? null : descriptor.holdCode,
  });
  if (changed) saveStore(store);
}

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
    if (holdCode) {
      registerHold(holdCode);
    }
  });
}

export function getAllHolds(): HoldMappingRow[] {
  const store = loadStore();

  return Object.values(store.mappings)
    .map<HoldMappingRow>((mapping) => ({
      id: mapping.canonicalKey,
      kind: 'mapping',
      codeLabel: mapping.sampleHoldCode ?? mapping.canonicalKey.toLocaleUpperCase('da'),
      displayName: mapping.displayName,
      autoGuessed: mapping.autoGuessed,
      colorHue: mapping.colorHue,
      effectiveHue: mapping.colorHue ?? getDefaultHue(mapping.canonicalKey),
      description: mapping.sampleHoldCode
        ? `Normaliseres til ${mapping.canonicalKey.toLocaleUpperCase('da')} for fx ${mapping.sampleHoldCode}.`
        : `Normaliseres til ${mapping.canonicalKey.toLocaleUpperCase('da')} på tværs af dine hold.`,
      sortLabel: mapping.displayName,
    }))
    .sort((a, b) => a.sortLabel.localeCompare(b.sortLabel, 'da'));
}

export function setHoldDisplayName(id: string, _kind: HoldMappingRow['kind'], name: string): void {
  const store = loadStore();
  const trimmed = normalizeWhitespace(name);
  if (!trimmed) return;

  const mapping = store.mappings[id];
  if (!mapping) return;

  mapping.displayName = trimmed;
  mapping.autoGuessed = trimmed === mapping.defaultName;
  saveStore(store);
}

export function setHoldColorHue(id: string, _kind: HoldMappingRow['kind'], hue: number | null): void {
  const store = loadStore();
  const mapping = store.mappings[id];
  if (!mapping) return;

  mapping.colorHue = hue;
  saveStore(store);
}

export function resetAllMappings(): void {
  const store = loadStore();

  for (const mapping of Object.values(store.mappings)) {
    mapping.displayName = mapping.defaultName;
    mapping.autoGuessed = true;
    mapping.colorHue = null;
  }

  saveStore(store);
}

export function replaceHoldCodesInDOM(container: Element, useFullName = false): number {
  const spans = container.querySelectorAll<HTMLElement>('span[data-lectioContextCard^="HE"]');
  let count = 0;

  spans.forEach((span) => {
    const holdCode = span.textContent?.trim();
    if (!holdCode) return;

    const displayName = useFullName ? getFullHoldDisplayName(holdCode) : getHoldDisplayName(holdCode);
    if (displayName !== holdCode) {
      span.textContent = displayName;
      span.title = holdCode;
      count++;
    }
  });

  return count;
}

export function clearHoldMappings(): void {
  cachedStore = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Ignore errors
  }
}
