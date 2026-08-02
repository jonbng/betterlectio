import { PostHog } from 'posthog-node';
import { getCachedProfile } from '@/lib/profile-cache';
import { getRecentUrls } from '@/lib/url-history';

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

const ALLOWED_EVENTS = new Set([
  'feedback_submitted',
  'onboarding_started',
  'onboarding_completed',
  'extension installed',
  'extension updated',
  'betterlectio bypass engaged',
  'mobile_app_invite_success_shown',
  'referral share link copied',
]);
const FEATURE_SAMPLE_RATE = 0.1;

function sampleFraction(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x100000000;
}

function shouldCaptureEvent(event: string, distinctId: string): boolean {
  if (ALLOWED_EVENTS.has(event)) return true;
  if (event !== 'feature used' && event !== 'extension loaded') return false;

  // A stable monthly cohort keeps comparisons internally consistent while
  // using roughly one tenth of the former feature-event volume.
  const month = new Date().toISOString().slice(0, 7);
  return sampleFraction(`${month}:${distinctId}`) < FEATURE_SAMPLE_RATE;
}

function flushClient(): void {
  try {
    const client = _client as any;
    if (!client) return;
    void client.flush?.();
  } catch {
    // Non-critical
  }
}

/**
 * Await PostHog flush — guarantees enqueued events reach the server before a
 * caller-initiated navigation (e.g. `window.location.reload()` that would
 * otherwise kill any in-flight fetch). Resolves even on error; never throws.
 */
