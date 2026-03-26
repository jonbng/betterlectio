const AUTH_ACTIVITY_KEY = 'bl-last-authenticated-activity';
const LOGOUT_INTENT_KEY = 'bl-last-logout-intent';

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
  writeJson(LOGOUT_INTENT_KEY, {
    schoolId,
    timestamp: Date.now(),
  } satisfies LogoutIntent);
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
