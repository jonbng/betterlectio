// Referral finalize endpoint.
//
// Called after a fresh install so we can attribute the invitee back to
// whoever shared the referral link.
//
// Extension: credentialed fetch with `bl_ref` HttpOnly cookie on *.supabase.co.
// Android: POST body `{ cookieId }` from Play Install Referrer (no cookie).
// iOS: POST body `{ cookieId }` captured from a universal link or App Clip.
//
// Attribution is first-install-only and never overwrites:
//   • Self-referral → rejected
//   • Student already has `referred_by` → rejected
//   • Fresh-install window (7d) based on platform:
//       extension → extension_installed_at
//       android → android_installed_at (+ app_installed_at)
//       iOS → iphone_installed_at (+ app_installed_at)
//   • Click row older than 180d → expired
//
// On success we also stamp the referrer's `referral_reward_unlocked_at`
// once they reach REFERRAL_UNLOCK_THRESHOLD attributed invites.

import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

const baseCorsHeaders: Record<string, string> = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
};

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowed = origin === 'https://betterlectio.dk' ||
    /^chrome-extension:\/\/[a-z]{32}$/.test(origin) ||
    /^moz-extension:\/\/[0-9a-f-]+$/i.test(origin);
  return { ...baseCorsHeaders, 'Access-Control-Allow-Origin': allowed ? origin : 'https://betterlectio.dk', Vary: 'Origin' };
}

const COOKIE_NAME = 'bl_ref';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ELEVID_RE = /^[0-9A-Za-z_-]{1,48}$/;

type Platform = 'android' | 'ios' | 'extension';

type RejectionReason =
  | 'no_cookie'
  | 'unknown_cookie'
  | 'self_referral'
  | 'already_referred'
  | 'returning_user'
  | 'expired';

function jsonResponse(req: Request, body: Record<string, unknown>, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers({ ...corsHeaders(req), 'Content-Type': 'application/json' });
  if (extraHeaders) {
    new Headers(extraHeaders).forEach((value, key) => headers.append(key, value));
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function parseCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

function clearCookieHeader(): string {
  return [
    `${COOKIE_NAME}=`,
    'Max-Age=0',
    'Path=/',
    'Secure',
    'HttpOnly',
    'SameSite=None',
  ].join('; ');
}

async function capturePostHog(
  event: string,
  distinctId: string,
  properties: Record<string, unknown>,
): Promise<void> {
  // Successful attribution is the sole server-side PostHog signal. Clicks,
  // rejections, and unlocks already live in Postgres and need no duplicate.
  if (event !== 'referral attributed') return;
  const apiKey = Deno.env.get('POSTHOG_API_KEY');
  const host = Deno.env.get('POSTHOG_HOST') ?? 'https://eu.i.posthog.com';
  if (!apiKey) return;
  try {
    await fetch(`${host}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        event,
        distinct_id: distinctId,
        properties: { ...properties, $lib: 'supabase-edge', source: 'referral-finalize' },
      }),
    });
  } catch {
    /* best-effort */
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Method not allowed' }, 405);
  }
  if (Deno.env.get('REFERRALS_ENABLED') === 'false') {
    return jsonResponse(req, { error: 'feature_disabled' }, 503);
  }

  const clearCookie = { 'Set-Cookie': clearCookieHeader() };

  let body: {
    studentId?: unknown;
    schoolId?: unknown;
    extensionVersion?: unknown;
    cookieId?: unknown;
    platform?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400);
  }

  const studentId = typeof body.studentId === 'string' ? body.studentId : '';
  const schoolId = typeof body.schoolId === 'number' ? body.schoolId : null;
  const extensionVersion = typeof body.extensionVersion === 'string' ? body.extensionVersion : null;
  const platform: Platform = body.platform === 'android'
    ? 'android'
    : body.platform === 'ios'
      ? 'ios'
      : 'extension';
  const cookieFromBody =
    typeof body.cookieId === 'string' && UUID_RE.test(body.cookieId) ? body.cookieId : null;

  if (!studentId || !ELEVID_RE.test(studentId)) {
    return jsonResponse(req, { error: 'Invalid studentId' }, 400);
  }

  // Auth: validate the caller's JWT actually owns the studentId they claim.
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse(req, { error: 'Missing bearer token' }, 401);
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Verify the JWT and get the auth.uid().
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user?.id) {
    return jsonResponse(req, { error: 'Unauthorized' }, 401);
  }
  const supabaseUserId = userData.user.id;

  const { data: student, error: studentErr } = await supabaseAdmin
    .from('students')
    .select('id, supabase_id, referred_by, extension_installed_at, app_installed_at, name, school_id')
    .eq('id', studentId)
    .maybeSingle();

  if (studentErr || !student || student.supabase_id !== supabaseUserId) {
    return jsonResponse(req, { error: 'Unauthorized' }, 401);
  }

  // Resolve cookie_id: body (Android Install Referrer) wins, else HttpOnly cookie.
  const cookieFromHeader = parseCookie(req, COOKIE_NAME);
  const cookie = cookieFromBody ?? cookieFromHeader;
  const responseExtra = cookieFromHeader ? clearCookie : undefined;

  if (!cookie) {
    return jsonResponse(req, { attributed: false, reason: 'no_cookie' satisfies RejectionReason });
  }
  if (!UUID_RE.test(cookie)) {
    return jsonResponse(req,
      { attributed: false, reason: 'unknown_cookie' satisfies RejectionReason },
      200,
      responseExtra,
    );
  }

  // The RPC locks the click row and commits student attribution, click
  // conversion, and reward unlock in one database transaction.
  const { data: result, error: finalizeError } = await supabaseAdmin.rpc(
    'finalize_referral_attribution',
    { p_cookie_id: cookie, p_student_id: studentId, p_platform: platform },
  );
  if (finalizeError || !result || typeof result !== 'object') {
    console.error('[referral-finalize] atomic RPC failed', finalizeError);
    return jsonResponse(req, { error: 'Could not attribute', stage: 'atomic-finalize' }, 500);
  }

  const payload = result as Record<string, unknown>;
  if (payload.attributed === true) {
    await capturePostHog('referral attributed', `lectio:${studentId}`, {
      referrer_student_id: payload.referrerStudentId ?? null,
      school_id: schoolId ?? student.school_id ?? null,
      extension_version: extensionVersion,
      platform,
      referrer_unlocked: payload.referrerUnlocked === true,
    });
  }
  return jsonResponse(req, payload, 200, responseExtra);
});
