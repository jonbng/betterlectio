// Referral finalize endpoint.
//
// Called after a fresh install so we can attribute the invitee back to
// whoever shared the referral link.
//
// Extension: credentialed fetch with `bl_ref` HttpOnly cookie on *.supabase.co.
// Android: POST body `{ cookieId }` from Play Install Referrer (no cookie).
//
// Attribution is first-install-only and never overwrites:
//   • Self-referral → rejected
//   • Student already has `referred_by` → rejected
//   • Fresh-install window (7d) based on platform:
//       extension → extension_installed_at
//       android   → app_installed_at
//   • Click row older than 180d → expired
//
// On success we also stamp the referrer's `referral_reward_unlocked_at`
// once they reach REFERRAL_UNLOCK_THRESHOLD attributed invites.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.49.8';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
};

const COOKIE_NAME = 'bl_ref';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ELEVID_RE = /^[0-9A-Za-z_-]{1,48}$/;
const FRESH_INSTALL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const CLICK_EXPIRY_MS = 180 * 24 * 60 * 60 * 1000;
const REFERRAL_UNLOCK_THRESHOLD = 3;

type Platform = 'android' | 'extension';

type RejectionReason =
  | 'no_cookie'
  | 'unknown_cookie'
  | 'self_referral'
  | 'already_referred'
  | 'returning_user'
  | 'expired';

