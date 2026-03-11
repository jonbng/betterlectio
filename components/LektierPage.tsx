import { FileText, BookOpen, Download, ArrowUpRight } from 'lucide-react';
import { getHoldHue, getHoldDisplayName } from '@/lib/hold-mapping';

// ── Types ──────────────────────────────────────────────────────────────

interface HomeworkItem {
  text: string;
  fileUrl: string | null;
  activityUrl: string | null;
  note: string | null;
}

interface LektierEntry {
  dateText: string;
  date: Date;
  activityUrl: string;
  hold: string;
  teacherName: string;
  teacherAbbrev: string;
  room: string;
  timeRange: string;
  module: string;
  activityTitle: string | null;
  homeworkItems: HomeworkItem[];
  note: string | null;
}

interface LektierDay {
  date: Date;
  displayDate: string;
  entries: LektierEntry[];
}

// ── Helpers ────────────────────────────────────────────────────────────

const DANISH_DAYS = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'];
const DANISH_MONTHS = [
  'januar', 'februar', 'marts', 'april', 'maj', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'december',
];

function formatDisplayDate(date: Date): string {
  return `${DANISH_DAYS[date.getDay()]} ${date.getDate()}. ${DANISH_MONTHS[date.getMonth()]}`;
}

function getRelativeLabel(date: Date): { text: string; type: 'today' | 'tomorrow' | 'soon' | 'later' | 'past' } | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return { text: 'i dag', type: 'today' };
  if (diffDays === 1) return { text: 'i morgen', type: 'tomorrow' };
  if (diffDays === -1) return { text: 'i går', type: 'past' };
  if (diffDays > 1 && diffDays <= 3) return { text: `om ${diffDays} dage`, type: 'soon' };
  if (diffDays > 3 && diffDays <= 7) return { text: `om ${diffDays} dage`, type: 'later' };
  if (diffDays < -1) return { text: `${Math.abs(diffDays)} dage siden`, type: 'past' };
  return null;
}

// ── Tooltip parser ─────────────────────────────────────────────────────

function parseTooltip(tooltip: string) {
  const lines = tooltip.split('\n');

  // Find the date/time line. Lectio has used multiple variants over time.
  // Examples:
  // "25/2-2026 08:10 til 09:50"
  // "25/2-2026 08:10 - 09:50"
  // "25/2 08:10 til 09:50"
  const dateTimeRe = /^(\d{1,2})\/(\d{1,2})(?:-(\d{4}))?\s+(\d{1,2}:\d{2})\s*(?:til|-)\s*(\d{1,2}:\d{2})$/i;
  let dateLineIdx = -1;
  let dateMatch: RegExpMatchArray | null = null;

  for (let i = 0; i < lines.length; i++) {
    dateMatch = lines[i].trim().match(dateTimeRe);
    if (dateMatch) { dateLineIdx = i; break; }
  }
  if (!dateMatch || dateLineIdx === -1) return null;

  const activityTitle = dateLineIdx > 0
    ? lines.slice(0, dateLineIdx).join(' ').trim() || null
    : null;

  const day = parseInt(dateMatch[1]);
  const month = parseInt(dateMatch[2]);
  const year = dateMatch[3] ? parseInt(dateMatch[3]) : new Date().getFullYear();
  const timeRange = `${dateMatch[4]}-${dateMatch[5]}`;
  const date = new Date(year, month - 1, day);

  let hold = '';
  let teacherName = '';
  let teacherAbbrev = '';
  let room = '';

  for (let i = dateLineIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('Hold: ')) {
      hold = line.substring(6);
    } else if (line.startsWith('Lærer: ')) {
      const teacherStr = line.substring(7);
      const m = teacherStr.match(/^(.+?)\s*\(([^)]+)\)$/);
      if (m) {
        teacherName = m[1].trim();
        teacherAbbrev = m[2].trim();
      } else {
        teacherName = teacherStr;
        teacherAbbrev = teacherStr;
      }
    } else if (line.startsWith('Lokale: ')) {
      room = line.substring(8);
    }
  }

  return { activityTitle, date, timeRange, hold, teacherName, teacherAbbrev, room };
}

