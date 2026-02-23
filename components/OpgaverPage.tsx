import { useState } from 'preact/hooks';
import { ClipboardList, Clock, CheckCircle2, ChevronDown, AlertTriangle } from 'lucide-react';
import { OpgaveDetailSheet } from '@/components/OpgaveDetailSheet';

// ── Types ──────────────────────────────────────────────────────────────

export interface OpgaveEntry {
  title: string;
  url: string;
  hold: string;
  deadline: Date;
  deadlineText: string;
  studentTime: string;
  status: 'venter' | 'afleveret';
  absence: string;
  awaiting: string;
  note: string;
  grade: string;
  gradeExtra: string;
}

// ── Constants ──────────────────────────────────────────────────────────

const DANISH_WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const DANISH_MONTHS = [
  'januar', 'februar', 'marts', 'april', 'maj', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'december',
];

// ── Helpers ────────────────────────────────────────────────────────────

function getHoldHue(hold: string): number {
  let hash = 0;
  for (let i = 0; i < hold.length; i++) {
    hash = hold.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function formatTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function formatAbsoluteDeadline(deadline: Date): string {
  return `${deadline.getDate()}/${deadline.getMonth() + 1}-${deadline.getFullYear()}`;
}

// ── Deadline display (the core of this design) ────────────────────────

type Urgency = 'overdue' | 'imminent' | 'soon' | 'later';

interface DeadlineDisplay {
  label: string;
  detail: string;
  urgency: Urgency;
}

function getDeadlineDisplay(deadline: Date): DeadlineDisplay {
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const timeStr = `kl. ${formatTime(deadline)}`;

  // ── Overdue ──
  if (diffMs < 0) {
    const absMs = Math.abs(diffMs);
    const absMin = Math.floor(absMs / 60000);
    const absHours = Math.floor(absMs / 3600000);
    const absDays = Math.floor(absMs / 86400000);

    let label: string;
    if (absMin < 60) label = 'Lige overskredet';
    else if (absHours < 24)
      label = `${absHours} ${absHours === 1 ? 'time' : 'timer'} forsinket`;
    else label = `${absDays} ${absDays === 1 ? 'dag' : 'dage'} forsinket`;

    return { label, detail: timeStr, urgency: 'overdue' };
  }

  // ── Future ──
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  // Calendar day difference
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const deadlineDay = new Date(deadline);
  deadlineDay.setHours(0, 0, 0, 0);
  const calDayDiff = Math.round(
    (deadlineDay.getTime() - todayStart.getTime()) / 86400000
  );

  // Urgency based on actual time remaining
  const urgency: Urgency =
    diffMs < 24 * 3600000
      ? 'imminent'
      : diffMs < 72 * 3600000
        ? 'soon'
        : 'later';

  let label: string;
  let detail: string;

  if (calDayDiff === 0) {
    // Today
    if (diffMin < 60) {
      label = `Om ${Math.max(1, diffMin)} min.`;
    } else {
      label = `Om ${diffHours} ${diffHours === 1 ? 'time' : 'timer'}`;
    }
    detail = timeStr;
  } else if (calDayDiff === 1) {
    label = 'I morgen';
    detail = timeStr;
  } else if (calDayDiff === 2) {
    label = 'I overmorgen';
    detail = timeStr;
  } else if (calDayDiff <= 7) {
    label = `Om ${calDayDiff} dage`;
    const wd = DANISH_WEEKDAYS[deadline.getDay()];
    detail = `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${timeStr}`;
  } else {
    label = `${deadline.getDate()}. ${DANISH_MONTHS[deadline.getMonth()]}`;
    detail = timeStr;
  }

  return { label, detail, urgency };
}

// ── Grade color ───────────────────────────────────────────────────────

function getGradeHue(grade: string): number {
  switch (grade.trim()) {
    case '12': return 85;
    case '10': return 145;
    case '7': return 210;
    case '4': return 50;
    case '02': return 40;
    case '00': return 25;
    case '-3': return 0;
    default: return 145;
  }
}

// ── DOM parser (exported) ──────────────────────────────────────────────

export function parseOpgaverFromDOM(): OpgaveEntry[] {
  const table = document.querySelector<HTMLTableElement>(
    '#s_m_Content_Content_ExerciseGV'
  );
  if (!table) return [];

  const entries: OpgaveEntry[] = [];
  const rows = table.querySelectorAll('tr');

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (row.querySelector('th')) continue;

    const cells = row.querySelectorAll<HTMLTableCellElement>('td.OnlyDesktop');
    if (cells.length < 11) continue;

    const hold = cells[1].textContent?.trim() || '';

    const titleLink = cells[2].querySelector<HTMLAnchorElement>('a');
    const title =
      titleLink?.textContent?.trim() || cells[2].textContent?.trim() || '';
    const url = titleLink?.getAttribute('href') || '';

    const deadlineText = cells[3].textContent?.trim() || '';
    const deadline = parseDeadline(deadlineText);

    const studentTime = cells[4].textContent?.trim() || '';

    const isWaiting = !!cells[5].querySelector('.exercisewait');
    const status: 'venter' | 'afleveret' = isWaiting ? 'venter' : 'afleveret';

    const absence = cells[6].textContent?.trim() || '';
    const awaiting = cells[7].textContent?.trim() || '';
    const note = cells[8].textContent?.trim() || '';

    const gradeCell = cells[9];
    const gradeHtml = gradeCell.innerHTML;
    let grade = '';
    let gradeExtra = '';
    if (gradeHtml.includes('<br')) {
      const parts = gradeHtml.split(/<br\s*\/?>/i);
      grade = parts[0]?.replace(/<[^>]*>/g, '').trim() || '';
      gradeExtra =
        parts
          .slice(1)
          .join(' ')
          .replace(/<[^>]*>/g, '')
          .trim() || '';
    } else {
      grade = gradeCell.textContent?.trim() || '';
    }

    entries.push({
      title,
      url,
      hold,
      deadline,
      deadlineText,
      studentTime,
      status,
      absence,
      awaiting,
      note,
      grade,
      gradeExtra,
    });
  }

  return entries;
}

function parseDeadline(text: string): Date {
  const match = text.match(/^(\d{1,2})\/(\d{1,2})-(\d{4})\s+(\d{2}):(\d{2})$/);
  if (match) {
    return new Date(
      parseInt(match[3]),
      parseInt(match[2]) - 1,
      parseInt(match[1]),
      parseInt(match[4]),
      parseInt(match[5])
    );
  }
  return new Date();
}

// ── Component ──────────────────────────────────────────────────────────

interface OpgaverPageProps {
  entries: OpgaveEntry[];
  schoolId: string;
}

export function OpgaverPage({ entries, schoolId }: OpgaverPageProps) {
  const [selectedHold, setSelectedHold] = useState<string | null>(null);
  const [showAllSubmitted, setShowAllSubmitted] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());
  const [selectedEntry, setSelectedEntry] = useState<OpgaveEntry | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const openDetail = (e: MouseEvent, entry: OpgaveEntry) => {
    e.preventDefault();
    setSelectedEntry(entry);
    setSheetOpen(true);
  };

  const holds = [...new Set(entries.map(e => e.hold))].sort();

  const filtered = selectedHold
    ? entries.filter(e => e.hold === selectedHold)
    : entries;

  const upcoming = filtered
    .filter(e => e.status === 'venter')
    .sort((a, b) => a.deadline.getTime() - b.deadline.getTime());

  const submitted = filtered
    .filter(e => e.status === 'afleveret')
    .sort((a, b) => b.deadline.getTime() - a.deadline.getTime());

  const visibleSubmitted = showAllSubmitted ? submitted : submitted.slice(0, 6);

  const toggleNote = (idx: number) => {
    setExpandedNotes(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="il-opgaver-page">
      {/* ── Header ─────────────────────────────── */}
      <div className="il-opgaver-header">
        <h1 className="il-opgaver-title">Opgaver</h1>
        <p className="il-opgaver-subtitle">
          {upcoming.length} kommende &middot; {submitted.length} afleveret
        </p>
      </div>

      {/* ── Hold filter pills ──────────────────── */}
      {holds.length > 1 && (
        <div className="il-opgaver-filters">
          <button
            className={`il-opgaver-filter-pill${selectedHold === null ? ' is-active' : ''}`}
            onClick={() => setSelectedHold(null)}
          >
            Alle
          </button>
          {holds.map(hold => (
            <button
              key={hold}
              className={`il-opgaver-filter-pill${selectedHold === hold ? ' is-active' : ''}`}
              onClick={() =>
                setSelectedHold(selectedHold === hold ? null : hold)
              }
              style={{ '--hold-hue': getHoldHue(hold) } as any}
            >
              {hold}
            </button>
          ))}
        </div>
      )}

      {/* ── Empty state ────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="il-opgaver-empty">
          <ClipboardList className="il-opgaver-empty-icon" />
          <p className="il-opgaver-empty-title">Ingen opgaver</p>
          <p className="il-opgaver-empty-subtitle">
            Der er ingen opgaver at vise
          </p>
        </div>
      ) : (
        <>
          {/* ── Upcoming ───────────────────────── */}
          {upcoming.length > 0 && (
            <section className="il-opgaver-section">
              <h2 className="il-opgaver-section-title">
                <Clock size={14} />
                Kommende
                <span className="il-opgaver-section-count">
                  {upcoming.length}
                </span>
              </h2>
              <div className="il-opgaver-upcoming">
                {upcoming.map((entry, idx) => {
                  const display = getDeadlineDisplay(entry.deadline);
                  const hue = getHoldHue(entry.hold);
                  const globalIdx = entries.indexOf(entry);
                  const hasMeta =
                    (entry.studentTime && entry.studentTime !== '0,00') ||
                    entry.awaiting;

                  return (
                    <div
                      key={idx}
                      className={`il-opgaver-card is-${display.urgency}`}
                      style={
                        {
                          '--hold-hue': hue,
                          animationDelay: `${idx * 40}ms`,
                        } as any
                      }
                    >
                      {/* Deadline — the hero element */}
                      <div className="il-opgaver-card-deadline">
                        <div className="il-opgaver-deadline-info">
                          {display.urgency === 'overdue' && (
                            <AlertTriangle
                              size={16}
                              className="il-opgaver-deadline-icon"
                            />
                          )}
                          <span className="il-opgaver-deadline-label">
                            {display.label}
                          </span>
                          <span className="il-opgaver-deadline-sep">
                            &middot;
                          </span>
                          <span className="il-opgaver-deadline-detail">
                            {display.detail}
                          </span>
                        </div>
                        <span
                          className="il-opgaver-hold-pill"
                          style={{ '--hold-hue': hue } as any}
                        >
                          {entry.hold}
                        </span>
                      </div>

                      {/* Title */}
                      <a
                        href={entry.url}
                        className="il-opgaver-card-title"
                        onClick={e =>
                          openDetail(e as unknown as MouseEvent, entry)
                        }
                      >
                        {entry.title}
                      </a>

                      {/* Meta */}
                      {hasMeta && (
                        <div className="il-opgaver-card-meta">
                          {entry.studentTime &&
                            entry.studentTime !== '0,00' && (
                              <span>{entry.studentTime} timer</span>
                            )}
                          {entry.studentTime &&
                            entry.studentTime !== '0,00' &&
                            entry.awaiting && (
                              <span className="il-opgaver-meta-dot" />
                            )}
                          {entry.awaiting && <span>{entry.awaiting}</span>}
                        </div>
                      )}

                      {/* Note */}
                      {entry.note && (
                        <div
                          className={`il-opgaver-note${expandedNotes.has(globalIdx) ? ' is-expanded' : ''}`}
                          onClick={() => toggleNote(globalIdx)}
                        >
                          <span>{entry.note}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Submitted ──────────────────────── */}
          {submitted.length > 0 && (
            <section className="il-opgaver-section">
              <h2 className="il-opgaver-section-title">
                <CheckCircle2 size={14} />
                Afleveret
                <span className="il-opgaver-section-count">
                  {submitted.length}
                </span>
              </h2>
              <div className="il-opgaver-submitted-list">
                {visibleSubmitted.map((entry, idx) => {
                  const hue = getHoldHue(entry.hold);
                  const globalIdx = entries.indexOf(entry);
                  const gradeHue = entry.grade ? getGradeHue(entry.grade) : 0;
                  return (
                    <div
                      key={idx}
                      className="il-opgaver-submitted-row"
                      style={
                        {
                          '--hold-hue': hue,
                          animationDelay: `${idx * 35}ms`,
                        } as any
                      }
                    >
                      <div className="il-opgaver-submitted-primary">
                        <a
                          href={entry.url}
                          className="il-opgaver-submitted-title"
                          onClick={e =>
                            openDetail(e as unknown as MouseEvent, entry)
                          }
                        >
                          {entry.title}
                        </a>
                        <span
                          className="il-opgaver-hold-pill"
                          style={{ '--hold-hue': hue } as any}
                        >
                          {entry.hold}
                        </span>
                        {entry.grade && (
                          <span
                            className="il-opgaver-grade"
                            style={{ '--grade-hue': gradeHue } as any}
                          >
                            {entry.grade}
                          </span>
                        )}
                        <span className="il-opgaver-submitted-date">
                          {formatAbsoluteDeadline(entry.deadline)}
                        </span>
                      </div>
                      {(entry.note || entry.gradeExtra) && (
                        <div className="il-opgaver-submitted-detail">
                          {entry.gradeExtra && (
                            <span className="il-opgaver-grade-extra">
                              {entry.gradeExtra}
                            </span>
                          )}
                          {entry.note && (
                            <div
                              className={`il-opgaver-note${expandedNotes.has(globalIdx) ? ' is-expanded' : ''}`}
                              onClick={() => toggleNote(globalIdx)}
                            >
                              <span>{entry.note}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {submitted.length > 6 && !showAllSubmitted && (
                <button
                  className="il-opgaver-show-more"
                  onClick={() => setShowAllSubmitted(true)}
                >
                  <ChevronDown size={16} />
                  Vis alle {submitted.length} afleverede
                </button>
              )}
            </section>
          )}
        </>
      )}
      <OpgaveDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        entry={selectedEntry}
        schoolId={schoolId}
      />
    </div>
  );
}
