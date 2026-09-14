import type { Cookie as PuppeteerCookie } from "puppeteer";
import type { CookieStore, SessionStatus, StoredCookie } from "../types.js";
import { getCookies, setCookies } from "./storage.js";

// Session timeout in milliseconds (55 minutes to be safe, actual is ~60)
const SESSION_TIMEOUT_MS = 55 * 60 * 1000;

export function puppeteerCookieToStored(cookie: PuppeteerCookie): StoredCookie {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain || ".lectio.dk",
    path: cookie.path || "/",
    expires: cookie.expires ?? -1,
    httpOnly: cookie.httpOnly ?? false,
    secure: cookie.secure ?? false,
    sameSite: cookie.sameSite as StoredCookie["sameSite"],
  };
}

export function saveCookies(
  cookies: PuppeteerCookie[],
  schoolId: string,
  schoolName: string
): void {
  const store: CookieStore = {
    schoolId,
    schoolName,
    cookies: cookies.map(puppeteerCookieToStored),
    savedAt: Date.now(),
  };
  setCookies(store);
}

export function getSessionStatus(): SessionStatus {
  const store = getCookies();

  if (!store || !store.cookies.length) {
    return { authenticated: false };
  }

  // Browser logins include the client-side isloggedin3 marker, while sessions
  // captured by the server contain Lectio's persistent authentication cookie.
  const authCookie = store.cookies.find((c) => c.name === "isloggedin3");
  const autoLoginCookie = store.cookies.find(
    (c) => c.name === "autologinkeyV2" && c.value.length > 0
  );
  if (authCookie?.value !== "Y" && !autoLoginCookie) {
    return { authenticated: false };
  }

  // Check LastAuthenticatedPageLoad2 timestamp
  const lastAuthCookie = store.cookies.find(
    (c) => c.name === "LastAuthenticatedPageLoad2"
  );
  let sessionValid = true;
  let expiresIn = SESSION_TIMEOUT_MS;
  let lastActivity = new Date(store.savedAt).toISOString();

  const lastAuthTime = lastAuthCookie
    ? parseInt(lastAuthCookie.value, 10)
    : store.savedAt;
  if (!isNaN(lastAuthTime)) {
    const elapsed = Date.now() - lastAuthTime;
    expiresIn = Math.max(0, SESSION_TIMEOUT_MS - elapsed);
    sessionValid = elapsed < SESSION_TIMEOUT_MS;
    lastActivity = new Date(lastAuthTime).toISOString();
  }

  return {
    authenticated: true,
    school: {
      id: store.schoolId,
      name: store.schoolName,
    },
    session: {
      valid: sessionValid,
      expiresIn: Math.floor(expiresIn / 1000), // Convert to seconds
      lastActivity,
    },
  };
}

export function isSessionValid(): boolean {
  const status = getSessionStatus();
  return status.authenticated && (status.session?.valid ?? false);
}

export function getCookieHeader(): string | null {
  const store = getCookies();
  if (!store?.cookies.length) {
    return null;
  }

  return store.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

export function getStoredSchoolId(): string | null {
  const store = getCookies();
  return store?.schoolId ?? null;
}

/**
 * Parse Set-Cookie header and update stored cookies
 * This keeps the session alive by updating timestamps and any rotated cookies
 */
export function updateCookiesFromResponse(setCookieHeaders: string[]): void {
  const store = getCookies();
  if (!store) return;

  let updated = false;

  for (const header of setCookieHeaders) {
    const parsed = parseSetCookieHeader(header);
    if (!parsed) continue;

    // Find existing cookie with same name
    const existingIndex = store.cookies.findIndex((c) => c.name === parsed.name);

    if (existingIndex >= 0) {
      // Update existing cookie
      store.cookies[existingIndex] = parsed;
      updated = true;
    } else {
      // Add new cookie
      store.cookies.push(parsed);
      updated = true;
    }
  }

  if (updated) {
    store.savedAt = Date.now();
    setCookies(store);
  }
}

/**
 * Parse a Set-Cookie header into a StoredCookie
 */
function parseSetCookieHeader(header: string): StoredCookie | null {
  const parts = header.split(";").map((p) => p.trim());
  if (parts.length === 0) return null;

  // First part is name=value
  const [nameValue, ...attributes] = parts;
  const eqIndex = nameValue.indexOf("=");
  if (eqIndex === -1) return null;

  const name = nameValue.slice(0, eqIndex);
  const value = nameValue.slice(eqIndex + 1);

  const cookie: StoredCookie = {
    name,
    value,
    domain: ".lectio.dk",
    path: "/",
    expires: -1,
    httpOnly: false,
    secure: false,
  };

  // Parse attributes
  for (const attr of attributes) {
    const lowerAttr = attr.toLowerCase();

    if (lowerAttr.startsWith("domain=")) {
      cookie.domain = attr.slice(7);
    } else if (lowerAttr.startsWith("path=")) {
      cookie.path = attr.slice(5);
    } else if (lowerAttr.startsWith("expires=")) {
      const dateStr = attr.slice(8);
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        cookie.expires = date.getTime() / 1000; // Convert to seconds
      }
    } else if (lowerAttr.startsWith("max-age=")) {
      const maxAge = parseInt(attr.slice(8), 10);
      if (!isNaN(maxAge)) {
        cookie.expires = Date.now() / 1000 + maxAge;
      }
    } else if (lowerAttr === "httponly") {
      cookie.httpOnly = true;
    } else if (lowerAttr === "secure") {
      cookie.secure = true;
    } else if (lowerAttr.startsWith("samesite=")) {
      const sameSite = attr.slice(9);
      if (sameSite === "Strict" || sameSite === "Lax" || sameSite === "None") {
        cookie.sameSite = sameSite;
      }
    }
  }

  return cookie;
}
