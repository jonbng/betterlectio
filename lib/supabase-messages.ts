// Message types for content script <-> background script Supabase communication.
// All Supabase operations run in the background script to avoid Firefox
// cross-compartment Promise errors in content scripts.

export type SupabaseMessage =
  | { type: 'bl-supabase-ensure-session'; schoolId: string; qrData?: { qrId: string; userId: string } }
  | { type: 'bl-supabase-get-session' }
  | { type: 'bl-supabase-sign-out' };

export type SupabaseResponse =
  | { ok: true; session?: { expires_at: number } | null }
  | { ok: false; error?: string };
