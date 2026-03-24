import { render } from "preact";
import { AppSidebar } from "@/components/AppSidebar";
import { FindSkemaPage } from "@/components/FindSkemaPage";
import { ViewingScheduleHeader } from "@/components/ViewingScheduleHeader";
import { ProfilePage } from "@/components/ProfilePage";
import { ForsideGreeting } from "@/components/ForsideGreeting";
import { MembersPage, parseMembersFromDOM } from "@/components/MembersPage";
import { LektierPage, parseLektierFromDOM } from "@/components/LektierPage";
import { OpgaverPage, parseOpgaverFromDOM, fetchAllOpgaver } from "@/components/OpgaverPage";
import { BeskederPage, parseBeskederFromDOM } from "@/components/BeskederPage";
import { newMessage } from "@/lib/beskeder-parser";
import { BeskederThreadView } from "@/components/BeskederThreadView";
import { BeskederComposePage, enhanceComposeForm } from "@/components/BeskederCompose";
import {
  isThreadViewState,
  isComposeState,
  parseThreadFromDOM,
  parseComposeFromDOM,
} from "@/lib/beskeder-thread-parser";
import { FravaerPage } from "@/components/FravaerPage";
import { fetchCombinedFravaerData } from "@/lib/fravaer-parse";
import { KaraktererPage, parseKaraktererFromDOM } from "@/components/KaraktererPage";
import { ProfilPage } from "@/components/ProfilPage";
import { parseProfilFromDOM } from "@/lib/profil-parser";
import { parseForsideOpgaver } from "@/components/ForsideOpgaverCard";
import { ForsideDashboard, parseAktuelInfo, parseLektier, parseBeskeder } from "@/components/ForsideDashboard";
import { ForsideSchedulePanel, fetchScheduleWeek } from "@/components/ForsideScheduleCard";
import { Toaster } from "@/components/ui/sonner";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { initPreloading } from "@/lib/preload";
import {
  updateProfileCache,
  updateLoginState,
  getCachedProfile,
  extractViewedEntity,
  isViewingOwnPage,
  getViewedEntityId,
} from "@/lib/profile-cache";
import { updatePageTitle, observeTitleChanges } from "@/lib/page-titles";
import { getSettings } from "@/lib/settings-storage";
import { applyThemeForSchool } from "@/lib/theme-storage";
import { loadTeacherNames, replaceTeacherInitialsInDOM } from "@/lib/teacher-cache";
import { scanDOMForHolds, replaceHoldCodesInDOM, getHoldHue, getHoldDisplayName, getFullHoldDisplayName, hasHoldMapping } from "@/lib/hold-mapping";
import { initBrickTooltips } from "@/lib/brick-tooltip";
import { initUserJotWidget, identifyUserJot, setUserJotTheme } from "@/lib/userjot";
import { ScheduleToolbar, parseScheduleToolbar } from "@/components/ScheduleToolbar";
import { captureOncePerSession, identifyIfNeeded, getDistinctId, syncOptOutToExtensionStorage } from "@/lib/posthog";
import "@/styles/globals.css";

export default defineContentScript({
  matches: ["*://*.lectio.dk/*"],
  main() {
    // Content script loaded

    // Listen for messages from background script (e.g., extension icon click)
    browser.runtime.onMessage.addListener((message) => {
      if (message.action === "openSettings") {
        window.dispatchEvent(new CustomEvent("betterlectio:openSettings"));
      }
    });

    // Wait for DOM to be ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initLayout);
    } else {
      initLayout();
    }
  },
});

function replaceFavicon() {
  // Remove existing favicons
  document
    .querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')
    .forEach((el) => {
      el.remove();
    });

  // Add our favicon
  const favicon = document.createElement("link");
  favicon.rel = "icon";
  favicon.type = "image/x-icon";
  favicon.href = browser.runtime.getURL("/assets/favicon.ico");
  document.head.appendChild(favicon);
}

function injectFont() {
  const preconnect1 = document.createElement("link");
  preconnect1.rel = "preconnect";
  preconnect1.href = "https://fonts.googleapis.com";

  const preconnect2 = document.createElement("link");
  preconnect2.rel = "preconnect";
  preconnect2.href = "https://fonts.gstatic.com";
  preconnect2.crossOrigin = "anonymous";

  const font = document.createElement("link");
  font.rel = "stylesheet";
  font.href =
    "https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap";

  document.head.append(preconnect1, preconnect2, font);
}

function DashboardLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div id="il-lectio-content" />
      </SidebarInset>
      <Toaster position="bottom-right" />
    </SidebarProvider>
  );
}

function applyDarkMode(enabled: boolean) {
  document.documentElement.classList.toggle("dark", enabled);
  setUserJotTheme(enabled ? "dark" : "light");
}

function getBrowserInfoForUserJot(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Firefox")) {
    const match = ua.match(/Firefox\/(\d+)/);
    return `Firefox ${match?.[1] ?? ""}`.trim();
  }
  if (ua.includes("Edg/")) {
    const match = ua.match(/Edg\/(\d+)/);
    return `Edge ${match?.[1] ?? ""}`.trim();
  }
  if (ua.includes("Chrome")) {
    const match = ua.match(/Chrome\/(\d+)/);
    return `Chrome ${match?.[1] ?? ""}`.trim();
  }
  if (ua.includes("Safari")) {
    const match = ua.match(/Version\/(\d+)/);
    return `Safari ${match?.[1] ?? ""}`.trim();
  }
  return "Ukendt browser";
}

function getLectioVersionForUserJot(): string {
  return (
    (document.getElementById("s_m_VersionInfoLink") ??
      document.getElementById("m_VersionInfoLink"))
      ?.textContent?.replace(/^\s*Lectio\s+version\s*/i, "")
      ?.trim() || "Ukendt Lectio-version"
  );
}

let activityModalInterceptorInstalled = false;
let masonryResizeObserver: ResizeObserver | null = null;
let masonryRelayoutHandler: (() => void) | null = null;
let timeIndicatorIntervalId: number | null = null;

function isActivityDetailUrl(url: URL): boolean {
  return /\/lectio\/\d+\/aktivitet\/aktivitetforside2\.aspx$/i.test(url.pathname);
}

function installActivityModalClickInterceptor() {
  if (activityModalInterceptorInstalled) return;
  activityModalInterceptorInstalled = true;

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      if (anchor.closest("[data-no-activity-modal]")) return;
      if (window.location.pathname.toLowerCase().includes("/aktivitet/aktivitetforside2.aspx")) {
        return;
      }

      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

      let activityUrl: URL;
      try {
        activityUrl = new URL(href, window.location.origin);
      } catch {
        return;
      }

      if (!isActivityDetailUrl(activityUrl)) return;

      event.preventDefault();
      event.stopPropagation();

      window.dispatchEvent(
        new CustomEvent("betterlectio:openActivityModal", {
          detail: { url: activityUrl.href },
        }),
      );
    },
    true,
  );
}

