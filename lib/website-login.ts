// Website login broker: Lectio content scripts capture ?bl_login=STATE,
// persist it (Lectio strips query params on redirect), then mint a
// magic-link OTP via the background and redirect to betterlectio.dk.

import { ensureSupabaseSession, getSupabaseSessionMeta } from '@/lib/supabase/session';

const PENDING_KEY = 'bl-website-login-pending';
/** Same-origin sync backup — survives Lectio redirects that beat async storage. */
const SESSION_PENDING_KEY = 'bl-website-login-pending';
const PENDING_TTL_MS = 5 * 60 * 1000;
const WEBSITE_ORIGIN = 'https://betterlectio.dk';
const STATE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PendingLogin = {
  state: string;
  createdAt: number;
};

function isFreshPending(pending: PendingLogin | null | undefined): pending is PendingLogin {
  if (!pending?.state || !STATE_RE.test(pending.state)) return false;
  if (Date.now() - pending.createdAt > PENDING_TTL_MS) return false;
  return true;
}

function readSessionPending(): PendingLogin | null {
  try {
    const raw = sessionStorage.getItem(SESSION_PENDING_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw) as PendingLogin;
    if (!isFreshPending(pending)) {
      sessionStorage.removeItem(SESSION_PENDING_KEY);
      return null;
    }
    return pending;
  } catch {
    return null;
  }
}

function writeSessionPending(pending: PendingLogin): void {
  try {
    sessionStorage.setItem(SESSION_PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Private mode / quota — extension storage is the fallback.
  }
}

function clearSessionPending(): void {
  try {
    sessionStorage.removeItem(SESSION_PENDING_KEY);
  } catch {
    // Non-critical.
  }
}

let completing = false;
let overlayEl: HTMLElement | null = null;

function mintErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'not_signed_in':
      return 'Kunne ikke oprette session. Er du logget ind på Lectio?';
    case 'network_error':
      return 'Netværksfejl. Prøv igen.';
    case 'No linked student':
    case 'no_student':
      return 'Ingen elevprofil fundet. Prøv at genindlæse Lectio.';
    default:
      return 'Kunne ikke logge ind. Prøv igen.';
  }
}

/**
 * Capture ?bl_login=STATE. Writes sessionStorage synchronously first so Lectio
 * inline redirects (lecmobile → login_list.aspx) cannot drop the intent before
 * async extension storage settles.
 */
export async function captureWebsiteLoginFromUrl(): Promise<string | null> {
  try {
    // Prefer URL param; fall back to sync sessionStorage written at document_start.
    let state = new URLSearchParams(window.location.search).get('bl_login');
    if (!state || !STATE_RE.test(state)) {
      state = readSessionPending()?.state ?? null;
    }
    if (!state || !STATE_RE.test(state)) return null;

    const pending: PendingLogin = {
      state,
      createdAt: readSessionPending()?.createdAt ?? Date.now(),
    };
    // Sync first, strip URL before any await (storage can stall).
    writeSessionPending(pending);
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('bl_login')) {
        url.searchParams.delete('bl_login');
        window.history.replaceState(null, '', url.toString());
      }
    } catch {
      // Non-critical.
    }
    console.log('[BetterLectio] captured bl_login', state.slice(0, 8) + '…');
    await persistPending(pending);
    return state;
  } catch {
    return null;
  }
}

async function persistPending(pending: PendingLogin): Promise<void> {
  writeSessionPending(pending);
  try {
    await browser.storage.local.set({ [PENDING_KEY]: pending });
  } catch {
    // Non-critical — sessionStorage may still have it.
  }
}

export async function readPending(): Promise<PendingLogin | null> {
  try {
    const row = await browser.storage.local.get(PENDING_KEY);
    const fromExt = row[PENDING_KEY] as PendingLogin | undefined;
    if (isFreshPending(fromExt)) return fromExt;
  } catch {
    // Fall through to sessionStorage.
  }

  const fromSession = readSessionPending();
  if (fromSession) {
    // Promote so other tabs / later scripts see it via extension storage.
    try {
      await browser.storage.local.set({ [PENDING_KEY]: fromSession });
    } catch {
      // Non-critical.
    }
    return fromSession;
  }

  // Expired extension entry — clean up.
  try {
    const row = await browser.storage.local.get(PENDING_KEY);
    if (row[PENDING_KEY]) await clearPending();
  } catch {
    // Non-critical.
  }
  return null;
}

