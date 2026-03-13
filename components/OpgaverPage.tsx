import { useState, useRef, useEffect } from 'preact/hooks';
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  ChevronDown,
  AlertTriangle,
  Check,
  XCircle,
  Search,
  X,
  CalendarDays,
  Upload,
} from 'lucide-react';
import { OpgaveDetailSheet } from '@/components/OpgaveDetailSheet';
import { getHoldHue, getHoldDisplayName } from '@/lib/hold-mapping';
import { getExerciseIdFromUrl, loadIgnoredMissingIds } from '@/lib/opgaver-ignored';
import { cn } from '@/lib/utils';

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

const MISSING_IGNORED_PREFIX = 'bl-opgaver-ignored-missing-';
const LEGACY_MISSING_IGNORED_PREFIX = 'il-opgaver-ignored-missing-';
const MISSING_AGGRESSIVE_MAX_AGE_DAYS = 60;
const MISSING_ZERO_TIME_MAX_AGE_DAYS = 7;

const UPCOMING_CARD_STYLE: Record<Urgency, string> = {
  overdue:
    'border-l-[5px] border-l-[oklch(0.63_0.2_25)] bg-[linear-gradient(135deg,oklch(0.98_0.012_25),oklch(0.99_0.004_25))] dark:border-l-[oklch(0.58_0.18_25)] dark:bg-[linear-gradient(135deg,oklch(0.16_0.02_25),oklch(0.14_0.008_25))]',
  imminent:
    'border-l-[4px] border-l-[oklch(0.64_0.16_50)] bg-[linear-gradient(135deg,oklch(0.98_0.01_50),oklch(0.99_0.004_50))] dark:border-l-[oklch(0.58_0.15_50)] dark:bg-[linear-gradient(135deg,oklch(0.16_0.015_50),oklch(0.14_0.006_50))]',
  soon: 'border-l-[3px] border-l-[oklch(0.62_0.12_80)] dark:border-l-[oklch(0.55_0.1_80)]',
  later: 'border-l-[2px] border-l-border dark:border-l-[oklch(0.3_0.004_285)]',
};
const DEADLINE_LABEL_STYLE: Record<Urgency, string> = {
  overdue: 'text-[1.0625rem] font-[800] text-[oklch(0.52_0.18_25)] dark:text-[oklch(0.72_0.18_25)]',
  imminent: 'text-[1rem] font-[700] text-[oklch(0.52_0.15_50)] dark:text-[oklch(0.72_0.15_50)]',
  soon: 'text-[0.9375rem] font-[600] text-[oklch(0.48_0.12_80)] dark:text-[oklch(0.72_0.1_80)]',
  later: 'text-[0.875rem] font-medium',
};
const STATUS_BADGE_STYLE = {
  venter:
    'bg-[oklch(0.95_0.06_80)] text-[oklch(0.45_0.14_80)] border-[oklch(0.75_0.08_80/0.4)] dark:border-[oklch(0.48_0.06_80/0.5)] dark:bg-[oklch(0.3_0.05_80/0.32)] dark:text-[oklch(0.76_0.1_80)]',
  afleveret:
    'bg-[oklch(0.95_0.05_145)] text-[oklch(0.43_0.12_145)] border-[oklch(0.72_0.07_145/0.35)] dark:border-[oklch(0.46_0.05_145/0.45)] dark:bg-[oklch(0.3_0.05_145/0.28)] dark:text-[oklch(0.74_0.09_145)]',
  mangler:
    'bg-[oklch(0.95_0.02_25)] text-[oklch(0.44_0.06_25)] border-[oklch(0.72_0.03_25/0.35)] dark:border-[oklch(0.44_0.02_25/0.45)] dark:bg-[oklch(0.28_0.01_25/0.4)] dark:text-[oklch(0.74_0.04_25)]',
};

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
    setIgnoredMissingIds(loadIgnoredMissingIds(schoolId));
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

  const hasActiveFilters = selectedHold !== null || datePreset !== 'all' || queryLower !== '';

  return (
    <div className="mx-auto max-w-[860px] space-y-4 px-8 pb-12 pt-10 max-sm:px-4 max-sm:pb-8 max-sm:pt-6">
      {/* ── Header ─────────────────────────────── */}
      <div className="border-b border-border pb-5 mb-7">
        <h1 className="text-[2rem] font-[800] tracking-[-0.03em] text-foreground max-sm:text-2xl">Opgaver</h1>
        <p className="text-sm text-muted-foreground">
          {upcoming.length} kommende &middot; {submitted.length} afleveret
        </p>
      </div>


      {/* ── Search + filters toolbar ───────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative min-w-[240px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            type="text"
            className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-20 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 max-sm:pr-10"
            placeholder="Søg opgaver..."
            value={searchQuery}
            onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
          />
          {searchQuery && (
            <button
              className="absolute right-12 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setSearchQuery('')}
            >
              <X size={14} />
            </button>
          )}
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground max-sm:hidden">⌘K</kbd>
        </div>

        {/* Date presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          <CalendarDays size={14} className="text-muted-foreground" />
          {DATE_PRESETS.map(preset => (
            <button
              key={preset.key}
              className={cn(
                'rounded-full border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent',
                datePreset === preset.key &&
                  'border-[oklch(0.34_0.06_265)] bg-[oklch(0.94_0.06_265)] text-[oklch(0.43_0.14_265)] hover:bg-[oklch(0.92_0.08_265)] dark:border-[oklch(0.34_0.06_265)] dark:bg-[oklch(0.24_0.06_265)] dark:text-[oklch(0.75_0.12_265)] dark:hover:bg-[oklch(0.28_0.08_265)]',
              )}
              onClick={() => setDatePreset(datePreset === preset.key ? 'all' : preset.key)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Hold filter pills ──────────────────── */}
      {holds.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent',
              selectedHold === null && 'border-primary/40 bg-primary/10 text-foreground',
            )}
            onClick={() => setSelectedHold(null)}
          >
            Alle fag
          </button>
          {holds.map(hold => (
            <button
              key={hold}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent',
                selectedHold === hold &&
                  'border-[oklch(0.6_0.12_var(--hold-hue,265))] bg-[oklch(0.94_0.06_var(--hold-hue,265))] text-[oklch(0.4_0.14_var(--hold-hue,265))] dark:bg-[oklch(0.24_0.06_var(--hold-hue,265))] dark:text-[oklch(0.75_0.12_var(--hold-hue,265))]',
              )}
              onClick={() =>
                setSelectedHold(selectedHold === hold ? null : hold)
              }
              style={{ '--hold-hue': getHoldHue(hold) } as any}
            >
              <span
                className="inline-block size-2 rounded-full bg-[oklch(0.54_0.2_var(--hold-hue,265))] dark:bg-[oklch(0.62_0.1_var(--hold-hue,265))]"
              />
              {getHoldDisplayName(hold)}
            </button>
          ))}
        </div>
      )}

      {/* ── Empty state ────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-14 text-center">
          {hasActiveFilters ? (
            <>
              <Search className="mb-3 size-6 text-muted-foreground" />
              <p className="text-base font-semibold text-foreground">Ingen resultater</p>
              <p className="text-sm text-muted-foreground">
                Prøv at ændre dine filtre eller søgning
              </p>
              <button
                className="mt-4 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
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
              <ClipboardList className="mb-3 size-6 text-muted-foreground" />
              <p className="text-base font-semibold text-foreground">Ingen opgaver</p>
              <p className="text-sm text-muted-foreground">
                Der er ingen opgaver at vise
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          {/* ── Upcoming ───────────────────────── */}
          {upcoming.length > 0 && (
            <section className="space-y-3">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-background px-3 py-2 text-left hover:bg-accent/40"
                onClick={() => setIsUpcomingCollapsed((prev) => !prev)}
                aria-expanded={!isUpcomingCollapsed}
              >
                <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Clock size={14} />
                  Kommende
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                    {upcoming.length}
                  </span>
                </h2>
                <ChevronDown
                  size={16}
                  className={cn('transition-transform', isUpcomingCollapsed && 'rotate-180')}
                />
              </button>
              {!isUpcomingCollapsed && (
                <div className="flex flex-col gap-[0.625rem]">
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
                      entry.studentTime && entry.studentTime !== '0,00';

                    return (
                      <a
                        key={idx}
                        href={entry.url}
                        className={cn(
                          'rounded-lg border border-border bg-card px-4 py-3.5 no-underline transition-all animate-[opgaver-slide-up_0.4s_ease_both] hover:-translate-y-[2px] hover:bg-accent/25 hover:shadow-[0_4px_20px_oklch(0_0_0/0.07)] dark:hover:border-[oklch(0.32_0.004_285)] dark:hover:shadow-[0_4px_20px_oklch(0_0_0/0.4)]',
                          UPCOMING_CARD_STYLE[effectiveUrgency],
                        )}
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
                        <div className="flex flex-wrap items-center justify-between gap-2 max-sm:flex-col max-sm:items-start max-sm:gap-1.5">
                          <div className="inline-flex min-w-0 items-center gap-1.5">
                            {effectiveUrgency === 'overdue' && (
                              <AlertTriangle
                                size={16}
                                className={cn('relative top-px', DEADLINE_LABEL_STYLE[effectiveUrgency])}
                              />
                            )}
                            <span className={cn('whitespace-nowrap', DEADLINE_LABEL_STYLE[effectiveUrgency])}>
                              {display.label}
                            </span>
                            <span className="text-xs text-muted-foreground/40">
                              &middot;
                            </span>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {display.detail}
                            </span>
                          </div>
                          <span
                            className="hold-pill-dynamic rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{ '--hold-hue': hue } as any}
                          >
                            {getHoldDisplayName(entry.hold)}
                          </span>
                        </div>

                        {/* Title */}
                        <span
                          className="mt-1 block truncate text-sm font-medium text-foreground transition-colors hover:text-[oklch(0.5_0.16_var(--hold-hue,235))] max-sm:whitespace-normal"
                        >
                          {entry.title}
                        </span>

                        {/* Missing submission badge */}
                        {entry.status === 'mangler' && aggressiveMissing && (
                          <div className="mt-2 inline-flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive dark:border-[oklch(0.58_0.18_25/0.2)] dark:bg-[oklch(0.58_0.18_25/0.12)] dark:text-[oklch(0.72_0.18_25)]">
                            <Upload size={13} />
                            Mangler aflevering
                          </div>
                        )}
                        {entry.status === 'mangler' && !aggressiveMissing && (
                          <div className={cn('mt-2 inline-flex rounded-md border px-2 py-1 text-xs font-medium', STATUS_BADGE_STYLE.mangler)}>
                            {entry.statusText || 'Ikke afleveret'}
                          </div>
                        )}
                        {entry.status === 'afleveret' && entry.statusText && (
                          <div className={cn('mt-2 inline-flex rounded-md border px-2 py-1 text-xs font-medium', STATUS_BADGE_STYLE[entry.status])}>
                            {entry.statusText}
                          </div>
                        )}
                        {entry.status === 'mangler' && (
                          <button
                            type="button"
                            className="mt-2 inline-flex rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent dark:border-[oklch(0.38_0.004_285)] dark:bg-[oklch(0.2_0.003_285)] dark:text-[oklch(0.66_0.006_285)] dark:hover:border-[oklch(0.5_0.006_285)] dark:hover:bg-[oklch(0.24_0.003_285)] dark:hover:text-[oklch(0.86_0.003_90)]"
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
                          <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            {entry.studentTime &&
                              entry.studentTime !== '0,00' && (
                                <span>{entry.studentTime} timer</span>
                              )}
                          </div>
                        )}

                        {/* Note */}
                        {entry.note && (
                          <div
                            className={cn(
                              'mt-2 cursor-pointer rounded-md border-l-[3px] border-l-[oklch(0.75_0.12_var(--hold-hue,235))] bg-[oklch(0.96_0.005_265/0.6)] px-2.5 py-2 text-[13px] leading-6 text-muted-foreground whitespace-pre-line transition-all dark:border-l-[oklch(0.45_0.1_var(--hold-hue,265))] dark:bg-[oklch(0.18_0.004_285/0.6)]',
                              expandedNotes.has(globalIdx) ? 'line-clamp-none' : 'line-clamp-2',
                            )}
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
            <section className="space-y-3">
              <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <CheckCircle2 size={14} />
                Afleveret
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {submitted.length}
                </span>
              </h2>
              <div className="flex flex-col gap-[0.625rem] sm:grid sm:grid-cols-2 max-sm:grid-cols-1">
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
                      className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3.5 no-underline transition-all animate-[opgaver-slide-up_0.35s_ease_both] hover:-translate-y-[2px] hover:bg-accent/25 hover:shadow-[0_4px_20px_oklch(0_0_0/0.07)] dark:hover:border-[oklch(0.32_0.004_285)] dark:hover:shadow-[0_4px_20px_oklch(0_0_0/0.4)]"
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
                      <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-[0.625rem] border border-border bg-[oklch(0.94_0.06_var(--grade-hue,145))] dark:bg-[oklch(0.24_0.06_var(--grade-hue,145))]">
                        {entry.grade ? (
                          <span className="text-xl font-extrabold leading-none tabular-nums text-[oklch(0.38_0.16_var(--grade-hue,145))] dark:text-[oklch(0.78_0.1_var(--grade-hue,145))]">
                            {entry.grade}
                          </span>
                        ) : entry.status === 'mangler' ? (
                          <XCircle
                            size={18}
                            className="text-[oklch(0.58_0.18_25)] dark:text-[oklch(0.72_0.16_25)]"
                          />
                        ) : (
                          <Check
                            size={18}
                            className="text-[oklch(0.5_0.12_145)] dark:text-[oklch(0.62_0.1_145)]"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-foreground transition-colors hover:text-[oklch(0.5_0.16_var(--hold-hue,235))] max-sm:whitespace-normal dark:hover:text-[oklch(0.72_0.12_var(--hold-hue,265))]">
                          {entry.title}
                        </span>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span
                            className="hold-pill-dynamic rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{ '--hold-hue': hue } as any}
                          >
                            {getHoldDisplayName(entry.hold)}
                          </span>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {formatAbsoluteDeadline(entry.deadline)}
                          </span>
                        </div>
                        {entry.gradeExtra && (
                          <span className="mt-1 block text-xs italic text-muted-foreground/70">
                            {entry.gradeExtra}
                          </span>
                        )}
                        {entry.status === 'mangler' && (() => {
                          const eid = getExerciseIdFromUrl(entry.url);
                          return eid && ignoredMissingIds.has(eid);
                        })() && (
                          <button
                            className="mt-2 inline-flex rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent dark:border-[oklch(0.38_0.004_285)] dark:bg-[oklch(0.2_0.003_285)] dark:text-[oklch(0.66_0.006_285)] dark:hover:border-[oklch(0.5_0.006_285)] dark:hover:bg-[oklch(0.24_0.003_285)] dark:hover:text-[oklch(0.86_0.003_90)]"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleIgnoreMissing(entry);
                            }}
                          >
                            Vis igen som manglende
                          </button>
                        )}
                      </div>
                    </a>
                  );
                })}
              </div>
              {submitted.length > 6 && !showAllSubmitted && (
                <button
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-input bg-muted px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
