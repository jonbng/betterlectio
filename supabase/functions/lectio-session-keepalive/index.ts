import { createClient } from "npm:@supabase/supabase-js@2.49.8"
import { fetchWithJar, isLectioLoginHtml, SessionExpiredError } from "../_shared/lectio-http.ts"
import {
  cookieJarPayload,
  decryptLectioSession,
  encryptLectioSession,
  payloadToJar,
} from "../_shared/lectio-session-crypto.ts"
import { currentKeyVersion, masterKeyForVersion } from "../_shared/lectio-session-capture.ts"

interface ClaimedSession {
  grant_id: string
  student_id: string
  school_id: number
  key_version: number
  ciphertext: string
  iv: string
  wrapped_dek: string
  wrap_iv: string
  claim_token: string
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

async function processClaim(admin: ReturnType<typeof createClient>, claim: ClaimedSession): Promise<boolean> {
  const studentId = claim.student_id
  const schoolId = String(claim.school_id)
  try {
    const payload = await decryptLectioSession(
      {
        keyVersion: claim.key_version,
        ciphertext: claim.ciphertext,
        iv: claim.iv,
        wrappedDek: claim.wrapped_dek,
        wrapIv: claim.wrap_iv,
      },
      masterKeyForVersion(claim.key_version),
      studentId,
      schoolId,
    )
    const jar = payloadToJar(payload)
    const result = await fetchWithJar(`https://www.lectio.dk/lectio/${schoolId}/ping.aspx`, jar)
    const html = new TextDecoder().decode(result.body)
    if (!result.response.ok) throw new Error(`lectio_http_${result.response.status}`)
    if (isLectioLoginHtml(html)) throw new SessionExpiredError()

    const currentVersion = currentKeyVersion()
    const encrypted = await encryptLectioSession(
      cookieJarPayload(jar, studentId, schoolId),
      masterKeyForVersion(currentVersion),
      currentVersion,
    )
    const { data, error } = await admin.rpc("complete_lectio_session_keepalive", {
      p_grant_id: claim.grant_id,
      p_claim_token: claim.claim_token,
      p_key_version: encrypted.keyVersion,
      p_ciphertext: encrypted.ciphertext,
      p_iv: encrypted.iv,
      p_wrapped_dek: encrypted.wrappedDek,
      p_wrap_iv: encrypted.wrapIv,
    })
    if (error) throw error
    return Boolean(data)
  } catch (error) {
    const terminal = error instanceof SessionExpiredError ||
      (error instanceof DOMException && error.name === "OperationError")
    const errorCode = terminal
      ? error instanceof SessionExpiredError ? "session_expired" : "decrypt_failed"
      : error instanceof Error && /^lectio_http_\d+$/.test(error.message) ? error.message : "keepalive_failed"
    const { error: recordError } = await admin.rpc("fail_lectio_session_keepalive", {
      p_grant_id: claim.grant_id,
      p_claim_token: claim.claim_token,
      p_error_code: errorCode,
      p_terminal: terminal,
    })
    if (recordError) console.error("Could not record Lectio keepalive failure", { grantId: claim.grant_id })
    console.warn("Lectio keepalive failed", { grantId: claim.grant_id, errorCode, terminal })
    return false
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)
  const expected = Deno.env.get("LECTIO_KEEPALIVE_CRON_SECRET")
  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) {
    return json({ error: "Unauthorized" }, 401)
  }
  if (Deno.env.get("LECTIO_SESSION_KEEPALIVE_ENABLED") === "false") {
    return json({ ok: true, disabled: true, claimed: 0 })
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  )
  const { data, error } = await admin.rpc("claim_due_lectio_sessions", {
    p_batch_size: 20,
    p_lease_seconds: 120,
  })
  if (error) {
    console.error("Could not claim Lectio sessions", { message: error.message })
    return json({ error: "Claim failed" }, 500)
  }

  const claims = (data ?? []) as ClaimedSession[]
  const results = await Promise.all(claims.map((claim) => processClaim(admin, claim)))
  return json({ ok: true, claimed: claims.length, succeeded: results.filter(Boolean).length })
})
