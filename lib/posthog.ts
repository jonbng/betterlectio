import { PostHog } from 'posthog-node';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST as string;
const IS_DEV = import.meta.env.DEV;

// ── Analytics opt-out ────────────────────────────────────────────────
// Works in both content scripts (localStorage) and background/service workers
// (browser.storage.local). Content scripts sync the flag on settings change.

const OPT_OUT_STORAGE_KEY = 'bl-analytics-opt-out';

function isOptedOut(): boolean {
  if (IS_DEV) return true;
  // Fast path: check cached value (set by syncOptOutToExtensionStorage or loadOptOutFlag)
  if (_optOutCached !== undefined) return _optOutCached;
  // Fallback: try localStorage (content script context)
  try {
    const stored = localStorage.getItem('bl-feature-settings') ?? localStorage.getItem('il-feature-settings');
    if (!stored) return false;
    return JSON.parse(stored)?.behavior?.analyticsOptOut === true;
  } catch {
    // localStorage not available (background/service worker) — default to false,
    // the async loadOptOutFlag() will update _optOutCached on next tick
    return false;
  }
}

let _optOutCached: boolean | undefined;

/**
 * Sync the analytics opt-out flag to browser.storage.local so the background
 * script can read it. Call this whenever the setting changes.
 */
export function syncOptOutToExtensionStorage(optedOut: boolean): void {
  _optOutCached = optedOut;
  try {
    browser.storage.local.set({ [OPT_OUT_STORAGE_KEY]: optedOut });
  } catch {
    // Non-critical
  }
}

/**
 * Load the opt-out flag from browser.storage.local (for background/service worker).
 * Call once at startup in contexts without localStorage.
 */
export async function loadOptOutFlag(): Promise<void> {
  try {
    const result = await browser.storage.local.get(OPT_OUT_STORAGE_KEY);
    _optOutCached = result[OPT_OUT_STORAGE_KEY] === true;
  } catch {
    _optOutCached = false;
  }
}

// ── Singleton client ─────────────────────────────────────────────────

let _client: PostHog | null = null;
let _flushHandlersRegistered = false;

function flushClient(): void {
  try {
    const client = getClient() as any;
    void client.flush?.();
  } catch {
    // Non-critical
  }
}

function registerFlushHandlers(): void {
  if (_flushHandlersRegistered) return;

  try {
    if (typeof window === 'undefined') return;

    window.addEventListener('pagehide', flushClient, { capture: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushClient();
      }
    });
    _flushHandlersRegistered = true;
  } catch {
    // Non-critical
  }
}

function getClient(): PostHog {
  if (_client) return _client;
  _client = new PostHog(POSTHOG_KEY, {
    host: POSTHOG_HOST,
    // Keep request volume down while still flushing quickly in short-lived
    // extension contexts. We also flush on page hide / tab backgrounding.
    flushAt: 3,
    flushInterval: 5000,
  });
  registerFlushHandlers();
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

export function setPersonProperties(
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  identify(distinctId, properties);
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
    (getClient() as any).reset?.();
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
  captureOncePerSessionByKey(event, event, distinctId, properties);
}

export function captureOncePerSessionByKey(
  keySuffix: string,
  event: string,
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  try {
    if (isOptedOut()) return;
    const key = `bl-posthog-once:${keySuffix}`;
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

export function captureFeatureUsedOncePerSession(
  feature: string,
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  captureOncePerSessionByKey(
    `feature:${feature}`,
    'feature used',
    distinctId,
    { feature, ...properties },
  );
}

// ── Rate limiting for error capture ─────────────────────────────────

const MAX_ERRORS_PER_PAGE = 15;
let _errorCount = 0;

/**
 * Capture an exception/error.
 * Only captures if a distinctId is provided (no anonymous fallback).
 * Rate-limited to MAX_ERRORS_PER_PAGE per page load to protect free tier quota.
 */
export function captureException(
  error: unknown,
  distinctId?: string,
  additionalProperties?: Record<string, unknown>,
): void {
  try {
    if (isOptedOut() || !distinctId) return;
    if (++_errorCount > MAX_ERRORS_PER_PAGE) return;
    getClient().captureException(error, distinctId, {
      ...additionalProperties,
      error_count: _errorCount,
      ...(additionalProperties?.current_page ? {} : getErrorContext()),
    });
  } catch {
    // Non-critical
  }
}

/**
 * Get current page context for error enrichment.
 */
function getErrorContext(): Record<string, unknown> {
  try {
    if (typeof window === 'undefined') return {};
    const path = window.location.pathname;
    const page = path.split('/').pop()?.split('?')[0] ?? 'unknown';
    const profile = (window as any).__IL_CACHED_PROFILE__;
    return {
      current_page: page,
      current_url: window.location.href,
      school_id: profile?.schoolId,
    };
  } catch {
    return {};
  }
}
