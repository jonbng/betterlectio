const CLASS_LETTER = String.raw`A-Za-zÆØÅæøå`;
const CLASS_SUFFIX = String.raw`(?:[${CLASS_LETTER}0-9]{1,2}|\.\d+)`;
const CLASS_CODE_BODY = String.raw`(?:[${CLASS_LETTER}]+\d+|\d+)`;
const CLASS_CODE = String.raw`(?:[${CLASS_LETTER}]+\d+|${CLASS_CODE_BODY}${CLASS_SUFFIX})`;

const YEAR_BASED_CLASS_RE = new RegExp(`^([${CLASS_LETTER}]*)(\\d{4})(${CLASS_SUFFIX}?)(?:\\s+(\\d+))?$`, 'i');
const GRADE_BASED_CLASS_RE = new RegExp(`^(${CLASS_CODE})(?:\\s+(\\d+))?$`, 'i');
const YEAR_BASED_HOLD_RE = new RegExp(`^(\\S+)\\s+(.+)$`, 'i');
const GRADE_PREFIX_RE = new RegExp(`^[${CLASS_LETTER}]*(\\d+)`, 'i');

export function looksLikeAcademicClassPrefix(value: string): boolean {
  return GRADE_BASED_CLASS_RE.test(value.trim());
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
  const trimmed = classCode.trim();
  const match = trimmed.match(GRADE_BASED_CLASS_RE);
  return match ? match[1] : trimmed;
}

export function classGroupsMatch(left: string, right: string): boolean {
  const normalizedLeft = extractClassGroup(left).toLowerCase();
  const normalizedRight = extractClassGroup(right).toLowerCase();
  return normalizedLeft !== '' && normalizedLeft === normalizedRight;
}

export function getSchoolYearFromClassName(name: string, now: Date = new Date()): number | null {
  const transformed = transformYearBasedClassName(name, now);
  if (transformed) return transformed.grade;

  const trimmed = name.trim();
  const match = trimmed.match(GRADE_PREFIX_RE);
  if (!match) return null;

  const grade = Number.parseInt(match[1], 10);
  return grade >= 1 && grade <= 3 ? grade : null;
}