function parseDateFromDateText(dateText: string): Date | null {
  const match = dateText.match(/(\d{1,2})\/(\d{1,2})/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const now = new Date();
  const candidate = new Date(now.getFullYear(), month - 1, day);

  // If this date appears to be far in the past, it is likely next year.
  if (candidate.getTime() < now.getTime() - 1000 * 60 * 60 * 24 * 30) {
    candidate.setFullYear(candidate.getFullYear() + 1);
  }
  return candidate;
}

function parseFallbackActivityMeta(activityLink: HTMLAnchorElement) {
  const contentText =
    activityLink.querySelector('.s2skemabrikcontent')?.textContent?.replace(/\s+/g, ' ').trim() || '';
  const moduleMatch = contentText.match(/(\d+)\.\s*modul/i);
  const module = moduleMatch ? `${moduleMatch[1]}. modul` : '';

  // Typical format: "<module> - <hold> • <teacher> • <room>"
  const parts = contentText.split('•').map((s) => s.trim()).filter(Boolean);
  let hold = '';
  let teacherName = '';
  let teacherAbbrev = '';
  let room = '';

  if (parts.length >= 1) {
    const first = parts[0].split('-').map((s) => s.trim()).filter(Boolean);
    hold = first[first.length - 1] || '';
  }
  if (parts.length >= 2) {
    teacherName = parts[1];
    teacherAbbrev = parts[1];
  }
  if (parts.length >= 3) {
    room = parts[2];
  }

  return {
    module,
    hold,
    teacherName,
    teacherAbbrev,
    room,
  };
}

function parseContextCardMeta(activityLink: HTMLAnchorElement) {
  const holdSpan = activityLink.querySelector<HTMLElement>(
    'span[data-lectiocontextcard^="HE"], span[data-lectioContextCard^="HE"]'
  );
  const teacherSpan = activityLink.querySelector<HTMLElement>(
    'span[data-lectiocontextcard^="T"], span[data-lectioContextCard^="T"]'
  );
  const contentText =
    activityLink.querySelector('.s2skemabrikcontent')?.textContent?.replace(/\s+/g, ' ').trim() || '';

  const moduleMatch = contentText.match(/(\d+)\.\s*modul/i);
  const module = moduleMatch ? `${moduleMatch[1]}. modul` : '';
  const roomParts = contentText.split('•').map((s) => s.trim()).filter(Boolean);
  const room = roomParts.length >= 3 ? roomParts[2] : '';

  const hold = holdSpan?.textContent?.trim() || holdSpan?.getAttribute('title') || '';
  const teacherAbbrev = teacherSpan?.textContent?.trim() || '';

  return {
    module,
    hold,
    teacherName: teacherAbbrev,
    teacherAbbrev,
    room,
  };
}

// ── Homework cell parser ───────────────────────────────────────────────

function parseHomeworkCell(cell: HTMLTableCellElement) {
  const items: HomeworkItem[] = [];
  const noteTexts: string[] = [];

  const children = Array.from(cell.childNodes);
  let i = 0;
  while (i < children.length) {
    const node = children[i];

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;

      if (el.tagName === 'A') {
        const href = el.getAttribute('href') || '';
        const text = el.textContent?.trim() || '';
        if (text && href) {
          if (href.includes('/lc/')) {
            items.push({ text, fileUrl: href, activityUrl: null, note: null });
          } else {
            items.push({ text, fileUrl: null, activityUrl: href, note: null });
          }
        }
      } else if (el.tagName === 'IMG') {
        // Standalone <img> → text-only homework item (text follows as sibling)
        let text = '';
        let j = i + 1;
        while (j < children.length) {
          const next = children[j];
          if (next.nodeType === Node.TEXT_NODE) {
            text += next.textContent || '';
            j++;
          } else {
            break;
          }
        }
        text = text.trim();
        if (text) {
          items.push({ text, fileUrl: null, activityUrl: null, note: null });
          i = j;
          continue;
        }
      } else if (el.classList?.contains('ls-homework-note')) {
        // Attach annotation to the most recent item, or collect as standalone
        const noteText = el.textContent?.trim();
        if (noteText) {
          if (items.length > 0) {
            const lastItem = items[items.length - 1];
            lastItem.note = lastItem.note ? lastItem.note + '\n' + noteText : noteText;
          } else {
            noteTexts.push(noteText);
          }
        }
      }
      // Skip <br>, other elements
    } else if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text && text.length > 3) {
        noteTexts.push(text);
      }
    }

    i++;
  }

  const note = noteTexts.length > 0 ? noteTexts.join('\n\n') : null;
  return { items, note };
}

