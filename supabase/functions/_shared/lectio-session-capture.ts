import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.8"
import {
  cookieJarPayload,
  encryptLectioSession,
  masterKeyFromBase64,
} from "./lectio-session-crypto.ts"

export function currentKeyVersion(): number {
  const version = Number(Deno.env.get("LECTIO_SESSION_MASTER_KEY_VERSION") ?? "1")
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("Invalid Lectio session key version")
  return version
}

export function masterKeyForVersion(version: number): Uint8Array {
  const value = Deno.env.get(`LECTIO_SESSION_MASTER_KEY_V${version}`)
  if (!value) throw new Error(`Missing Lectio session master key version ${version}`)
  return masterKeyFromBase64(value)
}

/**
 * Best-effort capture. The SQL function performs the active-grant check and
 * encrypted upsert atomically, so a caller can never opt an arbitrary user in.
 */
export async function captureLectioSessionIfGranted(
  admin: SupabaseClient,
  studentId: string,
  schoolId: string,
  jar: Map<string, string>,
  requestId: string,
): Promise<void> {
  if (Deno.env.get("LECTIO_SESSION_CAPTURE_ENABLED") === "false") return

  try {
    // Avoid touching key material for the normal (non-donor) login path. The
    // RPC repeats this check under a row lock to close revocation races.
    const { data: grant, error: grantError } = await admin
      .from("lectio_session_grants")
      .select("id")
      .eq("student_id", studentId)
      .eq("school_id", Number(schoolId))
      .eq("enabled", true)
      .is("revoked_at", null)
      .maybeSingle()
    if (grantError) throw grantError
    if (!grant) return

    const keyVersion = currentKeyVersion()
    const encrypted = await encryptLectioSession(
      cookieJarPayload(jar, studentId, schoolId),
      masterKeyForVersion(keyVersion),
      keyVersion,
    )
    const { data, error } = await admin.rpc("store_lectio_session_credential", {
      p_student_id: studentId,
      p_school_id: Number(schoolId),
      p_key_version: encrypted.keyVersion,
      p_ciphertext: encrypted.ciphertext,
      p_iv: encrypted.iv,
      p_wrapped_dek: encrypted.wrappedDek,
      p_wrap_iv: encrypted.wrapIv,
    })
    if (error) throw error
    console.info("Lectio session capture checked", { requestId, stored: Boolean(data) })
  } catch (error) {
    // Authentication must still succeed if capture, encryption, or storage fails.
    console.warn("Lectio session capture failed", {
      requestId,
      error: error instanceof Error ? error.message : "unknown error",
    })
  }
}
