// Referral click endpoint.
//
// Flow: betterlectio.dk/r/{elevid}  →  302  →  this function  →  302
//   • Android UA → Google Play with Install Referrer `bl_ref={cookie_id}`
//   • Everyone else → /download?ref=1&bl_ref={cookie_id} (extension path)
//
// The website route hands off here so we can set a cookie on the
// `*.supabase.co` domain — the extension reads it during finalize.
// Android cannot use that cookie, so we also embed cookie_id in the
// Play Install Referrer string.
//
// Side effects:
//   • Insert one row capturing coarse browser/platform, referer origin,
//     daily-rotated hashed IP, and country for attribution/abuse controls.
//   • Set `bl_ref` cookie (180-day, SameSite=None; Secure; HttpOnly) holding
//     the row's `cookie_id` so finalize can look it back up.
//
// Validation: the `ref` query param must be a known student elevid. If it
// isn't, we still 302 to `/download` so a stale link doesn't 404 — but skip
// the DB insert and the cookie.

import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const ELEVID_RE = /^[0-9A-Za-z_-]{1,48}$/;
const DOWNLOAD_BASE = 'https://betterlectio.dk/download?ref=1';
const REFERRAL_BASE = 'https://betterlectio.dk/r';
const PLAY_STORE_BASE =
  'https://play.google.com/store/apps/details?id=dk.betterlectio.android';
const COOKIE_NAME = 'bl_ref';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 180d
const MAX_CLICKS_PER_IP_PER_MINUTE = 30;
const MAX_CLICKS_PER_REFERRER_PER_MINUTE = 120;

function ipSalt(): string {
  const v = Deno.env.get('BL_IP_HASH_SALT');
  if (!v || v.length < 32) throw new Error('BL_IP_HASH_SALT must contain at least 32 characters');
  return v;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null;
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip');
}

function isAndroidUa(ua: string | null): boolean {
  if (!ua) return false;
  return /Android/i.test(ua) && !/Windows Phone/i.test(ua);
}

function coarseUserAgent(ua: string | null): string | null {
  if (!ua) return null;
  const platform = /Android/i.test(ua) ? 'android' : /iPhone|iPad|iPod/i.test(ua) ? 'ios' :
    /Windows/i.test(ua) ? 'windows' : /Macintosh/i.test(ua) ? 'macos' : /Linux/i.test(ua) ? 'linux' : 'other';
  const browser = /Firefox/i.test(ua) ? 'firefox' : /Edg\//i.test(ua) ? 'edge' :
    /Chrome|CriOS/i.test(ua) ? 'chrome' : /Safari/i.test(ua) ? 'safari' : 'other';
  return `${platform}/${browser}`;
}

function refererOrigin(value: string | null): string | null {
  if (!value) return null;
  try { return new URL(value).origin; } catch { return null; }
}

function downloadUrl(cookieId?: string): string {
  if (!cookieId) return DOWNLOAD_BASE;
  return `${DOWNLOAD_BASE}&bl_ref=${encodeURIComponent(cookieId)}`;
}

function iosLandingUrl(ref: string, cookieId: string): string {
  return `${REFERRAL_BASE}/${encodeURIComponent(ref)}?bl_ref=${encodeURIComponent(cookieId)}`;
}

function playStoreUrl(cookieId: string): string {
  const referrer = encodeURIComponent(`${COOKIE_NAME}=${cookieId}`);
  return `${PLAY_STORE_BASE}&referrer=${referrer}`;
}

