// Suppresses Lectio's session timeout dialogs and proactively renews the session.
// Lets SessionHelper run normally — only intercepts the DOM dialogs it creates.

const SETTINGS_KEY = 'il-feature-settings';

function isSessionRenewEnabled(): boolean {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return true;
    const settings = JSON.parse(stored);
    return settings?.behavior?.sessionPopupBlocker ?? true;
  } catch {
    return true;
  }
}

function getSchoolId(): string | null {
  const cookieMatch = document.cookie.match(/BaseSchoolUrl=(\d+)/);
  if (cookieMatch) return cookieMatch[1];

  const urlMatch = window.location.pathname.match(/\/lectio\/(\d+)\//);
  if (urlMatch) return urlMatch[1];

  return null;
}

function renewSession(): void {
  const schoolId = getSchoolId();
  if (!schoolId) return;

  const pingUrl = new URL(`/lectio/${schoolId}/ping.aspx`, window.location.origin).href;
  fetch(pingUrl, { credentials: 'include' }).catch(() => {});
}

export default defineContentScript({
  matches: ['*://*.lectio.dk/*'],
  runAt: 'document_start',
  world: 'MAIN',

  main() {
    if (!isSessionRenewEnabled()) return;

    // Popup suppression: watch for jQuery UI dialogs SessionHelper appends to body
    const setupObserver = () => {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (!(node instanceof HTMLElement)) continue;

            const dialog = node.classList.contains('ui-dialog')
              ? node
              : node.querySelector?.('.ui-dialog');

            if (!dialog) continue;

            const text = dialog.textContent || '';

            if (text.includes('Din session udløber snart')) {
              dialog.remove();
              renewSession();
              console.log('[BetterLectio] Session warning suppressed, renewing');
            } else if (text.includes('Din session er udløbet')) {
              dialog.remove();
              console.log('[BetterLectio] Session timeout suppressed, reloading');
              location.reload();
            }
          }
        }
      });

      observer.observe(document.body, { childList: true });
    };

    if (document.body) {
      setupObserver();
    } else {
      document.addEventListener('DOMContentLoaded', setupObserver, { once: true });
    }

    // Proactive renewal: ping before the 50-min warning threshold
    const RENEW_THRESHOLD = 45 * 60 * 1000;

    const shouldRenew = (): boolean => {
      if (document.hidden) return false;

      const match = document.cookie.match(/LastAuthenticatedPageLoad2=(\d+)/);
      if (!match) return false;

      const lastAuth = parseInt(match[1]);
      return Date.now() - lastAuth > RENEW_THRESHOLD;
    };

    const checkAndRenew = () => {
      if (shouldRenew()) {
        renewSession();
        console.log('[BetterLectio] Proactive session renewal triggered');
      }
    };

    const startProactiveRenewal = () => {
      document.addEventListener('visibilitychange', checkAndRenew);
      setInterval(checkAndRenew, 60_000);
    };

    if (document.readyState === 'complete') {
      startProactiveRenewal();
    } else {
      window.addEventListener('load', startProactiveRenewal, { once: true });
    }
  },
});
