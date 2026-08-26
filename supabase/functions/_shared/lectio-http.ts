const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 BetterLectio/1.0"

const PROTECTED_COOKIES = new Set(["autologinkeyV2", "ASP.NET_SessionId"])
const MAX_REDIRECTS = 5

export class SessionExpiredError extends Error {
  constructor() {
    super("Lectio session expired")
    this.name = "SessionExpiredError"
  }
}

export class UnsafeRedirectError extends Error {
  constructor() {
    super("Lectio redirected outside its trusted host")
    this.name = "UnsafeRedirectError"
  }
}

export interface FetchResult {
  response: Response
  body: ArrayBuffer
  finalUrl: URL
}

function parseSetCookies(headers: Headers): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const cookieStr of headers.getSetCookie()) {
    const head = cookieStr.split(";", 1)[0] ?? ""
    const eq = head.indexOf("=")
    if (eq < 0) continue
    const name = head.slice(0, eq).trim()
    const value = head.slice(eq + 1).trim()
    if (name) out.push([name, value])
  }
  return out
}

export function mergeCookies(jar: Map<string, string>, response: Response): void {
  for (const [name, value] of parseSetCookies(response.headers)) {
    if (value === "") {
      // Lectio uses empty primary cookies as replay detection. Deleting them
      // here destroys an otherwise valid session.
      if (PROTECTED_COOKIES.has(name)) continue
      jar.delete(name)
    } else {
      jar.set(name, value)
    }
  }
}

export function cookieHeaderFromJar(jar: Map<string, string>): string {
  return Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join("; ")
}

function isUniloginAuth(url: URL): boolean {
  const host = url.hostname.toLowerCase()
  return host === "unilogin.dk" || host.endsWith(".unilogin.dk")
}

export async function fetchWithJar(
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

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) {
        return { response, body: await response.arrayBuffer(), finalUrl: currentUrl }
      }
      const next = new URL(location, currentUrl)
      if (isUniloginAuth(next)) {
        await response.body?.cancel()
        throw new SessionExpiredError()
      }
      if (next.protocol !== "https:" || next.hostname.toLowerCase() !== "www.lectio.dk") {
        await response.body?.cancel()
        throw new UnsafeRedirectError()
      }
      await response.body?.cancel()
      currentUrl = next
      continue
    }

    return { response, body: await response.arrayBuffer(), finalUrl: currentUrl }
  }
  throw new Error(`Exceeded ${MAX_REDIRECTS} redirects fetching ${startUrl}`)
}

export function decodeUtf8(buffer: ArrayBuffer): string {
  return new TextDecoder("utf-8").decode(buffer)
}

export function isLectioLoginHtml(html: string): boolean {
  return /name="m\$Content\$username"/i.test(html) ||
    /id="m_Content_password"/i.test(html) ||
    /Loginv[æa]lger/i.test(html) ||
    /unilogin/i.test(html)
}
