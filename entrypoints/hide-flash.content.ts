// This script runs at document_start to hide the page before it renders
// CSS is imported and registered in manifest for earliest possible injection
// JS handles prerender coordination, login page detection, and CSS layer wrapping

import '@/styles/hide-flash.css';

const LOGIN_STATE_KEY = 'il-login-state';
const SETTINGS_KEY = 'il-feature-settings';

/**
 * Intercept Lectio's CSS and wrap it in @layer lectio { }.
 *
 * This puts ALL of Lectio's styles into a low-priority CSS cascade layer,
 * so our extension's CSS (in higher layers or un-layered) automatically wins
 * without needing !important on every declaration.
 *
 * The layer order becomes: lectio < theme < base < components < utilities
 */
function interceptLectioCSS() {
  let bundleHandled = false;

  function processNode(node: Node): void {
    // Handle <link> for lectio-css.bundle.css
    if (
      node instanceof HTMLLinkElement &&
      node.rel === 'stylesheet' &&
      node.href &&
      node.href.includes('lectio-css.bundle.css')
    ) {
      if (bundleHandled) return;
      bundleHandled = true;

      const href = node.href; // Already absolute
      // Disable original <link> so its styles don't apply un-layered
      node.media = 'not all';
      // Re-import the same URL wrapped in @layer lectio
      const layered = document.createElement('style');
      layered.setAttribute('data-il-layered', 'bundle');
      layered.textContent = `@import url("${href}") layer(lectio);`;
      node.parentNode?.insertBefore(layered, node.nextSibling);
      return;
    }

    // Handle inline <style> tags containing Lectio CSS
    if (
      node instanceof HTMLStyleElement &&
      !node.hasAttribute('data-il-layered') &&
      node.textContent
    ) {
      const text = node.textContent;
      // Detect Lectio-specific patterns
      if (
        text.includes('.ls-') ||
        text.includes('ls-font-icons') ||
        text.includes('lectioTab')
      ) {
        node.textContent = `@layer lectio { ${text} }`;
        node.setAttribute('data-il-layered', 'inline');
      }
    }
  }

  // Process any nodes already in the head
  const head = document.head || document.documentElement;
  head.querySelectorAll('link[rel="stylesheet"], style').forEach(processNode);

  // Watch for nodes added as the HTML parser continues
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        processNode(node);
        // Also check children (e.g. if a <head> fragment is inserted)
        if (node instanceof Element) {
          node.querySelectorAll('link[rel="stylesheet"], style').forEach(processNode);
        }
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Clean up observer once the page has fully loaded
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => observer.disconnect(), 200);
  });
}

function isFoucPreventionEnabled(): boolean {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return true; // Default to enabled
    const settings = JSON.parse(stored);
    // Navigate to visual.foucPrevention, default to true
    return settings?.visual?.foucPrevention ?? true;
  } catch {
    return true; // Default to enabled on error
  }
}

interface LoginState {
  isLoggedIn: boolean;
  schoolId: string | null;
  lastChecked: number;
}

function getCachedLoginState(): LoginState | null {
  try {
    const stored = localStorage.getItem(LOGIN_STATE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore errors
  }
  return null;
}

function isLoginPage(): boolean {
  const path = window.location.pathname;
  const host = window.location.host;

  // Main lectio.dk homepage
  if (host === 'www.lectio.dk' && (path === '/' || path === '/index.html')) {
    return true;
  }

  // Login list pages
  if (path.includes('login_list.aspx')) {
    return true;
  }

  // Session expired login page (e.g. /lectio/94/login.aspx)
  if (/\/lectio\/\d+\/login\.aspx/.test(path)) {
    return true;
  }

  return false;
}

export default defineContentScript({
  matches: ['*://*.lectio.dk/*'],
  runAt: 'document_start',
  main() {
    // Intercept Lectio CSS and wrap in @layer lectio — runs on ALL pages
    // (including login/print) so Lectio's styles never pollute our cascade
    interceptLectioCSS();

    // Skip for print pages - reveal immediately
    if (window.location.pathname.includes('print.aspx')) {
      document.documentElement.classList.add('il-ready');
      return;
    }

    // Skip for login pages - they have their own UI, don't hide
    if (isLoginPage()) {
      document.documentElement.classList.add('il-ready');
      return;
    }

    // Check if FOUC prevention is disabled in settings
    if (!isFoucPreventionEnabled()) {
      document.documentElement.classList.add('il-ready');
      return;
    }

    // Check cached login state - if we know user was logged out, don't hide
    const loginState = getCachedLoginState();
    if (loginState && !loginState.isLoggedIn) {
      document.documentElement.classList.add('il-ready');
      return;
    }

    // For prerendered pages: mark as prerendered for instant reveal (no transition)
    // @ts-ignore - document.prerendering is a newer API
    if (document.prerendering) {
      (window as any).__IL_PRERENDERED__ = true;
      document.documentElement.classList.add('il-prerendered');
      return;
    }

    // Page will be hidden by CSS until content.tsx adds .il-ready after rendering sidebar
  },
});