// ── Group by day ───────────────────────────────────────────────────────

function groupByDay(entries: LektierEntry[]): LektierDay[] {
  const dayMap = new Map<string, LektierDay>();

  for (const entry of entries) {
    const key = entry.date.toISOString().split('T')[0];
    if (!dayMap.has(key)) {
      dayMap.set(key, {
        date: entry.date,
        displayDate: formatDisplayDate(entry.date),
        entries: [],
      });
    }
    dayMap.get(key)!.entries.push(entry);
  }

  return Array.from(dayMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ── DOM parser (exported) ──────────────────────────────────────────────

export function parseLektierFromDOM(): LektierEntry[] {
  const explicitTable = document.querySelector<HTMLTableElement>(
    '#s_m_Content_Content_MaterialLektieOverblikGV'
  );
  const fallbackTables = Array.from(
    document.querySelectorAll<HTMLTableElement>('table')
  );
  const table =
    explicitTable ||
    fallbackTables.find((t) => !!t.querySelector('a.s2skemabrik'));
  if (!table) return [];

  const entries: LektierEntry[] = [];
  const rows = table.querySelectorAll('tr');

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const allCells = Array.from(row.querySelectorAll<HTMLTableCellElement>('td'));
    if (allCells.length === 0) continue;

    // Find activity cell robustly instead of relying on fixed column classes/order.
    const activityCell = allCells.find((cell) => !!cell.querySelector('a.s2skemabrik'));
    if (!activityCell) continue;
    const activityIdx = allCells.indexOf(activityCell);

    const dateCell = allCells
      .slice(0, activityIdx)
      .reverse()
      .find((cell) => !cell.classList.contains('OnlyMobile')) || allCells[0];
    const homeworkCell = allCells
      .slice(activityIdx + 1)
      .find((cell) => !cell.classList.contains('OnlyMobile')) || allCells[activityIdx + 1];
    if (!homeworkCell) continue;

    const dateText = dateCell.textContent?.trim() || '';

    // Activity link with tooltip metadata
    const activityLink = activityCell.querySelector<HTMLAnchorElement>('a.s2skemabrik');
    if (!activityLink) continue;

    const tooltip =
      activityLink.getAttribute('data-tooltip') ||
      activityLink.getAttribute('title') ||
      '';
    const activityUrl = activityLink.getAttribute('href') || '';
    const tooltipData = parseTooltip(tooltip);
    const fallbackMeta = parseFallbackActivityMeta(activityLink);
    const contextMeta = parseContextCardMeta(activityLink);
    const fallbackDate = parseDateFromDateText(dateText);
    if (!tooltipData && !fallbackDate) continue;

    // Homework items & note from third cell
    const { items, note } = parseHomeworkCell(homeworkCell);

    entries.push({
      dateText,
      date: tooltipData?.date || fallbackDate!,
      activityUrl,
      hold: tooltipData?.hold || contextMeta.hold || fallbackMeta.hold,
      teacherName: tooltipData?.teacherName || contextMeta.teacherName || fallbackMeta.teacherName,
      teacherAbbrev: tooltipData?.teacherAbbrev || contextMeta.teacherAbbrev || fallbackMeta.teacherAbbrev,
      room: tooltipData?.room || contextMeta.room || fallbackMeta.room,
      timeRange: tooltipData?.timeRange || '',
      module: contextMeta.module || fallbackMeta.module,
      activityTitle: tooltipData?.activityTitle || null,
      homeworkItems: items,
      note,
    });
  }

  return entries;
}

// ── Component ──────────────────────────────────────────────────────────

interface LektierPageProps {
  entries: LektierEntry[];
}

export function LektierPage({ entries }: LektierPageProps) {
  const days = groupByDay(entries);
  const totalFiles = entries.reduce((sum, e) =>
    sum + e.homeworkItems.filter(i => i.fileUrl).length, 0);

  return (
    <div className="il-lektier-page space-y-5">
      {/* Header */}
      <div className="il-lektier-header flex flex-wrap items-end justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4">
        <div className="il-lektier-header-text">
          <h1 className="il-lektier-title text-2xl font-bold tracking-tight text-foreground">Lektier</h1>
          <p className="il-lektier-subtitle text-sm text-muted-foreground">De næste 14 dage</p>
        </div>
        <div className="il-lektier-stats flex items-center gap-2">
          <div className="il-lektier-stat flex min-w-20 flex-col rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
            <span className="il-lektier-stat-value text-lg font-semibold text-foreground">{entries.length}</span>
            <span className="il-lektier-stat-label text-xs uppercase tracking-wide text-muted-foreground">moduler</span>
          </div>
          {totalFiles > 0 && (
            <div className="il-lektier-stat flex min-w-20 flex-col rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
              <span className="il-lektier-stat-value text-lg font-semibold text-foreground">{totalFiles}</span>
              <span className="il-lektier-stat-label text-xs uppercase tracking-wide text-muted-foreground">filer</span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {days.length === 0 ? (
        <div className="il-lektier-empty flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-14 text-center">
          <BookOpen className="il-lektier-empty-icon mb-3 size-7 text-muted-foreground" />
          <p className="il-lektier-empty-title text-base font-semibold text-foreground">Ingen lektier</p>
          <p className="il-lektier-empty-subtitle text-sm text-muted-foreground">Du har ingen lektier de næste 14 dage</p>
        </div>
      ) : (
        <div className="il-lektier-timeline space-y-4">
          {days.map((day, dayIdx) => {
            const relative = getRelativeLabel(day.date);
            const dayClasses = ['il-lektier-day'];
            if (relative?.type === 'today') dayClasses.push('is-today');
            if (relative?.type === 'tomorrow') dayClasses.push('is-tomorrow');

            return (
              <div
                key={day.date.toISOString()}
                className={dayClasses.join(' ')}
                style={{ animationDelay: `${dayIdx * 60}ms` }}
              >
                {/* Date column */}
                <div className="il-lektier-date-col flex w-[88px] shrink-0 flex-col items-center rounded-xl border border-border bg-card py-3">
                  <div className="il-lektier-date-number text-2xl font-bold text-foreground">{day.date.getDate()}</div>
                  <div className="il-lektier-date-weekday text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {DANISH_DAYS[day.date.getDay()].substring(0, 3).toLowerCase()}
                  </div>
                  <div className="il-lektier-date-month text-xs text-muted-foreground">
                    {DANISH_MONTHS[day.date.getMonth()].substring(0, 3)}
                  </div>
                  {relative && (
                    <div className={`il-lektier-date-relative is-${relative.type} mt-2 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-foreground`}>
                      {relative.text}
                    </div>
                  )}
                </div>

                {/* Cards column */}
                <div className="il-lektier-cards-col flex flex-1 flex-col gap-3">
                  {day.entries.map((entry, idx) => {
                    const hue = getHoldHue(entry.hold);
                    const contentItems = entry.homeworkItems.filter(i => !i.fileUrl);
                    const fileItems = entry.homeworkItems.filter(i => i.fileUrl);
                    const hasContent = contentItems.length > 0 || entry.note || fileItems.length > 0;

                    return (
                      <div
                        key={idx}
                        className="il-lektier-card overflow-hidden rounded-xl border border-border bg-card"
                        style={{ '--hold-hue': hue } as any}
                      >
                        <div className="il-lektier-card-accent h-0.5 w-full bg-primary/60" />
                        <div className="il-lektier-card-body space-y-3 p-4">
                          <div className="il-lektier-card-top flex flex-wrap items-center justify-between gap-2">
                            <a href={entry.activityUrl} className="il-lektier-card-module text-sm font-semibold text-foreground no-underline hover:text-primary">
                              {entry.module && <span>{entry.module}</span>}
                              {entry.module && entry.timeRange && <span className="il-lektier-card-sep">&middot;</span>}
                              {entry.timeRange && <span className="il-lektier-card-time text-muted-foreground">{entry.timeRange}</span>}
                            </a>
                            <span
                              className="il-lektier-hold-pill rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground"
                              style={{ '--hold-hue': hue } as any}
                            >
                              {getHoldDisplayName(entry.hold)}
                            </span>
                          </div>

                          <div className="il-lektier-card-meta flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            {entry.teacherName && <span title={entry.teacherAbbrev}>{entry.teacherName}</span>}
                            {entry.teacherName && entry.room && (
                              <span className="il-lektier-meta-dot" />
                            )}
                            {entry.room && <span>{entry.room}</span>}
                            {entry.activityTitle && (
                              <>
                                <span className="il-lektier-meta-dash">&mdash;</span>
                                <span className="il-lektier-meta-title">{entry.activityTitle}</span>
                              </>
                            )}
                          </div>

                          {hasContent && (
                            <div className="il-lektier-card-items space-y-3">
                              {/* Teacher instruction — the most important content */}
                              {entry.note && (
                                <div className="il-lektier-instruction rounded-md border border-border bg-muted/35 px-3 py-2 text-sm text-foreground">
                                  {entry.note}
                                </div>
                              )}

                              {/* Homework content items (descriptions, readings, linked tasks) */}
                              {contentItems.length > 0 && (
                                <div className="il-lektier-content-list space-y-2">
                                  {contentItems.map((item, itemIdx) => (
                                    <div key={itemIdx} className="il-lektier-content-item flex items-start gap-2 rounded-md border border-border/70 bg-background px-2.5 py-2">
                                      <BookOpen size={15} className="il-lektier-content-icon mt-0.5 shrink-0 text-muted-foreground" />
                                      <div className="il-lektier-content-body min-w-0 space-y-1">
                                        {item.activityUrl ? (
                                          <a href={item.activityUrl} className="il-lektier-content-link inline-flex items-center gap-1 text-sm font-medium text-foreground no-underline hover:text-primary">
                                            <span>{item.text}</span>
                                            <ArrowUpRight size={13} className="il-lektier-content-arrow text-muted-foreground" />
                                          </a>
                                        ) : (
                                          <span className="il-lektier-content-text text-sm text-foreground">{item.text}</span>
                                        )}
                                        {item.note && (
                                          <div className="il-lektier-item-annotation text-xs text-muted-foreground">{item.note}</div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* File attachments */}
                              {fileItems.length > 0 && (
                                <div className="il-lektier-files grid gap-2">
                                  {fileItems.map((item, itemIdx) => (
                                    <a key={itemIdx} href={item.fileUrl!} className="il-lektier-file flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2 no-underline transition-colors hover:bg-accent/40">
                                      <div className="il-lektier-file-icon-wrap inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                        <FileText size={18} />
                                      </div>
                                      <div className="il-lektier-file-info min-w-0 flex-1">
                                        <span className="il-lektier-file-name block truncate text-sm font-medium text-foreground">{item.text}</span>
                                        {item.note && (
                                          <span className="il-lektier-file-annotation block truncate text-xs text-muted-foreground">{item.note}</span>
                                        )}
                                      </div>
                                      <Download size={16} className="il-lektier-file-dl shrink-0 text-muted-foreground" />
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
