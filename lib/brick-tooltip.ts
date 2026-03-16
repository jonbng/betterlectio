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
  otherContent: HomeworkItem[];
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
    otherContent: [],
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
  // Stop when hitting "Øvrigt indhold:" so those items don't bleed into homework
  let currentItem: HomeworkItem | null = null;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("Øvrigt indhold:") || trimmed === "Øvrigt indhold:") {
      if (currentItem) data.homework.push(currentItem);
      currentItem = null;
      i++;
      break;
    }

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

  // Øvrigt indhold items — same format as homework
  currentItem = null;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("- ")) {
      if (currentItem) data.otherContent.push(currentItem);
      currentItem = { label: trimmed.slice(2), description: "" };
    } else if (currentItem && trimmed.startsWith("(") && trimmed.endsWith(")")) {
      currentItem.description = trimmed.slice(1, -1);
    } else if (currentItem && (line.startsWith("    ") || line.startsWith("\t"))) {
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
  if (currentItem) data.otherContent.push(currentItem);

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
  el.id = "bl-brick-tooltip";
  el.className =
    "fixed z-[10000] hidden w-[21rem] max-w-[calc(100vw-1rem)] max-h-[min(28rem,calc(100vh-2rem))] overflow-y-auto overflow-x-hidden overscroll-contain font-sans text-[0.8125rem] leading-[1.45] text-foreground bg-popover border border-border rounded-xl shadow-[0_1px_2px_oklch(0_0_0/0.04),0_4px_16px_oklch(0_0_0/0.08),0_12px_40px_oklch(0_0_0/0.06)] dark:shadow-[0_1px_2px_oklch(0_0_0/0.25),0_4px_16px_oklch(0_0_0/0.35),0_12px_40px_oklch(0_0_0/0.25)] pointer-events-auto transition-all duration-150 ease-out opacity-0 translate-y-[3px] scale-[0.98]";
  el.style.scrollbarWidth = "thin";
  el.setAttribute("role", "tooltip");
  document.body.appendChild(el);
  return el;
}

function createBridgeElement(): HTMLElement {
  const el = document.createElement("div");
  el.id = "bl-brick-tooltip-bridge";
  el.className = "fixed z-[9999] hidden pointer-events-auto";
  document.body.appendChild(el);
  return el;
}

// ── SVG icons (inline, no dependencies) ────────────────

const ICON_CLOCK = `<svg class="size-3.5 shrink-0 text-muted-foreground" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2"/><path d="M8 4.5V8l2.5 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const ICON_HOMEWORK = `<svg class="size-3.5 shrink-0" viewBox="0 0 16 16" fill="none"><path d="M3 2.5h7l3 3V13a.5.5 0 01-.5.5h-9A.5.5 0 013 13V3a.5.5 0 01.5-.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M10 2.5V5.5h3" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M5.5 8h5M5.5 10.5h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;

const ICON_NOTE = `<svg class="size-3.5 shrink-0" viewBox="0 0 16 16" fill="none"><path d="M13 10l-3 3H4a.5.5 0 01-.5-.5v-9A.5.5 0 014 3h8.5a.5.5 0 01.5.5V10z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M13 10h-3v3" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6 6.5h4M6 9h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;

const ICON_LINK = `<svg class="size-3.5 shrink-0" viewBox="0 0 16 16" fill="none"><path d="M6.5 9.5l3-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M9 10.5l1.5-1.5a2.121 2.121 0 000-3v0a2.121 2.121 0 00-3 0L6 7.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M7 5.5L5.5 7a2.121 2.121 0 000 3v0a2.121 2.121 0 003 0L10 8.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;

const ICON_FILE = `<svg class="size-[0.6875rem] shrink-0" viewBox="0 0 16 16" fill="none"><path d="M4 2h5.5l3 3V13.5a.5.5 0 01-.5.5H4a.5.5 0 01-.5-.5V2.5A.5.5 0 014 2z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M9.5 2v3.5h3" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>`;

