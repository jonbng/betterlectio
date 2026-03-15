import { render } from "preact";
import { AppSidebar } from "@/components/AppSidebar";
import { FindSkemaPage } from "@/components/FindSkemaPage";
import { ViewingScheduleHeader } from "@/components/ViewingScheduleHeader";
import { ForsideGreeting } from "@/components/ForsideGreeting";
import { MembersPage, parseMembersFromDOM } from "@/components/MembersPage";
import { LektierPage, parseLektierFromDOM } from "@/components/LektierPage";
import { OpgaverPage, parseOpgaverFromDOM, fetchAllOpgaver } from "@/components/OpgaverPage";
import { BeskederPage, parseBeskederFromDOM } from "@/components/BeskederPage";
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
import { ForsideOpgaverCard, parseForsideOpgaver } from "@/components/ForsideOpgaverCard";
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
import { scanDOMForHolds, replaceHoldCodesInDOM, getHoldHue, getHoldDisplayName, hasHoldMapping } from "@/lib/hold-mapping";
import { initBrickTooltips } from "@/lib/brick-tooltip";
import { initUserJotWidget, identifyUserJot, setUserJotTheme } from "@/lib/userjot";
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
    .forEach((el) => el.remove());

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

  // Update login state and profile cache
  updateLoginState();
  updateProfileCache();

  // Update page title to cleaner format
  if (settings.visual.cleanPageTitles ?? true) {
    updatePageTitle();
  }

  // Set cached profile data on window for AppSidebar to use
  const cachedProfile = getCachedProfile();
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
  if (settings.visual.customFavicon ?? true) {
    replaceFavicon();
  }

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

  // Preact render() is synchronous — move original content immediately
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
    scanDOMForHolds(wrapper);
    const holdReplacements = replaceHoldCodesInDOM(wrapper);
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
    document.getElementById('il-nav-blocker')?.remove();

    // Initialize preloading for faster navigation
    const schoolId = window.location.pathname.match(/\/lectio\/(\d+)\//)?.[1];
    if (schoolId) {
      if (settings.behavior.preloading ?? true) {
        initPreloading(schoolId);
      }

      // Inject FindSkema page
      if (
        (settings.pages.findSkemaRedesign ?? true) &&
        window.location.pathname.toLowerCase().includes("findskema.aspx")
      ) {
        injectFindSkemaPage(schoolId);
      }

      // Inject greeting on forside page
      if (
        (settings.pages.forsideRedesign ?? true) &&
        window.location.pathname.toLowerCase().includes("forside.aspx")
      ) {
        injectForsideGreeting(schoolId);
      }

      // Inject members page UI
      if (
        (settings.pages.membersPageCards ?? true) &&
        window.location.pathname.toLowerCase().includes("members.aspx")
      ) {
        injectMembersPage(schoolId);
      }

      // Inject lektier page UI
      if (
        (settings.pages.lektierRedesign ?? true) &&
        window.location.pathname.toLowerCase().includes("material_lektieoversigt")
      ) {
        injectLektierPage(schoolId);
      }

      // Inject opgaver page UI
      if (
        (settings.pages.opgaverRedesign ?? true) &&
        window.location.pathname.toLowerCase().includes("opgaverelev")
      ) {
        injectOpgaverPage(schoolId);
      }

      // Inject beskeder page UI
      if (
        (settings.pages.beskederRedesign ?? true) &&
        window.location.pathname.toLowerCase().includes("beskeder2.aspx")
      ) {
        injectBeskederPage(schoolId);
      }

      // Inject fravær page redesign
      if (
        (settings.pages.fravaerRedesign ?? true) &&
        /\/subnav\/fravaerelev(_fravaersaarsager)?\.aspx/i.test(
          window.location.pathname,
        )
      ) {
        injectFravaerPage(schoolId);
      }

      // Inject "viewing schedule" header when looking at someone else's schedule
      if (
        (settings.schedule.viewingScheduleHeader ?? true) &&
        !isViewingOwnPage()
      ) {
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
    if (settings.visual.cleanPageTitles ?? true) {
      observeTitleChanges();
    }

    // Set up schedule table column widths, clean labels, and highlight today
    injectScheduleColgroup();
    cleanUpModuleLabels();
    injectTodayButton();
    setupWeekendCollapse();
    if (settings.schedule.todayHighlight ?? true) {
      highlightTodayInSchedule();
      if (settings.schedule.currentTimeIndicator ?? true) {
        injectCurrentTimeIndicator(settings.schedule.currentTimeLabel ?? false);
      }
    }

    // Remove redundant tooltip on activity page title
    removeActivityTitleTooltip();

    // Initialize UserJot after our DOM move/rewrite to avoid layout side effects.
    initUserJotWidget();
    if (userJotIdentifyPayload) {
      identifyUserJot(userJotIdentifyPayload);
    }

    console.log("[BetterLectio] Dashboard layout injected");
  }
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

  // Reset previous indicator/interval before creating a new one
  const existing = container.querySelector('#il-time-indicator');
  if (existing) existing.remove();
  if (timeIndicatorIntervalId !== null) {
    window.clearInterval(timeIndicatorIntervalId);
    timeIndicatorIntervalId = null;
  }

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

function updateTimeIndicatorPosition() {
  const indicator = document.getElementById("il-time-indicator");
  if (!indicator) return;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Schedule runs from 8:10 (490 min) to 20:00 (1200 min)
  const startMinutes = 490;
  const endMinutes = 1200;

  // Hide if outside schedule hours
  if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
    indicator.style.display = "none";
    return;
  }

  // Calculate position using linear mapping
  // 8:10 (490 min) -> 0.636em, 20:00 (1200 min) -> 45.818em
  // Rate: (45.818 - 0.636) / (1200 - 490) = 0.0636 em/min
  const topEm = 0.636 + (currentMinutes - startMinutes) * 0.0636;

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

  // Check if we're already on the current week (no week param in URL)
  const isCurrentWeek = !new URLSearchParams(window.location.search).has("week");

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
      container.querySelectorAll<HTMLElement>(".s2skemabrik.s2brik"),
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
        ? getHoldDisplayName(cancelledCode)
        : "";

      // Hide the cancelled brick
      cancelled.style.display = "none";

      // Expand replacement to full width (use the standard full-width values)
      replacement.style.width = "13.82em";
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
    "#il-original-content .s2skemabrik.s2bgbox.s2brik",
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

    // Detect narrow bricks (side-by-side overlap, ~half width)
    const inlineWidth = brick.style.width;
    if (inlineWidth && parseFloat(inlineWidth) < 8) {
      brick.classList.add("il-narrow");
    }

    // Extract components from the original DOM
    const holdSpan = content.querySelector<HTMLElement>(
      'span[data-lectiocontextcard^="HE"]',
    );
    const teacherSpan = content.querySelector<HTMLElement>(
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
    const holdDisplayName = holdCode ? getHoldDisplayName(holdCode) : "";
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
    if (teacherSpan || timeline) {
      const meta = document.createElement("div");
      meta.className = "il-brick-meta";

      if (teacherSpan) {
        meta.appendChild(teacherSpan);
      }

      if (timeline) {
        if (teacherSpan) {
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

  // Replace native opgaver card with custom component
  enhanceForsideOpgaver(schoolId);

  // Apply masonry layout to dashboard cards
  applyMasonryLayout();

  console.log("[BetterLectio] Forside greeting injected");
}

function enhanceForsideOpgaver(schoolId: string) {
  const table = document.querySelector<HTMLTableElement>(
    '#s_m_Content_Content_ElevOpgaveAfleveringerDBB',
  );
  if (!table) return;

  const island = table.closest<HTMLElement>('.lf-island');
  if (!island) return;

  // Parse data from native DOM before replacing it
  const entries = parseForsideOpgaver(island);
  if (entries.length === 0) return;

  const opgaverPageUrl = `/lectio/${schoolId}/OpgaverElev.aspx`;

  // Clear island and render our custom card
  island.classList.add('il-foc-island');
  island.innerHTML = '';
  render(
    <ForsideOpgaverCard initialEntries={entries} opgaverPageUrl={opgaverPageUrl} schoolId={schoolId} />,
    island,
  );
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

  const renderHeader = (headerName: string) => {
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
