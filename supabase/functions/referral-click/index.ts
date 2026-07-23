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
//   • Insert one row in `referral_clicks` capturing UA / referer / hashed IP /
//     country so we have rich attribution metadata.
//   • Set `bl_ref` cookie (180-day, SameSite=None; Secure; HttpOnly) holding
//     the row's `cookie_id` so finalize can look it back up.
//   • Fire-and-forget PostHog `referral link clicked` event.
//
// Validation: the `ref` query param must be a known student elevid. If it
// isn't, we still 302 to `/download` so a stale link doesn't 404 — but skip
// the DB insert and the cookie.

import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ELEVID_RE = /^[0-9A-Za-z_-]{1,48}$/;
const DOWNLOAD_BASE = 'https://betterlectio.dk/download?ref=1';
const PLAY_STORE_BASE =
  'https://play.google.com/store/apps/details?id=dk.betterlectio.android';
const COOKIE_NAME = 'bl_ref';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 180d

function ipSalt(): string {
  const v = Deno.env.get('BL_IP_HASH_SALT');
  return v && v.length > 0 ? v : 'bl-referral-static-fallback';
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

function refererHost(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).host;
  } catch {
    return null;
  }
}

function isAndroidUa(ua: string | null): boolean {
  if (!ua) return false;
  return /Android/i.test(ua) && !/Windows Phone/i.test(ua);
}

function downloadUrl(cookieId?: string): string {
  if (!cookieId) return DOWNLOAD_BASE;
  return `${DOWNLOAD_BASE}&bl_ref=${encodeURIComponent(cookieId)}`;
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
        properties: { ...properties, $lib: 'supabase-edge', source: 'referral-click' },
      }),
    });
  } catch {
    // PostHog is best-effort — never fail the redirect on telemetry errors.
  }
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
  const userAgent = req.headers.get('user-agent');
  const android = isAndroidUa(userAgent);

  // Always end somewhere useful — a malformed link is worse than a slightly
  // wrong-feeling redirect.
  if (!ref || !ELEVID_RE.test(ref)) {
    return redirectResponse(android ? PLAY_STORE_BASE : downloadUrl());
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Validate the referrer exists. Anonymous links to non-students get
    // redirected without a cookie so we don't pollute the table.
    const { data: referrer } = await supabaseAdmin
      .from('students')
      .select('id, school_id')
      .eq('id', ref)
      .maybeSingle();

    if (!referrer) {
      await capturePostHog('referral link clicked invalid', `lectio:${ref}`, {
        reason: 'unknown_referrer',
        platform: android ? 'android' : 'web',
      });
      return redirectResponse(android ? PLAY_STORE_BASE : downloadUrl());
    }

    const cookieId = crypto.randomUUID();
    const referer = req.headers.get('referer');
    const country =
      req.headers.get('cf-ipcountry') ?? req.headers.get('x-vercel-ip-country');
    const city =
      req.headers.get('cf-ipcity') ?? req.headers.get('x-vercel-ip-city');
    const ip = getClientIp(req);
    const ipHash = ip ? await sha256Hex(`${ipSalt()}:${ip}`) : null;
    const landingUrl = `https://betterlectio.dk/r/${ref}`;

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
        user_agent: userAgent,
        referer,
        landing_url: landingUrl,
        ip_hash: ipHash,
        country,
        city,
      });

    if (insertError) {
      console.error('[referral-click] insert failed', insertError);
      await capturePostHog('referral link clicked invalid', `lectio:${ref}`, {
        reason: 'insert_failed',
        platform: android ? 'android' : 'web',
      });
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

    await capturePostHog('referral link clicked', `lectio:${ref}`, {
      country,
      referer_host: refererHost(referer),
      has_referer: !!referer,
      school_id: referrer.school_id,
      platform: android ? 'android' : 'web',
      redirect: android ? 'play_store' : 'download',
    });

    const destination = android ? playStoreUrl(cookieId) : downloadUrl(cookieId);
    return redirectResponse(destination, cookie);
  } catch (err) {
    console.error('[referral-click] unhandled', err);
    return redirectResponse(android ? PLAY_STORE_BASE : downloadUrl());
  }
});
