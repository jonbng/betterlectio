import { createClient } from "npm:@supabase/supabase-js@2.49.8"

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 BetterLectio/1.0"

const NUMERIC_RE = /^\d+$/
const COOKIE_TOKEN_RE = /^[A-Za-z0-9._\-+/=]{8,512}$/

const PROTECTED_COOKIES = new Set(["autologinkeyV2", "ASP.NET_SessionId"])
const MAX_REDIRECTS = 5

class SessionExpiredError extends Error {
  constructor() {
    super("Lectio session expired")
    this.name = "SessionExpiredError"
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function errorResponse(
  error: string,
  status: number,
  stage: string,
  schoolId: string | null | undefined,
  requestId: string,
): Response {
  console.warn("token-for-auth request failed", { requestId, stage, status, schoolId: schoolId ?? null })
  return jsonResponse({ error, stage, schoolId: schoolId ?? null, request_id: requestId }, status)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseSetCookies(headers: Headers): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const cookieStr of headers.getSetCookie()) {
    const semi = cookieStr.indexOf(";")
    const head = semi < 0 ? cookieStr : cookieStr.slice(0, semi)
    const eq = head.indexOf("=")
    if (eq < 0) continue
    const name = head.slice(0, eq).trim()
    const value = head.slice(eq + 1).trim()
    if (!name) continue
    out.push([name, value])
  }
  return out
}

// Lectio occasionally sends `Set-Cookie: autologinkeyV2=` (empty value) as part of
// replay-detection. Treating that as "clear" would wipe a still-valid token from our
// jar; mirror BetterLectio/CookieManager.swift:159-181 and ignore empty values for
// the two primary cookies. Other cookies follow normal RFC behavior: empty = delete.
function mergeCookies(jar: Map<string, string>, response: Response): void {
  for (const [name, value] of parseSetCookies(response.headers)) {
    if (value === "") {
      if (PROTECTED_COOKIES.has(name)) continue
      jar.delete(name)
    } else {
      jar.set(name, value)
    }
  }
}

function cookieHeaderFromJar(jar: Map<string, string>): string {
  return Array.from(jar.entries())
    .map(([n, v]) => `${n}=${v}`)
    .join("; ")
}

function isUniloginAuth(url: URL): boolean {
  const host = url.hostname.toLowerCase()
  return host === "unilogin.dk" || host.endsWith(".unilogin.dk")
}

interface FetchResult {
  response: Response
  body: ArrayBuffer
  finalUrl: URL
}

// Manual redirect loop (max 5 hops) so Set-Cookie from intermediate redirects can be
// captured into the jar and replayed on the next hop. Each hop:
//   1. Builds Cookie header from the current jar
//   2. Sends with redirect: "manual"
//   3. Merges any Set-Cookie into the jar
//   4. On 30x: resolves Location, recurses; on terminal: returns
// Throws SessionExpiredError if any hop targets the unilogin auth realm.
async function fetchWithJar(
  startUrl: string,
  jar: Map<string, string>,
): Promise<FetchResult> {
  let currentUrl = new URL(startUrl)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(currentUrl.toString(), {
      headers: {
        Cookie: cookieHeaderFromJar(jar),
        "User-Agent": USER_AGENT,
        Referer: "https://www.lectio.dk",
      },
      redirect: "manual",
    })
    mergeCookies(jar, response)

    const status = response.status
    if (status >= 300 && status < 400) {
      const location = response.headers.get("location")
      if (!location) {
        // Redirect without Location — treat as terminal.
        const body = await response.arrayBuffer()
        return { response, body, finalUrl: currentUrl }
      }
      const next = new URL(location, currentUrl)
      if (isUniloginAuth(next)) {
        await response.body?.cancel()
        throw new SessionExpiredError()
      }
      await response.body?.cancel()
      currentUrl = next
      continue
    }

    const body = await response.arrayBuffer()
    return { response, body, finalUrl: currentUrl }
  }
  throw new Error(`Exceeded ${MAX_REDIRECTS} redirects fetching ${startUrl}`)
}

