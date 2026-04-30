const CLASS_LETTER = String.raw`A-Za-zÆØÅæøå`;
const CLASS_SUFFIX = String.raw`(?:[${CLASS_LETTER}0-9]{1,2}|\.[${CLASS_LETTER}0-9]+)`;
const CLASS_CODE_BODY = String.raw`(?:[${CLASS_LETTER}]+\d+|\d+)`;
const CLASS_CODE = String.raw`(?:[${CLASS_LETTER}]+\d+(?:${CLASS_SUFFIX})*|${CLASS_CODE_BODY}(?:${CLASS_SUFFIX})+)`;

const YEAR_BASED_CLASS_RE = new RegExp(`^([${CLASS_LETTER}]*)(\\d{4})((?:${CLASS_SUFFIX})*)(?:\\s+(\\d+))?$`, "i");
const GRADE_BASED_CLASS_RE = new RegExp(`^(${CLASS_CODE})(?:\\s+(\\d+))?$`, "i");
const GRADE_PREFIX_RE = new RegExp(`^[${CLASS_LETTER}]*(\\d+)`, "i");

function normalizeClassCode(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || !trimmed.includes("_")) return trimmed;
  const tail = trimmed.slice(trimmed.lastIndexOf("_") + 1);
  return GRADE_BASED_CLASS_RE.test(tail) ? tail : trimmed;
}

function getCurrentSchoolStartYear(now: Date): number {
  const currentYear = now.getFullYear();
  return now.getMonth() >= 7 ? currentYear : currentYear - 1;
}

function transformYearBasedGrade(name: string, now: Date): number | null {
  const match = name.trim().match(YEAR_BASED_CLASS_RE);
  if (!match) return null;
  const startYear = parseInt(match[2], 10);
  if (startYear < 2000 || startYear > 2100) return null;
  const grade = getCurrentSchoolStartYear(now) - startYear + 1;
  return grade >= 1 && grade <= 3 ? grade : null;
}

export function getSchoolYearFromClassName(
  name: string,
  now: Date = new Date(),
): number | null {
  const normalized = normalizeClassCode(name);

  const yearGrade = transformYearBasedGrade(normalized, now);
  if (yearGrade !== null) return yearGrade;

  const match = normalized.match(GRADE_PREFIX_RE);
  if (!match) return null;

  const grade = Number.parseInt(match[1], 10);
  return grade >= 1 && grade <= 3 ? grade : null;
}
