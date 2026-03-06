// ── Shared hidden iframe POST utility ───────────────────────────────────
//
// Submits a form via a hidden iframe to perform ASP.NET postbacks without
// reloading the page. The iframe receives the server response, which we
// parse back into a Document for further processing.

const DEFAULT_TIMEOUT_MS = 45_000;

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
        const html = iframe.contentDocument?.documentElement?.outerHTML;
        if (!html) throw new Error('No response HTML');
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
  if (form) {
    form.querySelectorAll<HTMLInputElement>('input[type="hidden"][name]').forEach((input) => {
      const name = input.name?.trim();
      if (!name) return;
      tokens[name] = input.value ?? '';
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

  // Also check for the login page's school selector
  if (doc.querySelector('#m_Content_schoolkode')) return true;

  // No main content area = likely login redirect
  const mainContent = doc.querySelector('[id*="Content_Content"]');
  if (!mainContent && !doc.querySelector('.ls-master-header')) return true;

  return false;
}
