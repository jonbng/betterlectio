import { assertEquals } from "jsr:@std/assert@1"
import { parseLectioProfile, parseScheduleIdentity } from "./profile.ts"

Deno.test("parses the full profile from a student card", () => {
  const schedule = '<title>Lectio - Eleven Ada Lovelace(k), 3x - Skema</title><div data-lectioContextCard="S123"></div>'
  const card = '<span id="s_m_Content_Content_StudentName">Ada Lovelace (k)</span>' +
    '<span id="s_m_Content_Content_StudentBirthday">Fødselsdag: 10/12-2007</span>' +
    '<img src="/lectio/1/GetImage.aspx?id=2" id="s_m_Content_Content_StudPic">'
  const profile = parseLectioProfile(schedule, card)
  assertEquals(profile.firstName, "Ada")
  assertEquals(profile.lastName, "Lovelace")
  assertEquals(profile.className, "3x")
  assertEquals(profile.birthdate, "2007-12-10")
  assertEquals(profile.profileSource, "student_card")
})

Deno.test("falls back to the schedule title when the student card is unavailable", () => {
  const schedule = '<div id="s_m_HeaderContent_MainTitle">Eleven Elliott Friedrich(k), 1x - Skema</div>' +
    '<div data-lectioContextCard="S456"></div>'
  const profile = parseLectioProfile(schedule, "")
  assertEquals(profile.studentId, "456")
  assertEquals(profile.firstName, "Elliott")
  assertEquals(profile.lastName, "Friedrich")
  assertEquals(profile.className, "1x")
  assertEquals(profile.profileSource, "schedule_title")
})

Deno.test("decodes HTML entities in schedule names", () => {
  const parsed = parseScheduleIdentity('<title>Eleven S&oslash;ren &amp; Test(k), 2a - Skema</title>')
  assertEquals(parsed.fullName, "Søren & Test")
})

Deno.test("missing optional student-card fields still yields a usable profile", () => {
  const schedule = '<title>Eleven Nora Test, 2b - Skema</title><i data-lectioContextCard="S789"></i>'
  const profile = parseLectioProfile(schedule, '<span id="s_m_Content_Content_StudentName">Nora Test</span>')
  assertEquals(profile.studentId, "789")
  assertEquals(profile.firstName, "Nora")
  assertEquals(profile.birthdate, null)
  assertEquals(profile.pictureUrl, null)
})

Deno.test("returns none when neither profile source contains a name", () => {
  const profile = parseLectioProfile('<div data-lectioContextCard="S42"></div>', "")
  assertEquals(profile.studentId, "42")
  assertEquals(profile.firstName, null)
  assertEquals(profile.profileSource, "none")
})
