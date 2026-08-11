import { createClient } from "npm:@supabase/supabase-js@2.49.8"
import { AuthAttemptRecorder, clientMetadata } from "../_shared/auth-attempt.ts"
import {
  decodeUtf8,
  fetchWithJar,
  isLectioLoginHtml,
  mergeCookies,
  SessionExpiredError,
} from "../_shared/lectio-http.ts"
import { parseLectioProfile, type ParsedLectioProfile } from "../_shared/profile.ts"

// LEGACY — extension QR path with camelCase response.
// New clients use `lectio-auth`. Keep deployed until soak, then delete.

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUMERIC_RE = /^\d+$/
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 BetterLectio/1.0"
const PRIMARY_COOKIES = new Set(["autologinkeyV2", "ASP.NET_SessionId"])

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function profileFields(profile: ParsedLectioProfile) {
  return {
    name: Boolean(profile.firstName),
    class_name: Boolean(profile.className),
    birthdate: Boolean(profile.birthdate),
    picture: Boolean(profile.pictureUrl),
  }
}

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID()
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed", stage: "method", schoolId: null, request_id: requestId }, 405)
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  )
  let recorder: AuthAttemptRecorder | null = null
  let schoolId: string | null = null
  let studentId: string | null = null
  let authUserId: string | null = null
  let scheduleOk = false
  let studentCardStatus: number | null = null
  let profile: ParsedLectioProfile | null = null

  const finish = async (outcome: "success" | "degraded" | "failed", status: number, stage?: string) => {
    await recorder?.finish({
      outcome,
      failureStage: stage ?? null,
      httpStatus: status,
      schoolId: schoolId ? Number(schoolId) : null,
      studentId,
      authUserId,
      profileSource: profile?.profileSource ?? null,
      scheduleOk,
      studentCardStatus,
      hasName: Boolean(profile?.firstName),
      hasClass: Boolean(profile?.className),
      hasBirthdate: Boolean(profile?.birthdate),
      hasPicture: Boolean(profile?.pictureUrl),
    })
  }
  const fail = async (error: string, status: number, stage: string) => {
    console.warn("verify-lectio-auth request failed", { requestId, stage, status, schoolId })
    await finish("failed", status, stage)
    return jsonResponse({ error, stage, schoolId, request_id: requestId }, status)
  }

  try {
    const raw = await req.json()
    const body = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
    const qrId = String(body.qrId ?? "")
    const qrUserId = String(body.userId ?? "")
    const suppliedSchool = body.schoolId ? String(body.schoolId) : null
    schoolId = suppliedSchool
    recorder = new AuthAttemptRecorder(
      admin,
      requestId,
      "verify-lectio-auth",
      clientMetadata(req, body, "extension"),
      suppliedSchool && NUMERIC_RE.test(suppliedSchool) ? Number(suppliedSchool) : null,
    )
    await recorder.start()

    if (!qrId || !qrUserId) return await fail("Missing required fields: qrId, userId", 400, "validate-input")
    if (!UUID_RE.test(qrId)) return await fail("Invalid qrId format", 400, "validate-input")
    if (!NUMERIC_RE.test(qrUserId)) return await fail("userId must be numeric", 400, "validate-input")
    if (suppliedSchool && !NUMERIC_RE.test(suppliedSchool)) {
      return await fail("schoolId must be numeric", 400, "validate-input")
    }

    const qrSchool = suppliedSchool || "94"
    const qrResponse = await fetch(
      `https://www.lectio.dk/lectio/${qrSchool}/LandingPageQrCode.aspx?userId=${qrUserId}&QrId=${qrId}`,
      { redirect: "manual", headers: { "User-Agent": USER_AGENT } },
    )
    const jar = new Map<string, string>()
    mergeCookies(jar, qrResponse)
    if (qrResponse.status !== 303) return await fail("QR code invalid or expired", 401, "qr-login")

    const location = qrResponse.headers.get("location") || ""
    const schoolMatch = location.match(/\/lectio\/(\d+)\//)
    if (!schoolMatch) return await fail("Could not determine school from QR redirect", 500, "qr-redirect-school")
    schoolId = schoolMatch[1]
    if (!jar.size) return await fail("No session cookies received from QR login", 500, "qr-session-cookies")
    await qrResponse.body?.cancel()

    const scheduleUrl = `https://www.lectio.dk/lectio/${schoolId}/SkemaNy.aspx`
    let scheduleHtml = ""
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) await sleep(400 * attempt)
        const result = await fetchWithJar(scheduleUrl, jar)
        if (!result.response.ok) {
          return await fail(`Lectio SkemaNy request failed (${result.response.status})`, 502, "fetch-skema")
        }
        scheduleHtml = decodeUtf8(result.body)
        if (isLectioLoginHtml(scheduleHtml)) return await fail("Lectio session expired or invalid", 401, "session-expired")
        if (parseLectioProfile(scheduleHtml, "").studentId) break
      }
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        return await fail("Lectio session expired or invalid", 401, "session-expired")
      }
      throw error
    }

    scheduleOk = true
    const scheduleIdentity = parseLectioProfile(scheduleHtml, "")
    studentId = scheduleIdentity.studentId
    if (!studentId) return await fail("Could not determine elevid from authenticated session", 500, "resolve-elevid")

    let cardHtml = ""
    try {
      const result = await fetchWithJar(
        `https://www.lectio.dk/lectio/${schoolId}/digitaltStudiekort.aspx`,
        jar,
      )
      studentCardStatus = result.response.status
      if (result.response.ok) {
        const candidate = decodeUtf8(result.body)
        if (!isLectioLoginHtml(candidate)) cardHtml = candidate
      }
    } catch (error) {
      studentCardStatus = error instanceof SessionExpiredError ? 401 : null
      console.warn("Student card enrichment failed", { requestId, error })
    }
    profile = parseLectioProfile(scheduleHtml, cardHtml)

    const email = `${schoolId}-${studentId}@betterlectio.dk`
    const { data, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email })
    if (linkError) return await fail("Failed to generate login link", 500, "generate-magic-link")
    authUserId = data.user?.id ?? null
    if (!authUserId) return await fail("Failed to resolve Supabase user", 500, "resolve-supabase-user")
    const tokenHash = data.properties?.hashed_token ?? (data.properties?.action_link
      ? new URL(data.properties.action_link).searchParams.get("token")
      : null)
    if (!tokenHash) return await fail("Failed to extract token_hash from magic link", 500, "extract-token")

    let pictureBlob: { buffer: ArrayBuffer; contentType: string } | null = null
    if (profile.pictureUrl) {
      try {
        const result = await fetchWithJar(profile.pictureUrl, jar)
        if (result.response.ok) {
          pictureBlob = {
            buffer: result.body,
            contentType: result.response.headers.get("content-type") || "image/jpeg",
          }
        }
      } catch (error) {
        console.warn("Profile picture enrichment failed", { requestId, error })
      }
    }

    let wasFirstInstall = false
    try {
      wasFirstInstall = await upsertExtensionStudent(admin, studentId, schoolId, authUserId, profile, pictureBlob)
    } catch (error) {
      console.error("Student upsert failed", { requestId, error })
      return await fail("Failed to save student profile", 500, "upsert-student")
    }

    const status = profile.firstName
      ? profile.profileSource === "student_card" ? "complete" : "fallback"
      : "degraded"
    await finish(status === "degraded" ? "degraded" : "success", 200)

    const additional: Record<string, string> = {}
    for (const [name, value] of jar.entries()) if (!PRIMARY_COOKIES.has(name)) additional[name] = value
    return jsonResponse({
      tokenHash,
      schoolId,
      elevid: studentId,
      wasFirstInstall,
      request_id: requestId,
      profile_status: status,
      profile_source: profile.profileSource,
      profile_fields: profileFields(profile),
      cookies: {
        autologinkey: jar.get("autologinkeyV2") ?? "",
        sessionId: jar.get("ASP.NET_SessionId") ?? "",
        additional,
      },
    })
  } catch (error) {
    console.error("Edge function error", { requestId, error })
    return await fail("Internal server error", 500, "unhandled")
  }
})

