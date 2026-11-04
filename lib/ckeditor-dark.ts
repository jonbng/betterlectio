const CKE_DARK_STYLE_ID = "bl-cke-dark";

export const CKE_DARK_CSS = `
  html,
  html body,
  html body.cke_editable {
    background-color: oklch(0.16 0.004 285) !important;
    background-image: none !important;
    color: oklch(0.93 0.003 90) !important;
    caret-color: oklch(0.93 0.003 90) !important;
  }
  html body.cke_editable {
    color-scheme: dark;
  }
  body a { color: oklch(0.76 0.1 255) !important; }
  body [style*="color: black" i],
  body [style*="color:black" i],
  body [style*="color: #000" i],
  body [style*="color:#000" i],
  body [style*="color: rgb(0, 0, 0)" i],
  body [style*="color:rgb(0, 0, 0)" i],
  body font[color="black" i],
  body font[color="#000" i],
  body font[color="#000000" i] {
    color: inherit !important;
  }
  ::selection { background: oklch(0.48 0.13 260 / 0.55); }
`;

function injectIntoEditor(iframe: HTMLIFrameElement): void {
  try {
    const doc = iframe.contentDocument;
    if (!doc || doc.getElementById(CKE_DARK_STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = CKE_DARK_STYLE_ID;
    style.textContent = CKE_DARK_CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
  } catch {
    /* cross-origin — ignore */
  }
}

function scanEditorIframes(root: ParentNode): void {
  root.querySelectorAll<HTMLIFrameElement>(".cke_wysiwyg_frame").forEach((iframe) => {
    if (iframe.contentDocument?.getElementById(CKE_DARK_STYLE_ID)) return;
    iframe.addEventListener("load", () => injectIntoEditor(iframe), { once: true });
    injectIntoEditor(iframe);
  });
}

/**
 * Inject dark-mode styles into CKEditor wysiwyg iframes under `root`.
 * Returns a MutationObserver that the caller must disconnect.
 */
export function watchCKEditorDarkMode(root: ParentNode): MutationObserver {
  const observer = new MutationObserver(() => scanEditorIframes(root));
  observer.observe(root instanceof Document ? root.body ?? root.documentElement : root, {
    childList: true,
    subtree: true,
  });
  scanEditorIframes(root);
  return observer;
}
