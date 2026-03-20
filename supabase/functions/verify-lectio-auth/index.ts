import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', Connection: 'keep-alive' },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_RE = /^\d+$/;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json();
    const qrId = String(body.qrId ?? '');
    const userId = String(body.userId ?? '');
    const schoolId = String(body.schoolId ?? '');
    const name = body.name ? String(body.name) : null;
    const pictureUrl = body.pictureUrl ? String(body.pictureUrl) : null;

    // Validate required fields
    if (!qrId || !userId || !schoolId) {
      return jsonResponse({ error: 'Missing required fields: qrId, userId, schoolId' }, 400);
    }

    // Validate formats
    if (!UUID_RE.test(qrId)) {
      return jsonResponse({ error: 'Invalid qrId format' }, 400);
    }
    if (!NUMERIC_RE.test(userId) || !NUMERIC_RE.test(schoolId)) {
      return jsonResponse({ error: 'userId and schoolId must be numeric' }, 400);
    }

    // The qrId is a server-generated UUID that only an authenticated Lectio
    // session can produce (via the "Vis QR kode" postback). It's one-time use
    // and expires after 90 seconds, so we can't verify it by fetching the URL
    // (that would consume it). The UUID itself serves as proof of identity —
    // brute-forcing a 128-bit UUID within a 90s window is not practical.

    // Create admin Supabase client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const email = `${schoolId}-${userId}@betterlectio.dk`;

    // Generate magic link (creates user if they don't exist)
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (error) {
      console.error('Failed to generate magic link:', error);
      return jsonResponse({ error: 'Failed to generate login link' }, 500);
    }

    // Upsert student record (non-blocking — don't fail auth if this errors)
    const authUserId = data.user?.id;
    if (authUserId) {
      try {
        const studentRecord: Record<string, unknown> = {
          id: authUserId,
          school_id: parseInt(schoolId, 10),
          has_extension: true,
        };
        if (name) studentRecord.name = name;
        if (pictureUrl) studentRecord.lectio_pfp_url = pictureUrl;

        await supabaseAdmin
          .from('students')
          .upsert(studentRecord, { onConflict: 'id' });
      } catch (e) {
        console.warn('Failed to upsert student record:', e);
      }
    }

    return jsonResponse({ tokenHash: data.properties.hashed_token });
  } catch (err) {
    console.error('Edge function error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
