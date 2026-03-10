const USERJOT_PROJECT_ID = "cmmj6ivyp03re0ink6haequ8z";
const USERJOT_SDK_PATH = "/vendor/userjot/cdn.userjot.com/sdk/v2/uj.js";
const USERJOT_BOOTSTRAP_SCRIPT_ID = "il-userjot-bootstrap";
const USERJOT_LOADER_SCRIPT_ID = "il-userjot-loader";
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
  script.textContent = `
    (() => {
      if (window.__IL_USERJOT_BOOTSTRAPPED__) return;
      window.__IL_USERJOT_BOOTSTRAPPED__ = true;
      window.$ujq = window.$ujq || [];
      window.uj = window.uj || new Proxy({}, {
        get: (_, method) => (...args) => window.$ujq.push([method, ...args]),
      });

      if (!document.getElementById("${USERJOT_LOADER_SCRIPT_ID}")) {
        const sdk = document.createElement("script");
        sdk.id = "${USERJOT_LOADER_SCRIPT_ID}";
        sdk.src = "${browser.runtime.getURL(USERJOT_SDK_PATH)}";
        sdk.type = "module";
        sdk.async = true;
        document.head.appendChild(sdk);
      }

      window.uj.init("${USERJOT_PROJECT_ID}", {
        widget: true,
        position: "right",
        theme: "${theme}",
      });

      window.addEventListener("${USERJOT_IDENTIFY_EVENT}", (event) => {
        const payload = event?.detail;
        if (!payload || typeof payload.id !== "string" || !payload.id.trim()) {
          return;
        }
        window.uj.identify(payload);
      });

      window.addEventListener("${USERJOT_SET_THEME_EVENT}", (event) => {
        const nextTheme = event?.detail;
        if (nextTheme !== "light" && nextTheme !== "dark") {
          return;
        }
        if (typeof window.uj?.setTheme === "function") {
          window.uj.setTheme(nextTheme);
          return;
        }
        // Fallback for SDKs without setTheme API.
        window.uj.init("${USERJOT_PROJECT_ID}", {
          widget: true,
          position: "right",
          theme: nextTheme,
        });
      });
    })();
  `;

  (document.documentElement || document.body).appendChild(script);
  script.remove();
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
