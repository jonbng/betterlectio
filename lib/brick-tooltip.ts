/**
 * Custom tooltip system for schedule bricks.
 * Replaces Lectio's jQuery Cluetip with a modern, well-positioned tooltip card.
 *
 * Key improvements:
 * - Parsed structured content (title, time, hold, teacher, room, homework)
 * - Smart positioning with viewport-aware flipping
 * - Hover bridge prevents flashing when cursor crosses brick/tooltip gap
 * - Smooth CSS-driven enter/exit animations
 */

import { getHoldDisplayName, getHoldHue } from "./hold-mapping";

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
    parts.push(`<svg class="il-tt-icon" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2"/><path d="M8 4.5V8l2.5 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
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

  // Homework section
  if (data.homework.length > 0) {
    parts.push('<div class="il-tt-homework">');
    parts.push(
      `<div class="il-tt-homework-label"><svg class="il-tt-icon" viewBox="0 0 16 16" fill="none"><path d="M3 2.5h7l3 3V13a.5.5 0 01-.5.5h-9A.5.5 0 013 13V3a.5.5 0 01.5-.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M10 2.5V5.5h3" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M5.5 8h5M5.5 10.5h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>Lektier</div>`,
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

  // Note section
  if (data.note) {
    parts.push(`<div class="il-tt-note">${esc(data.note)}</div>`);
  }

  return parts.join("");
}

function esc(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
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
  // Move data-tooltip to our own data attribute and remove original
  // to prevent Lectio's cluetip from binding to these elements.
  const bricks = document.querySelectorAll<HTMLElement>(
    "#il-original-content .s2skemabrik[data-tooltip]",
  );

  bricks.forEach((brick) => {
    const raw = brick.getAttribute("data-tooltip");
    if (raw) {
      brick.dataset.ilTooltip = raw;
      brick.removeAttribute("data-tooltip");
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