function decodeUtf8(buffer: ArrayBuffer): string {
  return new TextDecoder("utf-8").decode(buffer)
}

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID()
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, "method", null, requestId)
  }

  let clientSchoolId: string | null = null

  try {
    const body = await req.json()
    const autologinkey = String(body.autologinkey ?? "")
    const sessionId = String(body.sessionId ?? "")
    const gymId = String(body.gymId ?? "")
    clientSchoolId = gymId || null

    if (!autologinkey || !sessionId || !gymId) {
      return errorResponse("Missing required credentials (autologinkey, sessionId, gymId)", 400, "validate-input", clientSchoolId, requestId)
    }
    if (!NUMERIC_RE.test(gymId)) {
      return errorResponse("gymId must be numeric", 400, "validate-input", clientSchoolId, requestId)
    }
    if (!COOKIE_TOKEN_RE.test(autologinkey) || !COOKIE_TOKEN_RE.test(sessionId)) {
      return errorResponse("Invalid credential format", 400, "validate-input", clientSchoolId, requestId)
    }

    // Cookie jar shared across every Lectio fetch in this invocation. Each fetch reads
    // the latest values via cookieHeaderFromJar and writes Set-Cookie back via
    // mergeCookies. Sequential — never run two Lectio fetches in parallel against the
    // same jar; doing so trips Lectio's autologin reuse-detector and kills the session.
    const jar = new Map<string, string>()
    jar.set("ASP.NET_SessionId", sessionId)
    jar.set("autologinkeyV2", autologinkey)

    const skemaUrl = `https://www.lectio.dk/lectio/${gymId}/SkemaNy.aspx`
    const studiekortUrl = `https://www.lectio.dk/lectio/${gymId}/digitaltStudiekort.aspx`

    let skemaHtml: string
    try {
      const skemaResult = await fetchWithJar(skemaUrl, jar)
      if (!skemaResult.response.ok) {
        return errorResponse(`Lectio SkemaNy request failed (${skemaResult.response.status})`, 502, "fetch-skema", gymId, requestId)
      }
      skemaHtml = decodeUtf8(skemaResult.body)
    } catch (e) {
      if (e instanceof SessionExpiredError) {
        return errorResponse("Lectio session expired or invalid", 401, "session-expired", gymId, requestId)
      }
      throw e
    }

    // Resolve elevid from authenticated context card. Retries reuse the rotated jar so
    // each attempt presents the latest ASP.NET_SessionId — replaying the original would
    // look like reuse to Lectio.
    let elevidMatch = skemaHtml.match(/data-lectioContextCard="S(\d+)"/i)
    for (let attempt = 0; !elevidMatch && attempt < 2; attempt++) {
      await sleep(400 * (attempt + 1))
      try {
        const retry = await fetchWithJar(skemaUrl, jar)
        skemaHtml = decodeUtf8(retry.body)
      } catch (e) {
        if (e instanceof SessionExpiredError) {
          return errorResponse("Lectio session expired or invalid", 401, "session-expired", gymId, requestId)
        }
        throw e
      }
      elevidMatch = skemaHtml.match(/data-lectioContextCard="S(\d+)"/i)
    }
    if (!elevidMatch) {
      if (skemaHtml.includes("unilogin") || skemaHtml.includes("Loginvælger")) {
        return errorResponse("Lectio session expired or invalid", 401, "session-expired", gymId, requestId)
      }
      return errorResponse("Could not determine elevid from authenticated session", 500, "resolve-elevid", gymId, requestId)
    }

    const studentId = elevidMatch[1]
    const email = `${gymId}-${studentId}@betterlectio.dk`

    let studiekortHtml = ""
    try {
      const studiekortResult = await fetchWithJar(studiekortUrl, jar)
      if (studiekortResult.response.ok) {
        studiekortHtml = decodeUtf8(studiekortResult.body)
      }
    } catch (e) {
      if (e instanceof SessionExpiredError) {
        return errorResponse("Lectio session expired or invalid", 401, "session-expired", gymId, requestId)
      }
      throw e
    }

    // Parse class from SkemaNy title; name/birthdate/picture from studiekort
    let className: string | null = null
    const classTitleMatch = skemaHtml.match(/<title>[^<]*Eleven\s+.+?,\s*(\S+)\s*-/)
    if (classTitleMatch) className = classTitleMatch[1]

    let firstName: string | null = null
    let lastName: string | null = null
    const nameMatch = studiekortHtml.match(/id="s_m_Content_Content_StudentName"[^>]*>([^<]+)</)
    if (nameMatch) {
      const fullName = nameMatch[1].replace(/\([^)]*\)\s*$/, "").trim()
      const parts = fullName.split(/\s+/)
      firstName = parts[0] || null
      lastName = parts.length > 1 ? parts.slice(1).join(" ") : null
    }

    let birthdate: string | null = null
    const bdayMatch = studiekortHtml.match(/id="s_m_Content_Content_StudentBirthday"[^>]*>[^:]*:\s*(\d{1,2})\/(\d{1,2})-(\d{4})/)
    if (bdayMatch) {
      birthdate = `${bdayMatch[3]}-${bdayMatch[2].padStart(2, "0")}-${bdayMatch[1].padStart(2, "0")}`
    }

    let pictureUrl: string | null = null
    const picMatch = studiekortHtml.match(/src="([^"]+)"[^>]*id="s_m_Content_Content_StudPic"/)
    if (picMatch) {
      pictureUrl = new URL(picMatch[1], "https://www.lectio.dk").toString()
    }

    // Fetch the picture using the shared jar (still sequential after the studiekort fetch)
    // so the bytes are downloaded with the latest rotated cookies, not the input snapshot.
    let pictureBlob: { buffer: ArrayBuffer; contentType: string } | null = null
    if (pictureUrl) {
      try {
        const picResult = await fetchWithJar(pictureUrl, jar)
        if (picResult.response.ok) {
          pictureBlob = {
            buffer: picResult.body,
            contentType: picResult.response.headers.get("content-type") || "image/jpeg",
          }
        }
      } catch (e) {
        if (e instanceof SessionExpiredError) {
          return errorResponse("Lectio session expired or invalid", 401, "session-expired", gymId, requestId)
        }
        console.warn("Failed to fetch profile picture:", e)
      }
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    })

    if (error) {
      console.error("Failed to generate magic link:", error)
      return errorResponse("Failed to generate login link", 500, "generate-magic-link", gymId, requestId)
    }

    const supabaseAuthId = data.user?.id ?? null
    if (!supabaseAuthId) {
      return errorResponse("Failed to resolve Supabase user", 500, "resolve-supabase-user", gymId, requestId)
    }
    let tokenHash = data.properties?.hashed_token ?? null
    if (!tokenHash && data.properties?.action_link) {
      const linkUrl = new URL(data.properties.action_link)
      tokenHash = linkUrl.searchParams.get("token")
    }
    if (!tokenHash) {
      return errorResponse("Failed to extract token_hash from magic link", 500, "extract-token", gymId, requestId)
    }

    await upsertStudent(
      supabaseAdmin,
      studentId,
      gymId,
      supabaseAuthId,
      firstName,
      lastName,
      birthdate,
      className,
      pictureUrl,
      pictureBlob,
    )

    const additional: Record<string, string> = {}
    for (const [name, value] of jar.entries()) {
      if (!PROTECTED_COOKIES.has(name)) additional[name] = value
    }

    return jsonResponse({
      token_hash: tokenHash,
      email,
      studentId,
      request_id: requestId,
      cookies: {
        autologinkey: jar.get("autologinkeyV2") ?? "",
        sessionId: jar.get("ASP.NET_SessionId") ?? "",
        additional,
      },
    })
  } catch (err) {
    console.error("Edge function error", { requestId, error: err })
    return errorResponse("Internal server error", 500, "unhandled", clientSchoolId, requestId)
  }
})

