import { render } from "preact";
import { AppSidebar } from "@/components/AppSidebar";
import { FindSkemaPage } from "@/components/FindSkemaPage";
import { ViewingScheduleHeader } from "@/components/ViewingScheduleHeader";
import { ForsideGreeting } from "@/components/ForsideGreeting";
import { MembersPage, parseMembersFromDOM } from "@/components/MembersPage";
import { LektierPage, parseLektierFromDOM } from "@/components/LektierPage";
import { OpgaverPage, parseOpgaverFromDOM, fetchAllOpgaver } from "@/components/OpgaverPage";
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
import { loadTeacherNames, replaceTeacherInitialsInDOM } from "@/lib/teacher-cache";
import { scanDOMForHolds, replaceHoldCodesInDOM, getHoldHue, getHoldDisplayName } from "@/lib/hold-mapping";
import { initBrickTooltips } from "@/lib/brick-tooltip";
import "@/styles/globals.css";

export default defineContentScript({
  matches: ["*://*.lectio.dk/*"],
  main() {
    console.log("[BetterLectio] Content script loaded");

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
    <SidebarProvider defaultOpen={true}>
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
}

let activityModalInterceptorInstalled = false;

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
  // @ts-ignore
  const wasPrerendered =
    (window as any).__IL_PRERENDERED__ && !document.prerendering;

  // Check if this is the login.aspx page (session expired redirect, e.g. /lectio/94/login.aspx)
  const isLoginAspx = /\/lectio\/\d+\/login\.aspx/.test(
    window.location.pathname,
  );
  if (isLoginAspx) {
    const hasReturnUrl = new URLSearchParams(window.location.search).has('ReturnUrl');
    if (hasReturnUrl) {
      console.log("[BetterLectio] On login.aspx with ReturnUrl - auth redirect in progress, keeping state");
    } else {
      console.log("[BetterLectio] On login.aspx - session expired, clearing login state");
      updateLoginState(); // This will detect not logged in and clear the cache
    }
    document.documentElement.classList.add("il-ready");
    return;
  }

  // Don't inject on login page, print pages, or other non-app pages
  const isPrintPage = window.location.pathname.includes("print.aspx");
  const hasMainHeader = !!document.querySelector(".ls-master-header");

  if (!hasMainHeader || isPrintPage) {
    console.log("[BetterLectio] Not on main app page or print page, skipping");

    // If we're on a school page (has /lectio/XX/) but no main header,
    // user is likely logged out - update the state
    const isSchoolPage = /\/lectio\/\d+\//.test(window.location.pathname);
    if (isSchoolPage && !hasMainHeader && !isPrintPage) {
      console.log(
        "[BetterLectio] On school page but not logged in, clearing login state",
      );
      updateLoginState(); // This will detect not logged in and clear the cache
    }

    // Still reveal the page
    document.documentElement.classList.add("il-ready");
    return;
  }

  // Get settings for feature checks
  const settings = getSettings();

  applyDarkMode(settings.visual.darkMode ?? false);
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
  if (cachedProfile) {
    (window as any).__IL_CACHED_PROFILE__ = cachedProfile;
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
          injectForsideGreeting();
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

        // Inject fravær summary and subnavigation (Oversigt/Fraværsårsager)
        if (
          /\/subnav\/fravaerelev(_fravaersaarsager)?\.aspx/i.test(
            window.location.pathname,
          )
        ) {
          injectFravaerSummaryBar();
          injectFravaerSubnav();
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
      if (settings.schedule.todayHighlight ?? true) {
        highlightTodayInSchedule();
        if (settings.schedule.currentTimeIndicator ?? true) {
          injectCurrentTimeIndicator(settings.schedule.currentTimeLabel ?? false);
        }
      }

      // Remove redundant tooltip on activity page title
      removeActivityTitleTooltip();

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

  const tooltipElement = activityHeader.querySelector("[data-tooltip]");
  if (tooltipElement) {
    tooltipElement.removeAttribute("data-tooltip");
  }

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

  // Create the time indicator line
  const indicator = document.createElement("div");
  indicator.id = "il-time-indicator";
  indicator.innerHTML = showTimeLabel
    ? '<span class="il-time-label"></span><div class="il-time-dot"></div>'
    : '<div class="il-time-dot"></div>';
  container.appendChild(indicator);

  // Update position immediately and every minute
  updateTimeIndicatorPosition();
  setInterval(updateTimeIndicatorPosition, 60000);
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
    const topicSpan = content.querySelector<HTMLElement>(
      'span[style*="word-wrap"]',
    );
    const timeline = innerContainer.querySelector<HTMLElement>(".s2timeline");
    const icons = innerContainer.querySelector<HTMLElement>(
      ".s2skemabrikIcons",
    );

    // Get hold code for coloring (title attr has original code)
    const holdCode =
      holdSpan?.getAttribute("title") || holdSpan?.textContent?.trim() || "";

    // Extract room from content text: "\nHistorie • MR • 25\nMiddelalderen"
    // Content starts with a newline, so find the first non-empty line
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
      room = dotParts[dotParts.length - 1];
    }

    // Apply hold color as CSS custom property
    const hue = holdCode ? getHoldHue(holdCode) : 265;
    brick.style.setProperty("--brick-hue", String(hue));

    // Mark as enhanced and clear old content
    innerContainer.classList.add("il-enhanced");
    innerContainer.textContent = "";

    // ── Header: subject + room ──
    const header = document.createElement("div");
    header.className = "il-brick-header";

    let topicUsedAsSubject = false;
    if (holdSpan) {
      holdSpan.classList.add("il-brick-subject");
      header.appendChild(holdSpan);
    } else if (topicSpan) {
      // Fallback: use topic as subject when no hold span exists
      topicSpan.classList.add("il-brick-subject");
      topicSpan.style.removeProperty("word-wrap");
      header.appendChild(topicSpan);
      topicUsedAsSubject = true;
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
      const topicText = topicSpan.textContent?.trim();
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

function injectForsideGreeting() {
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
  render(<ForsideGreeting />, greetingContainer);

  // Apply masonry layout to dashboard cards
  applyMasonryLayout();

  console.log("[BetterLectio] Forside greeting injected");
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

      cards.forEach((card) => {
        // Find the shortest column
        const shortestColumn = columnHeights.indexOf(
          Math.min(...columnHeights),
        );

        // Position the card
        card.style.position = "absolute";
        card.style.width = `${cardWidth}px`;
        card.style.left = `${shortestColumn * (cardWidth + gap)}px`;
        card.style.top = `${columnHeights[shortestColumn]}px`;

        // Update the column height
        columnHeights[shortestColumn] += card.offsetHeight + gap;
      });

      // Set container height to tallest column
      container.style.setProperty(
        "height",
        `${Math.max(...columnHeights)}px`,
        "important",
      );

      console.log("[BetterLectio] Masonry layout:", {
        containerWidth,
        numColumns,
        cardWidth,
        scrollContainerWidth: scrollContainer?.clientWidth,
      });
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
      const resizeObserver = new ResizeObserver(() => {
        layoutMasonry();
      });
      resizeObserver.observe(scrollContainer);
    }
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

  // Render the header component
  render(
    <ViewingScheduleHeader
      name={viewedEntity.name}
      subtitle={viewedEntity.subtitle}
      pictureUrl={viewedEntity.pictureUrl}
      type={viewedEntity.type}
      schoolId={schoolId}
      entityId={viewedEntity.id}
    />,
    headerContainer,
  );

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

  const entries = allEntries && allEntries.length > 0 ? allEntries : initialEntries;
  console.log("[BetterLectio] Opgaver page injected with", entries.length, "entries");
}

function injectFravaerSubnav() {
  if (document.getElementById("il-fravaer-subnav")) return;

  const contentContainer = document.getElementById("il-lectio-content");
  if (!contentContainer) return;

  const sourceNav = document.querySelector(
    "#il-original-content .ls-subnav2",
  ) as HTMLElement | null;
  if (!sourceNav) return;

  const links = Array.from(sourceNav.querySelectorAll("a")).filter(
    (link) => !!link.getAttribute("href") && link.textContent?.trim(),
  );
  if (links.length === 0) return;

  const nav = document.createElement("nav");
  nav.id = "il-fravaer-subnav";
  nav.className = "il-fravaer-subnav";
  nav.setAttribute("aria-label", "Fravær");

  links.forEach((link) => {
    const href = link.getAttribute("href");
    if (!href) return;

    const linkUrl = new URL(href, window.location.origin);
    const navLink = document.createElement("a");
    navLink.href = linkUrl.toString();
    navLink.textContent = link.textContent?.trim() ?? "";
    navLink.className = "il-fravaer-subnav-link";

    if (linkUrl.pathname === window.location.pathname) {
      navLink.classList.add("is-active");
    }

    nav.appendChild(navLink);
  });

  if (!nav.childElementCount) return;

  document.body.classList.add("il-fravaer-page");

  const summaryBar = document.getElementById("il-fravaer-summary");
  const insertBeforeNode = summaryBar?.nextSibling ?? contentContainer.firstChild;
  contentContainer.insertBefore(nav, insertBeforeNode);
}

function injectFravaerSummaryBar() {
  if (document.getElementById("il-fravaer-summary")) return;

  const contentContainer = document.getElementById("il-lectio-content");
  if (!contentContainer) return;

  const summary = document.createElement("section");
  summary.id = "il-fravaer-summary";
  summary.className = "il-fravaer-summary";
  summary.setAttribute("role", "region");
  summary.setAttribute("aria-label", "Fravær overblik");

  const inner = document.createElement("div");
  inner.className = "il-fravaer-summary-inner";

  const header = document.createElement("div");
  header.className = "il-fravaer-summary-header";

  const title = document.createElement("div");
  title.className = "il-fravaer-summary-title";
  title.textContent =
    document
      .getElementById("s_m_HeaderContent_MainTitle")
      ?.textContent?.trim() || "Fravær";

  header.append(title);

  const metrics = buildFravaerSummaryMetrics();
  if (metrics.length > 0) {
    const metricsContainer = document.createElement("div");
    metricsContainer.className = "il-fravaer-summary-metrics";

    metrics.forEach((metric) => {
      const item = document.createElement("div");
      item.className = "il-fravaer-summary-metric";

      const label = document.createElement("span");
      label.className = "il-fravaer-summary-label";
      label.textContent = metric.label;

      const value = document.createElement("span");
      value.className = "il-fravaer-summary-value";
      value.textContent = metric.value;

      if (metric.subvalue) {
        const subvalue = document.createElement("span");
        subvalue.className = "il-fravaer-summary-subvalue";
        subvalue.textContent = metric.subvalue;
        item.append(label, value, subvalue);
      } else {
        item.append(label, value);
      }

      metricsContainer.appendChild(item);
    });

    inner.append(header, metricsContainer);
  } else {
    inner.appendChild(header);
  }

  summary.appendChild(inner);

  document.body.classList.add("il-fravaer-page");
  contentContainer.insertBefore(summary, contentContainer.firstChild);
}

function buildFravaerSummaryMetrics() {
  const metrics: Array<{ label: string; value: string; subvalue?: string }> =
    [];
  const table = document.getElementById(
    "s_m_Content_Content_SFTabStudentAbsenceDataTable",
  ) as HTMLTableElement | null;
  if (table) {
    const rows = Array.from(table.querySelectorAll("tr"));
    const totalRow = rows.find((row) =>
      row.textContent?.includes("Samlet"),
    ) as HTMLTableRowElement | undefined;
    if (!totalRow) return metrics;

    const cells = Array.from(totalRow.querySelectorAll("td"));
    if (cells.length < 9) return metrics;

    const almindeligtOpgjort = formatMetric(cells[1], cells[2]);
    const almindeligtAar = formatMetric(cells[3], cells[4]);
    const skriftligtOpgjort = formatMetric(cells[5], cells[6]);
    const skriftligtAar = formatMetric(cells[7], cells[8]);

    if (almindeligtOpgjort || almindeligtAar) {
      metrics.push({
        label: "Almindeligt",
        value: almindeligtOpgjort || almindeligtAar,
        subvalue:
          almindeligtOpgjort && almindeligtAar
            ? `Året ${almindeligtAar}`
            : undefined,
      });
    }

    if (skriftligtOpgjort || skriftligtAar) {
      metrics.push({
        label: "Skriftligt",
        value: skriftligtOpgjort || skriftligtAar,
        subvalue:
          skriftligtOpgjort && skriftligtAar
            ? `Året ${skriftligtAar}`
            : undefined,
      });
    }

    return metrics;
  }

  const almindeligtSamlet = document.getElementById(
    "s_m_Content_Content_FremmoedeFravaer",
  ) as HTMLElement | null;
  const skriftligtSamlet = document.getElementById(
    "s_m_Content_Content_SkriftligFravaer",
  ) as HTMLElement | null;

  if (almindeligtSamlet?.textContent?.trim()) {
    metrics.push({
      label: "Almindeligt",
      value: almindeligtSamlet.textContent.trim(),
    });
  }

  if (skriftligtSamlet?.textContent?.trim()) {
    metrics.push({
      label: "Skriftligt",
      value: skriftligtSamlet.textContent.trim(),
    });
  }

  return metrics;
}

function formatMetric(primaryCell?: Element, secondaryCell?: Element) {
  const primary = primaryCell?.textContent?.trim();
  const secondary = secondaryCell?.textContent?.trim();
  if (!primary && !secondary) return "";
  if (primary && secondary) return `${primary} (${secondary})`;
  return primary || secondary || "";
}
