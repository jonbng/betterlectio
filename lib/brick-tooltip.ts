/**
 * Custom tooltip system for schedule bricks.
 * Replaces Lectio's jQuery Cluetip with a modern, well-positioned tooltip card.
 *
 * Key improvements:
 * - Parsed structured content (title, time, hold, teacher, room, homework)
 * - Async-fetched enriched content (note, rich lektier, related items)
 * - Smart positioning with viewport-aware flipping
 * - Hover bridge prevents flashing when cursor crosses brick/tooltip gap
 * - Smooth CSS-driven enter/exit animations
 */

import { getHoldDisplayName, getHoldHue } from "./hold-mapping";
import {
  fetchActivityDetail,
  getCachedActivityDetail,
  type ActivityDetail,
  type ActivityHomeworkItem,
  type ActivityRelatedItem,
} from "./activity-detail";

// ── Types ──────────────────────────────────────────────

interface TooltipData {
  changed: boolean;
  title: string;
  date: string;
  time: string; // e.g. "08:10 til 09:50" or "Hele dagen"
  hold: string[];
  teacher: string;
  room: string;
  students: string;
  homework: HomeworkItem[];
  note: string;
}

interface HomeworkItem {
  label: string;
  description: string;
}

// ── Tooltip state ──────────────────────────────────────

let tooltipEl: HTMLElement | null = null;
let bridgeEl: HTMLElement | null = null;
let activeBrick: HTMLElement | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;
let showTimeout: ReturnType<typeof setTimeout> | null = null;
let activeFetchController: AbortController | null = null;
/** Tracks which brick we're currently fetching for, to avoid stale updates */
let fetchingForBrick: HTMLElement | null = null;

// ── Parsing ────────────────────────────────────────────

function parseTooltip(raw: string): TooltipData {
  const lines = raw.split(/\r?\n/);
  const data: TooltipData = {
    changed: false,
    title: "",
    date: "",
    time: "",
    hold: [],
    teacher: "",
    room: "",
    students: "",
    homework: [],
    note: "",
  };

  let i = 0;

  // Check for "Ændret!" prefix
  if (lines[i]?.trim() === "Ændret!") {
    data.changed = true;
    i++;
  }

  // Title line(s) — everything before the date line
  // Date line matches: "23/2-2026 08:10 til 09:50" or "23/2-2026 Hele dagen"
  const datePattern = /^\d{1,2}\/\d{1,2}-\d{4}\s/;
  const titleParts: string[] = [];

  while (i < lines.length && !datePattern.test(lines[i].trim())) {
    const line = lines[i].trim();
    // Stop if we hit a meta line (Hold:, Lærer:, etc.)
    if (/^(Hold:|Lærer:|Lokale:|Elever:|Lektier:)/.test(line)) break;
    if (line) titleParts.push(line);
    i++;
  }
  data.title = titleParts.join(" ");

  // Date/time line
  if (i < lines.length && datePattern.test(lines[i].trim())) {
    const dateLine = lines[i].trim();
    const dateMatch = dateLine.match(
      /^(\d{1,2}\/\d{1,2}-\d{4})\s+(.+)$/,
    );
    if (dateMatch) {
      data.date = dateMatch[1];
      data.time = dateMatch[2];
    }
    i++;
  }

  // Meta lines: Hold, Lærer, Lokale, Elever
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }

    if (line.startsWith("Hold: ")) {
      data.hold = line
        .slice(6)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      i++;
    } else if (line.startsWith("Lærer: ")) {
      data.teacher = line.slice(7);
      i++;
    } else if (line.startsWith("Lokale: ")) {
      data.room = line.slice(8);
      i++;
    } else if (line.startsWith("Elever: ")) {
      data.students = line.slice(8);
      i++;
    } else if (line.startsWith("Lektier:") || line === "Lektier:") {
      i++;
      break;
    } else if (line.startsWith("Note:") || line === "Note:") {
      i++;
      // Collect note lines until blank line or EOF
      const noteParts: string[] = [];
      while (i < lines.length && lines[i].trim()) {
        noteParts.push(lines[i].trim());
        i++;
      }
      data.note = noteParts.join(" ");
    } else {
      // Unknown line — could be part of a multi-line hold or students
      i++;
    }
  }

  // Homework items — lines starting with "- " and indented descriptions
  let currentItem: HomeworkItem | null = null;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("- ")) {
      if (currentItem) data.homework.push(currentItem);
      currentItem = { label: trimmed.slice(2), description: "" };
    } else if (currentItem && trimmed.startsWith("(") && trimmed.endsWith(")")) {
      // Parenthesized description block
      currentItem.description = trimmed.slice(1, -1);
    } else if (currentItem && (line.startsWith("    ") || line.startsWith("\t"))) {
      // Indented continuation of description
      const descLine = trimmed;
      if (descLine.startsWith("(")) {
        currentItem.description += (currentItem.description ? " " : "") + descLine.slice(1);
      } else if (descLine.endsWith(")")) {
        currentItem.description += (currentItem.description ? " " : "") + descLine.slice(0, -1);
      } else {
        currentItem.description += (currentItem.description ? " " : "") + descLine;
      }
    }
    i++;
  }
  if (currentItem) data.homework.push(currentItem);

  return data;
}

