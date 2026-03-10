import { useState, useRef, useEffect } from 'preact/hooks';
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  ChevronDown,
  AlertTriangle,
  Flame,
  ArrowRight,
  Check,
  XCircle,
  Search,
  X,
  CalendarDays,
  Upload,
} from 'lucide-react';
import { OpgaveDetailSheet } from '@/components/OpgaveDetailSheet';
import { getHoldHue, getHoldDisplayName } from '@/lib/hold-mapping';

// ── Types ──────────────────────────────────────────────────────────────

export interface OpgaveEntry {
  title: string;
  url: string;
  hold: string;
  deadline: Date;
  deadlineText: string;
  studentTime: string;
  status: 'venter' | 'mangler' | 'afleveret';
  statusText: string;
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

// ── Date range presets ─────────────────────────────────────────────────

type DatePreset = 'all' | '7d' | '14d' | 'month' | 'next-month';

interface DatePresetOption {
  key: DatePreset;
  label: string;
}

const DATE_PRESETS: DatePresetOption[] = [
  { key: 'all', label: 'Alle' },
  { key: '7d', label: '7 dage' },
  { key: '14d', label: '14 dage' },
  { key: 'month', label: 'Denne måned' },
  { key: 'next-month', label: 'Næste måned' },
];

function getDateRange(preset: DatePreset): { from: Date; to: Date } | null {
  if (preset === 'all') return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (preset === '7d') {
    const to = new Date(today);
    to.setDate(to.getDate() + 7);
    to.setHours(23, 59, 59, 999);
    return { from: today, to };
  }

  if (preset === '14d') {
    const to = new Date(today);
    to.setDate(to.getDate() + 14);
    to.setHours(23, 59, 59, 999);
    return { from: today, to };
  }

  if (preset === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from, to };
  }

  if (preset === 'next-month') {
    const from = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);
    return { from, to };
  }

  return null;
}

