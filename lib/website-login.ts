// Website login broker: Lectio content scripts capture ?bl_login=STATE,
// persist it (Lectio strips query params on redirect), then mint a
// magic-link OTP via the background and redirect to betterlectio.dk.

const PENDING_KEY = 'bl-website-login-pending';
const PENDING_TTL_MS = 5 * 60 * 1000;
const WEBSITE_ORIGIN = 'https://betterlectio.dk';
const STATE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PendingLogin = {
  state: string;
  createdAt: number;
};

let completing = false;
let toastEl: HTMLElement | null = null;

export function captureWebsiteLoginFromUrl(): string | null {
  try {
    const state = new URLSearchParams(window.location.search).get('bl_login');
    if (!state || !STATE_RE.test(state)) return null;
    void persistPending({ state, createdAt: Date.now() });
    // Strip param so Lectio redirects don't look weird / re-trigger.
    const url = new URL(window.location.href);
    url.searchParams.delete('bl_login');
    window.history.replaceState(null, '', url.toString());
    return state;
  } catch {
    return null;
  }
}

async function persistPending(pending: PendingLogin): Promise<void> {
  try {
    await browser.storage.local.set({ [PENDING_KEY]: pending });
  } catch {
    // Non-critical.
  }
}

export async function readPending(): Promise<PendingLogin | null> {
  try {
    const row = await browser.storage.local.get(PENDING_KEY);
    const pending = row[PENDING_KEY] as PendingLogin | undefined;
    if (!pending?.state || !STATE_RE.test(pending.state)) return null;
    if (Date.now() - pending.createdAt > PENDING_TTL_MS) {
      await clearPending();
      return null;
    }
    return pending;
  } catch {
    return null;
  }
}

async function clearPending(): Promise<void> {
  try {
    await browser.storage.local.remove(PENDING_KEY);
  } catch {
    // Non-critical.
  }
}

function showToast(message: string): void {
  if (toastEl) {
    toastEl.textContent = message;
    return;
  }
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.textContent = message;
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '2147483647',
    maxWidth: 'min(420px, calc(100vw - 32px))',
    padding: '12px 18px',
    borderRadius: '14px',
    background: '#111',
    color: '#fff',
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    lineHeight: '1.4',
    boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
    textAlign: 'center',
  });
  document.documentElement.appendChild(el);
  toastEl = el;
}

function hideToast(): void {
  toastEl?.remove();
  toastEl = null;
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
    showToast('Log ind på Lectio for at fortsætte til BetterLectio…');
    return false;
  }

  completing = true;
  showToast('Logger dig ind på BetterLectio…');

  try {
    const { ensureSupabaseSession } = await import('@/lib/supabase/session');
    await ensureSupabaseSession(schoolId, 'website-login', studentId);

    const resp = (await browser.runtime.sendMessage({
      type: 'bl-sb:auth:mint-website-otp',
    })) as { ok: true; token_hash: string } | { ok: false; error?: string };

    if (!resp?.ok || !('token_hash' in resp) || !resp.token_hash) {
      showToast(
        resp && 'error' in resp && resp.error
          ? `Kunne ikke logge ind: ${resp.error}`
          : 'Kunne ikke logge ind. Prøv igen.',
      );
      completing = false;
      return false;
    }

    await clearPending();
    const callback = new URL(`${WEBSITE_ORIGIN}/auth/callback`);
    callback.searchParams.set('token_hash', resp.token_hash);
    callback.searchParams.set('type', 'magiclink');
    callback.searchParams.set('state', pending.state);
    window.location.assign(callback.toString());
    return true;
  } catch (err) {
    console.error('[website-login] complete failed', err);
    showToast('Kunne ikke logge ind. Prøv igen.');
    completing = false;
    hideToast();
    return false;
  }
}

/** Capture URL intent (if any) and try to complete. Safe to call often. */
export function bootWebsiteLogin(opts: {
  schoolId: string | null | undefined;
  studentId: string | null | undefined;
}): void {
  captureWebsiteLoginFromUrl();
  void maybeCompleteWebsiteLogin(opts);
}
