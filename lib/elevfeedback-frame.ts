/** Survives iframe navigations (Rediger/Gem/Nyt postbacks). */
export const ELEVFEEDBACK_FRAME_NAME = "bl-elevfeedback-editor";

const FRAME_STYLE_ID = "bl-elevfeedback-frame";

export type ElevfeedbackFrameState =
  | "loading"
  | "edit"
  | "view"
  | "session-expired"
  | "unexpected";

/**
 * Lectio chrome that must not appear in the editor overlay.
 * Keep #aspnetForm, hidden fields, the LC editor island, and CKEditor dialogs.
 */
const FRAME_CHROME_SELECTORS = [
  "#modalBackgroundID",
  "#mobilMereSheetMenu",
  "form#search",
  'header[role="banner"]',
  "#s_m_mastermenu",
  "#s_m_helptipDiv",
  "#s_m_ctl17_helptipwrap",
  ".helptip-wrap",
  "#s_m_HeaderContent_subnav_div",
  ".ls-master-pageheader",
  "#s_m_MobilMenuNav",
  "#quickNavigateDiv",
  "#s_m_masterFooter",
  "footer.ls-master-footer",
  ".lectioTabToolbar",
  ".lectioTabFooter",
  ".ls-tocContainer-outer",
  ".nb_type_information",
  ".ls-paper-header",
  "#s_m_Content_Content_entityNavDiv",
  "#s_m_Content_Content_holdNavDiv",
  "nav.ls-std-toolbar-filled",
  "#contenttable > .ls-std-rowblock",
  "#s_m_Content_Content_BtnRowUP",
  ".hiddenButtons",
  "#s_m_HeaderContent_HeaderPageFunctionsDiv",
  ".toggleTocElementImg",
];

const KEEP_SIBLING_SELECTOR = [
  "script",
  "style",
  "link",
  "noscript",
  ".aspNetHidden",
  "input[type='hidden']",
  ".cke",
  ".cke_dialog",
  ".cke_dialog_background_cover",
  ".cke_panel",
  ".cke_reset_all",
  ".ls-alertbox",
  "#lectioalerts",
  "[role='alert']",
  "dialog",
  "#bl-elevfeedback-nyt",
].join(", ");

