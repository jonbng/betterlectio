import type { SupabaseMessage, SupabaseResponse } from '@/lib/supabase-messages';
import { fetchQrUrl } from '@/lib/profil-parser';

function sendSupabaseMessage(msg: SupabaseMessage): Promise<SupabaseResponse> {
  return browser.runtime.sendMessage(msg);
}

/**
 * Ensures a valid Supabase session exists. Runs silently — never throws.
 * Fetches QR data from Lectio (needs page cookies), then delegates all
 * Supabase operations to the background script to avoid Firefox
 * cross-compartment Promise errors.
 */
export async function ensureSupabaseSession(schoolId: string): Promise<void> {
  try {
    // Quick check: is session already valid?
    const check = await sendSupabaseMessage({ type: 'bl-supabase-get-session' });
    if (check.ok && check.session?.expires_at && check.session.expires_at > Date.now() / 1000 + 300) {
      return;
    }

    // Fetch QR data from Lectio (requires page cookies — must run in content script)
    const qrUrl = await fetchQrUrl(schoolId);
    if (!qrUrl) {
      console.warn('[BetterLectio] Auto Supabase auth: could not fetch QR URL');
      return;
    }

    const url = new URL(qrUrl);
    const userId = url.searchParams.get('userId');
    const qrId = url.searchParams.get('QrId');
    if (!userId || !qrId) {
      console.warn('[BetterLectio] Auto Supabase auth: invalid QR URL format');
      return;
    }

    // Send QR data to background for Supabase auth
    const result = await sendSupabaseMessage({
      type: 'bl-supabase-ensure-session',
      schoolId,
      qrData: { qrId, userId },
    });

    if (!result.ok) {
      console.warn('[BetterLectio] Auto Supabase auth failed:', result.error);
    }
  } catch (err) {
    console.warn('[BetterLectio] Auto Supabase auth error:', err);
  }
}