async function clearPending(): Promise<void> {
  clearSessionPending();
  try {
    await browser.storage.local.remove(PENDING_KEY);
  } catch {
    // Non-critical.
  }
}

export function showWebsiteLoginOverlay(message: string): void {
  const existing =
    overlayEl ?? document.getElementById('bl-website-login-overlay');
  if (existing) {
    overlayEl = existing as HTMLElement;
    const label = existing.querySelector('[data-bl-login-label]');
    if (label) label.textContent = message;
    return;
  }

  const root = document.createElement('div');
  root.id = 'bl-website-login-overlay';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: '#fff',
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  });

  const card = document.createElement('div');
  Object.assign(card.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    width: 'min(420px, 100%)',
    padding: '16px 18px',
    borderRadius: '16px',
    background: '#fff',
    color: '#111827',
  });

  const spinner = document.createElement('div');
  Object.assign(spinner.style, {
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    border: '2.5px solid #e5e7eb',
    borderTopColor: '#111827',
    flexShrink: '0',
    animation: 'bl-login-spin 0.7s linear infinite',
  });

  if (!document.getElementById('bl-login-spin-style')) {
    const style = document.createElement('style');
    style.id = 'bl-login-spin-style';
    style.textContent =
      '@keyframes bl-login-spin{to{transform:rotate(360deg)}}';
    document.documentElement.appendChild(style);
  }

  const label = document.createElement('div');
  label.setAttribute('data-bl-login-label', '');
  label.textContent = message;
  Object.assign(label.style, {
    fontSize: '14px',
    fontWeight: '600',
    lineHeight: '1.4',
  });

  card.appendChild(spinner);
  card.appendChild(label);
  root.appendChild(card);
  document.documentElement.appendChild(root);
  overlayEl = root;
}

export function hideWebsiteLoginOverlay(): void {
  overlayEl?.remove();
  document.getElementById('bl-website-login-overlay')?.remove();
  overlayEl = null;
}

/**
 * If a pending website login exists and we have Lectio identity + a Supabase
 * session, mint an OTP and redirect this tab to the website callback.
 */
export async function maybeCompleteWebsiteLogin(opts: {
  schoolId: string | null | undefined;
  studentId: string | null | undefined;
}): Promise<boolean> {
  if (completing) return false;
  const pending = await readPending();
  if (!pending) return false;

  const schoolId = opts.schoolId?.trim() || null;
  const studentId = opts.studentId?.trim() || null;

  if (!schoolId || !studentId) {
    showWebsiteLoginOverlay('Kontrollerer din Lectio-login…');
    return false;
  }

  completing = true;
  showWebsiteLoginOverlay('Logger dig ind på BetterLectio…');

  try {
    await ensureSupabaseSession(schoolId, 'website-login', studentId);

    const session = await getSupabaseSessionMeta();
    if (!session) {
      showWebsiteLoginOverlay(mintErrorMessage('not_signed_in'));
      completing = false;
      return false;
    }

    const resp = (await browser.runtime.sendMessage({
      type: 'bl-sb:auth:mint-website-otp',
    })) as { ok: true; token_hash: string } | { ok: false; error?: string };

    if (!resp?.ok || !('token_hash' in resp) || !resp.token_hash) {
      showWebsiteLoginOverlay(
        mintErrorMessage(resp && 'error' in resp ? resp.error : undefined),
      );
      completing = false;
      return false;
    }

    const callback = new URL(`${WEBSITE_ORIGIN}/auth/callback`);
    callback.searchParams.set('token_hash', resp.token_hash);
    callback.searchParams.set('type', 'magiclink');
    callback.searchParams.set('state', pending.state);
    // Navigate first so a failed assign doesn't burn the pending state.
    window.location.assign(callback.toString());
    await clearPending();
    return true;
  } catch (err) {
    console.error('[website-login] complete failed', err);
    showWebsiteLoginOverlay(mintErrorMessage(undefined));
    completing = false;
    return false;
  }
}

/** Capture URL intent (awaited), then try to complete. */
export async function captureAndBootWebsiteLogin(opts: {
  schoolId: string | null | undefined;
  studentId: string | null | undefined;
}): Promise<void> {
  await captureWebsiteLoginFromUrl();
  await maybeCompleteWebsiteLogin(opts);
}

/** Capture URL intent (if any) and try to complete. Safe to call often. */
export function bootWebsiteLogin(opts: {
  schoolId: string | null | undefined;
  studentId: string | null | undefined;
}): void {
  void captureAndBootWebsiteLogin(opts);
}