// ── Activity URL extraction ────────────────────────────

function getActivityUrl(brick: HTMLElement): string | null {
  // Schedule bricks are <a> tags linking to aktivitetforside2.aspx
  const anchor = brick.closest("a[href]") as HTMLAnchorElement | null;
  if (!anchor) return null;
  const href = anchor.getAttribute("href");
  if (!href) return null;
  try {
    const url = new URL(href, window.location.origin);
    if (/aktivitetforside2\.aspx/i.test(url.pathname)) {
      return url.href;
    }
  } catch {
    // ignore
  }
  return null;
}

// ── DOM creation ───────────────────────────────────────

function createTooltipElement(): HTMLElement {
  const el = document.createElement("div");
  el.id = "il-brick-tooltip";
  el.setAttribute("role", "tooltip");
  document.body.appendChild(el);
  return el;
}

function createBridgeElement(): HTMLElement {
  const el = document.createElement("div");
  el.id = "il-brick-tooltip-bridge";
  document.body.appendChild(el);
  return el;
}

// ── SVG icons (inline, no dependencies) ────────────────

const ICON_CLOCK = `<svg class="il-tt-icon" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2"/><path d="M8 4.5V8l2.5 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const ICON_HOMEWORK = `<svg class="il-tt-icon" viewBox="0 0 16 16" fill="none"><path d="M3 2.5h7l3 3V13a.5.5 0 01-.5.5h-9A.5.5 0 013 13V3a.5.5 0 01.5-.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M10 2.5V5.5h3" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M5.5 8h5M5.5 10.5h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;

const ICON_NOTE = `<svg class="il-tt-icon" viewBox="0 0 16 16" fill="none"><path d="M13 10l-3 3H4a.5.5 0 01-.5-.5v-9A.5.5 0 014 3h8.5a.5.5 0 01.5.5V10z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M13 10h-3v3" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6 6.5h4M6 9h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;

const ICON_LINK = `<svg class="il-tt-icon" viewBox="0 0 16 16" fill="none"><path d="M6.5 9.5l3-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M9 10.5l1.5-1.5a2.121 2.121 0 000-3v0a2.121 2.121 0 00-3 0L6 7.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M7 5.5L5.5 7a2.121 2.121 0 000 3v0a2.121 2.121 0 003 0L10 8.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;

const ICON_FILE = `<svg class="il-tt-icon il-tt-icon--sm" viewBox="0 0 16 16" fill="none"><path d="M4 2h5.5l3 3V13.5a.5.5 0 01-.5.5H4a.5.5 0 01-.5-.5V2.5A.5.5 0 014 2z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M9.5 2v3.5h3" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>`;

