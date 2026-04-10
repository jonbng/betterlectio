// Detects Lectio's native error popup.
//
// Lectio renders errors via LectioAlertBox.RegisterAlerts (see
// lectio-scripts/LectioAlertBox.ts). The server embeds markup like:
//
//   <div id="lectioalerts" style="display:none;">
//     <div data-title="Fejl: Der opstod en fejl"><h1>…</h1>body</div>
//   </div>
//
// On DOM ready, LectioAlertBox wraps each child in a jQuery UI .ui-dialog and
// appends it to #aspnetForm. Either way, the content div keeps its
// `data-title` attribute — that's the signature we watch for.
//
// When this popup shows up it usually means something in Lectio's postback /
// ASP.NET request failed, and in practice the most common cause is our
// extension messing with the DOM or tampering with a form. We want to capture
// every occurrence with as much context as possible so we can fix it.

const MARK_ATTR = 'data-bl-error-reported';

export interface LectioErrorPayload {
  title: string;
  body: string;
  dialogHtml: string;
}

type ErrorHandler = (payload: LectioErrorPayload) => void;

function normalizeText(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function extractError(contentEl: Element): LectioErrorPayload | null {
  const title = contentEl.getAttribute('data-title') ?? '';
  if (!/^Fejl/i.test(title)) return null;

  // Ignore session dialogs (handled by session-renew content script). They
  // shouldn't start with "Fejl" but guard anyway.
  const bodyText = normalizeText(contentEl);
  if (/Din session/i.test(bodyText)) return null;

  return {
    title: title.slice(0, 300),
    body: bodyText.slice(0, 2000),
    dialogHtml: (contentEl as HTMLElement).innerHTML.slice(0, 4000),
  };
}

function maybeReport(node: Element, onError: ErrorHandler): void {
  if (node.hasAttribute(MARK_ATTR)) return;

  const payload = extractError(node);
  if (!payload) return;

  node.setAttribute(MARK_ATTR, '1');
  try {
    onError(payload);
  } catch {
    // Never let reporting errors cascade
  }
}

function scanTree(root: ParentNode, onError: ErrorHandler): void {
  if (root instanceof Element && root.hasAttribute('data-title')) {
    maybeReport(root, onError);
  }
  root.querySelectorAll?.('[data-title]').forEach((el) => maybeReport(el, onError));
}

export function installLectioErrorDetector(onError: ErrorHandler): void {
  const run = () => {
    // Catch anything already rendered before we attached.
    scanTree(document.body, onError);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node instanceof Element) scanTree(node, onError);
          }
          continue;
        }

        if (
          mutation.type === 'attributes' &&
          mutation.target instanceof Element &&
          mutation.attributeName === 'data-title'
        ) {
          maybeReport(mutation.target, onError);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-title'],
    });
  };

  if (document.body) {
    run();
  } else {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  }
}
