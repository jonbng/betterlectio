import { PostHog } from 'posthog-node';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST as string;

// ── Analytics opt-out ────────────────────────────────────────────────
// Direct localStorage read to avoid circular dependency with settings-storage.

function isOptedOut(): boolean {
  try {
    const stored = localStorage.getItem('bl-feature-settings') ?? localStorage.getItem('il-feature-settings');
    if (!stored) return false;
    return JSON.parse(stored)?.behavior?.analyticsOptOut === true;
  } catch {
    return false;
  }
}

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
 * Capture an analytics event.
 * Only call when you have an identified user (distinctId from getDistinctId).
 */
export function capture(
  event: string,
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  try {
    if (isOptedOut()) return;
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
 * Prefer `identifyIfNeeded` in hot paths (e.g. every page load) to avoid
 * redundant identify calls on every navigation.
 */
export function identify(
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  try {
    if (isOptedOut()) return;
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
    if (isOptedOut()) return;
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
 * Only call when you have an identified user.
 */
export function captureOncePerSession(
  event: string,
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  try {
    if (isOptedOut()) return;
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
 * Only captures if a distinctId is provided (no anonymous fallback).
 */
export function captureException(
  error: unknown,
  distinctId?: string,
  additionalProperties?: Record<string, unknown>,
): void {
  try {
    if (isOptedOut() || !distinctId) return;
    getClient().captureException(error, distinctId, additionalProperties);
  } catch {
    // Non-critical
  }
}