function jsonResponse(body: Record<string, unknown>, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers({ ...corsHeaders, 'Content-Type': 'application/json' });
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

async function recordRejection(
  supabaseAdmin: SupabaseClient,
  clickId: string | null,
  reason: RejectionReason,
  studentId: string | null,
  referrerStudentId: string | null,
  platform: Platform,
): Promise<void> {
  if (clickId) {
    try {
      await supabaseAdmin
        .from('referral_clicks')
        .update({ rejection_reason: reason, expired_at: new Date().toISOString() })
        .eq('id', clickId)
        .is('converted_at', null);
    } catch (err) {
      console.warn('[referral-finalize] failed to mark rejection', err);
    }
  }

  if (studentId) {
    await capturePostHog('referral attribution rejected', `lectio:${studentId}`, {
      reason,
      referrer_student_id: referrerStudentId,
      platform,
    });
  }
}

async function maybeUnlockReferrer(
  supabaseAdmin: SupabaseClient,
  referrerStudentId: string,
  nowIso: string,
): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('referred_by', referrerStudentId);

  if (error) {
    console.warn('[referral-finalize] unlock count failed', error);
    return false;
  }
  if ((count ?? 0) < REFERRAL_UNLOCK_THRESHOLD) return false;

  const { data: unlocked, error: unlockErr } = await supabaseAdmin
    .from('students')
    .update({ referral_reward_unlocked_at: nowIso })
    .eq('id', referrerStudentId)
    .is('referral_reward_unlocked_at', null)
    .select('id');

  if (unlockErr) {
    console.warn('[referral-finalize] unlock stamp failed', unlockErr);
    return false;
  }

  if (unlocked && unlocked.length > 0) {
    await capturePostHog('referral unlock earned', `lectio:${referrerStudentId}`, {
      threshold: REFERRAL_UNLOCK_THRESHOLD,
      conversions: count,
    });
    return true;
  }
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
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
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const studentId = typeof body.studentId === 'string' ? body.studentId : '';
  const schoolId = typeof body.schoolId === 'number' ? body.schoolId : null;
  const extensionVersion = typeof body.extensionVersion === 'string' ? body.extensionVersion : null;
  const platform: Platform = body.platform === 'android' ? 'android' : 'extension';
  const cookieFromBody =
    typeof body.cookieId === 'string' && UUID_RE.test(body.cookieId) ? body.cookieId : null;

  if (!studentId || !ELEVID_RE.test(studentId)) {
    return jsonResponse({ error: 'Invalid studentId' }, 400);
  }

  // Auth: validate the caller's JWT actually owns the studentId they claim.
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'Missing bearer token' }, 401);
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
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  const supabaseUserId = userData.user.id;

  const { data: student, error: studentErr } = await supabaseAdmin
    .from('students')
    .select('id, supabase_id, referred_by, extension_installed_at, app_installed_at, name, school_id')
    .eq('id', studentId)
    .maybeSingle();

  if (studentErr || !student || student.supabase_id !== supabaseUserId) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  // Resolve cookie_id: body (Android Install Referrer) wins, else HttpOnly cookie.
  const cookieFromHeader = parseCookie(req, COOKIE_NAME);
  const cookie = cookieFromBody ?? cookieFromHeader;
  const responseExtra = cookieFromHeader ? clearCookie : undefined;

  if (!cookie) {
    return jsonResponse({ attributed: false, reason: 'no_cookie' satisfies RejectionReason });
  }
  if (!UUID_RE.test(cookie)) {
    return jsonResponse(
      { attributed: false, reason: 'unknown_cookie' satisfies RejectionReason },
      200,
      responseExtra,
    );
  }

  const { data: click, error: clickErr } = await supabaseAdmin
    .from('referral_clicks')
    .select('*')
    .eq('cookie_id', cookie)
    .maybeSingle();

  if (clickErr || !click) {
    return jsonResponse(
      { attributed: false, reason: 'unknown_cookie' satisfies RejectionReason },
      200,
      responseExtra,
    );
  }

  const reject = async (reason: RejectionReason) => {
    await recordRejection(
      supabaseAdmin,
      click.id,
      reason,
      studentId,
      click.referrer_student_id,
      platform,
    );
    return jsonResponse({ attributed: false, reason }, 200, responseExtra);
  };

  if (click.converted_at || click.expired_at) {
    return jsonResponse(
      { attributed: false, reason: 'unknown_cookie' satisfies RejectionReason },
      200,
      responseExtra,
    );
  }

  if (click.referrer_student_id === studentId) return reject('self_referral');
  if (student.referred_by) return reject('already_referred');

  const installedAtRaw =
    platform === 'android' ? student.app_installed_at : student.extension_installed_at;
  const installedAt = installedAtRaw ? new Date(installedAtRaw).getTime() : null;
  if (installedAt && Date.now() - installedAt > FRESH_INSTALL_WINDOW_MS) {
    return reject('returning_user');
  }

  const clickAge = Date.now() - new Date(click.created_at).getTime();
  if (clickAge > CLICK_EXPIRY_MS) return reject('expired');

  const { data: referrer } = await supabaseAdmin
    .from('students')
    .select('id, name')
    .eq('id', click.referrer_student_id)
    .maybeSingle();

  if (!referrer) return reject('expired');

  // ── Attribute ────────────────────────────────────────────────────────
  const nowIso = new Date().toISOString();

  const { data: updatedStudents, error: studentUpdateErr } = await supabaseAdmin
    .from('students')
    .update({
      referred_by: click.referrer_student_id,
      referred_at: nowIso,
      referral_click_id: click.id,
    })
    .eq('id', studentId)
    .is('referred_by', null)
    .select('id');

  if (studentUpdateErr) {
    console.error('[referral-finalize] student update failed', studentUpdateErr);
    return jsonResponse(
      { error: 'Could not attribute', stage: 'student-update' },
      500,
      responseExtra,
    );
  }

  if (!updatedStudents || updatedStudents.length === 0) {
    console.warn('[referral-finalize] lost attribution race for', studentId);
    await capturePostHog('referral attribution rejected', `lectio:${studentId}`, {
      reason: 'race_lost',
      referrer_student_id: click.referrer_student_id,
      platform,
    });
    return jsonResponse(
      { attributed: false, reason: 'already_referred' satisfies RejectionReason },
      200,
      responseExtra,
    );
  }

  const { error: clickUpdateErr } = await supabaseAdmin
    .from('referral_clicks')
    .update({ converted_at: nowIso, converted_student_id: studentId })
    .eq('id', click.id)
    .is('converted_at', null);

  if (clickUpdateErr) {
    console.warn('[referral-finalize] click update failed', clickUpdateErr);
  }

  const unlocked = await maybeUnlockReferrer(
    supabaseAdmin,
    click.referrer_student_id,
    nowIso,
  );

  await capturePostHog('referral attributed', `lectio:${studentId}`, {
    referrer_student_id: click.referrer_student_id,
    click_age_seconds: Math.round(clickAge / 1000),
    school_id: schoolId ?? student.school_id ?? null,
    extension_version: extensionVersion,
    country: click.country,
    platform,
    referrer_unlocked: unlocked,
  });

  return jsonResponse(
    {
      attributed: true,
      referrerStudentId: click.referrer_student_id,
      referrerName: referrer.name ?? null,
      referrerUnlocked: unlocked,
    },
    200,
    responseExtra,
  );
});