async function upsertExtensionStudent(
  admin: ReturnType<typeof createClient>,
  studentId: string,
  schoolId: string,
  authUserId: string,
  profile: ParsedLectioProfile,
  pictureBlob: { buffer: ArrayBuffer; contentType: string } | null,
): Promise<boolean> {
  const { data: existing, error: readError } = await admin
    .from("students")
    .select("extension_installed_at, extension_uninstalled_at, extension_reinstalled_at, pfp_hash")
    .eq("id", studentId)
    .maybeSingle()
  if (readError) throw readError

  let storedPath: string | null = null
  let pictureHash: string | null = null
  let hashMatched = false
  if (pictureBlob) {
    pictureHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", pictureBlob.buffer)))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
    hashMatched = existing?.pfp_hash === pictureHash
    if (!hashMatched) {
      const extension = pictureBlob.contentType.includes("png")
        ? "png"
        : pictureBlob.contentType.includes("webp") ? "webp" : "jpg"
      storedPath = `${schoolId}/${studentId}.${extension}`
      const { error } = await admin.storage.from("profile-pictures").upload(
        storedPath,
        new Uint8Array(pictureBlob.buffer),
        { contentType: pictureBlob.contentType, upsert: true },
      )
      if (error) storedPath = null
    }
  }

  const wasFirstInstall = !existing?.extension_installed_at
  const record: Record<string, unknown> = {
    id: studentId,
    school_id: Number(schoolId),
    supabase_id: authUserId,
  }
  if (wasFirstInstall) record.extension_installed_at = new Date().toISOString()
  else if (existing?.extension_uninstalled_at && !existing.extension_reinstalled_at) {
    record.extension_reinstalled_at = new Date().toISOString()
  }
  if (profile.firstName) record.lectio_first_name = profile.firstName
  if (profile.lastName) record.lectio_last_name = profile.lastName
  if (profile.birthdate) record.birthdate = profile.birthdate
  if (profile.className) record.class_name = profile.className
  if (storedPath) {
    record.lectio_pfp_url = admin.storage.from("profile-pictures").getPublicUrl(storedPath).data.publicUrl
    if (pictureHash) record.pfp_hash = pictureHash
  } else if (profile.pictureUrl && pictureBlob && !hashMatched) {
    record.lectio_pfp_url = profile.pictureUrl
  }

  const { error } = await admin.from("students").upsert(record, { onConflict: "id" })
  if (error) throw error
  return wasFirstInstall
}
