export interface LectioCookie {
  name: string
  value: string
}

export interface LectioCookieJarPayload {
  version: 1
  studentId: string
  schoolId: string
  capturedAt: string
  cookies: LectioCookie[]
}

export interface EncryptedLectioSession {
  keyVersion: number
  ciphertext: string
  iv: string
  wrappedDek: string
  wrapIv: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function toBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function aad(studentId: string, schoolId: string, purpose: "jar" | "dek"): Uint8Array {
  return encoder.encode(`betterlectio:lectio-session:v1:${purpose}:${schoolId}:${studentId}`)
}

export function masterKeyFromBase64(value: string): Uint8Array {
  let decoded: Uint8Array
  try {
    decoded = fromBase64(value.trim())
  } catch {
    throw new Error("Lectio session master key must be valid base64")
  }
  if (decoded.byteLength !== 32) {
    throw new Error("Lectio session master key must decode to exactly 32 bytes")
  }
  return decoded
}

async function importAesKey(bytes: Uint8Array): Promise<CryptoKey> {
  return await crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
}

export function cookieJarPayload(
  jar: Map<string, string>,
  studentId: string,
  schoolId: string,
  capturedAt = new Date().toISOString(),
): LectioCookieJarPayload {
  const cookies = Array.from(jar, ([name, value]) => ({ name, value }))
    .sort((left, right) => left.name.localeCompare(right.name))
  return { version: 1, studentId, schoolId, capturedAt, cookies }
}

export function payloadToJar(payload: LectioCookieJarPayload): Map<string, string> {
  if (payload.version !== 1 || !Array.isArray(payload.cookies)) {
    throw new Error("Unsupported Lectio cookie jar payload")
  }
  return new Map(payload.cookies.map(({ name, value }) => [name, value]))
}

export async function encryptLectioSession(
  payload: LectioCookieJarPayload,
  masterKeyBytes: Uint8Array,
  keyVersion: number,
): Promise<EncryptedLectioSession> {
  if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) throw new Error("Invalid key version")
  const masterKey = await importAesKey(masterKeyBytes)
  const dekBytes = crypto.getRandomValues(new Uint8Array(32))
  const dek = await importAesKey(dekBytes)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const wrapIv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = encoder.encode(JSON.stringify(payload))

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(payload.studentId, payload.schoolId, "jar") },
    dek,
    plaintext,
  )
  const wrappedDek = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: wrapIv, additionalData: aad(payload.studentId, payload.schoolId, "dek") },
    masterKey,
    dekBytes,
  )

  return {
    keyVersion,
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    iv: toBase64(iv),
    wrappedDek: toBase64(new Uint8Array(wrappedDek)),
    wrapIv: toBase64(wrapIv),
  }
}

export async function decryptLectioSession(
  encrypted: EncryptedLectioSession,
  masterKeyBytes: Uint8Array,
  studentId: string,
  schoolId: string,
): Promise<LectioCookieJarPayload> {
  const masterKey = await importAesKey(masterKeyBytes)
  const dekBytes = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(encrypted.wrapIv),
      additionalData: aad(studentId, schoolId, "dek"),
    },
    masterKey,
    fromBase64(encrypted.wrappedDek),
  )
  const dek = await importAesKey(new Uint8Array(dekBytes))
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(encrypted.iv),
      additionalData: aad(studentId, schoolId, "jar"),
    },
    dek,
    fromBase64(encrypted.ciphertext),
  )
  const payload = JSON.parse(decoder.decode(plaintext)) as LectioCookieJarPayload
  if (payload.studentId !== studentId || payload.schoolId !== schoolId) {
    throw new Error("Lectio session identity mismatch")
  }
  return payload
}

