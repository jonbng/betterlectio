const YEAR_BASED_CLASS_SUFFIX = String.raw`(?:[A-Za-z]|\.\d+)`;
const GRADE_BASED_CLASS_SUFFIX = String.raw`(?:[A-Za-z]|\.\d+)`;

const YEAR_BASED_CLASS_RE = new RegExp(`^([A-Za-z]*)(\\d{4})(${YEAR_BASED_CLASS_SUFFIX})(?:\\s+(\\d+))?$`);
const GRADE_BASED_CLASS_RE = new RegExp(`^([A-Za-z]*\\d+${GRADE_BASED_CLASS_SUFFIX})(?:\\s+(\\d+))?$`, 'i');
const YEAR_BASED_HOLD_RE = new RegExp(`^([A-Za-z]*\\d{4}${YEAR_BASED_CLASS_SUFFIX})\\s+(.+)$`);

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

  const suffix = match[3];
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
