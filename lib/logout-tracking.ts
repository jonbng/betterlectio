import {
  ANALYTICS_EVENTS,
  capture,
  flushAnalytics,
  getContentDistinctId,
} from '@/lib/posthog';

const AUTH_ACTIVITY_KEY = 'bl-last-authenticated-activity';
const LOGOUT_INTENT_KEY = 'bl-last-logout-intent';
const LOGOUT_CAPTURE_DEDUPE_MS = 5_000;
const LOGOUT_FLUSH_TIMEOUT_MS = 1_000;

export interface AuthenticatedActivity {
  schoolId: string | null;
  studentId: string | null;
  path: string;
  timestamp: number;
}

export interface LogoutIntent {
  schoolId: string | null;
  timestamp: number;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors.
  }
}

export function recordAuthenticatedActivity(activity: AuthenticatedActivity): void {
  writeJson(AUTH_ACTIVITY_KEY, activity);
}

export function getLastAuthenticatedActivity(): AuthenticatedActivity | null {
  return readJson<AuthenticatedActivity>(AUTH_ACTIVITY_KEY);
}

export function markLogoutIntent(schoolId: string | null): void {
  const now = Date.now();
  const previousIntent = readJson<LogoutIntent>(LOGOUT_INTENT_KEY);
  writeJson(LOGOUT_INTENT_KEY, {
    schoolId,
    timestamp: now,
  } satisfies LogoutIntent);

  // Native and custom navigation surfaces both call this helper. Capture once
  // before navigation tears down the content script, then begin flushing.
  try {
    if (previousIntent && now - previousIntent.timestamp < LOGOUT_CAPTURE_DEDUPE_MS) return;
    const distinctId = getContentDistinctId();
    if (!distinctId) return;
    capture(ANALYTICS_EVENTS.authLoggedOut, distinctId, {
      school_id: schoolId ?? undefined,
      source: 'user_initiated',
    });
    void flushLogoutAnalytics();
  } catch {
    // Logout must never depend on analytics.
  }
}

export async function flushLogoutAnalytics(): Promise<void> {
  await Promise.race([
    flushAnalytics(),
    new Promise<void>((resolve) => setTimeout(resolve, LOGOUT_FLUSH_TIMEOUT_MS)),
  ]);
}

export function getLastLogoutIntent(): LogoutIntent | null {
  return readJson<LogoutIntent>(LOGOUT_INTENT_KEY);
}

export function clearLogoutIntent(): void {
  try {
    localStorage.removeItem(LOGOUT_INTENT_KEY);
  } catch {
    // Ignore storage errors.
  }
}
