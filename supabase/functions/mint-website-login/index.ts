// Mint a fresh magic-link token_hash for the authenticated student so the
// marketing site can establish a Supabase SSR session via verifyOtp.
//
// Unlike verify-lectio-auth (QR scrape, --no-verify-jwt), this requires a
// valid Bearer JWT and only mints for the student owned by auth.uid().

import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'Missing bearer token' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey =
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user?.id) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  const supabaseUserId = userData.user.id;

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const { data: student, error: studentErr } = await supabaseAdmin
    .from('students')
    .select('id, school_id, supabase_id')
    .eq('supabase_id', supabaseUserId)
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (studentErr || !student || student.supabase_id !== supabaseUserId) {
    return jsonResponse({ error: 'No linked student' }, 401);
  }

  const schoolId = String(student.school_id);
  const elevid = String(student.id);
  const email = `${schoolId}-${elevid}@betterlectio.dk`;

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (error) {
    console.error('[mint-website-login] generateLink failed', error);
    return jsonResponse({ error: 'Failed to generate login link' }, 500);
  }

  let tokenHash = data.properties?.hashed_token ?? null;
  if (!tokenHash && data.properties?.action_link) {
    try {
      const linkUrl = new URL(data.properties.action_link);
      tokenHash = linkUrl.searchParams.get('token');
    } catch {
      tokenHash = null;
    }
  }

  if (!tokenHash) {
    return jsonResponse({ error: 'Failed to extract token_hash' }, 500);
  }

  return jsonResponse({
    token_hash: tokenHash,
    student_id: elevid,
    school_id: student.school_id,
  });
});
