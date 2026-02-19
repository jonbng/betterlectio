import { render } from "preact";
import { LoginPage, type School } from "@/components/LoginPage";
import { getCachedLoginState, clearLoginState } from "@/lib/profile-cache";
import { getLastSchool } from "@/lib/school-storage";
import { getSettings } from "@/lib/settings-storage";
import "@/styles/globals.css";

export default defineContentScript({
  matches: [
    "*://www.lectio.dk/",
    "*://www.lectio.dk/index.html",
    "*://www.lectio.dk/lectio/login_list.aspx*",
  ],
  runAt: "document_end",
  main() {
    console.log("[BetterLectio] Login content script loaded");
    initLoginPage();
  },
});

/**
 * Check if user is actually logged in by verifying with a request to their school.
 * Returns true if redirecting, false otherwise.
 */
async function checkAndRedirectIfLoggedIn(): Promise<boolean> {
  const loginState = getCachedLoginState();
  const lastSchool = getLastSchool();

  // If we have a recent login state (within 24 hours) and user was logged in
  if (loginState && loginState.isLoggedIn && lastSchool) {
    const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours
    const isRecent = Date.now() - loginState.lastChecked < staleThreshold;

    if (isRecent) {
      console.log(
        "[BetterLectio] Cached login state found, verifying session..."
      );

      const schoolId = lastSchool.url.match(/\/lectio\/(\d+)\//)?.[1];
      if (!schoolId) return false;

      const pingUrl = new URL(`/lectio/${schoolId}/ping.aspx`, window.location.origin).href;

      try {
        const response = await fetch(pingUrl, {
          method: 'HEAD',
          credentials: 'include',
          redirect: 'manual'
        });

        // redirect: 'manual' returns status 0 for opaque redirects, or 302 for redirects
        if (response.status !== 200) {
          console.log("[BetterLectio] Session expired, showing login page");
          clearLoginState();
          return false;
        }

        const forsideUrl = new URL(`/lectio/${schoolId}/forside.aspx`, window.location.origin).href;
        console.log(
          "[BetterLectio] Session valid, redirecting to last school:",
          lastSchool.name
        );
        window.location.href = forsideUrl;
        return true;
      } catch (err) {
        // Network error - don't clear state, just show login page
        // User can manually try to access their school
        console.log("[BetterLectio] Failed to verify session:", err);
        return false;
      }
    }
  }

  return false;
}

async function initLoginPage() {
  // Check if we're on the main page (has iframe) or the login_list page directly
  const isMainPage =
    window.location.pathname === "/" ||
    window.location.pathname === "/index.html";
  const isLoginListPage = window.location.pathname.includes("login_list.aspx");

  if (!isMainPage && !isLoginListPage) {
    console.log("[BetterLectio] Not on login page, skipping");
    return;
  }

  // Get settings
  const settings = getSettings();

  // Check if login page redesign is disabled
  if (!(settings.pages?.loginPageRedesign ?? true)) {
    console.log("[BetterLectio] Login page redesign disabled, skipping");
    return;
  }

  // Check if user is already logged in and should be redirected
  // (only if continueToLastSchool is enabled)
  if ((settings.behavior?.continueToLastSchool ?? true) && await checkAndRedirectIfLoggedIn()) {
    return; // Don't render login page, we're redirecting
  }

  let schools: School[] = [];

  if (isLoginListPage) {
    // Parse schools directly from the current page
    schools = parseSchoolsFromDOM(document);
  } else {
    // Main page - fetch the school list
    try {
      const response = await fetch(new URL("/lectio/login_list.aspx?forcemobile=1", window.location.origin).href);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      schools = parseSchoolsFromDOM(doc);
    } catch (err) {
      console.error("[BetterLectio] Failed to fetch school list:", err);
      // Try to parse from iframe if it exists
      const iframe = document.querySelector("iframe") as HTMLIFrameElement;
      if (iframe?.contentDocument) {
        schools = parseSchoolsFromDOM(iframe.contentDocument);
      }
    }
  }

  if (schools.length === 0) {
    console.error("[BetterLectio] No schools found");
    return;
  }

  console.log(`[BetterLectio] Found ${schools.length} schools`);

  // Replace the entire page with our login UI
  replacePageWithLoginUI(schools);
}

function parseSchoolsFromDOM(doc: Document): School[] {
  const schools: School[] = [];

  // Find all school links in the buttonHeader divs
  const schoolDivs = doc.querySelectorAll("#schoolsdiv .buttonHeader a");

  schoolDivs.forEach((link) => {
    const anchor = link as HTMLAnchorElement;
    const name = anchor.textContent?.trim();
    const href = anchor.getAttribute("href");

    // Skip "Vis alle skoler" link
    if (!name || !href || name.toLowerCase().includes("vis alle skoler")) {
      return;
    }

    // Extract school ID from URL like /lectio/51/default.aspx
    const match = href.match(/\/lectio\/(\d+)\//);
    if (match) {
      schools.push({
        id: match[1],
        name,
        url: href,
      });
    }
  });

  return schools;
}

function replacePageWithLoginUI(schools: School[]) {
  // Clear the body
  document.body.innerHTML = "";

  // Remove any existing stylesheets that might conflict
  const lectioStyles = document.querySelectorAll(
    'link[href*="lectio-css"], link[href*="lectio/content"]'
  );
  lectioStyles.forEach((style) => style.remove());

  // Add our wrapper class
  document.body.classList.add("il-login-page");

  // Create root container
  const root = document.createElement("div");
  root.id = "il-root";
  document.body.appendChild(root);

  // Render the login page
  render(<LoginPage schools={schools} />, root);

  // Mark page as ready (in case FOUC prevention is active)
  document.documentElement.classList.add("il-ready");

  console.log("[BetterLectio] Login page rendered");
}