const FRAME_CHROME_CSS = `
  html.bl-elevfeedback-frame #modalBackgroundID,
  html.bl-elevfeedback-frame #mobilMereSheetMenu,
  html.bl-elevfeedback-frame form#search,
  html.bl-elevfeedback-frame header[role="banner"],
  html.bl-elevfeedback-frame #s_m_mastermenu,
  html.bl-elevfeedback-frame .lectioToolbar,
  html.bl-elevfeedback-frame #s_m_helptipDiv,
  html.bl-elevfeedback-frame .helptip-wrap,
  html.bl-elevfeedback-frame #s_m_HeaderContent_subnav_div,
  html.bl-elevfeedback-frame .ls-master-pageheader,
  html.bl-elevfeedback-frame #s_m_MobilMenuNav,
  html.bl-elevfeedback-frame #quickNavigateDiv,
  html.bl-elevfeedback-frame #s_m_masterFooter,
  html.bl-elevfeedback-frame footer.ls-master-footer,
  html.bl-elevfeedback-frame .lectioTabToolbar,
  html.bl-elevfeedback-frame .lectioTabFooter,
  html.bl-elevfeedback-frame .ls-tocContainer-outer,
  html.bl-elevfeedback-frame .nb_type_information,
  html.bl-elevfeedback-frame .ls-paper-header,
  html.bl-elevfeedback-frame #s_m_Content_Content_entityNavDiv,
  html.bl-elevfeedback-frame #s_m_Content_Content_holdNavDiv,
  html.bl-elevfeedback-frame nav.ls-std-toolbar-filled,
  html.bl-elevfeedback-frame #contenttable > .ls-std-rowblock,
  html.bl-elevfeedback-frame #s_m_Content_Content_BtnRowUP,
  html.bl-elevfeedback-frame .hiddenButtons,
  html.bl-elevfeedback-frame #s_m_HeaderContent_HeaderPageFunctionsDiv,
  html.bl-elevfeedback-frame .ls-master-header,
  html.bl-elevfeedback-frame #s_m_masterHeaderDiv,
  html.bl-elevfeedback-frame .toggleTocElementImg,
  html.bl-elevfeedback-frame #s_m_Content_Content_Elevindhold_tocAndToolbar_toolbarMenuContainer {
    display: none !important;
    height: 0 !important;
    max-height: 0 !important;
    overflow: hidden !important;
    visibility: hidden !important;
    pointer-events: none !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
  }

  html.bl-elevfeedback-frame,
  html.bl-elevfeedback-frame body,
  html.bl-elevfeedback-frame .ls-master-container1,
  html.bl-elevfeedback-frame .ls-master-container2,
  html.bl-elevfeedback-frame #masterContent,
  html.bl-elevfeedback-frame #s_m_outerContentFrameDiv,
  html.bl-elevfeedback-frame .ls-content-container,
  html.bl-elevfeedback-frame #contenttable,
  html.bl-elevfeedback-frame #PrintAktivititetArea,
  html.bl-elevfeedback-frame .lectioTabContent,
  html.bl-elevfeedback-frame .ls-tabs4,
  html.bl-elevfeedback-frame .ls-texteditor-container,
  html.bl-elevfeedback-frame .ls-tocandcontentparent,
  html.bl-elevfeedback-frame #s_m_Content_Content_Elevindhold_tocAndToolbar_outerContentContainer,
  html.bl-elevfeedback-frame #ElevContentContainer,
  html.bl-elevfeedback-frame .ls-texteditor-paper-container {
    margin: 0 !important;
    padding: 0 !important;
    float: none !important;
    width: 100% !important;
    max-width: none !important;
    min-height: 0 !important;
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
  }

  html.bl-elevfeedback-frame body > :not(#masterContent):not(.cke):not(.cke_dialog):not(.cke_dialog_background_cover):not(.cke_panel):not(.cke_reset_all):not(.ls-alertbox):not(#lectioalerts):not([role="alert"]):not(dialog) {
    display: none !important;
  }

  html.bl-elevfeedback-frame body.masterbody {
    overflow: auto !important;
  }

  html.bl-elevfeedback-frame .ls-texteditor-toolbarOuterContainer {
    position: sticky !important;
    top: 0 !important;
    z-index: 4 !important;
  }

  html.bl-elevfeedback-frame #bl-elevfeedback-nyt {
    display: flex !important;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem 0.75rem;
    visibility: visible !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    pointer-events: auto !important;
  }

  html.bl-elevfeedback-frame #bl-elevfeedback-nyt a {
    display: inline-flex;
    min-height: 2.5rem;
    align-items: center;
    gap: 0.35rem;
    padding: 0 0.65rem;
    border-radius: 0.5rem;
    text-decoration: none;
  }

  html.bl-elevfeedback-frame.dark,
  html.bl-elevfeedback-frame.dark body {
    background: oklch(0.16 0.004 285) !important;
    color: oklch(0.93 0.003 90) !important;
  }

  html.bl-elevfeedback-frame.dark .ls-texteditor-container,
  html.bl-elevfeedback-frame.dark .ls-texteditor-toolbarOuterContainer,
  html.bl-elevfeedback-frame.dark .ls-texteditor-toolbarContainer,
  html.bl-elevfeedback-frame.dark .ls-paper,
  html.bl-elevfeedback-frame.dark .cke,
  html.bl-elevfeedback-frame.dark .cke_inner,
  html.bl-elevfeedback-frame.dark .cke_top,
  html.bl-elevfeedback-frame.dark .cke_bottom,
  html.bl-elevfeedback-frame.dark .cke_toolgroup,
  html.bl-elevfeedback-frame.dark .cke_combo_button {
    background: oklch(0.18 0.004 285) !important;
    border-color: oklch(0.28 0.006 285) !important;
    color: oklch(0.93 0.003 90) !important;
    box-shadow: none !important;
  }

  html.bl-elevfeedback-frame.dark .ls-texteditor-toolbarOuterContainer {
    border-bottom: 1px solid oklch(0.28 0.006 285) !important;
  }

  html.bl-elevfeedback-frame.dark #ElevContentContainer {
    box-sizing: border-box;
    padding: 1rem !important;
  }

  html.bl-elevfeedback-frame.dark #bl-elevfeedback-nyt {
    padding: 0 0 0.75rem !important;
  }

  html.bl-elevfeedback-frame.dark #bl-elevfeedback-nyt a {
    color: oklch(0.76 0.1 255) !important;
  }

  html.bl-elevfeedback-frame.dark #bl-elevfeedback-nyt a:hover,
  html.bl-elevfeedback-frame.dark #bl-elevfeedback-nyt a:focus-visible {
    background: oklch(0.24 0.025 260) !important;
    color: oklch(0.84 0.08 255) !important;
  }

  html.bl-elevfeedback-frame.dark .ls-paper {
    box-sizing: border-box;
    padding: 1.25rem !important;
    border: 1px solid oklch(0.28 0.006 285) !important;
    border-radius: 0.75rem !important;
  }

  html.bl-elevfeedback-frame.dark .ls-section-subgroup-heading {
    margin: 0 0 1rem !important;
    padding: 0 !important;
    background: transparent !important;
    color: oklch(0.93 0.003 90) !important;
    border: 0 !important;
    font-size: 1rem !important;
    font-weight: 600 !important;
  }

  html.bl-elevfeedback-frame.dark .cke {
    overflow: hidden !important;
    border: 1px solid oklch(0.31 0.007 285) !important;
    border-radius: 0.625rem !important;
  }

  html.bl-elevfeedback-frame.dark .cke_top,
  html.bl-elevfeedback-frame.dark .cke_bottom {
    background: oklch(0.205 0.005 285) !important;
  }

  html.bl-elevfeedback-frame.dark .cke_top {
    border-bottom: 1px solid oklch(0.31 0.007 285) !important;
  }

  html.bl-elevfeedback-frame.dark .cke_bottom {
    border-top: 1px solid oklch(0.31 0.007 285) !important;
  }

  html.bl-elevfeedback-frame.dark .cke_contents,
  html.bl-elevfeedback-frame.dark .cke_wysiwyg_frame,
  html.bl-elevfeedback-frame.dark .cke_wysiwyg_div.cke_editable {
    background: oklch(0.16 0.004 285) !important;
  }

  html.bl-elevfeedback-frame.dark .cke_wysiwyg_div.cke_editable {
    color: oklch(0.93 0.003 90) !important;
    caret-color: oklch(0.93 0.003 90) !important;
    color-scheme: dark;
  }

  html.bl-elevfeedback-frame.dark .cke_wysiwyg_div.cke_editable [data-lc-display-placeholder-text] {
    color: oklch(0.67 0.004 90) !important;
  }

  html.bl-elevfeedback-frame.dark .cke_wysiwyg_div.cke_editable [style*="color: black" i],
  html.bl-elevfeedback-frame.dark .cke_wysiwyg_div.cke_editable [style*="color:black" i],
  html.bl-elevfeedback-frame.dark .cke_wysiwyg_div.cke_editable [style*="color: #000" i],
  html.bl-elevfeedback-frame.dark .cke_wysiwyg_div.cke_editable [style*="color:#000" i],
  html.bl-elevfeedback-frame.dark .cke_wysiwyg_div.cke_editable [style*="color: rgb(0, 0, 0)" i],
  html.bl-elevfeedback-frame.dark .cke_wysiwyg_div.cke_editable [style*="color:rgb(0, 0, 0)" i],
  html.bl-elevfeedback-frame.dark .cke_wysiwyg_div.cke_editable font[color="black" i],
  html.bl-elevfeedback-frame.dark .cke_wysiwyg_div.cke_editable font[color="#000" i],
  html.bl-elevfeedback-frame.dark .cke_wysiwyg_div.cke_editable font[color="#000000" i] {
    color: inherit !important;
  }

  html.bl-elevfeedback-frame.dark .cke_button:hover,
  html.bl-elevfeedback-frame.dark .cke_button:focus,
  html.bl-elevfeedback-frame.dark .cke_button_on,
  html.bl-elevfeedback-frame.dark .cke_combo_button:hover,
  html.bl-elevfeedback-frame.dark .cke_combo_button:focus {
    background: oklch(0.27 0.008 285) !important;
  }

  html.bl-elevfeedback-frame.dark .cke_button_icon {
    filter: invert(1) hue-rotate(180deg);
    opacity: 0.82;
  }

  html.bl-elevfeedback-frame.dark .cke_button_disabled .cke_button_icon {
    opacity: 0.32;
  }

  html.bl-elevfeedback-frame.dark .cke_button_label,
  html.bl-elevfeedback-frame.dark .cke_combo_text,
  html.bl-elevfeedback-frame.dark .cke_path_item,
  html.bl-elevfeedback-frame.dark .cke_resizer {
    color: oklch(0.83 0.004 90) !important;
  }

  html.bl-elevfeedback-frame.dark .cke_toolbar_separator,
  html.bl-elevfeedback-frame.dark .cke_combo_separator {
    background-color: oklch(0.36 0.007 285) !important;
    border-color: oklch(0.36 0.007 285) !important;
  }

  html.bl-elevfeedback-frame.dark .cke_combo_arrow {
    border-top-color: oklch(0.75 0.004 90) !important;
  }
`;

