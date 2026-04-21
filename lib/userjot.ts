const USERJOT_PROJECT_ID = "cmmj6ivyp03re0ink6haequ8z";
const USERJOT_SDK_PATH = "/vendor/userjot/cdn.userjot.com/sdk/v2/uj.js";
const USERJOT_BOOTSTRAP_SCRIPT_ID = "il-userjot-bootstrap";
const USERJOT_IDENTIFY_EVENT = "betterlectio:userjot-identify";
const USERJOT_SET_THEME_EVENT = "betterlectio:userjot-set-theme";

export type UserJotTheme = "light" | "dark";

export interface UserJotIdentifyPayload {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
}

/**
 * Injects UserJot in page context so the widget works
 * from extension content scripts in all supported browsers.
 *
 * Uses an external script file (public/userjot-bootstrap.js) instead of
 * inline script.textContent to comply with Chrome MV3 CSP.
 *
 * The bootstrap script runs in the page's main world, while this module
 * runs in the extension's isolated world. They cannot share JS globals
 * (different `window` bindings), so any data needed at bootstrap time must
 * travel through the shared DOM — in this case `<script dataset>` and
 * CustomEvents dispatched on `window`.
 */
export function initUserJotWidget(initialIdentify?: UserJotIdentifyPayload): void {
  const existing = document.getElementById(USERJOT_BOOTSTRAP_SCRIPT_ID);
  if (existing) {
    // Already bootstrapped — fall through to the event path if a payload was given.
    if (initialIdentify && initialIdentify.id.trim()) {
      identifyUserJot(initialIdentify);
    }
    return;
  }

  const theme = document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";

  const script = document.createElement("script");
  script.id = USERJOT_BOOTSTRAP_SCRIPT_ID;
  script.src = browser.runtime.getURL("/userjot-bootstrap.js");
  script.dataset.projectId = USERJOT_PROJECT_ID;
  script.dataset.sdkUrl = browser.runtime.getURL(USERJOT_SDK_PATH);
  script.dataset.theme = theme;
  script.dataset.identifyEvent = USERJOT_IDENTIFY_EVENT;
  script.dataset.setThemeEvent = USERJOT_SET_THEME_EVENT;

  // Pass the initial identify payload through the DOM — it's the only
  // channel reliably shared between isolated and main worlds at bootstrap.
  if (initialIdentify && initialIdentify.id.trim()) {
    try {
      script.dataset.initialIdentify = JSON.stringify(initialIdentify);
    } catch {
      /* ignore serialization failures */
    }
  }

  (document.documentElement || document.body).appendChild(script);
}

export function identifyUserJot(payload: UserJotIdentifyPayload): void {
  if (!payload.id.trim()) return;
  window.dispatchEvent(
    new CustomEvent<UserJotIdentifyPayload>(USERJOT_IDENTIFY_EVENT, {
      detail: payload,
    }),
  );
}

export function setUserJotTheme(theme: UserJotTheme): void {
  window.dispatchEvent(
    new CustomEvent<UserJotTheme>(USERJOT_SET_THEME_EVENT, {
      detail: theme,
    }),
  );
}