export async function flushAnalytics(): Promise<void> {
  try {
    const client = _client as any;
    if (!client) return;
    if (typeof client.flush === 'function') {
      await client.flush();
    }
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

// ── Distinct ID: canonical Lectio student only (no anonymous) ─────────

const LECTIO_DISTINCT_PREFIX = 'lectio:';

/**
 * Raw Lectio elevid / `students.id` — bounded alphanumerics only.
 * Rejects empty, whitespace-only, or odd strings so we never emit events
 * under a garbage distinct id.
 */
function isValidRawStudentId(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const s = String(raw).trim();
  if (!s || s.length > 48) return false;
  return /^[0-9A-Za-z_-]+$/.test(s);
}

/**
 * True when `distinctId` is our canonical PostHog id for a Lectio student
 * (`lectio:` + non-empty elevid). All SDK calls funnel through this check.
 */
export function isLectioStudentDistinctId(distinctId: string | null | undefined): distinctId is string {
  if (!distinctId || typeof distinctId !== 'string') return false;
  if (!distinctId.startsWith(LECTIO_DISTINCT_PREFIX)) return false;
  return isValidRawStudentId(distinctId.slice(LECTIO_DISTINCT_PREFIX.length));
}

function requireLectioStudentDistinctId(distinctId: string | null | undefined): string | undefined {
  return isLectioStudentDistinctId(distinctId) ? distinctId : undefined;
}

// ── Public helpers ───────────────────────────────────────────────────

/**
 * Build the distinct ID from a known Lectio student ID.
 * Synchronous — use when the studentId is available.
 */
export function getDistinctId(studentId: string): string {
  return `${LECTIO_DISTINCT_PREFIX}${String(studentId).trim()}`;
}

/**
 * Resolved Lectio distinct ID in a content-script / page context when callers
 * don't have `studentId` handy. Uses the same sources as iframe-post error
 * reporting so `captureException(err, undefined, …)` still attributes to the
 * logged-in student when possible (never anonymous — returns undefined if unknown).
 */
export function getContentDistinctId(): string | undefined {
  try {
    if (typeof window === 'undefined') return undefined;
    const sid =
      (window as { __IL_CACHED_PROFILE__?: { studentId?: string | null } }).__IL_CACHED_PROFILE__
        ?.studentId
      ?? getCachedProfile()?.studentId;
    const raw = sid != null ? String(sid).trim() : '';
    if (!isValidRawStudentId(raw)) return undefined;
    return `${LECTIO_DISTINCT_PREFIX}${raw}`;
  } catch {
    return undefined;
  }
}

function resolveDistinctIdForCapture(explicit?: string): string | undefined {
  const trimmed = explicit?.trim();
  const candidate =
    trimmed && trimmed.length > 0 ? trimmed : getContentDistinctId();
  return requireLectioStudentDistinctId(candidate);
}

/**
 * Capture an analytics event.
 * Only call when you have an identified user (distinctId from getDistinctId).
 * Invalid or non-`lectio:` ids are dropped (never anonymous).
 */
export function capture(
  event: string,
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  try {
    if (isOptedOut()) return;
    const id = requireLectioStudentDistinctId(distinctId);
    if (!id) return;
    if (!shouldCaptureEvent(event, id)) return;
    getClient().capture({
      distinctId: id,
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
  _distinctId: string,
  _properties?: Record<string, unknown>,
): void {
  // Person profiles are not needed for the tiny explicit event set. Keeping
  // this compatibility helper as a no-op avoids repeated $identify events.
}

export function setPersonProperties(
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  identify(distinctId, properties);
}

/**
 * Identify only when the user or their properties have changed this session.
 * Stores a hash of distinctId + properties in sessionStorage so we skip
 * redundant identify calls on every Lectio page navigation.
 */
export function identifyIfNeeded(
  _distinctId: string,
  _properties?: Record<string, unknown>,
): void {
  // Intentionally disabled; see identify().
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
    (_client as any)?.reset?.();
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
    const id = requireLectioStudentDistinctId(distinctId);
    if (!id) return;
    if (!shouldCaptureEvent(event, id)) return;
    const key = `bl-posthog-once:${keySuffix}`;
    if (sessionStorage.getItem(key)) return;

    getClient().capture({
      distinctId: id,
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

const AMBIENT_ERROR_SAMPLE_RATE = 0.1;
const MAX_ERRORS_PER_CONTEXT = 5;
const AMBIENT_ERROR_SOURCES = new Set([
  'window.error',
  'unhandledrejection',
  'console.error',
  'background',
  'background-unhandledrejection',
  'csp-violation',
]);
let _errorCount = 0;
const _seenErrorSignatures = new Set<string>();

function shouldCaptureException(
  error: unknown,
  distinctId: string,
  properties?: Record<string, unknown>,
): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const source = String(properties?.source ?? 'unknown');
  const signature = `${source}:${message}`.slice(0, 500);
  if (_seenErrorSignatures.has(signature)) return false;

  const day = new Date().toISOString().slice(0, 10);
  const sampleKey = `${day}:${distinctId}:${signature}`;
  if (
    AMBIENT_ERROR_SOURCES.has(source)
    && sampleFraction(sampleKey) >= AMBIENT_ERROR_SAMPLE_RATE
  ) return false;

  _seenErrorSignatures.add(signature);
  return true;
}

/**
 * Auto props for `$exception` events: same dimensions as normal `capture()`
 * where possible, plus safe fallbacks in service workers (no `window`).
 */
function getExceptionAutoProperties(): Record<string, unknown> {
  try {
    const extension_version =
      typeof browser !== 'undefined' ? browser.runtime.getManifest().version : undefined;
    if (typeof window === 'undefined') {
      return {
        extension_version,
        runtime: 'service-worker',
        $os: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      };
    }
    return {
      ...getAutoProperties(),
      runtime: 'content-script',
    };
  } catch {
    return {};
  }
}

/**
 * Capture an exception/error.
 * Resolves `distinctId` from the cached Lectio profile in content scripts when
 * omitted so library-level catches still attribute correctly (no anonymous).
 * Explicit operational failures are retained; noisy global handlers are
 * deterministically sampled to 10%. Everything is deduplicated and capped at
 * five per extension context to protect the quota during error storms.
 */
export function captureException(
  error: unknown,
  distinctId?: string,
  additionalProperties?: Record<string, unknown>,
): void {
  try {
    if (isOptedOut()) return;
    const resolvedId = resolveDistinctIdForCapture(distinctId);
    if (!resolvedId) return;
    if (_errorCount >= MAX_ERRORS_PER_CONTEXT) return;
    if (!shouldCaptureException(error, resolvedId, additionalProperties)) return;
    _errorCount += 1;
    getClient().captureException(error, resolvedId, {
      ...getExceptionAutoProperties(),
      ...(additionalProperties?.current_page ? {} : getErrorContext()),
      ...additionalProperties,
      error_count: _errorCount,
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
    const profile =
      (window as { __IL_CACHED_PROFILE__?: { schoolId?: string | null; studentId?: string | null; className?: string | null } })
        .__IL_CACHED_PROFILE__ ?? getCachedProfile();
    return {
      current_page: page,
      $pathname: path,
      current_url: window.location.href,
      school_id: profile?.schoolId ?? undefined,
      student_id: profile?.studentId ?? undefined,
      class_name: profile?.className ?? undefined,
      recent_urls: getRecentUrls(5),
      referrer: document.referrer || undefined,
    };
  } catch {
    return {};
  }
}
