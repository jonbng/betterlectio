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
 * Identify a user with optional properties.
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