// ── Helpers ────────────────────────────────────────────────────────────

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

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const deadlineDay = new Date(deadline);
  deadlineDay.setHours(0, 0, 0, 0);
  const calDayDiff = Math.round(
    (deadlineDay.getTime() - todayStart.getTime()) / 86400000
  );

  const urgency: Urgency =
    diffMs < 24 * 3600000
      ? 'imminent'
      : diffMs < 72 * 3600000
        ? 'soon'
        : 'later';

  let label: string;
  let detail: string;

  if (calDayDiff === 0) {
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

function classifyStatus(statusText: string, hasWaitingClass: boolean, hasMissingClass: boolean): 'venter' | 'mangler' | 'afleveret' {
  if (hasMissingClass) return 'mangler';
  if (hasWaitingClass) return 'venter';

  const text = statusText.trim().toLowerCase();
  if (!text) return 'afleveret';

  if (
    text.includes('ikke afleveret')
    || text.includes('mangler')
    || text.includes('ej afleveret')
  ) {
    return 'mangler';
  }

  if (
    text.includes('venter')
    || text.includes('afventer')
    || text.includes('under behandling')
    || text.includes('afventer rettelse')
  ) {
    return 'venter';
  }

  if (
    text.includes('afleveret')
    || text.includes('bedømt')
    || text.includes('rettet')
    || text.includes('godkendt')
  ) {
    return 'afleveret';
  }

  // Unknown non-empty statuses are treated as active to avoid
  // showing potentially unresolved submissions as completed.
  return 'venter';
}

// ── DOM parser (exported) ──────────────────────────────────────────────

export function parseOpgaverFromDOM(root: Document | Element = document): OpgaveEntry[] {
  const table = root.querySelector<HTMLTableElement>(
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

    const statusText = cells[5].textContent?.trim() || '';
    const isWaiting = !!cells[5].querySelector('.exercisewait');
    const isMissing = !!cells[5].querySelector('.exercisemissing');

    const absence = cells[6].textContent?.trim() || '';
    const awaiting = cells[7].textContent?.trim() || '';

    const status = classifyStatus(statusText, isWaiting, isMissing);
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
      statusText,
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

// ── Fetch all opgaver (with filter unchecked) ─────────────────────────

export async function fetchAllOpgaver(): Promise<OpgaveEntry[] | null> {
  const checkbox = document.querySelector<HTMLInputElement>(
    '#s_m_Content_Content_CurrentExerciseFilterCB'
  );
  if (!checkbox || !checkbox.checked) {
    return null;
  }

  const form = document.querySelector<HTMLFormElement>('#aspnetForm');
  if (!form) return null;

  const formData = new URLSearchParams();

  const elements = form.elements;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i] as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const name = el.getAttribute('name');
    if (!name) continue;

    if (el instanceof HTMLInputElement) {
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (name === 's$m$Content$Content$CurrentExerciseFilterCB') continue;
        if (el.checked) formData.append(name, el.value || 'on');
      } else if (el.type !== 'submit' && el.type !== 'button' && el.type !== 'image') {
        formData.append(name, el.value);
      }
    } else if (el instanceof HTMLSelectElement) {
      formData.append(name, el.value);
    } else if (el instanceof HTMLTextAreaElement) {
      formData.append(name, el.value);
    }
  }

  formData.set('__EVENTTARGET', 's$m$Content$Content$CurrentExerciseFilterCB');
  formData.set('__EVENTARGUMENT', '');

  try {
    const pageUrl = new URL(window.location.pathname + window.location.search, window.location.origin).href;
    const response = await fetch(pageUrl, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    if (!response.ok) return null;

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    return parseOpgaverFromDOM(doc);
  } catch (err) {
    console.error('[BetterLectio] Failed to fetch all opgaver:', err);
    return null;
  }
}

// ── Component ──────────────────────────────────────────────────────────

interface OpgaverPageProps {
  entries: OpgaveEntry[];
  schoolId: string;
}

const MISSING_IGNORED_PREFIX = 'il-opgaver-ignored-missing-';
const MISSING_AGGRESSIVE_MAX_AGE_DAYS = 60;
const MISSING_ZERO_TIME_MAX_AGE_DAYS = 7;

function getExerciseIdFromUrl(url: string): string | null {
  const match = url.match(/exerciseid=(\d+)/i);
  return match?.[1] || null;
}

function getMissingIgnoreStorageKey(schoolId: string): string {
  return `${MISSING_IGNORED_PREFIX}${schoolId}`;
}

function parseStudentTimeHours(studentTime: string): number {
  const normalized = studentTime.trim().replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isAggressiveMissing(entry: OpgaveEntry, ignoredIds: Set<string>, now: Date): boolean {
  if (entry.status !== 'mangler') return false;

  const exerciseId = getExerciseIdFromUrl(entry.url);
  if (exerciseId && ignoredIds.has(exerciseId)) return false;

  const studentHours = parseStudentTimeHours(entry.studentTime);
  if (studentHours <= 0) return false;

  const ageMs = now.getTime() - entry.deadline.getTime();
  const maxAgeMs = MISSING_AGGRESSIVE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  if (ageMs > maxAgeMs) return false;

  return true;
}

function isActiveMissingForUpcoming(entry: OpgaveEntry, ignoredIds: Set<string>, now: Date): boolean {
  if (entry.status !== 'mangler') return false;

  const exerciseId = getExerciseIdFromUrl(entry.url);
  if (exerciseId && ignoredIds.has(exerciseId)) return false;

  const studentHours = parseStudentTimeHours(entry.studentTime);
  const maxAgeDays = studentHours <= 0 ? MISSING_ZERO_TIME_MAX_AGE_DAYS : MISSING_AGGRESSIVE_MAX_AGE_DAYS;
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const ageMs = now.getTime() - entry.deadline.getTime();
  return ageMs <= maxAgeMs;
}

export function OpgaverPage({ entries, schoolId }: OpgaverPageProps) {
  const [selectedHold, setSelectedHold] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllSubmitted, setShowAllSubmitted] = useState(false);
  const [isUpcomingCollapsed, setIsUpcomingCollapsed] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());
  const [selectedEntry, setSelectedEntry] = useState<OpgaveEntry | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [ignoredMissingIds, setIgnoredMissingIds] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const key = getMissingIgnoreStorageKey(schoolId);
      const raw = localStorage.getItem(key);
      if (!raw) {
        setIgnoredMissingIds(new Set());
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setIgnoredMissingIds(new Set(parsed.filter((id) => typeof id === 'string')));
      } else {
        setIgnoredMissingIds(new Set());
      }
    } catch {
      setIgnoredMissingIds(new Set());
    }
  }, [schoolId]);

  // Focus search on Cmd/Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const openDetail = (e: MouseEvent, entry: OpgaveEntry) => {
    e.preventDefault();
    setSelectedEntry(entry);
    setSheetOpen(true);
  };

  const toggleIgnoreMissing = (entry: OpgaveEntry) => {
    const exerciseId = getExerciseIdFromUrl(entry.url);
    if (!exerciseId) return;

    setIgnoredMissingIds((prev) => {
      const next = new Set(prev);
      if (next.has(exerciseId)) next.delete(exerciseId);
      else next.add(exerciseId);

      try {
        const key = getMissingIgnoreStorageKey(schoolId);
        localStorage.setItem(key, JSON.stringify([...next]));
      } catch {
        // Ignore storage errors; UI state still updates for current session.
      }

      return next;
    });
  };

  // Sort holds: active (has upcoming) first, then resolved names before raw codes, then alphabetical
  const holdsWithUpcoming = new Set(entries.filter(e => e.status === 'venter').map(e => e.hold));
  const holds = [...new Set(entries.map(e => e.hold))].sort((a, b) => {
    const aActive = holdsWithUpcoming.has(a) ? 0 : 1;
    const bActive = holdsWithUpcoming.has(b) ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;

    const aName = getHoldDisplayName(a);
    const bName = getHoldDisplayName(b);
    const aResolved = aName !== a ? 0 : 1;
    const bResolved = bName !== b ? 0 : 1;
    if (aResolved !== bResolved) return aResolved - bResolved;

    return aName.localeCompare(bName, 'da');
  });

  // Combined filtering: hold + search + date range
  const dateRange = getDateRange(datePreset);
  const queryLower = searchQuery.toLowerCase().trim();

  const filtered = entries.filter(e => {
    if (selectedHold && e.hold !== selectedHold) return false;
    if (queryLower && !e.title.toLowerCase().includes(queryLower) &&
        !e.hold.toLowerCase().includes(queryLower) &&
        !getHoldDisplayName(e.hold).toLowerCase().includes(queryLower)) return false;
    if (dateRange && (e.deadline < dateRange.from || e.deadline > dateRange.to)) return false;
    return true;
  });

  const upcoming = filtered
    .filter((entry) => {
      if (entry.status === 'venter') return true;
      return isActiveMissingForUpcoming(entry, ignoredMissingIds, new Date());
    })
    .sort((a, b) => {
      const now = new Date();
      const aActiveMissing = isActiveMissingForUpcoming(a, ignoredMissingIds, now);
      const bActiveMissing = isActiveMissingForUpcoming(b, ignoredMissingIds, now);
      if (aActiveMissing && !bActiveMissing) return -1;
      if (bActiveMissing && !aActiveMissing) return 1;
      return a.deadline.getTime() - b.deadline.getTime();
    });

  const submitted = filtered
    .filter((entry) => {
      if (entry.status === 'afleveret') return true;
      return entry.status === 'mangler'
        && !isActiveMissingForUpcoming(entry, ignoredMissingIds, new Date());
    })
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

  // Next urgent deadline (from unfiltered upcoming for the banner)
  // Only aggressive missing assignments should trigger the urgent banner.
  const allUpcoming = entries
    .filter((entry) => {
      if (entry.status === 'venter') return true;
      return isActiveMissingForUpcoming(entry, ignoredMissingIds, new Date());
    })
    .sort((a, b) => {
      const now = new Date();
      const aActiveMissing = isActiveMissingForUpcoming(a, ignoredMissingIds, now);
      const bActiveMissing = isActiveMissingForUpcoming(b, ignoredMissingIds, now);
      if (aActiveMissing && !bActiveMissing) return -1;
      if (bActiveMissing && !aActiveMissing) return 1;
      return a.deadline.getTime() - b.deadline.getTime();
    });
  const nextUrgent = allUpcoming.length > 0 ? (() => {
    const now = new Date();
    for (const entry of allUpcoming) {
      const display = getDeadlineDisplay(entry.deadline);
      const activeMissing = isActiveMissingForUpcoming(entry, ignoredMissingIds, now);
      const aggressiveMissing = isAggressiveMissing(entry, ignoredMissingIds, now);
      const isUrgentWaiting = entry.status !== 'mangler'
        && (display.urgency === 'overdue' || display.urgency === 'imminent');
      if (activeMissing || aggressiveMissing || isUrgentWaiting) {
        return { entry, display };
      }
    }
    return null;
  })() : null;

  const hasActiveFilters = selectedHold !== null || datePreset !== 'all' || queryLower !== '';

  return (
    <div className="il-opgaver-page">
      {/* ── Header ─────────────────────────────── */}
      <div className="il-opgaver-header">
        <h1 className="il-opgaver-title">Opgaver</h1>
        <p className="il-opgaver-subtitle">
          {upcoming.length} kommende &middot; {submitted.length} afleveret
        </p>
      </div>

      {/* ── Urgent banner ──────────────────────── */}
      {nextUrgent && (
        <button
          className={`il-opgaver-alert-banner is-${nextUrgent.display.urgency}`}
          onClick={(e) => openDetail(e as unknown as MouseEvent, nextUrgent.entry)}
        >
          <div className="il-opgaver-alert-icon">
            {nextUrgent.display.urgency === 'overdue' ? (
              <AlertTriangle size={20} />
            ) : (
              <Flame size={20} />
            )}
          </div>
          <div className="il-opgaver-alert-content">
            <span className="il-opgaver-alert-time">
              {nextUrgent.display.label}
              {nextUrgent.entry.status === 'mangler' &&
                ' — Mangler aflevering'}
            </span>
            <span className="il-opgaver-alert-title">{nextUrgent.entry.title}</span>
          </div>
          <ArrowRight size={16} className="il-opgaver-alert-arrow" />
        </button>
      )}

      {/* ── Search + filters toolbar ───────────── */}
      <div className="il-opgaver-toolbar">
        {/* Search */}
        <div className="il-opgaver-search">
          <Search size={15} className="il-opgaver-search-icon" />
          <input
            ref={searchRef}
            type="text"
            className="il-opgaver-search-input"
            placeholder="Søg opgaver..."
            value={searchQuery}
            onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
          />
          {searchQuery && (
            <button
              className="il-opgaver-search-clear"
              onClick={() => setSearchQuery('')}
            >
              <X size={14} />
            </button>
          )}
          <kbd className="il-opgaver-search-kbd">⌘K</kbd>
        </div>

        {/* Date presets */}
        <div className="il-opgaver-date-filters">
          <CalendarDays size={14} className="il-opgaver-date-icon" />
          {DATE_PRESETS.map(preset => (
            <button
              key={preset.key}
              className={`il-opgaver-date-pill${datePreset === preset.key ? ' is-active' : ''}`}
              onClick={() => setDatePreset(datePreset === preset.key ? 'all' : preset.key)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Hold filter pills ──────────────────── */}
      {holds.length > 1 && (
        <div className="il-opgaver-filters">
          <button
            className={`il-opgaver-filter-pill${selectedHold === null ? ' is-active' : ''}`}
            onClick={() => setSelectedHold(null)}
          >
            Alle fag
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
              <span className="il-opgaver-filter-dot" />
              {getHoldDisplayName(hold)}
            </button>
          ))}
        </div>
      )}

      {/* ── Empty state ────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="il-opgaver-empty">
          {hasActiveFilters ? (
            <>
              <Search className="il-opgaver-empty-icon" />
              <p className="il-opgaver-empty-title">Ingen resultater</p>
              <p className="il-opgaver-empty-subtitle">
                Prøv at ændre dine filtre eller søgning
              </p>
              <button
                className="il-opgaver-empty-reset"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedHold(null);
                  setDatePreset('all');
                }}
              >
                Nulstil filtre
              </button>
            </>
          ) : (
            <>
              <ClipboardList className="il-opgaver-empty-icon" />
              <p className="il-opgaver-empty-title">Ingen opgaver</p>
              <p className="il-opgaver-empty-subtitle">
                Der er ingen opgaver at vise
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          {/* ── Upcoming ───────────────────────── */}
          {upcoming.length > 0 && (
            <section className="il-opgaver-section">
              <button
                type="button"
                className="il-opgaver-section-toggle"
                onClick={() => setIsUpcomingCollapsed((prev) => !prev)}
                aria-expanded={!isUpcomingCollapsed}
              >
                <h2 className="il-opgaver-section-title">
                  <Clock size={14} />
                  Kommende
                  <span className="il-opgaver-section-count">
                    {upcoming.length}
                  </span>
                </h2>
                <ChevronDown
                  size={16}
                  className={`il-opgaver-section-chevron${isUpcomingCollapsed ? ' is-collapsed' : ''}`}
                />
              </button>
              {!isUpcomingCollapsed && (
                <div className="il-opgaver-upcoming">
                  {upcoming.map((entry, idx) => {
                    const display = getDeadlineDisplay(entry.deadline);
                    const aggressiveMissing = isAggressiveMissing(entry, ignoredMissingIds, new Date());
                    const effectiveUrgency =
                      entry.status === 'mangler' && !aggressiveMissing && display.urgency === 'overdue'
                        ? 'later'
                        : display.urgency;
                    const hue = getHoldHue(entry.hold);
                    const globalIdx = entries.indexOf(entry);
                    const hasMeta =
                      (entry.studentTime && entry.studentTime !== '0,00') ||
                      entry.awaiting ||
                      (entry.statusText && entry.status !== 'mangler');

                    return (
                      <a
                        key={idx}
                        href={entry.url}
                        className={`il-opgaver-card is-${effectiveUrgency}`}
                        style={
                          {
                            '--hold-hue': hue,
                            animationDelay: `${idx * 50}ms`,
                          } as any
                        }
                        onClick={(e) =>
                          openDetail(e as unknown as MouseEvent, entry)
                        }
                      >
                        {/* Deadline — the hero element */}
                        <div className="il-opgaver-card-deadline">
                          <div className="il-opgaver-deadline-info">
                            {effectiveUrgency === 'overdue' && (
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
                            {getHoldDisplayName(entry.hold)}
                          </span>
                        </div>

                        {/* Title */}
                        <span className="il-opgaver-card-title">
                          {entry.title}
                        </span>

                        {/* Missing submission badge */}
                        {entry.status === 'mangler' && aggressiveMissing && (
                          <div className="il-opgaver-missing-badge">
                            <Upload size={13} />
                            Mangler aflevering
                          </div>
                        )}
                        {entry.status === 'mangler' && !aggressiveMissing && (
                          <div className="il-opgaver-status-badge is-mangler">
                            {entry.statusText || 'Ikke afleveret'}
                          </div>
                        )}
                        {entry.status !== 'mangler' && entry.statusText && (
                          <div className={`il-opgaver-status-badge is-${entry.status}`}>
                            {entry.statusText}
                          </div>
                        )}
                        {entry.status === 'mangler' && (
                          <button
                            type="button"
                            className="il-opgaver-ignore-missing"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleIgnoreMissing(entry);
                            }}
                          >
                            {(() => {
                              const exerciseId = getExerciseIdFromUrl(entry.url);
                              const isIgnored = exerciseId ? ignoredMissingIds.has(exerciseId) : false;
                              return isIgnored ? 'Vis igen som manglende' : 'Ignorer manglende';
                            })()}
                          </button>
                        )}

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
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleNote(globalIdx);
                            }}
                          >
                            <span>{entry.note}</span>
                          </div>
                        )}
                      </a>
                    );
                  })}
                </div>
              )}
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
              <div className="il-opgaver-submitted-grid">
                {visibleSubmitted.map((entry, idx) => {
                  const hue = getHoldHue(entry.hold);
                  const gradeHue = entry.grade
                    ? getGradeHue(entry.grade)
                    : entry.status === 'mangler'
                      ? 25
                      : 145;
                  return (
                    <a
                      key={idx}
                      href={entry.url}
                      className="il-opgaver-submitted-card"
                      style={
                        {
                          '--hold-hue': hue,
                          '--grade-hue': gradeHue,
                          animationDelay: `${idx * 40}ms`,
                        } as any
                      }
                      onClick={(e) =>
                        openDetail(e as unknown as MouseEvent, entry)
                      }
                    >
                      <div className="il-opgaver-submitted-grade-wrap">
                        {entry.grade ? (
                          <span className="il-opgaver-submitted-grade">
                            {entry.grade}
                          </span>
                        ) : entry.status === 'mangler' ? (
                          <XCircle
                            size={18}
                            className="il-opgaver-submitted-missing"
                          />
                        ) : (
                          <Check
                            size={18}
                            className="il-opgaver-submitted-check"
                          />
                        )}
                      </div>
                      <div className="il-opgaver-submitted-info">
                        <span className="il-opgaver-submitted-title">
                          {entry.title}
                        </span>
                        <div className="il-opgaver-submitted-meta">
                          <span
                            className="il-opgaver-hold-pill"
                            style={{ '--hold-hue': hue } as any}
                          >
                            {getHoldDisplayName(entry.hold)}
                          </span>
                          <span className="il-opgaver-submitted-date">
                            {formatAbsoluteDeadline(entry.deadline)}
                          </span>
                        </div>
                        {entry.gradeExtra && (
                          <span className="il-opgaver-submitted-extra">
                            {entry.gradeExtra}
                          </span>
                        )}
                      </div>
                    </a>
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
