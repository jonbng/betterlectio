import { assertEquals, assertRejects } from "jsr:@std/assert@1"
import {
  cookieJarPayload,
  decryptLectioSession,
  encryptLectioSession,
  masterKeyFromBase64,
  payloadToJar,
} from "./lectio-session-crypto.ts"

Deno.test("Lectio cookie jars round-trip through envelope encryption", async () => {
  const key = crypto.getRandomValues(new Uint8Array(32))
  const payload = cookieJarPayload(
    new Map([["z", "last"], ["ASP.NET_SessionId", "secret"]]),
    "123",
    "94",
    "2026-08-26T12:00:00.000Z",
  )
  const encrypted = await encryptLectioSession(payload, key, 1)
  const decrypted = await decryptLectioSession(encrypted, key, "123", "94")

  assertEquals(decrypted, payload)
  assertEquals(Array.from(payloadToJar(decrypted)), [
    ["ASP.NET_SessionId", "secret"],
    ["z", "last"],
  ])
})

Deno.test("identity is cryptographically bound as additional data", async () => {
  const key = crypto.getRandomValues(new Uint8Array(32))
  const encrypted = await encryptLectioSession(
    cookieJarPayload(new Map([["cookie", "secret"]]), "123", "94"),
    key,
    1,
  )
  await assertRejects(() => decryptLectioSession(encrypted, key, "124", "94"))
})

Deno.test("master keys must be 256-bit base64", () => {
  assertEquals(masterKeyFromBase64(btoa("12345678901234567890123456789012")).byteLength, 32)
  assertRejects(async () => masterKeyFromBase64(btoa("too short")))
})