function initLayout() {
  // Sync analytics opt-out to extension storage so background script can read it
  try {
    const stored = localStorage.getItem('bl-feature-settings') ?? localStorage.getItem('il-feature-settings');
    const optedOut = stored ? JSON.parse(stored)?.behavior?.analyticsOptOut === true : false;
    syncOptOutToExtensionStorage(optedOut);
  } catch { /* non-critical */ }

  // If this page was prerendered and is now activating, it's already set up
  const wasPrerendered =
    (window as any).__IL_PRERENDERED__ && !(document as any).prerendering;

  // Check if this is the login.aspx page (session expired redirect, e.g. /lectio/94/login.aspx)
  const isLoginAspx = /\/lectio\/\d+\/login\.aspx/.test(
    window.location.pathname,
  );
  if (isLoginAspx) {
    const hasReturnUrl = new URLSearchParams(window.location.search).has('ReturnUrl');
    if (hasReturnUrl) {
      // Auth redirect in progress, keeping state
    } else {
      updateLoginState(); // This will detect not logged in and clear the cache
    }
    document.documentElement.classList.add("il-ready");
    return;
  }

  // Don't inject on login page, print pages, or other non-app pages
  const isPrintPage = window.location.pathname.includes("print.aspx");
  const hasMainHeader = !!document.querySelector(".ls-master-header");

  if (!hasMainHeader || isPrintPage) {
    // If we're on a school page (has /lectio/XX/) but no main header,
    // user is likely logged out - update the state
    const isSchoolPage = /\/lectio\/\d+\//.test(window.location.pathname);
    if (isSchoolPage && !hasMainHeader && !isPrintPage) {
      updateLoginState(); // This will detect not logged in and clear the cache
    }

    // Still reveal the page
    document.documentElement.classList.add("il-ready");
    return;
  }

  // Get settings for feature checks
  const settings = getSettings();

  applyDarkMode(settings.visual.darkMode ?? false);
  const schoolId = window.location.pathname.match(/\/lectio\/(\d+)\//)?.[1] ?? null;
  applyThemeForSchool(schoolId);
  installActivityModalClickInterceptor();

  // Redirect messages page to "Nyeste" folder by default
  if (
    (settings.behavior.messagesAutoRedirect ?? true) &&
    window.location.pathname.includes("beskeder2.aspx") &&
    !window.location.search.includes("mappeid")
  ) {
    window.location.href = window.location.pathname + "?mappeid=-70";
    return;
  }

  // Viewing someone else's documents does not work on Lectio's
  // "Nyeste dokumenter" pseudo-folder (`__5`). Bounce to their
  // regular root documents folder instead.
  if (
    /\/dokumentoversigt\.aspx$/i.test(window.location.pathname) &&
    !isViewingOwnPage()
  ) {
    const url = new URL(window.location.href);
    const folderId = url.searchParams.get("folderid");
    if (folderId?.endsWith("__5")) {
      url.searchParams.set("folderid", folderId.slice(0, -1));
      window.location.replace(url.toString());
      return;
    }
  }

  // Update login state and profile cache
  updateLoginState();
  updateProfileCache();

  // Auto-authenticate with Supabase (fire-and-forget, never blocks UI)
  // All Supabase operations run in the background script to avoid Firefox
  // cross-compartment Promise errors.
  if (schoolId) {
    import('@/lib/supabase/session').then(({ ensureSupabaseSession }) => {
      void ensureSupabaseSession(schoolId);
    }).catch(() => {});

    // Prefetch all school students into cache (for BL badges + profile data)
    import('@/lib/supabase/resources/student').then(({ getStudentsBySchool }) => {
      getStudentsBySchool(schoolId).catch(() => {});
    }).catch(() => {});
  }

  // Update page title to cleaner format
  updatePageTitle();

  // Set cached profile data on window for AppSidebar to use
  const cachedProfile = getCachedProfile();
  const pageProps = {
    school_id: schoolId,
    page: window.location.pathname.split('/').pop()?.split('?')[0] ?? 'unknown',
    extension_version: browser.runtime.getManifest().version,
  };

  // Identify and capture extension loaded event
  if (cachedProfile?.studentId) {
    const phDistinctId = getDistinctId(cachedProfile.studentId);
    identifyIfNeeded(phDistinctId, {
      name: cachedProfile.fullName || cachedProfile.name,
      school_id: cachedProfile.schoolId,
      school_name: cachedProfile.schoolName,
      class_name: cachedProfile.className,
      extension_version: browser.runtime.getManifest().version,
      lectio_version: getLectioVersionForUserJot(),
    });
    captureOncePerSession('extension loaded', phDistinctId, pageProps);
  }

  let userJotIdentifyPayload: Parameters<typeof identifyUserJot>[0] | null = null;
  if (cachedProfile) {
    (window as any).__IL_CACHED_PROFILE__ = cachedProfile;
    if (cachedProfile.studentId) {
      const version = browser.runtime.getManifest().version;
      const lectioVersion = getLectioVersionForUserJot();
      const browserInfo = getBrowserInfoForUserJot();
      const profileFirstName = cachedProfile.fullName?.split(" ").filter(Boolean)[0];
      const profileLastName = cachedProfile.fullName
        ?.split(" ")
        .filter(Boolean)
        .slice(1)
        .join(" ");
      userJotIdentifyPayload = {
        id: `${cachedProfile.schoolId ?? "lectio"}:${cachedProfile.studentId}`,
        firstName: profileFirstName
          ? `${profileFirstName} | BetterLectio ${version}`
          : `BetterLectio ${version}`,
        lastName: [profileLastName, `Lectio ${lectioVersion}`, browserInfo]
          .filter(Boolean)
          .join(" | "),
        avatar: cachedProfile.pictureUrl || undefined,
      };
    }
  }

  // Extract profile picture URL before modifying DOM (for immediate use)
  // Only do this when viewing our own page, not someone else's schedule
  if (isViewingOwnPage()) {
    const profileImg = document.querySelector(
      "#s_m_HeaderContent_picctrlthumbimage",
    ) as HTMLImageElement;
    if (profileImg?.src) {
      const url = new URL(profileImg.src, window.location.origin);
      url.searchParams.set("fullsize", "1");
      (window as any).__IL_PROFILE_PIC__ = url.toString();
    }
  }

  // Replace Lectio's favicon with our logo
  replaceFavicon();

  // Inject Geist font
  injectFont();

  // Collect all original body children (as actual nodes, not innerHTML)
  // This preserves event handlers and form connections
  const originalNodes: Node[] = [];
  while (document.body.firstChild) {
    originalNodes.push(document.body.removeChild(document.body.firstChild));
  }

  // Add our wrapper class
  document.body.classList.add("il-dashboard-active");

  // Create our root container
  const root = document.createElement("div");
  root.id = "il-root";
  document.body.appendChild(root);

  // Disable Lectio's Combokeys keyboard shortcuts (o c, o d, alt+x, ?, etc.).
  // Combokeys binds on document.documentElement in the bubble phase. Stopping
  // propagation at <body> prevents key events from ever reaching it.
  for (const evt of ["keydown", "keypress", "keyup"] as const) {
    document.body.addEventListener(evt, (e) => e.stopPropagation());
  }

  // Render the dashboard layout
  render(<DashboardLayout />, root);

  // Wait for the render and then move the original content into our content area
  requestAnimationFrame(() => {
    const contentContainer = document.getElementById("il-lectio-content");
    if (contentContainer) {
      // Create a wrapper for the original content
      const wrapper = document.createElement("div");
      wrapper.id = "il-original-content";

      // Move actual DOM nodes (preserves event handlers and form connections)
      for (const node of originalNodes) {
        wrapper.appendChild(node);
      }

      contentContainer.appendChild(wrapper);

      // Scan DOM for hold codes, register them, and replace with display names
      // Show class prefix (e.g. "1x Matematik") when viewing non-student schedules
      const showClassPrefix = !isViewingOwnPage();
      scanDOMForHolds(wrapper);
      const holdReplacements = replaceHoldCodesInDOM(wrapper, showClassPrefix);
      if (holdReplacements > 0) {
        console.log(`[BetterLectio] Replaced ${holdReplacements} hold codes with subject names`);
      }

      const pathnameLower = window.location.pathname.toLowerCase();
      const isSchedulePage =
        pathnameLower.includes("skemany.aspx") ||
        pathnameLower.includes("/skema/skema1dag.aspx") ||
        pathnameLower.includes("findskema.aspx");
      const isForsidePage = pathnameLower.includes("forside.aspx");

      // Only run schedule brick transforms on schedule pages.
      // Running these on lektier can mutate activity bricks we parse.
      if (isSchedulePage) {
        // Merge cancelled+replacement brick pairs into combined bricks
        mergeReplacedBricks();

        // Layout overlapping bricks side-by-side at equal widths
        layoutOverlappingBricks();

        // Enhance schedule brick layout with subject hierarchy and hold colors
        enhanceScheduleBricks();

        // Replace Lectio's cluetip tooltips with custom tooltip cards
        initBrickTooltips();
      }

      // Forside contains activity bricks too, but does not need schedule-specific
      // cancelled/replacement merging logic.
      if (isForsidePage) {
        enhanceScheduleBricks();
        initBrickTooltips();
      }

      // Reveal the page now that our UI is ready
      document.documentElement.classList.add("il-ready");

      // Initialize preloading for faster navigation
      const schoolId = window.location.pathname.match(/\/lectio\/(\d+)\//)?.[1];
      if (schoolId) {
        initPreloading(schoolId);

        // Inject FindSkema page
        if (window.location.pathname.toLowerCase().includes("findskema.aspx")) {
          injectFindSkemaPage(schoolId);
        }

        // Inject greeting on forside page
        if (window.location.pathname.toLowerCase().includes("forside.aspx")) {
          injectForsideGreeting(schoolId);
        }

        // Inject members page UI
        if (window.location.pathname.toLowerCase().includes("members.aspx")) {
          injectMembersPage(schoolId);
        }

        // Inject lektier page UI
        if (window.location.pathname.toLowerCase().includes("material_lektieoversigt")) {
          injectLektierPage(schoolId);
        }

        // Inject opgaver page UI
        if (window.location.pathname.toLowerCase().includes("opgaverelev")) {
          injectOpgaverPage(schoolId);
        }

        // Inject beskeder page UI
        if (window.location.pathname.toLowerCase().includes("beskeder2.aspx")) {
          injectBeskederPage(schoolId);
        }

        // Inject fravær page redesign
        if (
          /\/subnav\/fravaerelev(_fravaersaarsager)?\.aspx/i.test(
            window.location.pathname,
          )
        ) {
          injectFravaerPage(schoolId);
        }

        // Inject karakterer page UI
        if (window.location.pathname.toLowerCase().includes("grade_report.aspx")) {
          injectKaraktererPage(schoolId);
        }

        // Inject profil page UI
        if (window.location.pathname.toLowerCase().includes("studentindstillinger.aspx")) {
          injectProfilPage(schoolId);
        }

        // Inject "viewing schedule" header when looking at someone else's schedule
        if (!isViewingOwnPage()) {
          injectViewingScheduleHeader(schoolId);

          // Add body class for entity schedules (non-person types like hold, class, room)
          // This enables showing the Lectio subnavigation for these pages
          const viewedEntity = getViewedEntityId();
          if (
            viewedEntity &&
            viewedEntity.type !== "student" &&
            viewedEntity.type !== "teacher"
          ) {
            document.body.classList.add("il-entity-schedule");
          }
        }

        // Replace teacher initials with full names in original Lectio DOM
        loadTeacherNames(schoolId).then(cache => {
          if (!cache) return;
          const originalContent = document.getElementById("il-original-content");
          if (originalContent) {
            const count = replaceTeacherInitialsInDOM(cache, originalContent);
            if (count > 0) {
              console.log(`[BetterLectio] Replaced ${count} teacher initials with full names`);
            }
          }
        });
      }

      // Set up title observer for dynamic updates (e.g., unread message count)
      observeTitleChanges();

      // Set up schedule table column widths, clean labels, and highlight today
      injectScheduleColgroup();
      cleanUpModuleLabels();
      // Inject "I dag" button into native toolbar (needed for current-week detection)
      injectTodayButton();
      // Replace native schedule toolbar with custom Preact component
      // Show on own schedule and non-student entities (hold, lærere, grupper, etc.)
      // Only skip for other students' schedules (they get ProfilePage instead)
      if (window.location.pathname.toLowerCase().includes("skemany.aspx")) {
        const viewedForToolbar = getViewedEntityId();
        const isOtherStudent = viewedForToolbar && viewedForToolbar.type === 'student' && !isViewingOwnPage();
        if (!isOtherStudent) {
          injectScheduleToolbar();
        }
      }
      setupWeekendCollapse();
      if (settings.schedule.todayHighlight ?? true) {
        highlightTodayInSchedule();
        if (settings.schedule.currentTimeIndicator ?? true) {
          injectCurrentTimeIndicator(settings.schedule.currentTimeLabel ?? false);
        }
      }

      // Remove redundant tooltip on activity page title
      removeActivityTitleTooltip();

      // Inject dark mode into CKEditor iframes (activity/elevfeedback pages)
      initCKEditorDarkMode();

      // Initialize UserJot after our DOM move/rewrite to avoid layout side effects.
      initUserJotWidget();
      if (userJotIdentifyPayload) {
        identifyUserJot(userJotIdentifyPayload);
      }

      console.log("[BetterLectio] Dashboard layout injected");
    }
  });
}

function removeActivityTitleTooltip() {
  // On activity pages, the title has a tooltip that duplicates all info already shown on page
  const activityHeader = document.getElementById(
    "s_m_Content_Content_tocAndToolbar_actHeader",
  );
  if (!activityHeader) return;

  // Remove native browser tooltip from activity note textarea
  const activityNote = document.getElementById(
    "s_m_Content_Content_tocAndToolbar_ActNoteTB_tb",
  );
  if (activityNote) {
    activityNote.removeAttribute("title");
  }
}

/** Inject dark mode styles into CKEditor iframe bodies */
function initCKEditorDarkMode() {
  if (!document.documentElement.classList.contains("dark")) return;

  const darkCSS = `
    body {
      background: oklch(0.16 0.004 285) !important;
      color: oklch(0.93 0.003 90) !important;
      caret-color: oklch(0.93 0.003 90) !important;
    }
    body a { color: oklch(0.65 0.16 265) !important; }
  `;

  function injectIntoEditor(iframe: HTMLIFrameElement) {
    try {
      const doc = iframe.contentDocument;
      if (!doc || doc.getElementById("bl-cke-dark")) return;
      const style = doc.createElement("style");
      style.id = "bl-cke-dark";
      style.textContent = darkCSS;
      doc.head.appendChild(style);
    } catch {
      /* cross-origin — ignore */
    }
  }

  // Watch for CKEditor iframes appearing (they're injected after page load)
  const observer = new MutationObserver(() => {
    document.querySelectorAll<HTMLIFrameElement>(".cke_wysiwyg_frame").forEach((iframe) => {
      if (iframe.contentDocument?.getElementById("bl-cke-dark")) return;
      iframe.addEventListener("load", () => injectIntoEditor(iframe), { once: true });
      // Also try immediately (iframe may already be loaded)
      injectIntoEditor(iframe);
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Also handle already-existing editors
  document.querySelectorAll<HTMLIFrameElement>(".cke_wysiwyg_frame").forEach((iframe) => {
    iframe.addEventListener("load", () => injectIntoEditor(iframe), { once: true });
    injectIntoEditor(iframe);
  });
}

function highlightTodayInSchedule() {
  const today = new Date();
  const isoDate = today.toISOString().split("T")[0]; // "YYYY-MM-DD"

  // Find all cells with today's date and mark them
  const todayCells = document.querySelectorAll(
    `.s2skema td[data-date="${isoDate}"]`,
  );
  if (todayCells.length === 0) return;

  todayCells.forEach((td) => {
    td.classList.add("is-today");

    // Find the column index to highlight the header too
    const cellIndex = (td as HTMLTableCellElement).cellIndex;
    const table = td.closest("table");
    if (!table) return;

    // Find and mark the day header cell in the same column
    const headerRow = table.querySelector("tr.s2dayHeader");
    if (headerRow) {
      const headerCell = headerRow.children[cellIndex] as HTMLTableCellElement;
      if (headerCell) {
        headerCell.classList.add("is-today");
        // Change text to "I dag" with the date
        const dateMatch = headerCell.textContent?.match(/\((\d+\/\d+)\)/);
        if (dateMatch) {
          headerCell.textContent = `I dag (${dateMatch[1]})`;
        }
      }
    }

    // Also mark the info header cell (row with announcements)
    const infoHeaderRow = table.querySelector("tr:has(.s2infoHeader)");
    if (infoHeaderRow) {
      const infoCell = infoHeaderRow.children[
        cellIndex
      ] as HTMLTableCellElement;
      if (infoCell) {
        infoCell.classList.add("is-today");
      }
    }
  });
}

function injectCurrentTimeIndicator(showTimeLabel: boolean) {
  const today = new Date();
  const isoDate = today.toISOString().split("T")[0];
  const todayCell = document.querySelector(
    `.s2skema td[data-date="${isoDate}"]`,
  );
  if (!todayCell) return;

  const container = todayCell.querySelector(".s2skemabrikcontainer");
  if (!container) return;

  // Reset previous indicator/interval/calibration before creating a new one
  const existing = container.querySelector('#il-time-indicator');
  if (existing) existing.remove();
  if (timeIndicatorIntervalId !== null) {
    window.clearInterval(timeIndicatorIntervalId);
    timeIndicatorIntervalId = null;
  }
  timeCalibration = null;

  // Create the time indicator line
  const indicator = document.createElement("div");
  indicator.id = "il-time-indicator";
  indicator.innerHTML = showTimeLabel
    ? '<span class="il-time-label"></span><div class="il-time-dot"></div>'
    : '<div class="il-time-dot"></div>';
  container.appendChild(indicator);

  // Update position immediately and every minute
  updateTimeIndicatorPosition();
  timeIndicatorIntervalId = window.setInterval(updateTimeIndicatorPosition, 60000);
}

// Cached calibration data for the time indicator (derived from DOM once)
let timeCalibration: { startMinutes: number; endMinutes: number; startEm: number; emPerMin: number } | null = null;

function calibrateTimeMapping() {
  // Read module positions and times from the schedule's info column.
  // s2module-bg has top + height (em), s2module-info has top + time text.
  const infoColumn = document.querySelector<HTMLElement>(
    ".s2skema td:first-child .s2skemabrikcontainer",
  );
  if (!infoColumn) return null;

  const moduleBgs = infoColumn.querySelectorAll<HTMLElement>(".s2module-bg");
  const moduleInfos = infoColumn.querySelectorAll<HTMLElement>(".s2module-info");


  if (moduleInfos.length < 2 || moduleBgs.length < 1) return null;

  // Extract start time + top em from each module-info
  const modules: { startMin: number; endMin: number; topEm: number }[] = [];
  moduleInfos.forEach((mod) => {
    const topMatch = mod.style.top?.match(/([\d.]+)em/);
    // textContent strips <br> and " - " can become concatenated, e.g. "8:109:50"
    const timeMatch = mod.textContent?.match(/(\d{1,2}):(\d{2})\s*-?\s*(\d{1,2}):(\d{2})/);
    if (topMatch && timeMatch) {
      modules.push({
        topEm: parseFloat(topMatch[1]),
        startMin: parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]),
        endMin: parseInt(timeMatch[3]) * 60 + parseInt(timeMatch[4]),
      });
    }
  });

  if (modules.length < 2) return null;

  const first = modules[0];
  const last = modules[modules.length - 1];

  // Derive linear em/min rate from first and last module start positions
  const emPerMin = (last.topEm - first.topEm) / (last.startMin - first.startMin);

  // Compute end boundary: last module's end time extrapolated from the rate.
  // Also try reading the last s2module-bg's top+height for a precise end em.
  const lastBg = moduleBgs[moduleBgs.length - 1];
  const lastBgTop = parseFloat(lastBg?.style.top?.match(/([\d.]+)/)?.[1] ?? "0");
  const lastBgHeight = parseFloat(lastBg?.style.height?.match(/([\d.]+)/)?.[1] ?? "0");
  const endEm = lastBgTop + lastBgHeight;
  // Derive end minutes from em position
  const endMinutes = first.startMin + (endEm - first.topEm) / emPerMin;

  const result = {
    startMinutes: first.startMin,
    endMinutes: Math.round(endMinutes),
    startEm: first.topEm,
    emPerMin,
  };

  return result;
}

function updateTimeIndicatorPosition() {
  const indicator = document.getElementById("il-time-indicator");
  if (!indicator) return;

  // Calibrate once from DOM
  if (!timeCalibration) {
    timeCalibration = calibrateTimeMapping();
  }
  // Fallback to hardcoded values if DOM parsing fails
  const cal = timeCalibration ?? {
    startMinutes: 490,
    endMinutes: 1200,
    startEm: 0.636,
    emPerMin: 0.0636,
  };

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Hide if outside schedule hours
  if (currentMinutes < cal.startMinutes || currentMinutes > cal.endMinutes) {
    indicator.style.display = "none";
    return;
  }

  const topEm = cal.startEm + (currentMinutes - cal.startMinutes) * cal.emPerMin;

  indicator.style.display = "";
  indicator.style.top = `${topEm}em`;

  // Update time label (when enabled)
  const timeLabel = indicator.querySelector(".il-time-label");
  if (timeLabel) {
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    timeLabel.textContent = `${hours}:${minutes}`;
  }
}

function injectScheduleColgroup() {
  const tables = document.querySelectorAll(".s2skema");
  tables.forEach((table) => {
    // Skip if colgroup already exists
    if (table.querySelector("colgroup")) return;

    // Count day columns (cells with data-date attribute in content row)
    const contentRow = table.querySelector("tr:has(td[data-date])");
    if (!contentRow) return;

    const dayColumns = contentRow.querySelectorAll("td[data-date]").length;

    // Create colgroup with proper widths
    const colgroup = document.createElement("colgroup");

    // First column (module times) - fixed narrow width
    const firstCol = document.createElement("col");
    firstCol.style.width = "3.8em";
    colgroup.appendChild(firstCol);

    // Day columns - equal distribution of remaining space
    for (let i = 0; i < dayColumns; i++) {
      const col = document.createElement("col");
      colgroup.appendChild(col);
    }

    // Insert colgroup at the beginning of the table
    table.insertBefore(colgroup, table.firstChild);
  });
}

function injectTodayButton() {
  // Find the schedule toolbar's first div (contains week nav + view buttons)
  const toolbar = document.querySelector(
    ".display-grid-skemany > .ls-std-rowblock > div",
  );
  if (!toolbar) return;

  // Don't add if already present
  if (toolbar.querySelector(".il-today-btn")) return;

  // Build the URL: current page without ?week= param (defaults to current week)
  const url = new URL(window.location.href);
  url.searchParams.delete("week");

  // Compute current ISO week param (WWYYYY) to compare against URL
  const now = new Date();
  const tmp = new Date(now.getTime());
  tmp.setHours(0, 0, 0, 0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const week1 = new Date(tmp.getFullYear(), 0, 4);
  const weekNum =
    1 +
    Math.round(
      ((tmp.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7,
    );
  const currentWeekParam = `${weekNum}${tmp.getFullYear()}`;

  // Current week if no ?week= param, or if it matches the computed current week
  const urlWeek = new URLSearchParams(window.location.search).get("week");
  const isCurrentWeek = !urlWeek || urlWeek === currentWeekParam;

  // Create a .buttonlink wrapper to match Lectio's view buttons
  const wrapper = document.createElement("span");
  wrapper.className = "buttonlink il-today-btn";

  const link = document.createElement("a");
  link.textContent = "I dag";

  if (isCurrentWeek) {
    link.setAttribute("disabled", "disabled");
  } else {
    link.href = url.href;
  }

  wrapper.appendChild(link);

  // Insert after the datepicker (before the first view button)
  const datepicker = toolbar.querySelector(".ls-datepicker");
  if (datepicker?.nextSibling) {
    toolbar.insertBefore(wrapper, datepicker.nextSibling);
  } else {
    toolbar.appendChild(wrapper);
  }
}

function injectScheduleToolbar() {
  const nativeToolbar = document.querySelector(
    "#il-original-content .display-grid-skemany > .ls-std-rowblock",
  );
  if (!nativeToolbar) return;

  // Parse data from the native toolbar before hiding it
  const data = parseScheduleToolbar(nativeToolbar);
  if (!data) return;

  // Hide native toolbar (keep in DOM so print commands still work)
  (nativeToolbar as HTMLElement).style.display = "none";

  // Create container and render our component
  const container = document.createElement("div");
  container.id = "il-schedule-toolbar";
  nativeToolbar.parentElement!.insertBefore(container, nativeToolbar);

  render(<ScheduleToolbar data={data} />, container);
}

function setupWeekendCollapse() {
  const tables = document.querySelectorAll<HTMLTableElement>(".s2skema");
  if (tables.length === 0) return;

  // Collect weekend column indices across all schedule tables
  let weekendIndices: number[] = [];

  tables.forEach((table) => {
    const contentRow = table.querySelector("tr:has(td[data-date])");
    if (!contentRow) return;

    const dateCells = contentRow.querySelectorAll<HTMLTableCellElement>("td[data-date]");
    dateCells.forEach((td) => {
      const dateStr = td.getAttribute("data-date");
      if (!dateStr) return;
      const day = new Date(dateStr + "T12:00:00").getDay(); // 0=Sun, 6=Sat
      if (day === 0 || day === 6) {
        weekendIndices.push(td.cellIndex);
      }
    });
  });

  // Deduplicate indices
  weekendIndices = [...new Set(weekendIndices)];

  if (weekendIndices.length === 0) return;

  // Read persisted state (default: collapsed)
  const weekendCollapsedKey = "bl-weekend-collapsed";
  const legacyWeekendCollapsedKey = "il-weekend-collapsed";
  const stored =
    localStorage.getItem(weekendCollapsedKey) ??
    localStorage.getItem(legacyWeekendCollapsedKey);
  if (!localStorage.getItem(weekendCollapsedKey) && stored !== null) {
    localStorage.setItem(weekendCollapsedKey, stored);
  }
  let isCollapsed = stored !== "false"; // default true

  function applyState() {
    tables.forEach((table) => {
      table.classList.toggle("il-weekend-collapsed", isCollapsed);

      const colgroup = table.querySelector("colgroup");
      if (!colgroup) return;
      const cols = colgroup.querySelectorAll("col");
      weekendIndices.forEach((idx) => {
        if (cols[idx]) {
          cols[idx].setAttribute("data-il-weekend", isCollapsed ? "collapsed" : "expanded");
        }
      });
    });
  }

  function toggle() {
    isCollapsed = !isCollapsed;
    localStorage.setItem(weekendCollapsedKey, String(isCollapsed));
    applyState();
  }

  // Mark all weekend cells, colgroup cols, and make day headers clickable
  tables.forEach((table) => {
    const colgroup = table.querySelector("colgroup");
    if (!colgroup) return;

    // Mark all cells in weekend columns
    const rows = table.querySelectorAll("tr");
    rows.forEach((row) => {
      weekendIndices.forEach((idx) => {
        const cell = row.children[idx] as HTMLTableCellElement | undefined;
        if (!cell) return;
        cell.classList.add("il-weekend-col");

        // For day header row, set abbreviated label and make clickable
        if (row.classList.contains("s2dayHeader")) {
          const text = cell.textContent?.trim() || "";
          // "Lørdag (7/3)" → "Lør" ; "Søndag (8/3)" → "Søn"
          const abbrev = text.slice(0, 3);
          cell.setAttribute("data-il-weekend-abbrev", abbrev);
          if (!cell.hasAttribute("data-il-weekend-toggle")) {
            cell.addEventListener("click", toggle);
            cell.setAttribute("data-il-weekend-toggle", "1");
          }
        }
      });
    });
  });

  // Apply initial state
  applyState();
}

function cleanUpModuleLabels() {
  const moduleInfos = document.querySelectorAll<HTMLElement>(
    "#il-original-content .s2module-info",
  );

  moduleInfos.forEach((info) => {
    const innerDiv = info.querySelector<HTMLElement>("div");
    if (!innerDiv) return;

    // Extract times from text like "1. modul\n8:10 - 9:50"
    const text = innerDiv.textContent || "";
    const timeMatch = text.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if (!timeMatch) return;

    const startTime = timeMatch[1];
    const endTime = timeMatch[2];

    // Get the matching module-bg height for this module
    const top = info.style.top;
    const container = info.parentElement;
    const matchingBg = container?.querySelector<HTMLElement>(
      `.s2module-bg[style*="top:${top}"], .s2module-bg[style*="top: ${top}"]`,
    );
    const bgHeight = matchingBg?.style.height || "6.364em";

    // Set height on module-info to match the module-bg
    info.style.height = bgHeight;

    // Replace inner content with start/end times
    innerDiv.style.cssText =
      "display:flex;flex-direction:column;justify-content:space-between;height:117%;padding:0.15em 0.35em 0;box-sizing:border-box;";
    innerDiv.innerHTML = `<span class="il-module-time">${startTime}</span><span class="il-module-time il-module-time-end">${endTime}</span>`;
  });
}

/**
 * Detect overlapping schedule bricks and lay them out side-by-side at half width.
 * Runs after mergeReplacedBricks so hidden cancelled bricks are excluded.
 */
function layoutOverlappingBricks() {
  const containers = document.querySelectorAll<HTMLElement>(
    "#il-original-content .s2skemabrikcontainer",
  );

  containers.forEach((container) => {
    const bricks = Array.from(
      container.querySelectorAll<HTMLElement>(".s2skemabrik.s2bgbox"),
    ).filter((b) => b.style.display !== "none");

    if (bricks.length < 2) return;

    // Parse each brick's vertical extent
    const parsed = bricks.map((brick) => {
      const top = parseFloat(brick.style.top) || 0;
      const height = parseFloat(brick.style.height) || 0;
      return { brick, top, bottom: top + height };
    });

    // Build overlap groups using interval overlap detection
    // A brick overlaps another if their vertical ranges intersect
    const visited = new Set<number>();
    const groups: (typeof parsed)[] = [];

    for (let i = 0; i < parsed.length; i++) {
      if (visited.has(i)) continue;

      const group = [parsed[i]];
      visited.add(i);

      // Find all bricks that overlap with any brick in this group
      let changed = true;
      while (changed) {
        changed = false;
        for (let j = 0; j < parsed.length; j++) {
          if (visited.has(j)) continue;
          const b = parsed[j];
          // Check if b overlaps with any brick already in the group
          const overlaps = group.some(
            (g) => b.top < g.bottom && b.bottom > g.top,
          );
          if (overlaps) {
            group.push(b);
            visited.add(j);
            changed = true;
          }
        }
      }

      if (group.length > 1) {
        groups.push(group);
      }
    }

    // Layout each overlap group side-by-side
    for (const group of groups) {
      // Sort by original left position so the leftmost brick stays left
      group.sort(
        (a, b) =>
          (parseFloat(a.brick.style.left) || 0) -
          (parseFloat(b.brick.style.left) || 0),
      );

      const n = group.length;
      for (let i = 0; i < n; i++) {
        const { brick } = group[i];
        // Calculate position: divide available width evenly
        // Container width is roughly 100%, subtract padding
        const widthPct = 100 / n;
        const leftPct = widthPct * i;

        brick.style.width = `calc(${widthPct}% - 1.1em)`;
        brick.style.maxWidth = `calc(${widthPct}% - 1.1em)`;
        brick.style.left = `calc(${leftPct}% + 0.55em)`;
        brick.classList.add("il-narrow");
      }
    }
  });
}

/**
 * Find cancelled+replacement brick pairs in the same time slot and merge them.
 * The cancelled brick is hidden, the replacement expands to full width,
 * and a subtle note shows what was replaced.
 */
function mergeReplacedBricks() {
  const containers = document.querySelectorAll<HTMLElement>(
    "#il-original-content .s2skemabrikcontainer",
  );

  containers.forEach((container) => {
    const bricks = Array.from(
      container.querySelectorAll<HTMLElement>(".s2skemabrik.s2bgbox"),
    );

    // Group bricks by their top position (same time slot)
    const byTop = new Map<string, HTMLElement[]>();
    for (const brick of bricks) {
      const top = brick.style.top;
      if (!top) continue;
      const group = byTop.get(top) || [];
      group.push(brick);
      byTop.set(top, group);
    }

    for (const [, group] of byTop) {
      if (group.length !== 2) continue;

      const cancelled = group.find((b) => b.classList.contains("s2cancelled"));
      const replacement = group.find(
        (b) => !b.classList.contains("s2cancelled"),
      );

      if (!cancelled || !replacement) continue;

      // Extract subject info from the cancelled brick
      const cancelledHold = cancelled.querySelector<HTMLElement>(
        'span[data-lectiocontextcard^="HE"]',
      );
      const cancelledCode =
        cancelledHold?.getAttribute("title") ||
        cancelledHold?.textContent?.trim() ||
        "";
      const cancelledName = cancelledCode
        ? (!isViewingOwnPage() ? getFullHoldDisplayName(cancelledCode) : getHoldDisplayName(cancelledCode))
        : "";

      // Hide the cancelled brick
      cancelled.style.display = "none";

      // Expand replacement to full width
      replacement.style.width = "calc(100% - 1.1em)";
      replacement.style.left = "0.55em";

      // Store info for the enhancement pass
      replacement.dataset.replacesName =
        cancelledName !== cancelledCode ? cancelledName : "";
      replacement.dataset.replacesCode = cancelledCode;
    }
  });
}

function enhanceScheduleBricks() {
  const bricks = document.querySelectorAll<HTMLElement>(
    "#il-original-content .s2skemabrik.s2bgbox",
  );
  const subjectColorsEnabled = getSettings().schedule?.subjectColors ?? true;

  bricks.forEach((brick) => {
    // Skip bricks hidden by merge (cancelled bricks absorbed into replacements)
    if (brick.style.display === "none") return;

    const innerContainer = brick.querySelector<HTMLElement>(
      ".s2skemabrikInnerContainer",
    );
    if (!innerContainer || innerContainer.classList.contains("il-enhanced"))
      return;

    const content = innerContainer.querySelector<HTMLElement>(
      ".s2skemabrikcontent",
    );
    if (!content) return;

    // Detect narrow bricks (side-by-side overlap) — set by layoutOverlappingBricks()
    // or from inline width for forside bricks not processed by the overlap layout
    if (!brick.classList.contains("il-narrow")) {
      const inlineWidth = brick.style.width;
      if (inlineWidth && parseFloat(inlineWidth) < 8) {
        brick.classList.add("il-narrow");
      }
    }

    // Extract components from the original DOM
    const holdSpan = content.querySelector<HTMLElement>(
      'span[data-lectiocontextcard^="HE"]',
    );
    const teacherSpans = content.querySelectorAll<HTMLElement>(
      'span[data-lectiocontextcard^="T"]',
    );
    // Schedule page uses word-wrap, forside uses white-space:nowrap for topic
    const topicSpan =
      content.querySelector<HTMLElement>('span[style*="word-wrap"]') ||
      content.querySelector<HTMLElement>('span[style*="white-space"]');
    const timeline = innerContainer.querySelector<HTMLElement>(".s2timeline");
    const icons = innerContainer.querySelector<HTMLElement>(
      ".s2skemabrikIcons",
    );

    // Get hold code for coloring (title attr has original code)
    const holdCode =
      holdSpan?.getAttribute("title") || holdSpan?.textContent?.trim() || "";
    const holdDisplayName = holdCode ? (!isViewingOwnPage() ? getFullHoldDisplayName(holdCode) : getHoldDisplayName(holdCode)) : "";
    const hasMappedHoldTitle = holdCode ? hasHoldMapping(holdCode) : false;
    const topicText = topicSpan?.textContent?.trim() || "";

    // Extract room from content text.
    // Schedule: "\nHistorie • MR • 25\nMiddelalderen"
    // Forside:  "1. modul - 1x HI • MR • 25 - Industrialiseringen"
    const contentText = content.textContent || "";
    const contentLines = contentText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const firstLine = contentLines[0] || "";
    const dotParts = firstLine
      .split("•")
      .map((s) => s.trim())
      .filter(Boolean);
    let room = "";
    if (dotParts.length >= 3) {
      let lastPart = dotParts[dotParts.length - 1];
      // On forside, topic text is appended after room with " - " separator
      // e.g. "25 - Industrialiseringen" — strip the topic suffix
      if (topicText && lastPart.endsWith(topicText)) {
        lastPart = lastPart.slice(0, -topicText.length).replace(/\s*-\s*$/, "");
      }
      room = lastPart;
    }

    // Apply hold color as CSS custom property
    let hue: number;
    if (!subjectColorsEnabled) {
      brick.classList.add('il-no-subject-colors');
      if (brick.classList.contains('s2cancelled')) {
        hue = 25;
      } else if (brick.classList.contains('s2changed')) {
        hue = 145;
      } else {
        hue = 265;
      }
    } else {
      hue = holdCode ? getHoldHue(holdCode) : 265;
    }
    brick.style.setProperty("--brick-hue", String(hue));

    // Mark as enhanced and clear old content
    innerContainer.classList.add("il-enhanced");
    innerContainer.textContent = "";

    // ── Header: subject + room ──
    const header = document.createElement("div");
    header.className = "il-brick-header";

    let topicUsedAsSubject = false;
    if (hasMappedHoldTitle) {
      if (holdSpan) {
        holdSpan.textContent = holdDisplayName || holdCode;
        holdSpan.classList.add("il-brick-subject");
        header.appendChild(holdSpan);
      } else if (holdDisplayName) {
        const subjectLabel = document.createElement("span");
        subjectLabel.className = "il-brick-subject";
        subjectLabel.textContent = holdDisplayName;
        header.appendChild(subjectLabel);
      }
    } else if (topicText) {
      const subjectLabel = document.createElement("span");
      subjectLabel.className = "il-brick-subject";
      subjectLabel.textContent = topicText;
      header.appendChild(subjectLabel);
      topicUsedAsSubject = true;
    } else if (holdSpan) {
      holdSpan.classList.add("il-brick-subject");
      header.appendChild(holdSpan);
    } else if (holdCode) {
      const subjectLabel = document.createElement("span");
      subjectLabel.className = "il-brick-subject";
      subjectLabel.textContent = holdCode;
      header.appendChild(subjectLabel);
    }

    if (room) {
      const roomBadge = document.createElement("span");
      roomBadge.className = "il-brick-room";
      roomBadge.textContent = room;
      header.appendChild(roomBadge);
    }

    // Add "Aflyst" badge for cancelled bricks
    if (brick.classList.contains("s2cancelled")) {
      const cancelledBadge = document.createElement("span");
      cancelledBadge.className = "il-brick-cancelled-badge";
      cancelledBadge.textContent = "Aflyst";
      header.appendChild(cancelledBadge);
    }

    // Add "Ændret" badge for changed/moved bricks
    if (
      brick.classList.contains("s2changed") &&
      !brick.classList.contains("s2cancelled")
    ) {
      const changedBadge = document.createElement("span");
      changedBadge.className = "il-brick-changed-badge";
      changedBadge.textContent = "Ændret";
      header.appendChild(changedBadge);
    }

    innerContainer.appendChild(header);

    // ── "Replaces" note (for merged cancelled+replacement pairs) ──
    const replacesCode = brick.dataset.replacesCode;
    if (replacesCode) {
      const replacesName = brick.dataset.replacesName || replacesCode;
      const replacesDiv = document.createElement("div");
      replacesDiv.className = "il-brick-replaces";
      replacesDiv.textContent = `Erstatter ${replacesName}`;
      innerContainer.appendChild(replacesDiv);
    }

    // ── Meta: teacher, time ──
    if (teacherSpans.length > 0 || timeline) {
      const meta = document.createElement("div");
      meta.className = "il-brick-meta";

      teacherSpans.forEach((span, idx) => {
        if (idx > 0) {
          meta.appendChild(document.createTextNode(", "));
        }
        meta.appendChild(span);
      });

      if (timeline) {
        if (teacherSpans.length > 0) {
          meta.appendChild(document.createTextNode(" \u00B7 "));
        }
        timeline.style.display = "inline";
        meta.appendChild(timeline);
      }

      innerContainer.appendChild(meta);
    }

    // ── Topic ──
    if (topicSpan && !topicUsedAsSubject) {
      if (topicText) {
        const topicDiv = document.createElement("div");
        topicDiv.className = "il-brick-topic";
        topicDiv.textContent = topicText;
        innerContainer.appendChild(topicDiv);
      }
    }

    // ── Icons (homework, notes) ──
    if (icons && icons.children.length > 0) {
      icons.className = "il-brick-icons";
      innerContainer.appendChild(icons);
    }
  });
}

function injectFindSkemaPage(schoolId: string) {
  // Add body class for FindSkema-specific CSS
  document.body.classList.add("il-findskema");

  // Find the content container
  const contentContainer = document.getElementById("il-lectio-content");
  if (!contentContainer) return;

  // Get search type from URL (e.g., ?type=lokale)
  const urlParams = new URLSearchParams(window.location.search);
  const searchType = urlParams.get("type") as
    | "elev"
    | "laerer"
    | "stamklasse"
    | "lokale"
    | "ressource"
    | "hold"
    | "gruppe"
    | undefined;

  // Create container for our FindSkema page
  const findSkemaContainer = document.createElement("div");
  findSkemaContainer.id = "il-findskema-page";

  // Insert at the beginning of the content container
  contentContainer.insertBefore(
    findSkemaContainer,
    contentContainer.firstChild,
  );

  // Render the FindSkema page component
  render(
    <FindSkemaPage schoolId={schoolId} searchType={searchType || "elev"} />,
    findSkemaContainer,
  );

  console.log(
    "[BetterLectio] FindSkema page injected with type:",
    searchType || "elev",
  );
}

function injectForsideGreeting(schoolId: string) {
  // Add body class for forside-specific CSS
  document.body.classList.add("il-forside");

  // Find the content container
  const contentContainer = document.getElementById("il-lectio-content");
  if (!contentContainer) return;

  // Create container for the greeting
  const greetingContainer = document.createElement("div");
  greetingContainer.id = "il-forside-greeting";

  // Insert at the beginning of the content container
  contentContainer.insertBefore(greetingContainer, contentContainer.firstChild);

  // Render the greeting component
  render(<ForsideGreeting schoolId={schoolId} />, greetingContainer);

  // Parse data from the 4 native cards before hiding them
  injectForsideDashboard(schoolId, contentContainer);

  // Hide native schedule island and inject side panel with full schedule
  enhanceForsideSchedule(schoolId);

  // Apply masonry layout to remaining dashboard cards
  applyMasonryLayout();

  console.log("[BetterLectio] Forside greeting injected");
}

/** IDs of the 4 specific forside cards to parse and replace */
const FORSIDE_CARD_IDS = [
  's_m_Content_Content_AktuelInformationIsland_pa',
  's_m_Content_Content_LektierIsland_pa',
  's_m_Content_Content_ElevOpgaveAfleveringerIsland_pa',
  's_m_Content_Content_kommIsland_pa',
] as const;

function injectForsideDashboard(schoolId: string, contentContainer: HTMLElement) {
  // ── Parse all 4 cards from native DOM ──

  // Aktuel Information
  const aktuelIsland = document.getElementById('s_m_Content_Content_AktuelInformationIsland_pa');
  const aktuelInfo = aktuelIsland ? parseAktuelInfo(aktuelIsland) : [];

  // Lektier
  const lektierIsland = document.getElementById('s_m_Content_Content_LektierIsland_pa');
  const lektier = lektierIsland ? parseLektier(lektierIsland) : [];

  // Opgaver
  const opgaverIsland = document.getElementById('s_m_Content_Content_ElevOpgaveAfleveringerIsland_pa');
  const opgaver = opgaverIsland ? parseForsideOpgaver(opgaverIsland) : [];

  // Beskeder
  const beskederIsland = document.getElementById('s_m_Content_Content_kommIsland_pa');
  const { entries: beskeder, unreadCount } = beskederIsland
    ? parseBeskeder(beskederIsland)
    : { entries: [], unreadCount: 0 };

  // ── Hide ONLY these 4 specific cards ──
  for (const id of FORSIDE_CARD_IDS) {
    const islandContent = document.getElementById(id);
    if (islandContent) {
      const island = islandContent.closest<HTMLElement>('.lf-island');
      if (island) {
        island.style.display = 'none';
      }
    }
  }

  // ── Inject redesigned dashboard ──
  const dashboardContainer = document.createElement("div");
  dashboardContainer.id = "il-forside-dashboard";

  // Insert after the greeting
  const greeting = document.getElementById("il-forside-greeting");
  if (greeting?.nextSibling) {
    contentContainer.insertBefore(dashboardContainer, greeting.nextSibling);
  } else {
    contentContainer.appendChild(dashboardContainer);
  }

  render(
    <ForsideDashboard
      aktuelInfo={aktuelInfo}
      lektier={lektier}
      opgaver={opgaver}
      beskeder={beskeder}
      unreadCount={unreadCount}
      schoolId={schoolId}
    />,
    dashboardContainer,
  );
}

function enhanceForsideSchedule(schoolId: string) {
  // Hide the native schedule island from the masonry layout
  const islandContent = document.getElementById('s_m_Content_Content_skemaIsland_pa');
  if (islandContent) {
    const island = islandContent.closest<HTMLElement>('.lf-island');
    if (island) {
      island.style.display = 'none';
    }
  }

  // Create a side panel container next to the main content
  const contentContainer = document.getElementById("il-lectio-content");
  if (!contentContainer) return;

  const panel = document.createElement("div");
  panel.id = "il-forside-schedule-panel";
  panel.className = "w-[30rem] shrink-0 flex flex-col overflow-hidden max-md:hidden pr-4 py-4";
  // Inner card with rounding and border
  const inner = document.createElement("div");
  inner.className = "flex flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm";
  panel.appendChild(inner);
  // Insert after il-lectio-content (as a sibling inside SidebarInset)
  contentContainer.parentElement?.appendChild(panel);

  // Fetch schedule from SkemaNy.aspx and render the panel
  fetchScheduleWeek(schoolId).then((weekData) => {
    if (!weekData || weekData.days.length === 0) return;

    const enhanceBricks = (container: HTMLElement) => {
      // Wrap in #il-original-content context temporarily so CSS selectors work
      container.querySelectorAll<HTMLElement>('.s2skemabrik.s2bgbox').forEach((brick) => {
        if (brick.style.display === 'none') return;

        const innerContainer = brick.querySelector<HTMLElement>('.s2skemabrikInnerContainer');
        if (!innerContainer || innerContainer.classList.contains('il-enhanced')) return;

        const content = innerContainer.querySelector<HTMLElement>('.s2skemabrikcontent');
        if (!content) return;

        // Detect narrow bricks
        const inlineWidth = brick.style.width;
        if (inlineWidth && parseFloat(inlineWidth) < 8) {
          brick.classList.add('il-narrow');
        }

        const holdSpan = content.querySelector<HTMLElement>('span[data-lectiocontextcard^="HE"]');
        const teacherSpan = content.querySelector<HTMLElement>('span[data-lectiocontextcard^="T"]');
        const topicSpan = content.querySelector<HTMLElement>('span[style*="word-wrap"]') ||
          content.querySelector<HTMLElement>('span[style*="white-space"]');
        const icons = innerContainer.querySelector<HTMLElement>('.s2skemabrikIcons');

        const holdCode = holdSpan?.getAttribute('title') || holdSpan?.textContent?.trim() || '';
        const holdDisplayName = holdCode ? getHoldDisplayName(holdCode) : '';
        const hasMappedHoldTitle = holdCode ? hasHoldMapping(holdCode) : false;
        const topicText = topicSpan?.textContent?.trim() || '';

        // Extract room
        const contentText = content.textContent || '';
        const firstLine = contentText.split('\n').map(s => s.trim()).filter(Boolean)[0] || '';
        const dotParts = firstLine.split('•').map(s => s.trim()).filter(Boolean);
        let room = '';
        if (dotParts.length >= 3) {
          let lastPart = dotParts[dotParts.length - 1];
          if (topicText && lastPart.endsWith(topicText)) {
            lastPart = lastPart.slice(0, -topicText.length).replace(/\s*-\s*$/, '');
          }
          room = lastPart;
        }

        // Apply hold color
        const hue = holdCode ? getHoldHue(holdCode) : 265;
        brick.style.setProperty('--brick-hue', String(hue));

        // Mark enhanced and rebuild content
        innerContainer.classList.add('il-enhanced');
        innerContainer.textContent = '';

        // Header: subject + room
        const header = document.createElement('div');
        header.className = 'il-brick-header';

        let topicUsedAsSubject = false;
        if (hasMappedHoldTitle) {
          if (holdSpan) {
            holdSpan.textContent = holdDisplayName || holdCode;
            holdSpan.classList.add('il-brick-subject');
            header.appendChild(holdSpan);
          } else if (holdDisplayName) {
            const subjectLabel = document.createElement('span');
            subjectLabel.className = 'il-brick-subject';
            subjectLabel.textContent = holdDisplayName;
            header.appendChild(subjectLabel);
          }
        } else if (topicText) {
          const subjectLabel = document.createElement('span');
          subjectLabel.className = 'il-brick-subject';
          subjectLabel.textContent = topicText;
          header.appendChild(subjectLabel);
          topicUsedAsSubject = true;
        } else if (holdSpan) {
          holdSpan.classList.add('il-brick-subject');
          header.appendChild(holdSpan);
        } else if (holdCode) {
          const subjectLabel = document.createElement('span');
          subjectLabel.className = 'il-brick-subject';
          subjectLabel.textContent = holdCode;
          header.appendChild(subjectLabel);
        }

        if (room) {
          const roomBadge = document.createElement('span');
          roomBadge.className = 'il-brick-room';
          roomBadge.textContent = room;
          header.appendChild(roomBadge);
        }

        if (brick.classList.contains('s2cancelled')) {
          const badge = document.createElement('span');
          badge.className = 'il-brick-cancelled-badge';
          badge.textContent = 'Aflyst';
          header.appendChild(badge);
        }

        if (brick.classList.contains('s2changed') && !brick.classList.contains('s2cancelled')) {
          const badge = document.createElement('span');
          badge.className = 'il-brick-changed-badge';
          badge.textContent = 'Ændret';
          header.appendChild(badge);
        }

        innerContainer.appendChild(header);

        // Meta: teacher
        if (teacherSpan) {
          const meta = document.createElement('div');
          meta.className = 'il-brick-meta';
          meta.appendChild(teacherSpan);
          innerContainer.appendChild(meta);
        }

        // Topic
        if (topicSpan && !topicUsedAsSubject && topicText) {
          const topicDiv = document.createElement('div');
          topicDiv.className = 'il-brick-topic';
          topicDiv.textContent = topicText;
          innerContainer.appendChild(topicDiv);
        }

        // Icons
        if (icons && icons.children.length > 0) {
          icons.className = 'il-brick-icons';
          innerContainer.appendChild(icons);
        }
      });

      // Intercept brick clicks for activity modal
      container.querySelectorAll<HTMLAnchorElement>('.s2skemabrik.s2bgbox[href]').forEach((brick) => {
        brick.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const href = brick.getAttribute('href') || '';
          const activityUrl = href.startsWith('/') ? `${window.location.origin}${href}` : href;
          window.dispatchEvent(
            new CustomEvent('betterlectio:openActivityModal', {
              detail: { url: activityUrl },
            }),
          );
        });
      });

      // Scan holds, replace teacher initials, init hovercards
      scanDOMForHolds(container);
      initBrickTooltips(container);
      loadTeacherNames(schoolId).then(cache => {
        if (!cache) return;
        replaceTeacherInitialsInDOM(cache, container);
      });
    };

    const scheduleSettings = getSettings().schedule || {};
    const showTimeIndicator = scheduleSettings.currentTimeIndicator ?? true;
    const showTimeLabel = scheduleSettings.currentTimeLabel ?? false;

    const renderTarget = panel.querySelector('.rounded-2xl') || panel;
    render(
      <ForsideSchedulePanel
        initialWeekData={weekData}
        schoolId={schoolId}
        onBricksInjected={enhanceBricks}
        showTimeIndicator={showTimeIndicator}
        showTimeLabel={showTimeLabel}
      />,
      renderTarget,
    );

  });
}

function applyMasonryLayout() {
  // Delay to ensure CSS has been applied and container has proper width
  setTimeout(() => {
    const container = document.querySelector(
      "#il-original-content .ls-std-island-layout-ltr",
    ) as HTMLElement;
    if (!container) return;

    // Get all cards (they're inside column wrappers with display: contents)
    const cards = Array.from(
      container.querySelectorAll(".lf-island"),
    ) as HTMLElement[];
    if (cards.length === 0) return;

    const layoutMasonry = () => {
      // Use the scroll container width minus padding (1.5rem * 2 = 48px)
      const scrollContainer = document.getElementById("il-lectio-content");
      const containerWidth = scrollContainer
        ? scrollContainer.clientWidth - 48
        : container.clientWidth;
      const gap = 16; // 1rem
      const minCardWidth = 280; // Minimum card width before reducing columns

      // Calculate number of columns based on container width
      let numColumns = Math.floor(
        (containerWidth + gap) / (minCardWidth + gap),
      );
      numColumns = Math.max(1, Math.min(numColumns, 3)); // Between 1 and 3 columns

      // For very narrow screens, force single column if width is less than 600px
      if (containerWidth < 600) {
        numColumns = 1;
      } else if (containerWidth < 900) {
        numColumns = Math.min(numColumns, 2);
      }

      const cardWidth = (containerWidth - (numColumns - 1) * gap) / numColumns;

      // Set container width explicitly to match the calculated width
      // Use setProperty with !important to override any CSS rules
      container.style.setProperty("width", `${containerWidth}px`, "important");

      // Track the height of each column
      const columnHeights = new Array(numColumns).fill(0);
      const cardHeights: number[] = [];

      // First pass: apply size styles and measure once to avoid layout thrash.
      cards.forEach((card) => {
        card.style.position = "absolute";
        card.style.width = `${cardWidth}px`;
        card.style.left = "0px";
        card.style.top = "0px";
      });
      cards.forEach((card) => {
        cardHeights.push(card.offsetHeight);
      });

      cards.forEach((card, idx) => {
        // Find the shortest column
        const shortestColumn = columnHeights.indexOf(
          Math.min(...columnHeights),
        );

        // Position the card
        card.style.left = `${shortestColumn * (cardWidth + gap)}px`;
        card.style.top = `${columnHeights[shortestColumn]}px`;

        // Update the column height
        columnHeights[shortestColumn] += cardHeights[idx] + gap;
      });

      // Set container height to tallest column
      container.style.setProperty(
        "height",
        `${Math.max(...columnHeights)}px`,
        "important",
      );

    };

    // Make container relative for absolute positioning
    container.style.position = "relative";
    container.style.marginTop = "1rem";

    // Initial layout after a frame to ensure styles are applied
    requestAnimationFrame(() => {
      layoutMasonry();
    });

    // Relayout on resize - observe the scroll container for width changes
    const scrollContainer = document.getElementById("il-lectio-content");
    if (scrollContainer) {
      masonryResizeObserver?.disconnect();
      masonryResizeObserver = new ResizeObserver(() => {
        layoutMasonry();
      });
      masonryResizeObserver.observe(scrollContainer);
    }

    // Relayout when card content changes (e.g. async-fetched missing assignments)
    if (masonryRelayoutHandler) {
      window.removeEventListener('betterlectio:relayoutMasonry', masonryRelayoutHandler);
    }
    masonryRelayoutHandler = () => layoutMasonry();
    window.addEventListener('betterlectio:relayoutMasonry', masonryRelayoutHandler);
  }, 50);
}

function injectViewingScheduleHeader(schoolId: string) {
  const viewedEntity = extractViewedEntity();
  if (!viewedEntity) return;

  // Find the content container
  const contentContainer = document.getElementById("il-lectio-content");
  if (!contentContainer) return;

  // Create container for the header
  const headerContainer = document.createElement("div");
  headerContainer.id = "il-viewing-schedule-header";

  // Insert at the beginning of the content container
  contentContainer.insertBefore(headerContainer, contentContainer.firstChild);

  // Use ProfilePage for students only, ViewingScheduleHeader for teachers and other types
  const isPersonType =
    viewedEntity.type === "student";

  const renderHeader = (headerName: string) => {
    if (isPersonType) {
      render(
        <ProfilePage
          name={headerName}
          subtitle={viewedEntity.subtitle}
          pictureUrl={viewedEntity.pictureUrl}
          type={viewedEntity.type}
          schoolId={schoolId}
          entityId={viewedEntity.id}
        />,
        headerContainer,
      );
    } else {
      render(
        <ViewingScheduleHeader
          name={headerName}
          subtitle={viewedEntity.subtitle}
          pictureUrl={viewedEntity.pictureUrl}
          type={viewedEntity.type}
          schoolId={schoolId}
          entityId={viewedEntity.id}
        />,
        headerContainer,
      );
    }
  };

  // Render immediately with extracted name, then refine teacher names from cache.
  renderHeader(viewedEntity.name);

  if (viewedEntity.type === "teacher") {
    loadTeacherNames(schoolId).then((cache) => {
      const teacherName = cache?.byId[viewedEntity.id]?.fullName;
      if (teacherName && teacherName !== viewedEntity.name) {
        renderHeader(teacherName);
      }
    });
  }

  console.log(
    "[BetterLectio] Viewing schedule header injected for",
    viewedEntity.type,
  );
}

function injectMembersPage(schoolId: string) {
  const url = new URL(window.location.href);
  const reportType = url.searchParams.get("reporttype");

  // Redirect to withpics format if not already there (gives us pictures in the table)
  if (reportType !== "withpics") {
    url.searchParams.set("reporttype", "withpics");
    window.location.replace(url.toString());
    return;
  }

  // Parse members from the existing table
  const members = parseMembersFromDOM();
  if (members.length === 0) {
    console.log("[BetterLectio] No members found on page");
    return;
  }

  // Find the content container
  const contentContainer = document.getElementById("il-lectio-content");
  if (!contentContainer) return;

  // Create container for our members page
  const membersContainer = document.createElement("div");
  membersContainer.id = "il-members-page";

  // Append to content container (after the viewing header if present)
  contentContainer.appendChild(membersContainer);

  // Add class to hide the original Lectio content
  document.body.classList.add("il-members-page-active");

  // Render the members page component
  render(
    <MembersPage schoolId={schoolId} members={members} />,
    membersContainer,
  );

  console.log(
    "[BetterLectio] Members page injected with",
    members.length,
    "members",
  );
}

function injectBeskederPage(schoolId: string) {
  // Detect which beskeder state we're in
  if (isThreadViewState()) {
    injectBeskederThreadView(schoolId);
    return;
  }

  if (isComposeState()) {
    injectBeskederCompose(schoolId);
    return;
  }

  // Check for compose-to signal from ProfilePage "Skriv besked" button
  const composeToRaw = sessionStorage.getItem('bl-compose-to');
  if (composeToRaw) {
    try {
      const composeTo = JSON.parse(composeToRaw);
      if (composeTo?.contextId && composeTo?.name) {
        // Hide original Lectio DOM while postback reloads into compose state
        document.body.classList.add("il-beskeder-page-active");
        newMessage();
        return;
      }
    } catch {
      sessionStorage.removeItem('bl-compose-to');
    }
  }

  // Default: thread list
  const data = parseBeskederFromDOM();

  const contentContainer = document.getElementById("il-lectio-content");
  if (!contentContainer) return;

  const beskederContainer = document.createElement("div");
  beskederContainer.id = "il-beskeder-page";
  contentContainer.appendChild(beskederContainer);

  document.body.classList.add("il-beskeder-page-active");

  render(<BeskederPage data={data} schoolId={schoolId} />, beskederContainer);

  console.log(
    "[BetterLectio] Beskeder page injected with",
    data.threads.length,
    "threads,",
    data.folders.length,
    "folders",
  );
}

function injectBeskederThreadView(schoolId: string) {
  const data = parseThreadFromDOM();

  const contentContainer = document.getElementById("il-lectio-content");
  if (!contentContainer) return;

  const threadContainer = document.createElement("div");
  threadContainer.id = "il-beskeder-thread";
  contentContainer.appendChild(threadContainer);

  document.body.classList.add("il-beskeder-page-active");

  render(
    <BeskederThreadView data={data} schoolId={schoolId} />,
    threadContainer,
  );

  console.log(
    "[BetterLectio] Thread view injected with",
    data.messages.length,
    "messages",
  );
}

function injectBeskederCompose(schoolId: string) {
  document.body.classList.add("il-beskeder-page-active");
  document.body.classList.add("bl-beskeder-compose-active");

  const data = parseComposeFromDOM();
  if (!data) {
    // Fallback: show native form
    enhanceComposeForm();
    console.warn("[BetterLectio] Compose parser failed, using fallback");
    return;
  }

  const container = document.createElement("div");
  container.id = "il-beskeder-compose";
  // CRITICAL: Append inside the ASP.NET form so that moved native elements
  // (autocomplete hidden inputs, attach fields, checkbox) remain form
  // descendants and their values are included in __doPostBack submissions.
  const form = document.getElementById("aspnetForm");
  (form || document.getElementById("il-lectio-content"))?.appendChild(container);

  render(<BeskederComposePage data={data} schoolId={schoolId} />, container);

  console.log("[BetterLectio] Compose page rendered");
}

function injectLektierPage(_schoolId: string) {
  const entries = parseLektierFromDOM();

  const contentContainer = document.getElementById("il-lectio-content");
  if (!contentContainer) return;

  const lektierContainer = document.createElement("div");
  lektierContainer.id = "il-lektier-page";
  contentContainer.appendChild(lektierContainer);

  document.body.classList.add("il-lektier-page-active");

  render(<LektierPage entries={entries} />, lektierContainer);

  if (entries.length === 0) {
    console.log("[BetterLectio] Lektier page injected in empty state");
  } else {
    console.log(
      "[BetterLectio] Lektier page injected with",
      entries.length,
      "entries",
    );
  }
}

async function injectOpgaverPage(schoolId: string) {
  const contentContainer = document.getElementById("il-lectio-content");
  if (!contentContainer) return;

  const opgaverContainer = document.createElement("div");
  opgaverContainer.id = "il-opgaver-page";
  contentContainer.appendChild(opgaverContainer);

  document.body.classList.add("il-opgaver-page-active");

  // Render immediately with current (possibly filtered) entries
  const initialEntries = parseOpgaverFromDOM();
  render(<OpgaverPage entries={initialEntries} schoolId={schoolId} />, opgaverContainer);

  // Fetch all opgaver (with "Vis kun aktuelle" unchecked)
  const allEntries = await fetchAllOpgaver();
  if (allEntries && allEntries.length > 0) {
    render(<OpgaverPage entries={allEntries} schoolId={schoolId} />, opgaverContainer);
  }
}

async function injectFravaerPage(schoolId: string) {
  const contentContainer = document.getElementById("il-lectio-content");
  if (!contentContainer) return;

  const fravaerContainer = document.createElement("div");
  fravaerContainer.id = "il-fravaer-page";
  contentContainer.appendChild(fravaerContainer);

  document.body.classList.add("il-fravaer-page-active");

  // Show a loading state while we fetch both pages
  fravaerContainer.innerHTML = '<div class="il-fravaer-initial-loading"><div class="il-fravaer-spinner"></div><span>Henter fraværsdata...</span></div>';

  try {
    const data = await fetchCombinedFravaerData();
    render(<FravaerPage data={data} schoolId={schoolId} />, fravaerContainer);
  } catch (err) {
    console.error("[BetterLectio] Failed to load fravær page:", err);
    fravaerContainer.innerHTML = '<div class="il-fravaer-initial-loading"><span>Kunne ikke hente fraværsdata. Prøv at genindlæse siden.</span></div>';
  }
}

function injectKaraktererPage(_schoolId: string) {
  const data = parseKaraktererFromDOM();

  const contentContainer = document.getElementById("il-lectio-content");
  if (!contentContainer) return;

  const container = document.createElement("div");
  container.id = "il-karakterer-page";
  contentContainer.appendChild(container);

  document.body.classList.add("il-karakterer-page-active");

  render(<KaraktererPage data={data} />, container);

  console.log(
    "[BetterLectio] Karakterer page injected with",
    data.grades.length,
    "grade entries",
  );
}

function injectProfilPage(schoolId: string) {
  const data = parseProfilFromDOM();

  const contentContainer = document.getElementById("il-lectio-content");
  if (!contentContainer) return;

  const container = document.createElement("div");
  container.id = "il-profil-page";
  contentContainer.appendChild(container);

  document.body.classList.add("il-profil-page-active");

  render(<ProfilPage data={data} schoolId={schoolId} />, container);

  console.log("[BetterLectio] Profil page injected");
}
