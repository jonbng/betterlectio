import { createClient } from "npm:@supabase/supabase-js@2.49.8"
import { AuthAttemptRecorder, clientMetadata, type AuthPlatform } from "../_shared/auth-attempt.ts"
import { decodeUtf8, fetchWithJar, isLectioLoginHtml, SessionExpiredError } from "../_shared/lectio-http.ts"
import { parseLectioProfile, type ParsedLectioProfile } from "../_shared/profile.ts"

// LEGACY — cookie handoff for outdated iOS/Android builds.
// New clients use `lectio-auth` (QR only). Keep deployed until soak, then delete.

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}
const NUMERIC_RE = /^\d+$/
const COOKIE_TOKEN_RE = /^[A-Za-z0-9._\-+/=]{8,512}$/
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
  let platform: AuthPlatform = "unknown"

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
    console.warn("token-for-auth request failed", { requestId, stage, status, schoolId })
    await finish("failed", status, stage)
    return jsonResponse({ error, stage, schoolId, request_id: requestId }, status)
  }

  try {
    const raw = await req.json()
    const body = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
    const autologinkey = String(body.autologinkey ?? "")
    const sessionId = String(body.sessionId ?? "")
    const gymId = String(body.gymId ?? "")
    schoolId = gymId || null
    const metadata = clientMetadata(req, body, "unknown")
    platform = metadata.platform
    recorder = new AuthAttemptRecorder(
      admin,
      requestId,
      "token-for-auth",
      metadata,
      NUMERIC_RE.test(gymId) ? Number(gymId) : null,
    )
    await recorder.start()

    if (!autologinkey || !sessionId || !gymId) {
      return await fail("Missing required credentials (autologinkey, sessionId, gymId)", 400, "validate-input")
    }
    if (!NUMERIC_RE.test(gymId)) return await fail("gymId must be numeric", 400, "validate-input")
    if (!COOKIE_TOKEN_RE.test(autologinkey) || !COOKIE_TOKEN_RE.test(sessionId)) {
      return await fail("Invalid credential format", 400, "validate-input")
    }

    const jar = new Map<string, string>([
      ["ASP.NET_SessionId", sessionId],
      ["autologinkeyV2", autologinkey],
    ])
    const scheduleUrl = `https://www.lectio.dk/lectio/${gymId}/SkemaNy.aspx`
    let scheduleHtml = ""

    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) await sleep(400 * attempt)
        const result = await fetchWithJar(scheduleUrl, jar)
        if (!result.response.ok) {
          return await fail(`Lectio SkemaNy request failed (${result.response.status})`, 502, "fetch-skema")
        }
        scheduleHtml = decodeUtf8(result.body)
        if (isLectioLoginHtml(scheduleHtml)) {
          return await fail("Lectio session expired or invalid", 401, "session-expired")
        }
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

    let studentCardHtml = ""
    try {
      const result = await fetchWithJar(
        `https://www.lectio.dk/lectio/${gymId}/digitaltStudiekort.aspx`,
        jar,
      )
      studentCardStatus = result.response.status
      if (result.response.ok) {
        const candidate = decodeUtf8(result.body)
        if (!isLectioLoginHtml(candidate)) studentCardHtml = candidate
      }
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        // The schedule has already authenticated the user. Profile enrichment is optional.
        studentCardStatus = 401
      } else {
        console.warn("Student card enrichment failed", { requestId, error })
      }
    }

    profile = parseLectioProfile(scheduleHtml, studentCardHtml)
    const email = `${gymId}-${studentId}@betterlectio.dk`
    const { data, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email })
    if (linkError) return await fail("Failed to generate login link", 500, "generate-magic-link")

    authUserId = data.user?.id ?? null
    if (!authUserId) return await fail("Failed to resolve Supabase user", 500, "resolve-supabase-user")
    let tokenHash = data.properties?.hashed_token ?? null
    if (!tokenHash && data.properties?.action_link) {
      tokenHash = new URL(data.properties.action_link).searchParams.get("token")
    }
    if (!tokenHash) return await fail("Failed to extract token_hash from magic link", 500, "extract-token")

    try {
      await upsertStudent(admin, studentId, gymId, authUserId, profile, platform)
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
      token_hash: tokenHash,
      email,
      studentId,
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

async function upsertStudent(
  admin: ReturnType<typeof createClient>,
  studentId: string,
  schoolId: string,
  authUserId: string,
  profile: ParsedLectioProfile,
  platform: AuthPlatform,
): Promise<void> {
  const { data: existing, error: existingError } = await admin
    .from("students")
    .select("app_installed_at, android_installed_at, iphone_installed_at")
    .eq("id", studentId)
    .maybeSingle()
  if (existingError) throw existingError

  const now = new Date().toISOString()
  const record: Record<string, unknown> = {
    id: studentId,
    school_id: Number(schoolId),
    supabase_id: authUserId,
  }
  // Keep app_installed_at as the union stamp for existing clients/promotion.
  if (!existing?.app_installed_at) record.app_installed_at = now
  if (platform === "android" && !existing?.android_installed_at) record.android_installed_at = now
  if (platform === "ios" && !existing?.iphone_installed_at) record.iphone_installed_at = now
  if (profile.firstName) record.lectio_first_name = profile.firstName
  if (profile.lastName) record.lectio_last_name = profile.lastName
  if (profile.birthdate) record.birthdate = profile.birthdate
  if (profile.className) record.class_name = profile.className
  const { error } = await admin.from("students").upsert(record, { onConflict: "id" })
  if (error) throw error
}
