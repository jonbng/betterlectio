import { FileText, BookOpen, ExternalLink, Download, ArrowUpRight } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────

interface HomeworkItem {
  text: string;
  fileUrl: string | null;
  activityUrl: string | null;
}

interface LektierEntry {
  dateText: string;
  date: Date;
  activityUrl: string;
  hold: string;
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
  isToday: boolean;
  entries: LektierEntry[];
}

// ── Helpers ────────────────────────────────────────────────────────────

const DANISH_DAYS = ['Sondag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lordag'];
const DANISH_MONTHS = [
  'januar', 'februar', 'marts', 'april', 'maj', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'december',
];

function formatDisplayDate(date: Date): string {
  return `${DANISH_DAYS[date.getDay()]} ${date.getDate()}. ${DANISH_MONTHS[date.getMonth()]}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function getHoldHue(hold: string): number {
  let hash = 0;
  for (let i = 0; i < hold.length; i++) {
    hash = hold.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

// ── Tooltip parser ─────────────────────────────────────────────────────

function parseTooltip(tooltip: string) {
  const lines = tooltip.split('\n');

  // Find the date/time line: "DD/M-YYYY HH:MM til HH:MM"
  const dateTimeRe = /^(\d{1,2})\/(\d{1,2})-(\d{4})\s+(\d{2}:\d{2})\s+til\s+(\d{2}:\d{2})$/;
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
  const year = parseInt(dateMatch[3]);
  const timeRange = `${dateMatch[4]}-${dateMatch[5]}`;
  const date = new Date(year, month - 1, day);

  let hold = '';
  let teacherAbbrev = '';
  let room = '';

  for (let i = dateLineIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('Hold: ')) {
      hold = line.substring(6);
    } else if (line.startsWith('Lærer: ')) {
      const m = line.substring(7).match(/\(([^)]+)\)$/);
      teacherAbbrev = m ? m[1] : line.substring(7);
    } else if (line.startsWith('Lokale: ')) {
      room = line.substring(8);
    }
  }

  return { activityTitle, date, timeRange, hold, teacherAbbrev, room };
}

// ── Homework cell parser ───────────────────────────────────────────────

function parseHomeworkCell(cell: HTMLTableCellElement) {
  const items: HomeworkItem[] = [];
  const noteTexts: string[] = [];

  // Collect .ls-homework-note divs
  cell.querySelectorAll('.ls-homework-note').forEach(div => {
    const text = div.textContent?.trim();
    if (text) noteTexts.push(text);
  });

  // Walk direct child nodes
  const children = Array.from(cell.childNodes);
  let i = 0;
  while (i < children.length) {
    const node = children[i];

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;

      if (el.tagName === 'A') {
        const href = el.getAttribute('href') || '';
        const text = el.textContent?.trim() || '';
        if (text) {
          if (href.includes('/lc/')) {
            items.push({ text, fileUrl: href, activityUrl: null });
          } else if (href.includes('/aktivitet/')) {
            items.push({ text, fileUrl: null, activityUrl: href });
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
          items.push({ text, fileUrl: null, activityUrl: null });
          i = j;
          continue;
        }
      }
      // Skip <br>, <div.ls-homework-note> (already collected), etc.
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayMap = new Map<string, LektierDay>();

  for (const entry of entries) {
    const key = entry.date.toISOString().split('T')[0];
    if (!dayMap.has(key)) {
      dayMap.set(key, {
        date: entry.date,
        displayDate: formatDisplayDate(entry.date),
        isToday: isSameDay(entry.date, today),
        entries: [],
      });
    }
    dayMap.get(key)!.entries.push(entry);
  }

  return Array.from(dayMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ── DOM parser (exported) ──────────────────────────────────────────────

export function parseLektierFromDOM(): LektierEntry[] {
  const table = document.querySelector<HTMLTableElement>(
    '#s_m_Content_Content_MaterialLektieOverblikGV'
  );
  if (!table) return [];

  const entries: LektierEntry[] = [];
  const rows = table.querySelectorAll('tr');

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const cells = row.querySelectorAll<HTMLTableCellElement>('td.OnlyDesktop');
    if (cells.length < 3) continue;

    const dateText = cells[0].textContent?.trim() || '';

    // Activity link with tooltip metadata
    const activityLink = cells[1].querySelector<HTMLAnchorElement>('a.s2skemabrik');
    if (!activityLink) continue;

    const tooltip = activityLink.getAttribute('data-tooltip') || '';
    const activityUrl = activityLink.getAttribute('href') || '';
    const tooltipData = parseTooltip(tooltip);
    if (!tooltipData) continue;

    // Module from content div (e.g. "3. modul")
    const contentDiv = activityLink.querySelector('.s2skemabrikcontent');
    const contentText = contentDiv?.textContent || '';
    const moduleMatch = contentText.match(/(\d+)\.\s*modul/);
    const module = moduleMatch ? `${moduleMatch[1]}. modul` : '';

    // Homework items & note from third cell
    const { items, note } = parseHomeworkCell(cells[2]);

    entries.push({
      dateText,
      date: tooltipData.date,
      activityUrl,
      hold: tooltipData.hold,
      teacherAbbrev: tooltipData.teacherAbbrev,
      room: tooltipData.room,
      timeRange: tooltipData.timeRange,
      module,
      activityTitle: tooltipData.activityTitle,
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
    <div className="il-lektier-page">
      {/* Header */}
      <div className="il-lektier-header">
        <div className="il-lektier-header-text">
          <h1 className="il-lektier-title">Lektier</h1>
          <p className="il-lektier-subtitle">De næste 14 dage</p>
        </div>
        <div className="il-lektier-stats">
          <div className="il-lektier-stat">
            <span className="il-lektier-stat-value">{entries.length}</span>
            <span className="il-lektier-stat-label">moduler</span>
          </div>
          {totalFiles > 0 && (
            <div className="il-lektier-stat">
              <span className="il-lektier-stat-value">{totalFiles}</span>
              <span className="il-lektier-stat-label">filer</span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {days.length === 0 ? (
        <div className="il-lektier-empty">
          <BookOpen className="il-lektier-empty-icon" />
          <p className="il-lektier-empty-title">Ingen lektier</p>
          <p className="il-lektier-empty-subtitle">Du har ingen lektier de næste 14 dage</p>
        </div>
      ) : (
        <div className="il-lektier-timeline">
          {days.map((day, dayIdx) => (
            <div
              key={day.date.toISOString()}
              className={`il-lektier-day${day.isToday ? ' is-today' : ''}`}
              style={{ animationDelay: `${dayIdx * 60}ms` }}
            >
              {/* Date column */}
              <div className="il-lektier-date-col">
                <div className="il-lektier-date-number">{day.date.getDate()}</div>
                <div className="il-lektier-date-weekday">
                  {DANISH_DAYS[day.date.getDay()].substring(0, 3).toLowerCase()}
                </div>
                <div className="il-lektier-date-month">
                  {DANISH_MONTHS[day.date.getMonth()].substring(0, 3)}
                </div>
                {day.isToday && <div className="il-lektier-date-today">i dag</div>}
              </div>

              {/* Cards column */}
              <div className="il-lektier-cards-col">
                {day.entries.map((entry, idx) => {
                  const hue = getHoldHue(entry.hold);
                  return (
                    <div
                      key={idx}
                      className="il-lektier-card"
                      style={{ '--hold-hue': hue } as any}
                    >
                      <div className="il-lektier-card-accent" />
                      <div className="il-lektier-card-body">
                        <div className="il-lektier-card-top">
                          <a href={entry.activityUrl} className="il-lektier-card-module">
                            {entry.module && <span>{entry.module}</span>}
                            {entry.module && entry.timeRange && <span className="il-lektier-card-sep">&middot;</span>}
                            {entry.timeRange && <span className="il-lektier-card-time">{entry.timeRange}</span>}
                          </a>
                          <span
                            className="il-lektier-hold-pill"
                            style={{ '--hold-hue': hue } as any}
                          >
                            {entry.hold}
                          </span>
                        </div>

                        <div className="il-lektier-card-meta">
                          {entry.teacherAbbrev && <span>{entry.teacherAbbrev}</span>}
                          {entry.teacherAbbrev && entry.room && (
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

                        {(entry.homeworkItems.length > 0 || entry.note) && (
                          <div className="il-lektier-card-items">
                            {entry.homeworkItems.map((item, itemIdx) => (
                              <div key={itemIdx}>
                                {item.fileUrl ? (
                                  <a href={item.fileUrl} className="il-lektier-file">
                                    <div className="il-lektier-file-icon-wrap">
                                      <FileText size={20} />
                                    </div>
                                    <div className="il-lektier-file-info">
                                      <span className="il-lektier-file-name">{item.text}</span>
                                    </div>
                                    <Download size={16} className="il-lektier-file-dl" />
                                  </a>
                                ) : item.activityUrl ? (
                                  <a href={item.activityUrl} className="il-lektier-activity-link">
                                    <div className="il-lektier-activity-icon-wrap">
                                      <ExternalLink size={18} />
                                    </div>
                                    <span className="il-lektier-activity-text">{item.text}</span>
                                    <ArrowUpRight size={16} className="il-lektier-activity-arrow" />
                                  </a>
                                ) : (
                                  <div className="il-lektier-reading">
                                    <BookOpen size={20} className="il-lektier-reading-icon" />
                                    <span>{item.text}</span>
                                  </div>
                                )}
                              </div>
                            ))}

                            {entry.note && (
                              <div className="il-lektier-note">
                                <span>{entry.note}</span>
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
          ))}
        </div>
      )}
    </div>
  );
}
