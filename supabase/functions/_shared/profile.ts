export type ProfileSource = "student_card" | "schedule_title" | "none"

export interface ParsedLectioProfile {
  studentId: string | null
  firstName: string | null
  lastName: string | null
  className: string | null
  birthdate: string | null
  pictureUrl: string | null
  profileSource: ProfileSource
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
    aelig: "æ",
    AElig: "Æ",
    oslash: "ø",
    Oslash: "Ø",
    aring: "å",
    Aring: "Å",
  }
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, key: string) => {
    if (key.startsWith("#x")) return String.fromCodePoint(Number.parseInt(key.slice(2), 16))
    if (key.startsWith("#")) return String.fromCodePoint(Number.parseInt(key.slice(1), 10))
    return named[key] ?? entity
  })
}

function cleanText(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim()
}

function splitName(fullName: string | null): Pick<ParsedLectioProfile, "firstName" | "lastName"> {
  if (!fullName) return { firstName: null, lastName: null }
  const cleaned = fullName.replace(/\s*\(k\)\s*$/i, "").trim()
  const parts = cleaned.split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  }
}

function scheduleTitleText(html: string): string | null {
  const mainTitle = html.match(/<[^>]+id=["']s_m_HeaderContent_MainTitle["'][^>]*>([\s\S]*?)<\/[^>]+>/i)
  if (mainTitle) return cleanText(mainTitle[1])
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return title ? cleanText(title[1]) : null
}

export function parseScheduleIdentity(html: string): {
  studentId: string | null
  fullName: string | null
  className: string | null
} {
  const studentId = html.match(/data-lectioContextCard=["']S(\d+)["']/i)?.[1] ?? null
  const title = scheduleTitleText(html)
  if (!title) return { studentId, fullName: null, className: null }

  const match = title.match(/Eleven\s+(.+?)(?:\s*\(k\))?\s*,\s*([^\s,]+)\s*-\s*Skema/i)
  if (match) {
    return { studentId, fullName: match[1].trim(), className: match[2].trim() }
  }
  const nameOnly = title.match(/Eleven\s+(.+?)(?:\s*\(k\))?\s*-\s*Skema/i)
  return { studentId, fullName: nameOnly?.[1]?.trim() ?? null, className: null }
}

export function parseLectioProfile(
  scheduleHtml: string,
  studentCardHtml: string,
): ParsedLectioProfile {
  const schedule = parseScheduleIdentity(scheduleHtml)
  const nameMatch = studentCardHtml.match(
    /id=["']s_m_Content_Content_StudentName["'][^>]*>([\s\S]*?)<\//i,
  )
  const studentCardName = nameMatch ? cleanText(nameMatch[1]).replace(/\s*\([^)]*\)\s*$/, "") : null
  const fullName = studentCardName || schedule.fullName
  const names = splitName(fullName)

  const birthday = studentCardHtml.match(
    /id=["']s_m_Content_Content_StudentBirthday["'][^>]*>[\s\S]*?:\s*(\d{1,2})\/(\d{1,2})-(\d{4})/i,
  )
  const picture = studentCardHtml.match(
    /src=["']([^"']+)["'][^>]*id=["']s_m_Content_Content_StudPic["']/i,
  )

  return {
    studentId: schedule.studentId,
    ...names,
    className: schedule.className,
    birthdate: birthday
      ? `${birthday[3]}-${birthday[2].padStart(2, "0")}-${birthday[1].padStart(2, "0")}`
      : null,
    pictureUrl: picture ? new URL(decodeHtml(picture[1]), "https://www.lectio.dk").toString() : null,
    profileSource: studentCardName ? "student_card" : schedule.fullName ? "schedule_title" : "none",
  }
}
