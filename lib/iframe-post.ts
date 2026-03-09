// ── Shared hidden iframe POST utility ───────────────────────────────────
//
// Submits a form via a hidden iframe to perform ASP.NET postbacks without
// reloading the page. The iframe receives the server response, which we
// parse back into a Document for further processing.

const DEFAULT_TIMEOUT_MS = 45_000;
const DEBUG_IFRAME_POST = false;

/**
 * POST a form to Lectio via a hidden iframe, returning the response Document.
 * This mimics Lectio's native ASP.NET postback flow while keeping the main
 * page intact (no reload). Cookie/origin behavior is preserved because the
 * form submission originates from the same domain.
 */
export async function postFormViaHiddenIframe(
  action: string,
  fields: Record<string, string>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Document> {
  return new Promise((resolve, reject) => {
    const iframeName = `il-iframe-post-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const iframe = document.createElement('iframe');
    const form = document.createElement('form');
    let didSubmit = false;
    let sawNavigatedLoad = false;

    iframe.name = iframeName;
    iframe.style.display = 'none';

    form.method = 'POST';
    form.action = action;
    form.target = iframeName;
    form.style.display = 'none';

    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value ?? '';
      form.appendChild(input);
    }

    const cleanup = () => {
      form.remove();
      iframe.remove();
    };

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Submission timeout'));
    }, timeoutMs);

    iframe.addEventListener('load', () => {
      if (!didSubmit) return;

      try {
        const iframeDoc = iframe.contentDocument;
        if (!iframeDoc?.documentElement) throw new Error('No response HTML');
        const iframeHref = iframeDoc.location?.href || '';
        if (!sawNavigatedLoad && iframeHref.startsWith('about:blank')) {
          sawNavigatedLoad = true;
          return;
        }

        // Sync JS-set .value to HTML attributes before serializing —
        // outerHTML only captures attributes, not DOM properties set by scripts.
        iframeDoc.querySelectorAll<HTMLInputElement>('input').forEach((el) => {
          el.setAttribute('value', el.value);
        });
        iframeDoc.querySelectorAll<HTMLTextAreaElement>('textarea').forEach((el) => {
          el.textContent = el.value;
        });

        const html = iframeDoc.documentElement.outerHTML;
        clearTimeout(timeout);
        cleanup();
        const parser = new DOMParser();
        resolve(parser.parseFromString(html, 'text/html'));
      } catch (err) {
        clearTimeout(timeout);
        cleanup();
        reject(err);
      }
    });

    document.body.appendChild(iframe);
    document.body.appendChild(form);
    didSubmit = true;
    form.submit();
  });
}

/**
 * Extract all ASP.NET form tokens (hidden fields) from a Document.
 * Works on any Document (live DOM or DOMParser output).
 */
export function parseFormTokensFromDoc(doc: Document): { tokens: Record<string, string>; action: string } {
  const form = doc.getElementById('aspnetForm') as HTMLFormElement | null;
  const actionRaw = form?.getAttribute('action') || '';
  const action = actionRaw
    ? new URL(actionRaw, window.location.href).href
    : window.location.href;

  const tokens: Record<string, string> = {};
  // Search entire document for hidden inputs — ASP.NET may render __VIEWSTATE
  // outside the <form> in a sibling <div class="aspNetHidden">, and DOMParser
  // may restructure the DOM differently than the live page.
  doc.querySelectorAll<HTMLInputElement>('input[name]').forEach((input) => {
    // Only collect hidden fields (check attribute OR property for DOMParser compat)
    if (input.type !== 'hidden' && input.getAttribute('type') !== 'hidden') return;
    const name = input.name?.trim();
    if (!name) return;
    tokens[name] = input.value ?? '';
  });

  // Debug: log if ViewState is still missing after scanning
  if (DEBUG_IFRAME_POST && !('__VIEWSTATE' in tokens) && !('__VIEWSTATEX' in tokens)) {
    const vsEl = doc.querySelector('input[name="__VIEWSTATE"]') as HTMLInputElement | null;
    console.error('[BetterLectio] parseFormTokens: no ViewState found', {
      formExists: !!form,
      vsElementExists: !!vsEl,
      vsType: vsEl?.getAttribute('type'),
      vsTypeProperty: vsEl?.type,
      totalInputs: doc.querySelectorAll('input').length,
      hiddenInputs: doc.querySelectorAll('input[type="hidden"]').length,
      namedInputs: doc.querySelectorAll('input[name]').length,
    });
  }

  return { tokens, action };
}

/**
 * Check if a response Document is a session-expired login redirect.
 */
export function isSessionExpired(doc: Document): boolean {
  // Lectio redirects to login page when session expires
  const form = doc.getElementById('aspnetForm') as HTMLFormElement | null;
  const action = form?.getAttribute('action') || '';
  if (action.includes('login.aspx')) return true;

  // Also check for strong login page markers
  if (doc.querySelector('#m_Content_schoolkode, #s_m_Content_schoolkode')) return true;
  if (doc.querySelector('input[type="password"][name*="password"], input[type="password"][id*="password"]')) {
    return true;
  }

  return false;
}
