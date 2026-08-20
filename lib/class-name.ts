const CLASS_LETTER = String.raw`A-Za-zÆØÅæøå`;
const CLASS_SEPARATOR = String.raw`[._/\-]`;
const CLASS_SUFFIX = String.raw`(?:[${CLASS_LETTER}0-9]{1,2}|${CLASS_SEPARATOR}[${CLASS_LETTER}0-9]+)`;
const CLASS_CODE_BODY = String.raw`(?:[${CLASS_LETTER}]+\d+|\d+)`;
const NAMED_CLASS = String.raw`[${CLASS_LETTER}]+`;
const CLASS_CODE = String.raw`(?:[${CLASS_LETTER}]+\d+(?:${CLASS_SUFFIX})*|${CLASS_CODE_BODY}(?:${CLASS_SUFFIX})+|${NAMED_CLASS})`;

const YEAR_BASED_CLASS_RE = new RegExp(`^([${CLASS_LETTER}]*)(\\d{4})((?:${CLASS_SUFFIX})*)(?:\\s+(\\d+))?$`, 'i');
const GRADE_BASED_CLASS_RE = new RegExp(`^(${CLASS_CODE})(?:\\s+(\\d+))?$`, 'i');
const YEAR_BASED_HOLD_RE = new RegExp(`^(\\S+)\\s+(.+)$`, 'i');
const GRADE_PREFIX_RE = new RegExp(`^[${CLASS_LETTER}]*(\\d+)`, 'i');

/**
 * Some Lectio schedule titles surface a hold identifier like `t25htxvx_1vx`
 * instead of a stamklasse. When the segment after the last underscore is itself
 * a valid class code, treat that as the canonical class name.
 *
 * Recognized class shapes: `1x`, `2hf`, `2zq`, `1.4`, `L2d`, `S2x`, `IB1`,
 * `10.st.kl.2`, hyphenated `3hx-u`, and named classes with no grade digit
 * (`BShannon`, `BHamilton`, `Epsilon`, `gf`).
 */
export function normalizeClassCode(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || !trimmed.includes('_')) return trimmed;
  const tail = trimmed.slice(trimmed.lastIndexOf('_') + 1);
  return GRADE_BASED_CLASS_RE.test(tail) ? tail : trimmed;
}

export function looksLikeAcademicClassPrefix(value: string): boolean {
  return GRADE_BASED_CLASS_RE.test(normalizeClassCode(value));
}

function getCurrentSchoolStartYear(now: Date): number {
  const currentYear = now.getFullYear();
  return now.getMonth() >= 7 ? currentYear : currentYear - 1;
}

export interface TransformedClassName {
  displayName: string;
  grade: number;
}

export function transformYearBasedClassName(name: string, now: Date = new Date()): TransformedClassName | null {
  const trimmed = name.trim();
  const match = trimmed.match(YEAR_BASED_CLASS_RE);
  if (!match) return null;

  const letterPrefix = match[1];
  const startYear = parseInt(match[2], 10);
  if (startYear < 2000 || startYear > 2100) return null;

  const grade = getCurrentSchoolStartYear(now) - startYear + 1;
  if (grade < 1 || grade > 3) return null;

  const suffix = match[3] || '';
  const studentNumber = match[4] ? ` ${match[4]}` : '';
  return {
    displayName: `${letterPrefix}${grade}${suffix}${studentNumber}`,
    grade,
  };
}

export function transformYearBasedHoldName(name: string, now: Date = new Date()): string | null {
  const trimmed = name.trim();
  const match = trimmed.match(YEAR_BASED_HOLD_RE);
  if (!match) return null;

  const transformedPrefix = transformYearBasedClassName(match[1], now);
  if (!transformedPrefix) return null;

  return `${transformedPrefix.displayName} ${match[2]}`;
}

export function extractClassGroup(classCode: string): string {
  const normalized = normalizeClassCode(classCode);
  const match = normalized.match(GRADE_BASED_CLASS_RE);
  return match ? match[1] : normalized;
}

export function classGroupsMatch(left: string, right: string): boolean {
  const normalizedLeft = extractClassGroup(left).toLowerCase();
  const normalizedRight = extractClassGroup(right).toLowerCase();
  return normalizedLeft !== '' && normalizedLeft === normalizedRight;
}

export function getSchoolYearFromClassName(name: string, now: Date = new Date()): number | null {
  const normalized = normalizeClassCode(name);

  const transformed = transformYearBasedClassName(normalized, now);
  if (transformed) return transformed.grade;

  const match = normalized.match(GRADE_PREFIX_RE);
  if (!match) return null;

  const grade = Number.parseInt(match[1], 10);
  return grade >= 1 && grade <= 3 ? grade : null;
}
