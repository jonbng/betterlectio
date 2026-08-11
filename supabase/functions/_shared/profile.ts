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
  // Lectio wraps the identity in a nested <span class="ls-hidden-smallscreen">…</span>
  // before the page name. Matching any closer (`</[^>]+>`) stops at that span and drops
  // "Skema"/etc. Close with the same tag that opened MainTitle instead.
  const open = html.match(
    /<([a-z][\w:-]*)\b[^>]*\bid=["']s_m_HeaderContent_MainTitle["'][^>]*>/i,
  )
  if (open && open.index != null) {
    const tag = open[1]
    const start = open.index + open[0].length
    const close = html.slice(start).match(new RegExp(`</${tag}\\s*>`, "i"))
    if (close && close.index != null) {
      const text = cleanText(html.slice(start, start + close.index))
      if (text) return text
    }
  }
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

  // Titles look like "Eleven Name(k), 1x - Skema" (or Beskeder, Forside, …).
  // Require the class comma form first; do not require the page name to be "Skema".
  const match = title.match(/Eleven\s+(.+?)(?:\s*\(k\))?\s*,\s*([^\s,]+)\s*-/i)
  if (match) {
    return { studentId, fullName: match[1].trim(), className: match[2].trim() }
  }
  const nameOnly = title.match(/Eleven\s+(.+?)(?:\s*\(k\))?\s*-/i)
  return { studentId, fullName: nameOnly?.[1]?.trim() ?? null, className: null }
}

function attrPair(
  html: string,
  id: string,
  attr: string,
): string | null {
  const idFirst = html.match(
    new RegExp(`id=["']${id}["'][^>]*\\b${attr}=["']([^"']+)["']`, "i"),
  )
  if (idFirst) return idFirst[1]
  const attrFirst = html.match(
    new RegExp(`\\b${attr}=["']([^"']+)["'][^>]*\\bid=["']${id}["']`, "i"),
  )
  return attrFirst?.[1] ?? null
}

function absolutizeLectioUrl(raw: string): string {
  const decoded = decodeHtml(raw)
  try {
    const url = new URL(decoded, "https://www.lectio.dk")
    // Header thumbs are small; prefer the full-size Lectio image when we can.
    if (url.searchParams.has("pictureid") && !url.searchParams.has("fullsize")) {
      url.searchParams.set("fullsize", "1")
    }
    return url.toString()
  } catch {
    return decoded
  }
}

function parsePictureUrl(scheduleHtml: string, studentCardHtml: string): string | null {
  const cardSrc = attrPair(studentCardHtml, "s_m_Content_Content_StudPic", "src")
  if (cardSrc) return absolutizeLectioUrl(cardSrc)

  // digitaltStudiekort is often empty for new-year students; SkemaNy still exposes
  // the signed-in user's header thumbnail on almost every authenticated page.
  const headerSrc = attrPair(scheduleHtml, "s_m_HeaderContent_picctrlthumbimage", "src")
  if (headerSrc) return absolutizeLectioUrl(headerSrc)

  return null
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

  return {
    studentId: schedule.studentId,
    ...names,
    className: schedule.className,
    birthdate: birthday
      ? `${birthday[3]}-${birthday[2].padStart(2, "0")}-${birthday[1].padStart(2, "0")}`
      : null,
    pictureUrl: parsePictureUrl(scheduleHtml, studentCardHtml),
    profileSource: studentCardName ? "student_card" : schedule.fullName ? "schedule_title" : "none",
  }
}
