import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, createSupabaseClient } from '@/lib/supabase';
import { fetchQrUrl } from '@/lib/profil-parser';

export async function triggerSupabaseAuth(
  schoolId: string,
): Promise<{ success: boolean; error?: string }> {
  // 1. Fetch QR code URL from Lectio
  const qrUrl = await fetchQrUrl(schoolId);
  if (!qrUrl) {
    return { success: false, error: 'Kunne ikke hente QR URL fra Lectio.' };
  }

  // 2. Parse userId and qrId from URL
  const url = new URL(qrUrl);
  const userId = url.searchParams.get('userId');
  const qrId = url.searchParams.get('QrId');
  if (!userId || !qrId) {
    return { success: false, error: 'Ugyldigt QR URL format.' };
  }

  // 3. POST to edge function — server verifies QR, extracts profile, returns magic link
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/verify-lectio-auth`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ qrId, userId }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    return { success: false, error: `Serverfejl: ${body}` };
  }

  const { tokenHash, error } = await resp.json();
  if (error || !tokenHash) {
    return { success: false, error: error || 'Ingen token modtaget.' };
  }

  // 4. Verify OTP directly — sets session in browser.storage.local via our adapter
  const supabase = createSupabaseClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  if (verifyError) {
    return { success: false, error: verifyError.message };
  }

  return { success: true };
}