const ICON_SPINNER = `<svg class="size-3.5 shrink-0 animate-spin text-muted-foreground" viewBox="0 0 16 16" fill="none"><path d="M8 2a6 6 0 105.196 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

// ── Rendering ──────────────────────────────────────────

function renderTooltip(data: TooltipData, hue: number): string {
  const parts: string[] = [];

  // ── Header section ──
  parts.push('<div class="px-3 pt-2.5 pb-2 border-b border-border/60 flex flex-col gap-[0.3125rem]">');

  if (data.title) {
    parts.push(`<div class="text-[0.9375rem] font-semibold leading-snug text-foreground break-words">${esc(data.title)}</div>`);
  }

  if (data.changed) {
    parts.push('<span class="inline-flex items-center w-fit text-[0.6875rem] font-semibold uppercase tracking-[0.025em] px-1.5 py-0.5 rounded bg-accent text-accent-foreground leading-[1.4]">Ændret</span>');
  }

  // Time row
  if (data.date || data.time) {
    parts.push('<div class="flex items-center gap-[0.3125rem] tabular-nums text-muted-foreground">');
    parts.push(ICON_CLOCK);
    if (data.date) {
      parts.push(`<span class="font-medium text-foreground/80">${esc(formatDate(data.date))}</span>`);
    }
    if (data.date && data.time) {
      parts.push('<span class="text-border">·</span>');
    }
    if (data.time) {
      parts.push(
        `<span class="text-muted-foreground">${esc(data.time.replace("til", "–"))}</span>`,
      );
    }
    parts.push("</div>");
  }
  parts.push("</div>");

  // ── Meta section (hold, teacher, room) ──
  const hasMeta = data.hold.length > 0 || data.teacher || data.room || data.students;
  if (hasMeta) {
    parts.push('<div class="px-3 py-[0.4375rem] flex flex-col gap-1">');

    if (data.hold.length > 0) {
      parts.push('<div class="flex items-baseline gap-1.5">');
      parts.push('<span class="min-w-[2.75rem] shrink-0 text-[0.6875rem] font-medium uppercase tracking-[0.04em] text-muted-foreground">Hold</span>');
      parts.push('<div class="flex flex-wrap gap-1">');
      for (const h of data.hold) {
        const holdHue = getHoldHue(h);
        const displayName = getHoldDisplayName(h);
        parts.push(
          `<span class="il-tt-hold text-[0.75rem] font-medium px-[0.3125rem] py-[0.0625rem] rounded whitespace-nowrap leading-normal" style="--hold-hue:${holdHue}">${esc(displayName)}</span>`,
        );
      }
      parts.push("</div></div>");
    }

    if (data.teacher) {
      parts.push('<div class="flex items-baseline gap-1.5">');
      parts.push('<span class="min-w-[2.75rem] shrink-0 text-[0.6875rem] font-medium uppercase tracking-[0.04em] text-muted-foreground">Lærer</span>');
      parts.push(`<span class="min-w-0 flex-1 text-[0.8125rem] text-foreground/85">${esc(data.teacher)}</span>`);
      parts.push("</div>");
    }

    if (data.room) {
      parts.push('<div class="flex items-baseline gap-1.5">');
      parts.push('<span class="min-w-[2.75rem] shrink-0 text-[0.6875rem] font-medium uppercase tracking-[0.04em] text-muted-foreground">Lokale</span>');
      parts.push(`<span class="min-w-0 flex-1 text-[0.8125rem] font-medium text-foreground/85 tabular-nums">${esc(data.room)}</span>`);
      parts.push("</div>");
    }

    if (data.students) {
      parts.push('<div class="flex items-baseline gap-1.5">');
      parts.push('<span class="min-w-[2.75rem] shrink-0 text-[0.6875rem] font-medium uppercase tracking-[0.04em] text-muted-foreground">Elever</span>');
      parts.push(`<span class="min-w-0 flex-1 text-[0.75rem] leading-[1.4] text-muted-foreground">${esc(data.students)}</span>`);
      parts.push("</div>");
    }

    parts.push("</div>");
  }

  // ── Homework section (basic, from tooltip text) ──
  if (data.homework.length > 0) {
    parts.push('<div class="px-3 py-[0.4375rem] border-t border-border/60" data-tt-section="homework">');
    parts.push(
      `<div class="flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground mb-[0.3125rem]">${ICON_HOMEWORK}Lektier</div>`,
    );
    for (let idx = 0; idx < data.homework.length; idx++) {
      const item = data.homework[idx];
      const sep = idx > 0 ? ' border-t border-dashed border-border/40 mt-[0.1875rem] pt-[0.1875rem]' : '';
      parts.push(`<div class="flex flex-col gap-[0.0625rem]${sep}">`);
      parts.push(`<span class="text-[0.8125rem] font-medium text-foreground truncate">${esc(item.label)}</span>`);
      if (item.description) {
        parts.push(
          `<span class="text-[0.75rem] leading-[1.4] text-muted-foreground line-clamp-2">${esc(item.description)}</span>`,
        );
      }
      parts.push("</div>");
    }
    parts.push("</div>");
  }

  // ── Øvrigt indhold section (basic, from tooltip text) ──
  if (data.otherContent.length > 0) {
    parts.push('<div class="px-3 py-[0.4375rem] border-t border-border/60" data-tt-section="other-content">');
    parts.push(
      `<div class="flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground mb-[0.3125rem]">${ICON_NOTE}Øvrigt indhold</div>`,
    );
    for (let idx = 0; idx < data.otherContent.length; idx++) {
      const item = data.otherContent[idx];
      const sep = idx > 0 ? ' border-t border-dashed border-border/40 mt-[0.1875rem] pt-[0.1875rem]' : '';
      parts.push(`<div class="flex flex-col gap-[0.0625rem]${sep}">`);
      parts.push(`<span class="text-[0.8125rem] font-medium text-foreground truncate">${esc(item.label)}</span>`);
      if (item.description) {
        parts.push(
          `<span class="text-[0.75rem] leading-[1.4] text-muted-foreground line-clamp-2">${esc(item.description)}</span>`,
        );
      }
      parts.push("</div>");
    }
    parts.push("</div>");
  }

  // ── Note section (basic, from tooltip text) ──
  if (data.note) {
    parts.push('<div class="px-3 py-[0.4375rem] border-t border-border/60" data-tt-section="note">');
    parts.push(`<div class="flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground mb-1">${ICON_NOTE}Note</div>`);
    parts.push(`<div class="text-[0.75rem] italic text-muted-foreground leading-[1.45] line-clamp-4">${esc(data.note)}</div>`);
    parts.push("</div>");
  }

  // ── Loading indicator (hidden initially, shown during fetch) ──
  parts.push('<div class="flex items-center gap-1.5 px-3 py-[0.375rem] border-t border-border/60 text-[0.6875rem] text-muted-foreground" id="bl-tt-loading" style="display:none">');
  parts.push(`${ICON_SPINNER}<span>Henter detaljer…</span>`);
  parts.push("</div>");

  return parts.join("");
}

// ── Enriched rendering (from fetched activity detail) ──

function renderEnrichedSections(detail: ActivityDetail, basicData: TooltipData): string {
  const parts: string[] = [];

  // ── Rich Note section ──
  const note = detail.note || basicData.note;
  if (note) {
    parts.push('<div class="px-3 py-[0.4375rem] border-t border-border/60" data-tt-section="note">');
    parts.push(`<div class="flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground mb-1">${ICON_NOTE}Note</div>`);
    parts.push(`<div class="text-[0.75rem] italic text-muted-foreground leading-[1.45] line-clamp-4">${esc(note)}</div>`);
    parts.push("</div>");
  }

  // ── Rich Lektier section ──
  if (detail.homework.length > 0) {
    parts.push('<div class="px-3 py-[0.4375rem] border-t border-border/60" data-tt-section="homework">');
    parts.push(
      `<div class="flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground mb-[0.3125rem]">${ICON_HOMEWORK}Lektier <span class="il-tt-count inline-flex min-w-[1.125rem] h-[1.125rem] items-center justify-center rounded-lg px-1 text-[0.625rem] font-semibold ml-1">${detail.homework.length}</span></div>`,
    );
    for (let idx = 0; idx < detail.homework.length; idx++) {
      const item = detail.homework[idx];
      const sep = idx > 0 ? ' border-t border-dashed border-border/40 mt-[0.1875rem] pt-[0.1875rem]' : '';
      parts.push(`<div class="flex flex-col gap-[0.0625rem]${sep}">`);
      parts.push(`<span class="text-[0.8125rem] font-medium text-foreground truncate">${esc(item.title)}</span>`);

      const contentText = stripHtml(item.contentHtml);
      if (contentText) {
        parts.push(
          `<span class="text-[0.75rem] leading-[1.4] text-muted-foreground line-clamp-2">${esc(contentText)}</span>`,
        );
      }

      // File/link chips
      if (item.links.length > 0) {
        parts.push('<div class="flex flex-wrap gap-1 mt-1">');
        for (const link of item.links.slice(0, 3)) {
          const icon = link.type === "file" ? ICON_FILE : ICON_LINK;
          const label = truncate(link.label, 30);
          parts.push(
            `<a class="inline-flex items-center gap-[0.1875rem] text-[0.6875rem] font-medium px-[0.3125rem] py-[0.0625rem] rounded bg-muted text-muted-foreground no-underline whitespace-nowrap max-w-[12rem] overflow-hidden text-ellipsis transition-colors hover:bg-accent hover:text-accent-foreground" href="${escAttr(link.url)}" target="_blank" rel="noopener noreferrer" title="${escAttr(link.label)}">${icon}${esc(label)}</a>`,
          );
        }
        if (item.links.length > 3) {
          parts.push(`<span class="inline-flex items-center text-[0.6875rem] font-semibold px-[0.3125rem] py-[0.0625rem] rounded bg-muted text-muted-foreground">+${item.links.length - 3}</span>`);
        }
        parts.push("</div>");
      }

      parts.push("</div>");
    }
    parts.push("</div>");
  } else if (basicData.homework.length > 0) {
    // Fall back to basic homework
    parts.push('<div class="px-3 py-[0.4375rem] border-t border-border/60" data-tt-section="homework">');
    parts.push(
      `<div class="flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground mb-[0.3125rem]">${ICON_HOMEWORK}Lektier</div>`,
    );
    for (let idx = 0; idx < basicData.homework.length; idx++) {
      const item = basicData.homework[idx];
      const sep = idx > 0 ? ' border-t border-dashed border-border/40 mt-[0.1875rem] pt-[0.1875rem]' : '';
      parts.push(`<div class="flex flex-col gap-[0.0625rem]${sep}">`);
      parts.push(`<span class="text-[0.8125rem] font-medium text-foreground truncate">${esc(item.label)}</span>`);
      if (item.description) {
        parts.push(`<span class="text-[0.75rem] leading-[1.4] text-muted-foreground line-clamp-2">${esc(item.description)}</span>`);
      }
      parts.push("</div>");
    }
    parts.push("</div>");
  }

  // ── Rich Øvrigt indhold section ──
  if (detail.otherContent.length > 0) {
    parts.push('<div class="px-3 py-[0.4375rem] border-t border-border/60" data-tt-section="other-content">');
    parts.push(
      `<div class="flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground mb-[0.3125rem]">${ICON_NOTE}Øvrigt indhold <span class="il-tt-count inline-flex min-w-[1.125rem] h-[1.125rem] items-center justify-center rounded-lg px-1 text-[0.625rem] font-semibold ml-1">${detail.otherContent.length}</span></div>`,
    );
    for (let idx = 0; idx < detail.otherContent.length; idx++) {
      const item = detail.otherContent[idx];
      const sep = idx > 0 ? ' border-t border-dashed border-border/40 mt-[0.1875rem] pt-[0.1875rem]' : '';
      parts.push(`<div class="flex flex-col gap-[0.0625rem]${sep}">`);
      parts.push(`<span class="text-[0.8125rem] font-medium text-foreground truncate">${esc(item.title)}</span>`);

      const contentText = stripHtml(item.contentHtml);
      if (contentText) {
        parts.push(
          `<span class="text-[0.75rem] leading-[1.4] text-muted-foreground line-clamp-2">${esc(contentText)}</span>`,
        );
      }

      if (item.links.length > 0) {
        parts.push('<div class="flex flex-wrap gap-1 mt-1">');
        for (const link of item.links.slice(0, 3)) {
          const icon = link.type === "file" ? ICON_FILE : ICON_LINK;
          const label = truncate(link.label, 30);
          parts.push(
            `<a class="inline-flex items-center gap-[0.1875rem] text-[0.6875rem] font-medium px-[0.3125rem] py-[0.0625rem] rounded bg-muted text-muted-foreground no-underline whitespace-nowrap max-w-[12rem] overflow-hidden text-ellipsis transition-colors hover:bg-accent hover:text-accent-foreground" href="${escAttr(link.url)}" target="_blank" rel="noopener noreferrer" title="${escAttr(link.label)}">${icon}${esc(label)}</a>`,
          );
        }
        if (item.links.length > 3) {
          parts.push(`<span class="inline-flex items-center text-[0.6875rem] font-semibold px-[0.3125rem] py-[0.0625rem] rounded bg-muted text-muted-foreground">+${item.links.length - 3}</span>`);
        }
        parts.push("</div>");
      }

      parts.push("</div>");
    }
    parts.push("</div>");
  } else if (basicData.otherContent.length > 0) {
    // Fall back to basic other content
    parts.push('<div class="px-3 py-[0.4375rem] border-t border-border/60" data-tt-section="other-content">');
    parts.push(
      `<div class="flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground mb-[0.3125rem]">${ICON_NOTE}Øvrigt indhold</div>`,
    );
    for (let idx = 0; idx < basicData.otherContent.length; idx++) {
      const item = basicData.otherContent[idx];
      const sep = idx > 0 ? ' border-t border-dashed border-border/40 mt-[0.1875rem] pt-[0.1875rem]' : '';
      parts.push(`<div class="flex flex-col gap-[0.0625rem]${sep}">`);
      parts.push(`<span class="text-[0.8125rem] font-medium text-foreground truncate">${esc(item.label)}</span>`);
      if (item.description) {
        parts.push(`<span class="text-[0.75rem] leading-[1.4] text-muted-foreground line-clamp-2">${esc(item.description)}</span>`);
      }
      parts.push("</div>");
    }
    parts.push("</div>");
  }

  // ── Related items section ──
  if (detail.related.length > 0) {
    parts.push('<div class="px-3 py-[0.4375rem] border-t border-border/60">');
    parts.push(
      `<div class="flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground mb-1">${ICON_LINK}Relateret</div>`,
    );
    for (const item of detail.related.slice(0, 4)) {
      if (item.url) {
        parts.push(
          `<a class="block text-[0.75rem] text-primary leading-normal truncate no-underline transition-colors hover:underline hover:underline-offset-[0.1em]" href="${escAttr(item.url)}" target="_blank" rel="noopener noreferrer" title="${escAttr(item.label)}">${esc(item.label)}</a>`,
        );
      } else {
        parts.push(`<span class="block text-[0.75rem] text-muted-foreground leading-normal truncate">${esc(item.label)}</span>`);
      }
    }
    if (detail.related.length > 4) {
      parts.push(`<span class="text-[0.75rem] italic text-muted-foreground">+${detail.related.length - 4} mere</span>`);
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
  if (!tooltipEl.classList.contains("bl-tt-visible")) return;
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
  const loadingEl = tooltipEl?.querySelector("#bl-tt-loading") as HTMLElement | null;
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
        const el = tooltipEl?.querySelector("#bl-tt-loading") as HTMLElement | null;
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

  // Remove basic homework, other content, note, and loading indicator
  const basicHomework = tooltipEl.querySelector('[data-tt-section="homework"]');
  const basicOtherContent = tooltipEl.querySelector('[data-tt-section="other-content"]');
  const basicNote = tooltipEl.querySelector('[data-tt-section="note"]');
  const loadingEl = tooltipEl.querySelector("#bl-tt-loading");
  basicHomework?.remove();
  basicOtherContent?.remove();
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

    // Reset to pre-animation state and make visible for measurement
    tooltipEl.classList.remove("bl-tt-visible", "opacity-100", "translate-y-0", "scale-100", "hidden");
    tooltipEl.classList.add("opacity-0", "translate-y-1", "scale-[0.98]");
    bridgeEl.classList.remove("hidden");

    // Measure, position, then trigger enter animation
    requestAnimationFrame(() => {
      if (!tooltipEl || !bridgeEl) return;
      positionTooltip(brick, tooltipEl, bridgeEl);
      tooltipEl.classList.remove("opacity-0", "translate-y-1", "scale-[0.98]");
      tooltipEl.classList.add("bl-tt-visible", "opacity-100", "translate-y-0", "scale-100");
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
      tooltipEl.classList.remove("bl-tt-visible", "opacity-100", "translate-y-0", "scale-100");
      tooltipEl.classList.add("opacity-0", "translate-y-1", "scale-[0.98]");
      // Wait for exit animation
      setTimeout(() => {
        if (tooltipEl && !tooltipEl.classList.contains("bl-tt-visible")) {
          tooltipEl.classList.add("hidden");
        }
      }, 150);
    }
    if (bridgeEl) {
      bridgeEl.classList.add("hidden");
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

export function initBrickTooltips(container?: HTMLElement) {
  // Copy data-tooltip to our own data attribute.
  // Keep the original attribute intact because Lectio's cluetip callback
  // reads it lazily on hover; removing it causes runtime errors in Lectio.
  const root = container || document;
  const selector = container
    ? ".s2skemabrik[data-tooltip]"
    : "#il-original-content .s2skemabrik[data-tooltip]";
  const bricks = root.querySelectorAll<HTMLElement>(selector);

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
    if (target.closest("#bl-brick-tooltip") || target.id === "bl-brick-tooltip-bridge") {
      cancelHide();
    }
  });

  document.addEventListener("mouseout", (e) => {
    const target = e.target as HTMLElement;
    const related = e.relatedTarget as HTMLElement | null;

    if (
      (target.closest("#bl-brick-tooltip") || target.id === "bl-brick-tooltip-bridge") &&
      !related?.closest("#bl-brick-tooltip") &&
      related?.id !== "bl-brick-tooltip-bridge" &&
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
