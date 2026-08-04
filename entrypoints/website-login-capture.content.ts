// Zero-dependency capture at document_start.
// If this log never appears, content scripts are not injecting in this tab
// (common for leftover named popup windows from window.open(..., "bl-login")).

const SESSION_KEY = 'bl-website-login-pending';
const STATE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function showLoginScreen(): void {
  if (document.getElementById('bl-website-login-overlay')) return;

  const style = document.createElement('style');
  style.id = 'bl-website-login-overlay-style';
  style.textContent = `
    @keyframes bl-login-spin { to { transform: rotate(360deg) } }
    #bl-website-login-overlay {
      position: fixed; inset: 0; z-index: 2147483647;
      display: flex; align-items: center; justify-content: center;
      background: #fff; color: #111827;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #bl-website-login-overlay .bl-login-content {
      display: flex; flex-direction: column; align-items: center; gap: 18px;
      padding: 32px; text-align: center;
    }
    #bl-website-login-overlay .bl-login-brand {
      font-size: 20px; font-weight: 800; letter-spacing: -0.03em;
    }
    #bl-website-login-overlay .bl-login-spinner {
      width: 30px; height: 30px; border-radius: 999px;
      border: 3px solid #e5e7eb; border-top-color: #111827;
      animation: bl-login-spin .7s linear infinite;
    }
    #bl-website-login-overlay [data-bl-login-label] {
      font-size: 15px; font-weight: 600; color: #4b5563;
    }
  `;

  const overlay = document.createElement('div');
  overlay.id = 'bl-website-login-overlay';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML = `
    <div class="bl-login-content">
      <div class="bl-login-brand">BetterLectio</div>
      <div class="bl-login-spinner" aria-hidden="true"></div>
      <div data-bl-login-label>Logger dig ind…</div>
    </div>
  `;
  document.documentElement.append(style, overlay);
}

export default defineContentScript({
  matches: ['*://*.lectio.dk/*'],
  runAt: 'document_start',
  main() {
    const href = window.location.href;
    console.log('[BetterLectio] capture@start', href);

    const state = new URLSearchParams(window.location.search).get('bl_login');
    let pendingState = state;
    let pendingCreatedAt = Date.now();
    if (!pendingState || !STATE_RE.test(pendingState)) {
      try {
        const pending = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as {
          state?: string;
          createdAt?: number;
        } | null;
        if (
          pending?.state &&
          STATE_RE.test(pending.state) &&
          typeof pending.createdAt === 'number' &&
          Date.now() - pending.createdAt < 5 * 60 * 1000
        ) {
          pendingState = pending.state;
          pendingCreatedAt = pending.createdAt;
        }
      } catch {
        // Ignore invalid session state.
      }
    }
    if (!pendingState || !STATE_RE.test(pendingState)) return;

    // Cover irrelevant Lectio chrome before it paints. If Lectio genuinely
    // needs credentials/UniLogin, that authentication UI must remain usable.
    const isActualLoginPage =
      /\/lectio\/\d+\/login\.aspx$/i.test(window.location.pathname) ||
      /\/lectio\/integration\//i.test(window.location.pathname);
    if (!isActualLoginPage) {
      showLoginScreen();
    }

    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ state: pendingState, createdAt: pendingCreatedAt }),
      );
    } catch {
      // Private mode / quota.
    }

    // Strip synchronously so a later Lectio redirect cannot drop the intent
    // before async storage / other scripts run.
    try {
      const url = new URL(href);
      url.searchParams.delete('bl_login');
      window.history.replaceState(null, '', url.toString());
    } catch {
      // Non-critical.
    }

    console.log('[BetterLectio] captured bl_login', pendingState.slice(0, 8) + '…');
  },
});
