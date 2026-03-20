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

    // Validate required fields
    if (!qrId || !userId) {
      return jsonResponse({ error: 'Missing required fields: qrId, userId' }, 400);
    }

    // Validate formats
    if (!UUID_RE.test(qrId)) {
      return jsonResponse({ error: 'Invalid qrId format' }, 400);
    }
    if (!NUMERIC_RE.test(userId)) {
      return jsonResponse({ error: 'userId must be numeric' }, 400);
    }

    // ── Step 1: Login via QR code URL ──────────────────────────────────
    const qrLoginUrl = `https://www.lectio.dk/lectio/94/LandingPageQrCode.aspx?userId=${userId}&QrId=${qrId}`;
    const qrResp = await fetch(qrLoginUrl, { redirect: 'manual' });

    if (qrResp.status !== 303) {
      return jsonResponse({ error: 'QR code invalid or expired' }, 401);
    }

    // Extract schoolId from Location header: /lectio/{schoolId}/UserSetup.aspx
    const location = qrResp.headers.get('Location') || '';
    const schoolMatch = location.match(/\/lectio\/(\d+)\//);
    if (!schoolMatch) {
      return jsonResponse({ error: 'Could not determine school from QR redirect' }, 500);
    }
    const schoolId = schoolMatch[1];

    // Extract session cookies from Set-Cookie headers
    const cookies: string[] = [];
    for (const [key, value] of qrResp.headers.entries()) {
      if (key.toLowerCase() === 'set-cookie') {
        const cookiePart = value.split(';')[0];
        if (cookiePart) cookies.push(cookiePart);
      }
    }
    // Also check getSetCookie() for multiple Set-Cookie headers
    if (typeof (qrResp.headers as any).getSetCookie === 'function') {
      for (const raw of (qrResp.headers as any).getSetCookie()) {
        const cookiePart = raw.split(';')[0];
        if (cookiePart && !cookies.includes(cookiePart)) cookies.push(cookiePart);
      }
    }
    const cookieHeader = cookies.join('; ');

    if (!cookieHeader) {
      return jsonResponse({ error: 'No session cookies received from QR login' }, 500);
    }

    // ── Step 2: Fetch student profile from digitaltStudiekort.aspx ─────
    const studiekortUrl = `https://www.lectio.dk/lectio/${schoolId}/digitaltStudiekort.aspx`;
    const studiekortResp = await fetch(studiekortUrl, {
      headers: { Cookie: cookieHeader },
      redirect: 'follow',
    });
    const html = await studiekortResp.text();

    // Parse name: strip "(k)" or similar suffix
    const nameMatch = html.match(/id="s_m_Content_Content_StudentName"[^>]*>([^<]+)</);
    let name: string | null = null;
    if (nameMatch) {
      name = nameMatch[1].replace(/\([^)]*\)\s*$/, '').trim();
    }

    // Parse birthday: "Fødselsdag: D/M-YYYY (N år)" → "YYYY-MM-DD"
    let birthdate: string | null = null;
    const bdayMatch = html.match(/id="s_m_Content_Content_StudentBirthday"[^>]*>[^:]*:\s*(\d{1,2})\/(\d{1,2})-(\d{4})/);
    if (bdayMatch) {
      const day = bdayMatch[1].padStart(2, '0');
      const month = bdayMatch[2].padStart(2, '0');
      const year = bdayMatch[3];
      birthdate = `${year}-${month}-${day}`;
    }

    // Parse picture URL
    let pictureUrl: string | null = null;
    const picMatch = html.match(/id="s_m_Content_Content_StudPic"[^>]*src="([^"]+)"/);
    if (picMatch) {
      pictureUrl = new URL(picMatch[1], 'https://www.lectio.dk').toString();
    }

    // ── Step 3: Generate magic link & upsert student ───────────────────
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const email = `${schoolId}-${userId}@betterlectio.dk`;

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (error) {
      console.error('Failed to generate magic link:', error);
      return jsonResponse({ error: 'Failed to generate login link' }, 500);
    }

    // Upsert student record (non-blocking)
    try {
      const studentRecord: Record<string, unknown> = {
        id: userId,
        school_id: parseInt(schoolId, 10),
        has_extension: true,
      };
      if (name) studentRecord.name = name;
      if (birthdate) studentRecord.birthdate = birthdate;
      if (pictureUrl) studentRecord.lectio_pfp_url = pictureUrl;

      await supabaseAdmin
        .from('students')
        .upsert(studentRecord, { onConflict: 'school_id,id' });
    } catch (e) {
      console.warn('Failed to upsert student record:', e);
    }

    return jsonResponse({ tokenHash: data.properties.hashed_token });
  } catch (err) {
    console.error('Edge function error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