const ICON_SPINNER = `<svg class="il-tt-icon il-tt-spinner" viewBox="0 0 16 16" fill="none"><path d="M8 2a6 6 0 105.196 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

// ── Rendering ──────────────────────────────────────────

function renderTooltip(data: TooltipData, hue: number): string {
  const parts: string[] = [];

  // Header section
  parts.push('<div class="il-tt-header">');

  if (data.title) {
    parts.push(`<div class="il-tt-title">${esc(data.title)}</div>`);
  }

  if (data.changed) {
    parts.push('<span class="il-tt-badge il-tt-badge--changed">Ændret</span>');
  }

  // Time row
  if (data.date || data.time) {
    parts.push('<div class="il-tt-time">');
    parts.push(ICON_CLOCK);
    if (data.date) {
      parts.push(`<span class="il-tt-date">${esc(formatDate(data.date))}</span>`);
    }
    if (data.time) {
      parts.push(
        `<span class="il-tt-timerange">${esc(data.time.replace("til", "–"))}</span>`,
      );
    }
    parts.push("</div>");
  }
  parts.push("</div>");

  // Meta section (hold, teacher, room)
  const hasMeta = data.hold.length > 0 || data.teacher || data.room;
  if (hasMeta) {
    parts.push('<div class="il-tt-meta">');

    if (data.hold.length > 0) {
      parts.push('<div class="il-tt-row">');
      parts.push('<span class="il-tt-label">Fag</span>');
      parts.push('<div class="il-tt-holds">');
      for (const h of data.hold) {
        const holdHue = getHoldHue(h);
        const displayName = getHoldDisplayName(h);
        parts.push(
          `<span class="il-tt-hold" style="--hold-hue:${holdHue}">${esc(displayName)}</span>`,
        );
      }
      parts.push("</div></div>");
    }

    if (data.teacher) {
      parts.push('<div class="il-tt-row">');
      parts.push('<span class="il-tt-label">Lærer</span>');
      parts.push(`<span class="il-tt-value">${esc(data.teacher)}</span>`);
      parts.push("</div>");
    }

    if (data.room) {
      parts.push('<div class="il-tt-row">');
      parts.push('<span class="il-tt-label">Lokale</span>');
      parts.push(`<span class="il-tt-value il-tt-room">${esc(data.room)}</span>`);
      parts.push("</div>");
    }

    if (data.students) {
      parts.push('<div class="il-tt-row">');
      parts.push('<span class="il-tt-label">Elever</span>');
      parts.push(`<span class="il-tt-value il-tt-students">${esc(data.students)}</span>`);
      parts.push("</div>");
    }

    parts.push("</div>");
  }

  // Homework section (basic, from tooltip text)
  if (data.homework.length > 0) {
    parts.push('<div class="il-tt-homework">');
    parts.push(
      `<div class="il-tt-homework-label">${ICON_HOMEWORK}Lektier</div>`,
    );
    for (const item of data.homework) {
      parts.push('<div class="il-tt-hw-item">');
      parts.push(`<span class="il-tt-hw-label">${esc(item.label)}</span>`);
      if (item.description) {
        parts.push(
          `<span class="il-tt-hw-desc">${esc(item.description)}</span>`,
        );
      }
      parts.push("</div>");
    }
    parts.push("</div>");
  }

  // Note section (basic, from tooltip text)
  if (data.note) {
    parts.push('<div class="il-tt-note">');
    parts.push(`<div class="il-tt-note-label">${ICON_NOTE}Note</div>`);
    parts.push(`<div class="il-tt-note-text">${esc(data.note)}</div>`);
    parts.push("</div>");
  }

  // Loading indicator placeholder (hidden initially, shown during fetch)
  parts.push('<div class="il-tt-loading" id="il-tt-loading" style="display:none">');
  parts.push(`${ICON_SPINNER}<span>Henter detaljer…</span>`);
  parts.push("</div>");

  return parts.join("");
}

// ── Enriched rendering (from fetched activity detail) ──

function renderEnrichedSections(detail: ActivityDetail, basicData: TooltipData): string {
  const parts: string[] = [];

  // ── Rich Note section ──
  // Prefer the fetched note (from the textarea) over the tooltip-parsed note
  const note = detail.note || basicData.note;
  if (note) {
    parts.push('<div class="il-tt-note">');
    parts.push(`<div class="il-tt-note-label">${ICON_NOTE}Note</div>`);
    parts.push(`<div class="il-tt-note-text">${esc(note)}</div>`);
    parts.push("</div>");
  }

  // ── Rich Lektier section ──
  if (detail.homework.length > 0) {
    parts.push('<div class="il-tt-homework">');
    parts.push(
      `<div class="il-tt-homework-label">${ICON_HOMEWORK}Lektier <span class="il-tt-count">${detail.homework.length}</span></div>`,
    );
    for (const item of detail.homework) {
      parts.push('<div class="il-tt-hw-item">');
      parts.push(`<span class="il-tt-hw-label">${esc(item.title)}</span>`);

      // Show content (sanitized HTML from the activity page, truncated for tooltip)
      const contentText = stripHtml(item.contentHtml);
      if (contentText) {
        parts.push(
          `<span class="il-tt-hw-desc">${esc(contentText)}</span>`,
        );
      }

      // Show file/link chips
      if (item.links.length > 0) {
        parts.push('<div class="il-tt-hw-links">');
        for (const link of item.links.slice(0, 3)) {
          const icon = link.type === "file" ? ICON_FILE : ICON_LINK;
          const label = truncate(link.label, 30);
          parts.push(
            `<a class="il-tt-hw-link" href="${escAttr(link.url)}" target="_blank" rel="noopener noreferrer" title="${escAttr(link.label)}">${icon}${esc(label)}</a>`,
          );
        }
        if (item.links.length > 3) {
          parts.push(`<span class="il-tt-hw-link il-tt-hw-link--more">+${item.links.length - 3}</span>`);
        }
        parts.push("</div>");
      }

      parts.push("</div>");
    }
    parts.push("</div>");
  } else if (basicData.homework.length > 0) {
    // Fall back to basic homework if fetch returned none (shouldn't happen, but safe)
    parts.push('<div class="il-tt-homework">');
    parts.push(
      `<div class="il-tt-homework-label">${ICON_HOMEWORK}Lektier</div>`,
    );
    for (const item of basicData.homework) {
      parts.push('<div class="il-tt-hw-item">');
      parts.push(`<span class="il-tt-hw-label">${esc(item.label)}</span>`);
      if (item.description) {
        parts.push(`<span class="il-tt-hw-desc">${esc(item.description)}</span>`);
      }
      parts.push("</div>");
    }
    parts.push("</div>");
  }

  // ── Related items section ──
  if (detail.related.length > 0) {
    parts.push('<div class="il-tt-related">');
    parts.push(
      `<div class="il-tt-related-label">${ICON_LINK}Relateret</div>`,
    );
    for (const item of detail.related.slice(0, 4)) {
      if (item.url) {
        parts.push(
          `<a class="il-tt-related-item il-tt-related-link" href="${escAttr(item.url)}" target="_blank" rel="noopener noreferrer" title="${escAttr(item.label)}">${esc(item.label)}</a>`,
        );
      } else {
        parts.push(`<span class="il-tt-related-item">${esc(item.label)}</span>`);
      }
    }
    if (detail.related.length > 4) {
      parts.push(`<span class="il-tt-related-item il-tt-related-more">+${detail.related.length - 4} mere</span>`);
    }
    parts.push("</div>");
  }

  return parts.join("");
}

/** Strip HTML tags and collapse whitespace to get plain text preview */
function stripHtml(html: string): string {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent || "").replace(/\s+/g, " ").trim();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function esc(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function escAttr(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Format "23/2-2026" to a friendlier Danish date like "Søn. 23. feb" */
function formatDate(raw: string): string {
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})-(\d{4})$/);
  if (!m) return raw;

  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  const year = parseInt(m[3], 10);
  const date = new Date(year, month, day);

  const days = ["Søn", "Man", "Tir", "Ons", "Tor", "Fre", "Lør"];
  const months = [
    "jan", "feb", "mar", "apr", "maj", "jun",
    "jul", "aug", "sep", "okt", "nov", "dec",
  ];

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(year, month, day);
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / 86400000,
  );

  if (diffDays === 0) return "I dag";
  if (diffDays === 1) return "I morgen";
  if (diffDays === -1) return "I går";

  return `${days[date.getDay()]}. ${day}. ${months[month]}`;
}

// ── Positioning ────────────────────────────────────────

function positionTooltip(
  brick: HTMLElement,
  tooltip: HTMLElement,
  bridge: HTMLElement,
) {
  const brickRect = brick.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const gap = 6;

  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  // Try right side first, then left, then below
  let top: number;
  let left: number;
  let bridgeTop: number;
  let bridgeLeft: number;
  let bridgeW: number;
  let bridgeH: number;

  const rightSpace = viewportW - brickRect.right;
  const leftSpace = brickRect.left;

  if (rightSpace >= tooltipRect.width + gap + 8) {
    // Place to the right
    left = brickRect.right + gap;
    top = brickRect.top + (brickRect.height - tooltipRect.height) / 2;
    // Bridge fills gap between brick and tooltip
    bridgeLeft = brickRect.right;
    bridgeTop = Math.min(brickRect.top, top);
    bridgeW = gap + 2;
    bridgeH =
      Math.max(brickRect.bottom, top + tooltipRect.height) - bridgeTop;
  } else if (leftSpace >= tooltipRect.width + gap + 8) {
    // Place to the left
    left = brickRect.left - tooltipRect.width - gap;
    top = brickRect.top + (brickRect.height - tooltipRect.height) / 2;
    bridgeLeft = brickRect.left - gap - 2;
    bridgeTop = Math.min(brickRect.top, top);
    bridgeW = gap + 2;
    bridgeH =
      Math.max(brickRect.bottom, top + tooltipRect.height) - bridgeTop;
  } else {
    // Place below
    left = brickRect.left;
    top = brickRect.bottom + gap;
    bridgeLeft = brickRect.left;
    bridgeTop = brickRect.bottom;
    bridgeW = brickRect.width;
    bridgeH = gap + 2;
  }

  // Clamp to viewport
  top = Math.max(8, Math.min(top, viewportH - tooltipRect.height - 8));
  left = Math.max(8, Math.min(left, viewportW - tooltipRect.width - 8));

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;

  // Position the invisible hover bridge
  bridge.style.top = `${bridgeTop}px`;
  bridge.style.left = `${bridgeLeft}px`;
  bridge.style.width = `${bridgeW}px`;
  bridge.style.height = `${bridgeH}px`;
}

/** Reposition tooltip after content changes (e.g. enrichment loaded) */
function repositionIfVisible(brick: HTMLElement) {
  if (!tooltipEl || !bridgeEl) return;
  if (!tooltipEl.classList.contains("il-tt-visible")) return;
  requestAnimationFrame(() => {
    if (!tooltipEl || !bridgeEl) return;
    positionTooltip(brick, tooltipEl, bridgeEl);
  });
}

// ── Enrichment fetch ───────────────────────────────────

function enrichTooltip(brick: HTMLElement, basicData: TooltipData, hue: number) {
  const activityUrl = getActivityUrl(brick);
  if (!activityUrl) return;

  // Check cache first — if we have it, render immediately
  const cached = getCachedActivityDetail(activityUrl);
  if (cached) {
    applyEnrichedContent(brick, cached, basicData, hue);
    return;
  }

  // Show loading indicator
  const loadingEl = tooltipEl?.querySelector("#il-tt-loading") as HTMLElement | null;
  if (loadingEl) {
    loadingEl.style.display = "";
  }

  // Cancel any previous fetch
  if (activeFetchController) {
    activeFetchController.abort();
  }
  activeFetchController = new AbortController();
  fetchingForBrick = brick;

  fetchActivityDetail(activityUrl, activeFetchController.signal)
    .then((detail) => {
      // Only apply if we're still showing the same brick's tooltip
      if (fetchingForBrick !== brick || activeBrick !== brick) return;
      applyEnrichedContent(brick, detail, basicData, hue);
    })
    .catch(() => {
      // Silently fail — basic tooltip content is still visible
      // Just hide the loading indicator
      if (fetchingForBrick === brick) {
        const el = tooltipEl?.querySelector("#il-tt-loading") as HTMLElement | null;
        if (el) el.style.display = "none";
      }
    })
    .finally(() => {
      if (fetchingForBrick === brick) {
        fetchingForBrick = null;
        activeFetchController = null;
      }
    });
}

function applyEnrichedContent(
  brick: HTMLElement,
  detail: ActivityDetail,
  basicData: TooltipData,
  hue: number,
) {
  if (!tooltipEl) return;

  // Remove basic homework, note, and loading indicator
  const basicHomework = tooltipEl.querySelector(".il-tt-homework");
  const basicNote = tooltipEl.querySelector(".il-tt-note");
  const loadingEl = tooltipEl.querySelector("#il-tt-loading");
  basicHomework?.remove();
  basicNote?.remove();
  loadingEl?.remove();

  // Render enriched sections
  const enrichedHtml = renderEnrichedSections(detail, basicData);
  if (enrichedHtml) {
    const frag = document.createElement("div");
    frag.innerHTML = enrichedHtml;
    while (frag.firstChild) {
      tooltipEl.appendChild(frag.firstChild);
    }
  }

  // Reposition since content size changed
  repositionIfVisible(brick);
}

// ── Show / Hide ────────────────────────────────────────

function showTooltip(brick: HTMLElement) {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  if (showTimeout) {
    clearTimeout(showTimeout);
    showTimeout = null;
  }

  const raw = brick.dataset.ilTooltip;
  if (!raw) return;

  showTimeout = setTimeout(() => {
    showTimeout = null;

    if (!tooltipEl) tooltipEl = createTooltipElement();
    if (!bridgeEl) bridgeEl = createBridgeElement();

    const data = parseTooltip(raw);

    // Get hold hue from the brick (set during enhanceScheduleBricks)
    const brickHue = brick.style.getPropertyValue("--brick-hue") || "265";
    const hue = parseInt(brickHue, 10);

    tooltipEl.innerHTML = renderTooltip(data, hue);
    tooltipEl.style.setProperty("--tt-hue", String(hue));

    // Show but invisible first for measurement
    tooltipEl.classList.remove("il-tt-visible");
    tooltipEl.style.display = "block";
    bridgeEl.style.display = "block";

    // Measure and position
    requestAnimationFrame(() => {
      if (!tooltipEl || !bridgeEl) return;
      positionTooltip(brick, tooltipEl, bridgeEl);
      // Trigger enter animation
      tooltipEl.classList.add("il-tt-visible");
    });

    activeBrick = brick;

    // Fetch enriched content (from cache or network)
    enrichTooltip(brick, data, hue);
  }, 120);
}

function hideTooltip() {
  if (showTimeout) {
    clearTimeout(showTimeout);
    showTimeout = null;
  }

  if (hideTimeout) return;

  hideTimeout = setTimeout(() => {
    hideTimeout = null;

    // Cancel any in-progress fetch
    if (activeFetchController) {
      activeFetchController.abort();
      activeFetchController = null;
      fetchingForBrick = null;
    }

    if (tooltipEl) {
      tooltipEl.classList.remove("il-tt-visible");
      // Wait for exit animation
      setTimeout(() => {
        if (tooltipEl && !tooltipEl.classList.contains("il-tt-visible")) {
          tooltipEl.style.display = "none";
        }
      }, 150);
    }
    if (bridgeEl) {
      bridgeEl.style.display = "none";
    }
    activeBrick = null;
  }, 80);
}

function cancelHide() {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
}

// ── Initialization ─────────────────────────────────────

export function initBrickTooltips() {
  // Copy data-tooltip to our own data attribute.
  // Keep the original attribute intact because Lectio's cluetip callback
  // reads it lazily on hover; removing it causes runtime errors in Lectio.
  const bricks = document.querySelectorAll<HTMLElement>(
    "#il-original-content .s2skemabrik[data-tooltip]",
  );

  bricks.forEach((brick) => {
    const raw = brick.getAttribute("data-tooltip");
    if (raw) {
      brick.dataset.ilTooltip = raw;
    }

    brick.addEventListener("mouseenter", () => showTooltip(brick));
    brick.addEventListener("mouseleave", () => hideTooltip());
    brick.addEventListener("focus", () => showTooltip(brick));
    brick.addEventListener("blur", () => hideTooltip());
  });

  // Tooltip and bridge hover listeners — cancel hide when hovering them
  document.addEventListener("mouseover", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest("#il-brick-tooltip") || target.id === "il-brick-tooltip-bridge") {
      cancelHide();
    }
  });

  document.addEventListener("mouseout", (e) => {
    const target = e.target as HTMLElement;
    const related = e.relatedTarget as HTMLElement | null;

    if (
      (target.closest("#il-brick-tooltip") || target.id === "il-brick-tooltip-bridge") &&
      !related?.closest("#il-brick-tooltip") &&
      related?.id !== "il-brick-tooltip-bridge" &&
      !related?.closest(".s2skemabrik[data-il-tooltip]")
    ) {
      hideTooltip();
    }
  });

  // Also hide on scroll (the schedule can scroll)
  const scheduleContainer = document.querySelector("#il-original-content .s2skema");
  if (scheduleContainer) {
    scheduleContainer.addEventListener("scroll", () => {
      if (activeBrick) {
        if (showTimeout) {
          clearTimeout(showTimeout);
          showTimeout = null;
        }
        hideTooltip();
      }
    }, { passive: true });
  }

  // Hide the native cluetip element if it exists
  const cluetip = document.getElementById("cluetip");
  if (cluetip) {
    cluetip.style.display = "none";
  }
}
