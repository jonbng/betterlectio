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
 */
export function initUserJotWidget(): void {
  if (document.getElementById(USERJOT_BOOTSTRAP_SCRIPT_ID)) {
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
