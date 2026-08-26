import { assertEquals, assertRejects } from "jsr:@std/assert@1"
import {
  cookieHeaderFromJar,
  fetchWithJar,
  isLectioLoginHtml,
  mergeCookies,
  SessionExpiredError,
  UnsafeRedirectError,
} from "./lectio-http.ts"

Deno.test("protected primary cookies survive empty Set-Cookie values", () => {
  const jar = new Map([["autologinkeyV2", "still-valid"], ["other", "remove-me"]])
  const headers = new Headers()
  headers.append("set-cookie", "autologinkeyV2=; Path=/")
  headers.append("set-cookie", "other=; Path=/")
  mergeCookies(jar, new Response(null, { headers }))
  assertEquals(jar.get("autologinkeyV2"), "still-valid")
  assertEquals(jar.has("other"), false)
})

Deno.test("redirects apply rotated cookies to the next sequential request", async () => {
  const originalFetch = globalThis.fetch
  const seen: string[] = []
  let call = 0
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
    seen.push(new Headers(init?.headers).get("cookie") ?? "")
    call++
    if (call === 1) {
      return Promise.resolve(new Response(null, {
        status: 302,
        headers: { location: "/next", "set-cookie": "ASP.NET_SessionId=rotated; Path=/" },
      }))
    }
    return Promise.resolve(new Response("ok", { status: 200 }))
  }) as typeof fetch
  try {
    const jar = new Map([["ASP.NET_SessionId", "original"]])
    await fetchWithJar("https://www.lectio.dk/start", jar)
    assertEquals(seen, ["ASP.NET_SessionId=original", "ASP.NET_SessionId=rotated"])
    assertEquals(cookieHeaderFromJar(jar), "ASP.NET_SessionId=rotated")
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test("redirects to UniLogin are classified as expired sessions", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (() => Promise.resolve(new Response(null, {
    status: 303,
    headers: { location: "https://login.unilogin.dk/auth" },
  }))) as typeof fetch
  try {
    await assertRejects(
      () => fetchWithJar("https://www.lectio.dk/start", new Map()),
      SessionExpiredError,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test("cookies are never forwarded to an untrusted redirect host", async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = (() => {
    calls++
    return Promise.resolve(new Response(null, {
      status: 302,
      headers: { location: "https://example.com/collect" },
    }))
  }) as typeof fetch
  try {
    await assertRejects(
      () => fetchWithJar("https://www.lectio.dk/start", new Map([["secret", "value"]])),
      UnsafeRedirectError,
    )
    assertEquals(calls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test("recognizes Lectio login HTML", () => {
  assertEquals(isLectioLoginHtml('<input name="m$Content$username">'), true)
  assertEquals(isLectioLoginHtml("<title>Eleven Ada, 3x - Skema</title>"), false)
})
