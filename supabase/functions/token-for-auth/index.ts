import { createClient } from "npm:@supabase/supabase-js@2.49.8"

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 BetterLectio/1.0"

const NUMERIC_RE = /^\d+$/
const COOKIE_TOKEN_RE = /^[A-Za-z0-9._\-+/=]{8,512}$/

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function errorResponse(error: string, status: number, stage: string, schoolId?: string | null): Response {
  return jsonResponse({ error, stage, schoolId: schoolId ?? null }, status)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  let clientSchoolId: string | null = null

  try {
    const body = await req.json()
    const autologinkey = String(body.autologinkey ?? "")
    const sessionId = String(body.sessionId ?? "")
    const gymId = String(body.gymId ?? "")
    clientSchoolId = gymId || null

    if (!autologinkey || !sessionId || !gymId) {
      return errorResponse("Missing required credentials (autologinkey, sessionId, gymId)", 400, "validate-input", clientSchoolId)
    }
    if (!NUMERIC_RE.test(gymId)) {
      return errorResponse("gymId must be numeric", 400, "validate-input", clientSchoolId)
    }
    if (!COOKIE_TOKEN_RE.test(autologinkey) || !COOKIE_TOKEN_RE.test(sessionId)) {
      return errorResponse("Invalid credential format", 400, "validate-input", clientSchoolId)
    }

    const cookieHeader = `ASP.NET_SessionId=${sessionId}; autologinkeyV2=${autologinkey}`
    const lectioHeaders = { Cookie: cookieHeader, "User-Agent": USER_AGENT }

    // Fetch SkemaNy + digitaltStudiekort in parallel
    const skemaUrl = `https://www.lectio.dk/lectio/${gymId}/SkemaNy.aspx`
    const studiekortUrl = `https://www.lectio.dk/lectio/${gymId}/digitaltStudiekort.aspx`

    const [skemaResponse, studiekortResponse] = await Promise.all([
      fetch(skemaUrl, { headers: lectioHeaders, redirect: "follow" }),
      fetch(studiekortUrl, { headers: lectioHeaders, redirect: "follow" }),
    ])

    if (!skemaResponse.ok) {
      return errorResponse(`Lectio SkemaNy request failed (${skemaResponse.status})`, 502, "fetch-skema", gymId)
    }

    let [skemaHtml, studiekortHtml] = await Promise.all([
      skemaResponse.text(),
      studiekortResponse.ok ? studiekortResponse.text() : Promise.resolve(""),
    ])

    // Resolve elevid from authenticated context card, with retries for fresh-session propagation
    let elevidMatch = skemaHtml.match(/data-lectioContextCard="S(\d+)"/i)
    for (let attempt = 0; !elevidMatch && attempt < 2; attempt++) {
      await sleep(400 * (attempt + 1))
      const retryResp = await fetch(skemaUrl, { headers: lectioHeaders, redirect: "follow" })
      skemaHtml = await retryResp.text()
      elevidMatch = skemaHtml.match(/data-lectioContextCard="S(\d+)"/i)
    }
    if (!elevidMatch) {
      if (skemaHtml.includes("unilogin") || skemaHtml.includes("Loginvælger")) {
        return errorResponse("Lectio session expired or invalid", 401, "session-expired", gymId)
      }
      return errorResponse("Could not determine elevid from authenticated session", 500, "resolve-elevid", gymId)
    }

    const studentId = elevidMatch[1]
    const email = `${gymId}-${studentId}@betterlectio.dk`

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
      return errorResponse("Failed to generate login link", 500, "generate-magic-link", gymId)
    }

    const supabaseAuthId = data.user?.id ?? null
    let tokenHash = data.properties?.hashed_token ?? null
    if (!tokenHash && data.properties?.action_link) {
      const linkUrl = new URL(data.properties.action_link)
      tokenHash = linkUrl.searchParams.get("token")
    }
    if (!tokenHash) {
      return errorResponse("Failed to extract token_hash from magic link", 500, "extract-token", gymId)
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
      cookieHeader,
    )

    return jsonResponse({ token_hash: tokenHash, email, studentId })
  } catch (err) {
    console.error("Edge function error:", err)
    return errorResponse("Internal server error", 500, "unhandled", clientSchoolId)
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
  cookieHeader: string,
): Promise<void> {
  let storedPfpPath: string | null = null
  let skipPfpUpload = false
  let newHash: string | null = null

  if (pictureUrl) {
    try {
      const picResp = await fetch(pictureUrl, {
        headers: { Cookie: cookieHeader, "User-Agent": USER_AGENT },
      })
      if (picResp.ok) {
        const picBuffer = await picResp.arrayBuffer()
        const contentType = picResp.headers.get("content-type") || "image/jpeg"

        const hashBuffer = await crypto.subtle.digest("SHA-256", picBuffer)
        newHash = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")

        try {
          const { data: existingStudent } = await supabaseAdmin
            .from("students")
            .select("pfp_hash")
            .eq("id", studentId)
            .single()
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
      }
    } catch (e) {
      console.warn("Failed to fetch/upload profile picture:", e)
    }
  }

  try {
    // Preserve the first-install timestamp if the row already has one.
    // Note: extension_installed_at is owned by verify-lectio-auth (extension QR flow);
    // this function is the mobile app path and only stamps app_installed_at.
    const { data: existing } = await supabaseAdmin
      .from("students")
      .select("app_installed_at")
      .eq("id", studentId)
      .maybeSingle()

    const studentRecord: Record<string, unknown> = {
      id: studentId,
      school_id: parseInt(gymId, 10),
    }
    if (!existing?.app_installed_at) {
      studentRecord.app_installed_at = new Date().toISOString()
    }
    if (supabaseAuthId) studentRecord.supabase_id = supabaseAuthId
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

    await supabaseAdmin
      .from("students")
      .upsert(studentRecord, { onConflict: "id" })
  } catch (e) {
    console.warn("Failed to upsert student record:", e)
  }
}
