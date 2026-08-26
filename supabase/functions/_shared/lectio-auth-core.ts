import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.8"
import { AuthAttemptRecorder, clientMetadata, type AuthPlatform } from "./auth-attempt.ts"
import {
  decodeUtf8,
  fetchWithJar,
  isLectioLoginHtml,
  mergeCookies,
  SessionExpiredError,
} from "./lectio-http.ts"
import { parseLectioProfile, type ParsedLectioProfile } from "./profile.ts"
import { captureLectioSessionIfGranted } from "./lectio-session-capture.ts"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUMERIC_RE = /^\d+$/
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 BetterLectio/1.0"

export const lectioAuthCorsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

export function lectioAuthJsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...lectioAuthCorsHeaders, "Content-Type": "application/json" },
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

export type LectioAuthSuccess = {
  token_hash: string
  email: string
  student_id: string
  school_id: string
  was_first_install: boolean
  request_id: string
  profile_status: "complete" | "fallback" | "degraded"
  profile_source: ParsedLectioProfile["profileSource"]
  profile_fields: ReturnType<typeof profileFields>
}

/**
 * Universal QR → Supabase mint. Never accepts or returns Lectio cookies.
 * Its temporary server jar is encrypted after login only when the resolved
 * student has a pre-existing, service-role-managed consent grant.
 */
export async function handleLectioAuth(
  req: Request,
  admin: SupabaseClient,
): Promise<Response> {
  const requestId = crypto.randomUUID()
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: lectioAuthCorsHeaders })
  }
  if (req.method !== "POST") {
    return lectioAuthJsonResponse(
      { error: "Method not allowed", stage: "method", schoolId: null, request_id: requestId },
      405,
    )
  }

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
    console.warn("lectio-auth request failed", { requestId, stage, status, schoolId })
    await finish("failed", status, stage)
    return lectioAuthJsonResponse({ error, stage, schoolId, request_id: requestId }, status)
  }

  try {
    const raw = await req.json()
    const body = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}

    // Reject cookie-based payloads so outdated clients cannot accidentally hit this endpoint.
    if (body.autologinkey != null || body.sessionId != null || body.gymId != null) {
      return await fail(
        "Cookie credentials are not accepted; use qrId, userId, and schoolId",
        400,
        "validate-input",
      )
    }

    const qrId = String(body.qrId ?? "")
    const qrUserId = String(body.userId ?? "")
    const suppliedSchool = body.schoolId != null ? String(body.schoolId) : ""
    schoolId = suppliedSchool || null
    const metadata = clientMetadata(req, body, "unknown")
    platform = metadata.platform
    recorder = new AuthAttemptRecorder(
      admin,
      requestId,
      "lectio-auth",
      metadata,
      NUMERIC_RE.test(suppliedSchool) ? Number(suppliedSchool) : null,
    )
    await recorder.start()

    if (!qrId || !qrUserId || !suppliedSchool) {
      return await fail("Missing required fields: qrId, userId, schoolId", 400, "validate-input")
    }
    if (!UUID_RE.test(qrId)) return await fail("Invalid qrId format", 400, "validate-input")
    if (!NUMERIC_RE.test(qrUserId)) return await fail("userId must be numeric", 400, "validate-input")
    if (!NUMERIC_RE.test(suppliedSchool)) {
      return await fail("schoolId must be numeric", 400, "validate-input")
    }
    if (platform === "unknown") {
      return await fail("client.platform must be ios, android, or extension", 400, "validate-input")
    }

    const qrResponse = await fetch(
      `https://www.lectio.dk/lectio/${suppliedSchool}/LandingPageQrCode.aspx?userId=${qrUserId}&QrId=${qrId}`,
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
        `https://www.lectio.dk/lectio/${schoolId}/digitaltStudiekort.aspx`,
        jar,
      )
      studentCardStatus = result.response.status
      if (result.response.ok) {
        const candidate = decodeUtf8(result.body)
        if (!isLectioLoginHtml(candidate)) studentCardHtml = candidate
      }
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        studentCardStatus = 401
      } else {
        console.warn("Student card enrichment failed", { requestId, error })
      }
    }

    profile = parseLectioProfile(scheduleHtml, studentCardHtml)
    const email = `${schoolId}-${studentId}@betterlectio.dk`
    const { data, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email })
    if (linkError) return await fail("Failed to generate login link", 500, "generate-magic-link")

    authUserId = data.user?.id ?? null
    if (!authUserId) return await fail("Failed to resolve Supabase user", 500, "resolve-supabase-user")
    let tokenHash = data.properties?.hashed_token ?? null
    if (!tokenHash && data.properties?.action_link) {
      tokenHash = new URL(data.properties.action_link).searchParams.get("token")
    }
    if (!tokenHash) return await fail("Failed to extract token_hash from magic link", 500, "extract-token")

    let wasFirstInstall = false
    try {
      wasFirstInstall = await upsertStudentForPlatform(
        admin,
        studentId,
        schoolId,
        authUserId,
        profile,
        platform,
      )
    } catch (error) {
      console.error("Student upsert failed", { requestId, error })
      return await fail("Failed to save student profile", 500, "upsert-student")
    }

    await captureLectioSessionIfGranted(admin, studentId, schoolId, jar, requestId)

    const status = profile.firstName
      ? profile.profileSource === "student_card" ? "complete" : "fallback"
      : "degraded"
    await finish(status === "degraded" ? "degraded" : "success", 200)

    const success: LectioAuthSuccess = {
      token_hash: tokenHash,
      email,
      student_id: studentId,
      school_id: schoolId,
      was_first_install: wasFirstInstall,
      request_id: requestId,
      profile_status: status,
      profile_source: profile.profileSource,
      profile_fields: profileFields(profile),
    }
    return lectioAuthJsonResponse(success)
  } catch (error) {
    console.error("Edge function error", { requestId, error })
    return await fail("Internal server error", 500, "unhandled")
  }
}