function isProtectedChrome(el: Element): boolean {
  return !!el.closest(
    ".cke, .cke_dialog, .cke_dialog_background_cover, .cke_panel, .cke_reset_all, .ls-alertbox, #lectioalerts, [role='alert'], dialog, #bl-elevfeedback-nyt",
  );
}

export function relocateElevfeedbackNytButtons(doc: Document): void {
  if (doc.getElementById("bl-elevfeedback-nyt")) return;
  const buttons = doc.querySelectorAll<HTMLElement>("[id$='NytElevindholdBtn']");
  if (buttons.length === 0) return;

  const host =
    doc.querySelector<HTMLElement>("#ElevContentContainer") ||
    doc.querySelector<HTMLElement>(".ls-texteditor-container");
  if (!host) return;

  const bar = doc.createElement("div");
  bar.id = "bl-elevfeedback-nyt";
  buttons.forEach((button) => {
    const wrap = button.closest(".nowrap") || button.parentElement;
    if (wrap) bar.appendChild(wrap);
  });
  if (bar.childElementCount > 0) host.prepend(bar);
}

export function hideElevfeedbackChrome(doc: Document): void {
  for (const selector of FRAME_CHROME_SELECTORS) {
    doc.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      if (isProtectedChrome(el)) return;
      el.style.setProperty("display", "none", "important");
      el.setAttribute("aria-hidden", "true");
    });
  }
}

