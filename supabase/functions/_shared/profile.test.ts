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
  assertEquals(profile.pictureUrl, "https://www.lectio.dk/lectio/1/GetImage.aspx?id=2")
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

Deno.test("parses identity from Lectio MainTitle with nested ls-hidden-smallscreen span", () => {
  // Real Lectio markup: identity lives in a span, page name ("Skema") follows outside it.
  // A naive </[^>]+> match stops at </span> and previously made schedule_title never fire.
  const schedule =
    '<div id="s_m_HeaderContent_MainTitle" class="maintitle" role="heading" aria-level="1" data-lectioContextCard="S72721772841">' +
    '<span class="ls-hidden-smallscreen">Eleven Jonathan Arthur Hojer Bangert(k), 1x - </span>Skema</div>'
  const profile = parseLectioProfile(schedule, "")
  assertEquals(profile.studentId, "72721772841")
  assertEquals(profile.firstName, "Jonathan")
  assertEquals(profile.lastName, "Arthur Hojer Bangert")
  assertEquals(profile.className, "1x")
  assertEquals(profile.profileSource, "schedule_title")
})

Deno.test("falls back to schedule header thumbnail when student card has no photo", () => {
  const schedule =
    '<div id="s_m_HeaderContent_MainTitle" data-lectioContextCard="S99">' +
    '<span class="ls-hidden-smallscreen">Eleven Nora Test(k), 2b - </span>Skema</div>' +
    '<img id="s_m_HeaderContent_picctrlthumbimage" class="ls-hidden-smallscreen" ' +
    'src="/lectio/94/GetImage.aspx?pictureid=74096211802" alt="">'
  const profile = parseLectioProfile(schedule, "")
  assertEquals(profile.firstName, "Nora")
  assertEquals(
    profile.pictureUrl,
    "https://www.lectio.dk/lectio/94/GetImage.aspx?pictureid=74096211802&fullsize=1",
  )
  assertEquals(profile.profileSource, "schedule_title")
})

Deno.test("accepts StudPic when id comes before src", () => {
  const card = '<img id="s_m_Content_Content_StudPic" src="/lectio/1/GetImage.aspx?pictureid=42">' +
    '<span id="s_m_Content_Content_StudentName">Ada Lovelace</span>'
  const profile = parseLectioProfile('<div data-lectioContextCard="S1"></div>', card)
  assertEquals(
    profile.pictureUrl,
    "https://www.lectio.dk/lectio/1/GetImage.aspx?pictureid=42&fullsize=1",
  )
})

Deno.test("parses named class codes without a grade digit", () => {
  const schedule =
    '<div id="s_m_HeaderContent_MainTitle">Eleven Thor Sakuragi Frigaard(k), BShannon - Skema</div>' +
    '<div data-lectioContextCard="S81180842864"></div>'
  const parsed = parseScheduleIdentity(schedule)
  assertEquals(parsed.fullName, "Thor Sakuragi Frigaard")
  assertEquals(parsed.className, "BShannon")
})

Deno.test("parses identity from MainTitle on non-Skema pages", () => {
  const schedule =
    '<div id="s_m_HeaderContent_MainTitle" data-lectioContextCard="S99">' +
    '<span class="ls-hidden-smallscreen">Eleven Nora Test(k), 2b - </span>Beskeder</div>'
  const parsed = parseScheduleIdentity(schedule)
  assertEquals(parsed.fullName, "Nora Test")
  assertEquals(parsed.className, "2b")
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