/** Exported for unit tests of stamp branching. */
export function computeInstallStamps(
  platform: AuthPlatform,
  existing: {
    extension_installed_at?: string | null
    extension_uninstalled_at?: string | null
    extension_reinstalled_at?: string | null
    app_installed_at?: string | null
    android_installed_at?: string | null
    iphone_installed_at?: string | null
  } | null,
  now: string,
): { stamps: Record<string, string>; wasFirstInstall: boolean } {
  const stamps: Record<string, string> = {}
  let wasFirstInstall = false

  if (platform === "extension") {
    wasFirstInstall = !existing?.extension_installed_at
    if (wasFirstInstall) stamps.extension_installed_at = now
    else if (existing?.extension_uninstalled_at && !existing.extension_reinstalled_at) {
      stamps.extension_reinstalled_at = now
    }
  } else if (platform === "android" || platform === "ios") {
    if (!existing?.app_installed_at) stamps.app_installed_at = now
    if (platform === "android") {
      wasFirstInstall = !existing?.android_installed_at
      if (wasFirstInstall) stamps.android_installed_at = now
    } else {
      wasFirstInstall = !existing?.iphone_installed_at
      if (wasFirstInstall) stamps.iphone_installed_at = now
    }
  }

  return { stamps, wasFirstInstall }
}

async function upsertStudentForPlatform(
  admin: SupabaseClient,
  studentId: string,
  schoolId: string,
  authUserId: string,
  profile: ParsedLectioProfile,
  platform: AuthPlatform,
): Promise<boolean> {
  const { data: existing, error: readError } = await admin
    .from("students")
    .select(
      "extension_installed_at, extension_uninstalled_at, extension_reinstalled_at, app_installed_at, android_installed_at, iphone_installed_at",
    )
    .eq("id", studentId)
    .maybeSingle()
  if (readError) throw readError

  const now = new Date().toISOString()
  const { stamps, wasFirstInstall } = computeInstallStamps(platform, existing, now)
  const record: Record<string, unknown> = {
    id: studentId,
    school_id: Number(schoolId),
    supabase_id: authUserId,
    ...stamps,
  }
  if (profile.firstName) record.lectio_first_name = profile.firstName
  if (profile.lastName) record.lectio_last_name = profile.lastName
  if (profile.birthdate) record.birthdate = profile.birthdate
  if (profile.className) record.class_name = profile.className
  const { error } = await admin.from("students").upsert(record, { onConflict: "id" })
  if (error) throw error
  return wasFirstInstall
}