/** Hide every sibling from the editor island up to <html>, keeping scripts/hidden fields/CKEditor. */
export function hideSiblingsOfElevfeedbackIsland(doc: Document): void {
  const island = doc.querySelector<HTMLElement>(".ls-texteditor-container");
  if (!island) return;

  let node: HTMLElement | null = island;
  while (node && node !== doc.body && node !== doc.documentElement) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent || parent === doc.documentElement) break;
    for (const sibling of Array.from(parent.children)) {
      if (sibling === node || sibling.nodeType !== 1) continue;
      const htmlSibling = sibling as HTMLElement;
      if (htmlSibling.matches(KEEP_SIBLING_SELECTOR) || isProtectedChrome(htmlSibling)) continue;
      htmlSibling.style.setProperty("display", "none", "important");
      htmlSibling.setAttribute("aria-hidden", "true");
    }
    node = parent;
  }
}

export function injectElevfeedbackFrameStyles(doc: Document, dark: boolean): void {
  doc.documentElement.classList.add("bl-elevfeedback-frame");
  if (dark) doc.documentElement.classList.add("dark");
  else doc.documentElement.classList.remove("dark");

  let style = doc.getElementById(FRAME_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement("style");
    style.id = FRAME_STYLE_ID;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
  // This function is called from a MutationObserver at document_start. Avoid
  // replacing the style's text node on every pass: doing so emits another
  // childList mutation and used to keep the iframe in a permanent rAF loop.
  if (style.textContent !== FRAME_CHROME_CSS) {
    style.textContent = FRAME_CHROME_CSS;
  }
}

export function getElevfeedbackFrameState(doc: Document): ElevfeedbackFrameState {
  const hasEditor = !!doc.querySelector("textarea[lectio-role='editor-textarea']");
  if (hasEditor) return "edit";

  const hasElevfeedbackRoot =
    !!doc.querySelector("#ElevContentContainer") ||
    !!doc.querySelector("[id*='Elevindhold']") ||
    !!doc.querySelector(".ls-texteditor-container");
  const hasEditButton = !!doc.querySelector(
    "#s_m_Content_Content_Elevindhold_tocAndToolbar_editModeBtn, [id$='_editModeBtn']",
  );
  if (hasEditButton || hasElevfeedbackRoot) return "view";

  const hasLogin = !!doc.querySelector(
    "input[type='password'], form[action*='login'], [id*='Login'][id*='username'], [id*='Login'][id*='password']",
  );
  if (hasLogin || /log\s*ind|login/i.test(doc.title)) return "session-expired";

  if (doc.readyState === "loading" && !doc.body?.childElementCount) return "loading";
  return "unexpected";
}

/** Hide Lectio chrome and keep the LC/CKEditor island. Safe to call on every load. */
export function prepareElevfeedbackIframeDocument(doc: Document, dark: boolean): void {
  injectElevfeedbackFrameStyles(doc, dark);
  relocateElevfeedbackNytButtons(doc);
  hideElevfeedbackChrome(doc);
  hideSiblingsOfElevfeedbackIsland(doc);
}

export function parentPrefersDark(): boolean {
  try {
    return window.parent.document.documentElement.classList.contains("dark");
  } catch {
    return false;
  }
}