function redirectResponse(location: string, cookie?: string): Response {
  const headers = new Headers({ ...corsHeaders, Location: location });
  if (cookie) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}

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

  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const ref = (url.searchParams.get('ref') ?? '').trim();
  const delivery = url.searchParams.get('delivery');
  const iosLanding = delivery === 'ios';
  const jsonDelivery = delivery === 'json';
  const validateDelivery = delivery === 'validate';
  const userAgent = req.headers.get('user-agent');
  const android = isAndroidUa(userAgent);

  if (Deno.env.get('REFERRALS_ENABLED') === 'false') {
    if (jsonDelivery || validateDelivery) return jsonResponse({ error: 'feature_disabled' }, 503);
    return redirectResponse(android ? PLAY_STORE_BASE : downloadUrl());
  }

  // Always end somewhere useful — a malformed link is worse than a slightly
  // wrong-feeling redirect.
  if (!ref || !ELEVID_RE.test(ref)) {
    if (jsonDelivery) return jsonResponse({ error: 'invalid_referral' }, 400);
    return redirectResponse(android ? PLAY_STORE_BASE : downloadUrl());
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (validateDelivery) {
      const token = url.searchParams.get('token') ?? '';
      if (!/^[0-9a-f-]{36}$/i.test(token)) return jsonResponse({ valid: false });
      const { data: click } = await supabaseAdmin.from('referral_clicks')
        .select('cookie_id')
        .eq('cookie_id', token)
        .eq('referrer_student_id', ref)
        .is('converted_at', null)
        .is('expired_at', null)
        .gte('created_at', new Date(Date.now() - 180 * 24 * 60 * 60_000).toISOString())
        .maybeSingle();
      return jsonResponse({ valid: Boolean(click) });
    }

    // Validate the referrer exists. Anonymous links to non-students get
    // redirected without a cookie so we don't pollute the table.
    const { data: referrer } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('id', ref)
      .maybeSingle();

    if (!referrer) {
      if (jsonDelivery) return jsonResponse({ error: 'unknown_referral' }, 404);
      return redirectResponse(android ? PLAY_STORE_BASE : downloadUrl());
    }

    const cookieId = crypto.randomUUID();
    const referer = refererOrigin(req.headers.get('referer'));
    const country =
      req.headers.get('cf-ipcountry') ?? req.headers.get('x-vercel-ip-country');
    const ip = getClientIp(req);
    // Daily rotation prevents the hash from becoming a long-lived identifier.
    const day = new Date().toISOString().slice(0, 10);
    const ipHash = ip ? await sha256Hex(`${ipSalt()}:${day}:${ip}`) : null;
    const landingUrl = `https://betterlectio.dk/r/${ref}`;

    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const [{ count: referrerRate }, ipRateResult] = await Promise.all([
      supabaseAdmin.from('referral_clicks').select('id', { count: 'exact', head: true })
        .eq('referrer_student_id', ref).gte('created_at', oneMinuteAgo),
      ipHash
        ? supabaseAdmin.from('referral_clicks').select('id', { count: 'exact', head: true })
          .eq('ip_hash', ipHash).gte('created_at', oneMinuteAgo)
        : Promise.resolve({ count: 0, error: null }),
    ]);
    if ((referrerRate ?? 0) >= MAX_CLICKS_PER_REFERRER_PER_MINUTE ||
        (ipRateResult.count ?? 0) >= MAX_CLICKS_PER_IP_PER_MINUTE) {
      console.warn('[referral-click] rate limit reached', { ref });
      if (jsonDelivery) return jsonResponse({ error: 'rate_limited' }, 429);
      return redirectResponse(android ? PLAY_STORE_BASE : downloadUrl());
    }

    // The cookie is the source of truth that links a click to a future
    // install. If the insert fails we MUST NOT set the cookie — finalize
    // would later look it up, get nothing, and silently drop the
    // attribution. Better to redirect with no cookie so the user's next
    // click can try again on a healthy DB.
    const { error: insertError } = await supabaseAdmin
      .from('referral_clicks')
      .insert({
        cookie_id: cookieId,
        referrer_student_id: ref,
        user_agent: coarseUserAgent(userAgent),
        referer,
        landing_url: landingUrl,
        ip_hash: ipHash,
        country,
        city: null,
      });

    if (insertError) {
      console.error('[referral-click] insert failed', insertError);
      if (jsonDelivery) return jsonResponse({ error: 'click_failed' }, 500);
      return redirectResponse(android ? PLAY_STORE_BASE : downloadUrl());
    }

    const cookie = [
      `${COOKIE_NAME}=${cookieId}`,
      `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
      'Path=/',
      'Secure',
      'HttpOnly',
      'SameSite=None',
    ].join('; ');

    if (jsonDelivery) {
      return jsonResponse({ cookieId, referralUrl: iosLandingUrl(ref, cookieId) });
    }

    const destination = android
      ? playStoreUrl(cookieId)
      : iosLanding
        ? iosLandingUrl(ref, cookieId)
        : downloadUrl(cookieId);
    return redirectResponse(destination, cookie);
  } catch (err) {
    console.error('[referral-click] unhandled', err);
    if (jsonDelivery) return jsonResponse({ error: 'click_failed' }, 500);
    return redirectResponse(android ? PLAY_STORE_BASE : downloadUrl());
  }
});
