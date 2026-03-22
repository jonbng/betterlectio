import { PostHog } from 'posthog-node';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST as string;

const ANON_ID_KEY = 'bl-posthog-anon-id';

// ── Singleton client ─────────────────────────────────────────────────

let _client: PostHog | null = null;

function getClient(): PostHog {
  if (_client) return _client;
  _client = new PostHog(POSTHOG_KEY, {
    host: POSTHOG_HOST,
    // Flush immediately since the extension context can be short-lived
    flushAt: 1,
    flushInterval: 0,
  });
  return _client;
}

// ── Anonymous ID (extension-scoped via browser.storage.local) ───────

let _cachedAnonId: string | null = null;

/**
 * Get or create a persistent anonymous ID stored in browser.storage.local.
 * Works in both content scripts and MV3 service workers.
 * Falls back to in-memory UUID if storage is unavailable.
 */
async function getOrCreateAnonId(): Promise<string> {
  if (_cachedAnonId) return _cachedAnonId;
  try {
    const result = await browser.storage.local.get(ANON_ID_KEY);
    if (result[ANON_ID_KEY]) {
      _cachedAnonId = result[ANON_ID_KEY] as string;
      return _cachedAnonId;
    }
    const id = crypto.randomUUID();
    await browser.storage.local.set({ [ANON_ID_KEY]: id });
    _cachedAnonId = id;
    return id;
  } catch {
    // Fallback: in-memory only (won't persist across navigations)
    if (!_cachedAnonId) _cachedAnonId = crypto.randomUUID();
    return _cachedAnonId;
  }
}

// ── Auto properties (replaces what posthog-js would capture) ────────

function getAutoProperties(): Record<string, unknown> {
  try {
    return {
      $browser: getBrowserName(),
      $os: navigator.platform,
      $screen_height: screen.height,
      $screen_width: screen.width,
      $current_url: window.location.href,
      $pathname: window.location.pathname,
      extension_version: typeof browser !== 'undefined'
        ? browser.runtime.getManifest().version
        : undefined,
    };
  } catch {
    return {};
  }
}

function getBrowserName(): string {
  try {
    const ua = navigator.userAgent;
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Edg/')) return 'Edge';
    if (ua.includes('Chrome')) return 'Chrome';
    return 'Other';
  } catch {
    return 'Unknown';
  }
}

// ── Public helpers ───────────────────────────────────────────────────

/**
 * Build the distinct ID from a known Lectio student ID.
 * Synchronous — use when the studentId is available.
 */
export function getDistinctId(studentId: string): string {
  return `lectio:${studentId}`;
}

/**
 * Get or create a persistent anonymous distinct ID.
 * Async because it reads from browser.storage.local.
 * Use on pages where the user isn't identified yet (e.g. login).
 */
export async function getAnonDistinctId(): Promise<string> {
  return getOrCreateAnonId();
}

/**
 * Capture an analytics event.
 */
export function capture(
  event: string,
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  try {
    getClient().capture({
      distinctId,
      event,
      properties: { ...getAutoProperties(), ...properties },
    });
  } catch {
    // Never let analytics errors surface to the user
  }
}

/**
 * Link the anonymous (pre-login) ID to the real distinct ID so PostHog
 * merges pre-login events into the identified person.
 * Safe to call multiple times — it only fires the alias once per browser.
 */
export async function aliasAnonToIdentified(distinctId: string): Promise<void> {
  try {
    const ALIAS_KEY = 'bl-posthog-aliased';
    const prev = localStorage.getItem(ALIAS_KEY);
    if (prev === distinctId) return; // already linked in this browser

    const anonId = await getOrCreateAnonId();
    if (anonId === distinctId) return; // shouldn't happen, but guard

    getClient().alias({ distinctId, alias: anonId });
    localStorage.setItem(ALIAS_KEY, distinctId);
  } catch {
    // Non-critical
  }
}

/**
 * Identify a user with optional properties.
 * Prefer `identifyIfNeeded` in hot paths (e.g. every page load) to avoid
 * redundant identify calls on every navigation.
 */
export function identify(
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  try {
    getClient().identify({ distinctId, properties });
  } catch {
    // Non-critical
  }
}

const SESSION_IDENTIFY_KEY = 'bl-posthog-identified';

/**
 * Identify only when the user or their properties have changed this session.
 * Stores a hash of distinctId + properties in sessionStorage so we skip
 * redundant identify calls on every Lectio page navigation.
 */
export function identifyIfNeeded(
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  try {
    const fingerprint = JSON.stringify({ distinctId, ...properties });
    const prev = sessionStorage.getItem(SESSION_IDENTIFY_KEY);
    if (prev === fingerprint) return;

    getClient().identify({ distinctId, properties });
    sessionStorage.setItem(SESSION_IDENTIFY_KEY, fingerprint);
  } catch {
    // Non-critical
  }
}

/**
 * Reset PostHog state on logout.
 * Clears the session identify cache so the next login triggers a fresh identify.
 */
export function reset(): void {
  try {
    // Clear identify + once-per-session capture keys
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith('bl-posthog-')) sessionStorage.removeItem(key);
    }
    getClient().reset();
  } catch {
    // Non-critical
  }
}

/**
 * Capture an event at most once per browser session.
 * Useful for events like "extension loaded" that shouldn't fire on every page navigation.
 */
export function captureOncePerSession(
  event: string,
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  try {
    const key = `bl-posthog-once:${event}`;
    if (sessionStorage.getItem(key)) return;

    getClient().capture({
      distinctId,
      event,
      properties: { ...getAutoProperties(), ...properties },
    });
    sessionStorage.setItem(key, '1');
  } catch {
    // Non-critical
  }
}

/**
 * Capture an exception/error.
 */
export async function captureException(
  error: unknown,
  distinctId?: string,
  additionalProperties?: Record<string, unknown>,
): Promise<void> {
  try {
    const id = distinctId ?? await getOrCreateAnonId();
    getClient().captureException(error, id, additionalProperties);
  } catch {
    // Non-critical
  }
}
