import { createSupabaseClient, getSession } from '@/lib/supabase';
import { triggerSupabaseAuth } from '@/lib/supabase-auth';

const LOCK_KEY = 'bl-supabase-auth-lock';
const FAILURES_KEY = 'bl-supabase-auth-failures';
const REAUTH_KEY = 'bl-supabase-needs-reauth';
const LOCK_TTL_MS = 120_000; // 2 minutes

interface FailureState {
  count: number;
  lastAttempt: number;
}

function getBackoffMs(failures: number): number {
  if (failures <= 0) return 0;
  if (failures === 1) return 5 * 60_000;
  if (failures === 2) return 15 * 60_000;
  return 60 * 60_000;
}

async function getFailures(): Promise<FailureState> {
  const result = await browser.storage.local.get(FAILURES_KEY);
  return (result[FAILURES_KEY] as FailureState) ?? { count: 0, lastAttempt: 0 };
}

async function setFailures(state: FailureState): Promise<void> {
  await browser.storage.local.set({ [FAILURES_KEY]: state });
}

async function isLocked(): Promise<boolean> {
  const result = await browser.storage.local.get(LOCK_KEY);
  const lockTime = result[LOCK_KEY] as number | undefined;
  if (!lockTime) return false;
  return Date.now() - lockTime < LOCK_TTL_MS;
}

async function setLock(): Promise<void> {
  await browser.storage.local.set({ [LOCK_KEY]: Date.now() });
}

async function clearLock(): Promise<void> {
  await browser.storage.local.remove(LOCK_KEY);
}

/**
 * Ensures a valid Supabase session exists. Runs silently — never throws.
 * Safe to call fire-and-forget from any content script.
 */
export async function ensureSupabaseSession(schoolId: string): Promise<void> {
  try {
    // 1. Check existing session
    const session = await getSession();
    if (session?.expires_at && session.expires_at > Date.now() / 1000 + 300) {
      // Valid session with >5min remaining
      await browser.storage.local.remove(REAUTH_KEY);
      return;
    }

    // 2. Check if forced reauth is needed (overrides backoff)
    const reauthResult = await browser.storage.local.get(REAUTH_KEY);
    const needsReauth = !!reauthResult[REAUTH_KEY];

    // 3. Check backoff (skip if forced reauth)
    if (!needsReauth) {
      const failures = await getFailures();
      const backoff = getBackoffMs(failures.count);
      if (backoff > 0 && Date.now() - failures.lastAttempt < backoff) {
        return;
      }
    }

    // 4. Check cross-tab lock
    if (await isLocked()) return;

    // 5. Acquire lock and attempt auth
    await setLock();
    try {
      const result = await triggerSupabaseAuth(schoolId);
      if (result.success) {
        await setFailures({ count: 0, lastAttempt: 0 });
        await browser.storage.local.remove(REAUTH_KEY);
      } else {
        const failures = await getFailures();
        await setFailures({ count: failures.count + 1, lastAttempt: Date.now() });
        console.warn('[BetterLectio] Auto Supabase auth failed:', result.error);
      }
    } finally {
      await clearLock();
    }
  } catch (err) {
    console.warn('[BetterLectio] Auto Supabase auth error:', err);
    await clearLock().catch(() => {});
  }
}

/** Listen for sign-out events to trigger re-auth on next page load. */
export function initAuthStateListener(): void {
  try {
    const supabase = createSupabaseClient();
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        browser.storage.local.set({ [REAUTH_KEY]: true }).catch(() => {});
      }
    });
  } catch {
    // Non-critical — ignore
  }
}
