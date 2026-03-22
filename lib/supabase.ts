import type { SupabaseResponse } from '@/lib/supabase-messages';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/**
 * Get current Supabase session via background script.
 * Returns a minimal session object or null.
 */
export async function getSession(): Promise<{ expires_at: number } | null> {
  try {
    const resp: SupabaseResponse = await browser.runtime.sendMessage({ type: 'bl-supabase-get-session' });
    return resp.ok ? (resp.session ?? null) : null;
  } catch {
    return null;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session !== null;
}

export async function signOut(): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: 'bl-supabase-sign-out' });
  } catch {
    // Non-critical
  }
}