async function upsertStudent(
  supabaseAdmin: ReturnType<typeof createClient>,
  studentId: string,
  gymId: string,
  supabaseAuthId: string | null,
  firstName: string | null,
  lastName: string | null,
  birthdate: string | null,
  className: string | null,
  pictureUrl: string | null,
  pictureBlob: { buffer: ArrayBuffer; contentType: string } | null,
): Promise<void> {
  let storedPfpPath: string | null = null
  let skipPfpUpload = false
  let newHash: string | null = null

  if (pictureBlob) {
    try {
      const { buffer: picBuffer, contentType } = pictureBlob

      const hashBuffer = await crypto.subtle.digest("SHA-256", picBuffer)
      newHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")

      try {
        const { data: existingStudent, error: existingStudentError } = await supabaseAdmin
          .from("students")
          .select("pfp_hash")
          .eq("id", studentId)
          .maybeSingle()
        if (existingStudentError) {
          console.warn("Failed to read existing profile-picture hash:", existingStudentError)
        }
        if (existingStudent?.pfp_hash === newHash) {
          skipPfpUpload = true
        }
      } catch {
        // Student doesn't exist yet — proceed with upload
      }

      if (!skipPfpUpload) {
        const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg"
        const storagePath = `${gymId}/${studentId}.${ext}`

        const { error: uploadError } = await supabaseAdmin.storage
          .from("profile-pictures")
          .upload(storagePath, new Uint8Array(picBuffer), { contentType, upsert: true })

        if (uploadError) {
          console.warn("Failed to upload profile picture:", uploadError)
        } else {
          storedPfpPath = storagePath
        }
      }
    } catch (e) {
      console.warn("Failed to process profile picture:", e)
    }
  }

  // Preserve the first-install timestamp if the row already has one.
  // Note: extension_installed_at is owned by verify-lectio-auth (extension QR flow);
  // this function is the mobile app path and only stamps app_installed_at.
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("students")
    .select("app_installed_at")
    .eq("id", studentId)
    .maybeSingle()
  if (existingError) {
    throw new Error(`Failed to read existing student: ${existingError.message}`)
  }

  const studentRecord: Record<string, unknown> = {
    id: studentId,
    school_id: parseInt(gymId, 10),
    supabase_id: supabaseAuthId,
  }
  if (!existing?.app_installed_at) {
    studentRecord.app_installed_at = new Date().toISOString()
  }
  if (firstName) studentRecord.lectio_first_name = firstName
  if (lastName) studentRecord.lectio_last_name = lastName
  if (birthdate) studentRecord.birthdate = birthdate
  if (className) studentRecord.class_name = className

  if (storedPfpPath) {
    const { data: urlData } = supabaseAdmin.storage
      .from("profile-pictures")
      .getPublicUrl(storedPfpPath)
    studentRecord.lectio_pfp_url = urlData.publicUrl
    if (newHash) studentRecord.pfp_hash = newHash
  } else if (pictureUrl && !skipPfpUpload) {
    // Only fall back to raw Lectio URL when we actually attempted (and failed) an upload.
    // On hash match the existing storage URL must be left alone.
    studentRecord.lectio_pfp_url = pictureUrl
  }

  const { error: upsertError } = await supabaseAdmin
    .from("students")
    .upsert(studentRecord, { onConflict: "id" })
  if (upsertError) {
    throw new Error(`Failed to upsert student record: ${upsertError.message}`)
  }
}
