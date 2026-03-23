// Suppresses Lectio's session timeout dialogs and proactively renews the session.
// Lets SessionHelper run normally — only intercepts the DOM dialogs it creates.

function getSchoolId(): string | null {
  const cookieMatch = document.cookie.match(/BaseSchoolUrl=(\d+)/);
  if (cookieMatch) return cookieMatch[1];

  const urlMatch = window.location.pathname.match(/\/lectio\/(\d+)\//);
  if (urlMatch) return urlMatch[1];

  return null;
}

let renewInFlight: Promise<boolean> | null = null;

function getLastAuthenticatedPageLoadValue(): number | null {
  const match = document.cookie.match(/LastAuthenticatedPageLoad2=(\d+)/);
  if (!match) return null;

  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
}

function wasSessionRenewed(previousValue: number | null): boolean {
  const nextValue = getLastAuthenticatedPageLoadValue();
  if (nextValue === null) return false;
  if (previousValue === null) return true;
  return nextValue > previousValue;
}

function setDialogHidden(dialog: HTMLElement, hidden: boolean) {
  dialog.style.visibility = hidden ? 'hidden' : '';
  dialog.style.pointerEvents = hidden ? 'none' : '';
}

function clickElement(element: HTMLElement) {
  element.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
    }),
  );
}

async function renewSession(): Promise<boolean> {
  if (renewInFlight) return renewInFlight;

  const schoolId = getSchoolId();
  if (!schoolId) return false;

  renewInFlight = (async () => {
    let timer: number | null = null;
    try {
      const pingUrl = new URL(`/lectio/${schoolId}/ping.aspx`, window.location.origin);
      pingUrl.searchParams.set('_ilts', String(Date.now()));

      const ctrl = new AbortController();
      timer = window.setTimeout(() => ctrl.abort(), 8_000);

      const response = await fetch(pingUrl.href, {
        credentials: 'include',
        cache: 'no-store',
        signal: ctrl.signal,
      });

      // Treat redirects to login as renewal failure.
      return response.ok && !response.url.includes('/login.aspx');
    } catch {
      return false;
    } finally {
      if (timer !== null) window.clearTimeout(timer);
      renewInFlight = null;
    }
  })();

  return renewInFlight;
}

export default defineContentScript({
  matches: ['*://*.lectio.dk/*'],
  runAt: 'document_start',
  world: 'MAIN',

  main() {
    const isSessionDialog = (dialog: HTMLElement): boolean => {
      const text = (dialog.textContent || '').replace(/\s+/g, ' ').trim();
      return (
        text.includes('Din session udløber snart') ||
        text.includes('Klik herunder for at forlænge sessionen') ||
        text.includes('Din session er udløbet') ||
        text.includes('Klik herunder for at genindlæse siden') ||
        text.includes('Sessionsudløb') ||
        text.includes('Session udløbet')
      );
    };

    const handleDialog = (dialog: HTMLElement) => {
      if (!isSessionDialog(dialog)) return;

      const text = (dialog.textContent || '').replace(/\s+/g, ' ').trim();

      if (text.includes('Din session udløber snart')) {
        const dialogEl = dialog;
        if (dialogEl.dataset.ilRenewHandled === '1') return;
        dialogEl.dataset.ilRenewHandled = '1';
        setDialogHidden(dialogEl, true);

        const previousAuth = getLastAuthenticatedPageLoadValue();

        const renewButton = Array.from(dialog.querySelectorAll('button')).find((button) =>
          /forlæng session/i.test(button.textContent || ''),
        ) as HTMLButtonElement | undefined;

        if (renewButton) clickElement(renewButton);

        window.setTimeout(() => {
          if (!dialogEl.isConnected) return;

          const renewedByNativeHandler = wasSessionRenewed(previousAuth);
          if (renewedByNativeHandler) {
            dialog.remove();
            console.log('[BetterLectio] Session warning auto-confirmed');
            return;
          }

          renewSession().then((renewed) => {
            const didRenew = renewed || wasSessionRenewed(previousAuth);
            if (didRenew) {
              dialog.remove();
              console.log('[BetterLectio] Session warning suppressed after successful renewal');
            } else {
              dialogEl.dataset.ilRenewHandled = '0';
              setDialogHidden(dialogEl, false);
              console.warn('[BetterLectio] Session renewal failed; keeping warning dialog');
            }
          });
        }, 750);

        return;
      }

      if (text.includes('Din session er udløbet')) {
        dialog.remove();
        console.log('[BetterLectio] Session timeout suppressed, reloading');
        location.reload();
      }
    };

    const scanDialogs = (root: ParentNode) => {
      root.querySelectorAll?.('.ui-dialog').forEach((dialog) => {
        if (dialog instanceof HTMLElement) handleDialog(dialog);
      });

      if (root instanceof HTMLElement && root.classList.contains('ui-dialog')) {
        handleDialog(root);
      }
    };

    // Popup suppression: watch for jQuery UI dialogs SessionHelper appends to body
    const setupObserver = () => {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            for (const node of mutation.addedNodes) {
              if (node instanceof HTMLElement) scanDialogs(node);
            }
            continue;
          }

          if (
            mutation.type === 'attributes' &&
            mutation.target instanceof HTMLElement &&
            mutation.target.classList.contains('ui-dialog')
          ) {
            handleDialog(mutation.target);
          }
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'aria-hidden'],
      });

      scanDialogs(document.body);
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
        renewSession().then((renewed) => {
          if (renewed) {
            console.log('[BetterLectio] Proactive session renewal triggered');
          } else {
            console.warn('[BetterLectio] Proactive renewal attempted but not confirmed');
          }
        });
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
