import { useState, useRef, useEffect, useLayoutEffect } from 'preact/hooks';
import {
  ClipboardList,
  Clock,
  Check,
  AlertTriangle,
  Search,
  X,
  XCircle,
  ChevronUp,
  Eye,
  EyeOff,
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

// ── Week helpers ──────────────────────────────────────────────────────

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getWeekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function getWeekKey(date: Date): string {
  const ws = getWeekStart(date);
  const week = getISOWeekNumber(date);
  return `${ws.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getWeekLabel(weekKey: string, now: Date): string {
  const thisWeekKey = getWeekKey(now);
  if (weekKey === thisWeekKey) return 'Denne uge';

  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);
  if (weekKey === getWeekKey(nextWeek)) return 'Næste uge';

  const lastWeek = new Date(now);
  lastWeek.setDate(lastWeek.getDate() - 7);
  if (weekKey === getWeekKey(lastWeek)) return 'Sidste uge';

  const weekNum = parseInt(weekKey.split('-W')[1], 10);
  return `Uge ${weekNum}`;
}

function getWeekDateRange(weekKey: string): string {
  const [yearStr, wStr] = weekKey.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(wStr, 10);

  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmtDay = (d: Date) => `${d.getDate()}. ${DANISH_MONTHS[d.getMonth()]}`;

  if (monday.getMonth() === sunday.getMonth()) {
    return `${monday.getDate()}–${sunday.getDate()}. ${DANISH_MONTHS[monday.getMonth()]}`;
  }
  return `${fmtDay(monday)} – ${fmtDay(sunday)}`;
}

interface WeekGroup {
  key: string;
  label: string;
  dateRange: string;
  entries: OpgaveEntry[];
  totalHours: number;
}

function groupAllByWeek(items: OpgaveEntry[], now: Date): WeekGroup[] {
  const groups = new Map<string, OpgaveEntry[]>();

  for (const item of items) {
    const key = getWeekKey(item.deadline);
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }

  const sortedKeys = [...groups.keys()].sort();
  return sortedKeys.map(key => {
    const entries = groups.get(key)!;
    let totalHours = 0;
    for (const e of entries) totalHours += parseStudentTimeHours(e.studentTime);
    return {
      key,
      label: getWeekLabel(key, now),
      dateRange: getWeekDateRange(key),
      entries,
      totalHours,
    };
  });
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function parseStudentTimeHours(studentTime: string): number {
  const normalized = studentTime.trim().replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseAbsencePercent(absence: string): number | null {
  const normalized = absence.replace(/\s|\u00a0/g, '').replace(',', '.');
  if (!normalized) return null;
  const match = normalized.match(/(\d+(?:\.\d+)?)%?/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasAssignmentFravaer(entry: Pick<OpgaveEntry, 'status' | 'absence' | 'statusText'>): boolean {
  if (entry.status !== 'mangler') return false;
  const absencePercent = parseAbsencePercent(entry.absence);
  if (absencePercent !== null && absencePercent > 0) return true;
  return /frav[æa]r/i.test(entry.statusText);
}

function getAssignmentFravaerLabel(entry: Pick<OpgaveEntry, 'absence'>): string {
  const absencePercent = parseAbsencePercent(entry.absence);
  if (absencePercent === null) return 'Fravær';
  return `${String(absencePercent).replace('.', ',')}%`;
}

// ── Deadline display ──────────────────────────────────────────────────

type Urgency = 'overdue' | 'imminent' | 'soon' | 'normal';

interface DeadlineInfo {
  primary: string;
  secondary: string;
  urgency: Urgency;
}

function getDeadlineInfo(deadline: Date): DeadlineInfo {
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const timeStr = `kl. ${formatTime(deadline)}`;

  if (diffMs < 0) {
    const absDays = Math.floor(Math.abs(diffMs) / 86400000);
    const absHours = Math.floor(Math.abs(diffMs) / 3600000);
    let primary: string;
    if (absDays === 0) primary = absHours < 1 ? 'Lige overskredet' : `${absHours} t. siden`;
    else if (absDays === 1) primary = 'I går';
    else if (absDays <= 7) primary = `${absDays} dage siden`;
    else primary = `${deadline.getDate()}/${deadline.getMonth() + 1}`;
    return { primary, secondary: timeStr, urgency: 'overdue' };
  }

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const deadlineDay = new Date(deadline);
  deadlineDay.setHours(0, 0, 0, 0);
  const calDayDiff = Math.round((deadlineDay.getTime() - todayStart.getTime()) / 86400000);

  const urgency: Urgency =
    diffMs < 24 * 3600000 ? 'imminent' :
    diffMs < 72 * 3600000 ? 'soon' : 'normal';

  let primary: string;
  let secondary: string;

  if (calDayDiff === 0) {
    primary = 'I dag';
    secondary = timeStr;
  } else if (calDayDiff === 1) {
    primary = 'I morgen';
    secondary = timeStr;
  } else if (calDayDiff === 2) {
    primary = 'I overmorgen';
    secondary = timeStr;
  } else if (calDayDiff <= 7) {
    const wd = DANISH_WEEKDAYS[deadline.getDay()];
    primary = wd.charAt(0).toUpperCase() + wd.slice(1);
    secondary = timeStr;
  } else {
    primary = `${deadline.getDate()}. ${DANISH_MONTHS[deadline.getMonth()]}`;
    secondary = timeStr;
  }

  return { primary, secondary, urgency };
}

// ── Grade color ───────────────────────────────────────────────────────

function getGradeHue(grade: string): number {
  switch (grade.trim()) {
    case '12': return 145;
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

  return 'venter';
}

// ── DOM parser ─────────────────────────────────────────────────────────

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

// ── Fetch all opgaver ─────────────────────────────────────────────────

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

// ── Storage ───────────────────────────────────────────────────────────

const MISSING_IGNORED_PREFIX = 'bl-opgaver-ignored-missing-';

function getMissingIgnoreStorageKey(schoolId: string): string {
  return `${MISSING_IGNORED_PREFIX}${schoolId}`;
}

// ── Component ──────────────────────────────────────────────────────────

interface OpgaverPageProps {
  entries: OpgaveEntry[];
  schoolId: string;
}

type StatusFilter = 'venter' | 'mangler' | 'afleveret';

export function OpgaverPage({ entries, schoolId }: OpgaverPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedHold, setSelectedHold] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<OpgaveEntry | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [ignoredMissingIds, setIgnoredMissingIds] = useState<Set<string>>(new Set());
  const currentWeekRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIgnoredMissingIds(loadIgnoredMissingIds(schoolId));
  }, [schoolId]);

  // Position the scroll container so current week is at the top — runs
  // synchronously before paint so the user never sees it jump.
  // Offset matches the content wrapper's pt-28 so the current week lands
  // below the 160px top fade (in its transparent tail), not buried under it.
  useLayoutEffect(() => {
    if (!scrollRef.current || !currentWeekRef.current || entries.length === 0) return;
    scrollRef.current.scrollTop = currentWeekRef.current.offsetTop - 100;
  }, [entries.length]);

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
      } catch { /* noop */ }

      return next;
    });
  };

  const scrollToCurrentWeek = () => {
    if (scrollRef.current && currentWeekRef.current) {
      scrollRef.current.scrollTo({
        top: currentWeekRef.current.offsetTop - 100,
        behavior: 'smooth',
      });
    }
  };

  // ── Filtering ──
  const queryLower = searchQuery.toLowerCase().trim();
  const filtered = entries.filter(e => {
    if (selectedHold && e.hold !== selectedHold) return false;
    if (statusFilter) {
      if (e.status !== statusFilter) return false;
      // When filtering to "mangler", exclude ignored so the list matches the count.
      if (statusFilter === 'mangler') {
        const eid = getExerciseIdFromUrl(e.url);
        if (eid && ignoredMissingIds.has(eid)) return false;
      }
    }
    if (queryLower && !e.title.toLowerCase().includes(queryLower) &&
        !e.hold.toLowerCase().includes(queryLower) &&
        !getHoldDisplayName(e.hold).toLowerCase().includes(queryLower)) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
  const now = new Date();
  const weekGroups = groupAllByWeek(sorted, now);
  const currentWeekKey = getWeekKey(now);

  const holds = [...new Set(entries.map(e => e.hold))].sort((a, b) => {
    return getHoldDisplayName(a).localeCompare(getHoldDisplayName(b), 'da');
  });

  const missingCount = entries.filter(e => {
    if (e.status !== 'mangler') return false;
    const eid = getExerciseIdFromUrl(e.url);
    return !eid || !ignoredMissingIds.has(eid);
  }).length;

  const submittedCount = entries.filter(e => e.status === 'afleveret').length;
  const waitingCount = entries.filter(e => e.status === 'venter').length;

  const hasActiveFilters = selectedHold !== null || queryLower !== '' || statusFilter !== null;

  const toggleStatusFilter = (next: StatusFilter) => {
    setStatusFilter(prev => (prev === next ? null : next));
  };

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      {/* ── Fixed header — never scrolls ───────── */}
      <div className="shrink-0 bg-background px-10 pb-5 pt-10">
        <div className="mx-auto max-w-7xl">
          {/* Title row */}
          <div className="flex flex-wrap items-end justify-between gap-6 pb-5">
            <div>
              <h1 className="text-[2.5rem] font-[800] tracking-[-0.02em] text-foreground">Opgaver</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-lg text-muted-foreground">
                <span className="px-0.5">
                  <span className="tabular-nums">{entries.length}</span> opgaver
                </span>
                {waitingCount > 0 && (
                  <>
                    <span aria-hidden className="text-muted-foreground/30">&middot;</span>
                    <StatusPill
                      tone="waiting"
                      active={statusFilter === 'venter'}
                      onToggle={() => toggleStatusFilter('venter')}
                    >
                      <span className="tabular-nums">{waitingCount}</span> kommende
                    </StatusPill>
                  </>
                )}
                {missingCount > 0 && (
                  <>
                    <span aria-hidden className="text-muted-foreground/30">&middot;</span>
                    <StatusPill
                      tone="missing"
                      active={statusFilter === 'mangler'}
                      onToggle={() => toggleStatusFilter('mangler')}
                    >
                      <span className="tabular-nums">{missingCount}</span> mangler
                    </StatusPill>
                  </>
                )}
                {submittedCount > 0 && (
                  <>
                    <span aria-hidden className="text-muted-foreground/30">&middot;</span>
                    <StatusPill
                      tone="done"
                      active={statusFilter === 'afleveret'}
                      onToggle={() => toggleStatusFilter('afleveret')}
                    >
                      <span className="tabular-nums">{submittedCount}</span> afleveret
                    </StatusPill>
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-base font-medium text-muted-foreground transition-[background-color,transform] duration-150 hover:bg-accent hover:text-foreground active:scale-[0.97]"
              onClick={scrollToCurrentWeek}
            >
              <ChevronUp size={16} className="rotate-180" />
              Denne uge
            </button>
          </div>

          {/* Search + filters */}
          <div className="space-y-3 pt-1">
            <div className="relative">
              <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
              <input
                ref={searchRef}
                type="text"
                className="h-12 w-full rounded-xl border border-border bg-card pl-11 pr-20 text-lg text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
                placeholder="Søg opgaver..."
                value={searchQuery}
                onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="absolute right-14 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:text-foreground"
                  onClick={() => setSearchQuery('')}
                >
                  <X size={16} />
                </button>
              )}
              <kbd className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">⌘K</kbd>
            </div>

            {holds.length > 1 && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-base font-medium transition-[background-color,transform] duration-150 active:scale-[0.97]',
                    selectedHold === null
                      ? 'border-primary/30 bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                  onClick={() => setSelectedHold(null)}
                >
                  Alle fag
                </button>
                {holds.map(hold => {
                  const hue = getHoldHue(hold);
                  const active = selectedHold === hold;
                  return (
                    <button
                      key={hold}
                      type="button"
                      className={cn(
                        'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-base font-medium transition-[background-color,transform] duration-150 active:scale-[0.97]',
                        active
                          ? 'border-transparent'
                          : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                      style={active ? {
                        background: `oklch(0.94 0.05 ${hue})`,
                        color: `oklch(0.38 0.12 ${hue})`,
                        borderColor: `oklch(0.85 0.08 ${hue})`,
                      } : undefined}
                      onClick={() => setSelectedHold(active ? null : hold)}
                    >
                      <span
                        className="inline-block size-3 rounded-full"
                        style={{ background: `oklch(0.58 0.18 ${hue})` }}
                      />
                      {getHoldDisplayName(hold)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Scrollable timeline viewport ───────── */}
      <div className="relative min-h-0 flex-1">
        {/* Top fade — hints at past content above */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-40 bg-gradient-to-b from-background via-background/40 to-transparent" />

        {/* Bottom fade */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-40 bg-gradient-to-t from-background via-background/40 to-transparent" />

        <div
          ref={scrollRef}
          className="h-full overflow-y-auto px-10"
        >
          <div className="mx-auto max-w-7xl pb-16 pt-28">
            {/* ── Empty state ──────────────────── */}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-8 py-20 text-center">
                {hasActiveFilters ? (
                  <>
                    <Search className="mb-5 size-8 text-muted-foreground/30" />
                    <p className="text-xl font-semibold text-foreground">Ingen resultater</p>
                    <p className="mt-1.5 text-base text-muted-foreground">Prøv at ændre søgning eller filtre</p>
                    <button
                      type="button"
                      className="mt-6 rounded-xl border border-border bg-background px-6 py-3 text-base font-medium transition-[background-color,transform] duration-150 hover:bg-accent active:scale-[0.97]"
                      onClick={() => { setSearchQuery(''); setSelectedHold(null); setStatusFilter(null); }}
                    >
                      Nulstil
                    </button>
                  </>
                ) : (
                  <>
                    <ClipboardList className="mb-5 size-8 text-muted-foreground/30" />
                    <p className="text-xl font-semibold text-foreground">Ingen opgaver</p>
                    <p className="mt-1.5 text-base text-muted-foreground">Der er ingen opgaver at vise</p>
                  </>
                )}
              </div>
            ) : (
              /* ── Week groups ──────────────── */
              <div className="space-y-10">
                {weekGroups.map((group) => {
                  const isCurrentWeek = group.key === currentWeekKey;
                  return (
                    <div
                      key={group.key}
                      ref={isCurrentWeek ? currentWeekRef : undefined}
                    >
                      <WeekHeader
                        group={group}
                        isCurrentWeek={isCurrentWeek}
                      />
                      <div className="mt-3 space-y-2.5">
                        {group.entries.map((entry, i) => (
                          <AssignmentRow
                            key={entry.url || i}
                            entry={entry}
                            ignoredIds={ignoredMissingIds}
                            onToggleIgnore={toggleIgnoreMissing}
                            onClick={openDetail}
                            index={i}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <OpgaveDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        entry={selectedEntry}
        schoolId={schoolId}
      />
    </div>
  );
}

// ── WeekHeader ─────────────────────────────────────────────────────────

function WeekHeader({ group, isCurrentWeek }: { group: WeekGroup; isCurrentWeek: boolean }) {
  const hoursStr = group.totalHours > 0
    ? group.totalHours.toFixed(2).replace('.', ',')
    : null;

  return (
    <div className={cn(
      'mb-1',
      isCurrentWeek
        ? 'text-[oklch(0.48_0.16_265)] dark:text-[oklch(0.72_0.14_265)]'
        : 'text-muted-foreground',
    )}>
      <span className="text-base font-bold">
        {group.label}
      </span>
      {group.dateRange && (
        <span className={cn(
          'ml-2 text-base font-normal',
          isCurrentWeek ? 'opacity-60' : 'text-muted-foreground/60',
        )}>
          {group.dateRange}
        </span>
      )}
      <span className={cn(
        'ml-2',
        isCurrentWeek ? 'opacity-30' : 'text-muted-foreground/30',
      )}>&middot;</span>
      <span className={cn(
        'ml-2 text-base tabular-nums',
        isCurrentWeek ? 'opacity-70' : 'text-muted-foreground/60',
      )}>
        {group.entries.length} {group.entries.length === 1 ? 'opgave' : 'opgaver'}
      </span>
      {hoursStr && (
        <>
          <span className={cn(
            'ml-2',
            isCurrentWeek ? 'opacity-30' : 'text-muted-foreground/30',
          )}>&middot;</span>
          <span className={cn(
            'ml-2 text-base tabular-nums',
            isCurrentWeek ? 'opacity-70' : 'text-muted-foreground/60',
          )}>
            {hoursStr} t
          </span>
        </>
      )}
    </div>
  );
}

// ── AssignmentRow ──────────────────────────────────────────────────────

function AssignmentRow({
  entry,
  ignoredIds,
  onToggleIgnore,
  onClick,
  index,
}: {
  entry: OpgaveEntry;
  ignoredIds: Set<string>;
  onToggleIgnore: (entry: OpgaveEntry) => void;
  onClick: (e: MouseEvent, entry: OpgaveEntry) => void;
  index: number;
}) {
  const exerciseId = getExerciseIdFromUrl(entry.url);
  const isIgnored = exerciseId ? ignoredIds.has(exerciseId) : false;
  const isMissing = entry.status === 'mangler' && !isIgnored;
  const hasFravaer = hasAssignmentFravaer(entry) && !isIgnored;
  const deadline = getDeadlineInfo(entry.deadline);
  const hue = getHoldHue(entry.hold);
  const hasHours = entry.studentTime && parseStudentTimeHours(entry.studentTime) > 0;

  const borderClass =
    hasFravaer
      ? 'border-l-[5px] border-l-[oklch(0.60_0.20_25)] dark:border-l-[oklch(0.58_0.18_25)]'
      : isMissing
        ? 'border-l-4 border-l-[oklch(0.65_0.16_50)] dark:border-l-[oklch(0.58_0.14_50)]'
        : entry.status === 'venter'
          ? 'border-l-4 border-l-[oklch(0.65_0.14_80)] dark:border-l-[oklch(0.55_0.12_80)]'
          : entry.status === 'afleveret'
            ? 'border-l-[3px] border-l-[oklch(0.72_0.14_145)] dark:border-l-[oklch(0.50_0.10_145)]'
            : '';

  const bgClass =
    hasFravaer
      ? 'bg-[oklch(0.99_0.008_25)] dark:bg-[oklch(0.14_0.01_25)]'
      : isMissing
        ? 'bg-[oklch(0.995_0.004_50)] dark:bg-[oklch(0.14_0.006_50)]'
        : 'bg-card';

  return (
    <a
      href={entry.url}
      className={cn(
        'group flex items-start gap-5 rounded-xl border border-border px-6 py-5 no-underline transition-[background-color,transform] duration-150 ease-out hover:bg-accent/30 active:scale-[0.995]',
        'animate-[bl-fade-in_300ms_var(--ease-out)_both]',
        borderClass,
        bgClass,
        isIgnored && 'opacity-50',
      )}
      style={{ animationDelay: `${index * 30}ms` }}
      onClick={(e) => onClick(e as unknown as MouseEvent, entry)}
    >
      {/* Status icon */}
      <div className="mt-1 flex size-7 shrink-0 items-center justify-center">
        {hasFravaer ? (
          <AlertTriangle size={20} className="text-[oklch(0.55_0.20_25)] dark:text-[oklch(0.72_0.18_25)]" />
        ) : isMissing ? (
          <XCircle size={20} className="text-[oklch(0.58_0.16_50)] dark:text-[oklch(0.72_0.14_50)]" />
        ) : entry.status === 'venter' ? (
          <Clock size={20} className="text-[oklch(0.55_0.14_80)] dark:text-[oklch(0.70_0.12_80)]" />
        ) : entry.status === 'afleveret' ? (
          <Check size={20} className="text-[oklch(0.55_0.14_145)] dark:text-[oklch(0.65_0.12_145)]" />
        ) : (
          <div className="size-3 rounded-full bg-muted-foreground/30" />
        )}
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        {/* Title */}
        <span className="block truncate text-lg font-semibold text-foreground">
          {entry.title}
        </span>

        {/* Metadata row */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-base text-muted-foreground">
          {/* Hold */}
          <span
            className="hold-pill-dynamic rounded-full px-3 py-1 text-base font-medium"
            style={{ '--hold-hue': hue } as any}
          >
            {getHoldDisplayName(entry.hold)}
          </span>

          {/* Elevtimer */}
          {hasHours && (
            <span className="tabular-nums">{entry.studentTime} t</span>
          )}

          {/* Fravær badge */}
          {hasFravaer && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[oklch(0.95_0.03_25)] px-2.5 py-1 text-base font-semibold text-[oklch(0.45_0.18_25)] dark:bg-[oklch(0.22_0.03_25)] dark:text-[oklch(0.75_0.14_25)]">
              <AlertTriangle size={14} />
              Fravær {getAssignmentFravaerLabel(entry)}
            </span>
          )}

          {/* Missing badge (non-fravær) */}
          {isMissing && !hasFravaer && (
            <span className="rounded-lg bg-[oklch(0.95_0.02_50)] px-2.5 py-1 text-base font-medium text-[oklch(0.48_0.12_50)] dark:bg-[oklch(0.22_0.02_50)] dark:text-[oklch(0.75_0.10_50)]">
              Mangler
            </span>
          )}

          {/* Ignored marker */}
          {entry.status === 'mangler' && isIgnored && (
            <span className="rounded-lg bg-muted px-2.5 py-1 text-base text-muted-foreground/60">
              Ignoreret
            </span>
          )}

          {/* Awaiting */}
          {entry.status === 'venter' && entry.awaiting && (
            <span className="text-muted-foreground/60">{entry.awaiting}</span>
          )}
        </div>

        {/* Grade + note (for completed) */}
        {entry.grade && (
          <div className="mt-2 flex items-center gap-2.5">
            <GradeBadge grade={entry.grade} />
            {entry.gradeExtra && (
              <span className="text-base italic text-muted-foreground/70">
                {entry.gradeExtra}
              </span>
            )}
          </div>
        )}

        {/* Teacher note */}
        {entry.note && (
          <p className="mt-2 line-clamp-1 text-base leading-relaxed text-muted-foreground/70">
            {entry.note}
          </p>
        )}
      </div>

      {/* Right side: deadline + actions */}
      <div className="flex shrink-0 flex-col items-end gap-2 pt-0.5">
        <span className={cn(
          'text-lg font-semibold tabular-nums',
          deadline.urgency === 'overdue' && isMissing && 'text-[oklch(0.50_0.18_25)] dark:text-[oklch(0.72_0.16_25)]',
          deadline.urgency === 'imminent' && 'text-[oklch(0.50_0.15_50)] dark:text-[oklch(0.72_0.14_50)]',
          deadline.urgency === 'soon' && 'text-[oklch(0.48_0.12_80)] dark:text-[oklch(0.70_0.10_80)]',
          deadline.urgency === 'normal' && 'text-muted-foreground',
        )}>
          {deadline.primary}
        </span>
        <span className="text-base tabular-nums text-muted-foreground/50">
          {deadline.secondary}
        </span>

        {/* Ignore toggle (hover-visible) */}
        {entry.status === 'mangler' && (
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground/50 opacity-0 transition-[opacity,color,background-color] duration-150 hover:bg-accent hover:text-foreground group-hover:opacity-100"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleIgnore(entry);
            }}
          >
            {isIgnored ? (
              <><Eye size={14} /> Vis</>
            ) : (
              <><EyeOff size={14} /> Ignorer</>
            )}
          </button>
        )}
      </div>
    </a>
  );
}

// ── StatusPill ─────────────────────────────────────────────────────────
// The status counts in the header ("X mangler", "X kommende", "X afleveret")
// are themselves the filter control. At rest they read as prose. On hover, a
// soft colored chip materialises under the words. When active, the chip fills
// in and a small × slides in to clear. No new toolbar row, no layout shift —
// the information *is* the interaction.

type StatusTone = 'waiting' | 'missing' | 'done';

const STATUS_PILL_STYLES: Record<StatusTone, { inactive: string; active: string }> = {
  // hue 80 — amber/yellow-green for venter
  waiting: {
    inactive:
      'text-muted-foreground hover:bg-[oklch(0.96_0.035_80)] hover:text-[oklch(0.42_0.14_80)] '
      + 'dark:hover:bg-[oklch(0.24_0.045_80)] dark:hover:text-[oklch(0.78_0.13_80)]',
    active:
      'bg-[oklch(0.93_0.075_80)] text-[oklch(0.36_0.15_80)] shadow-[inset_0_0_0_1px_oklch(0.82_0.08_80)] '
      + 'dark:bg-[oklch(0.28_0.08_80)] dark:text-[oklch(0.84_0.15_80)] dark:shadow-[inset_0_0_0_1px_oklch(0.40_0.10_80)]',
  },
  // hue 25 — red for mangler (the star of the show)
  missing: {
    inactive:
      'text-[oklch(0.55_0.18_25)] hover:bg-[oklch(0.94_0.055_25)] hover:text-[oklch(0.44_0.21_25)] '
      + 'dark:text-[oklch(0.72_0.16_25)] dark:hover:bg-[oklch(0.26_0.065_25)] dark:hover:text-[oklch(0.82_0.19_25)]',
    active:
      'bg-[oklch(0.91_0.095_25)] text-[oklch(0.38_0.23_25)] shadow-[inset_0_0_0_1px_oklch(0.78_0.12_25)] '
      + 'dark:bg-[oklch(0.32_0.12_25)] dark:text-[oklch(0.88_0.19_25)] dark:shadow-[inset_0_0_0_1px_oklch(0.46_0.15_25)]',
  },
  // hue 145 — green for afleveret
  done: {
    inactive:
      'text-muted-foreground hover:bg-[oklch(0.96_0.035_145)] hover:text-[oklch(0.40_0.14_145)] '
      + 'dark:hover:bg-[oklch(0.24_0.045_145)] dark:hover:text-[oklch(0.76_0.13_145)]',
    active:
      'bg-[oklch(0.93_0.075_145)] text-[oklch(0.34_0.15_145)] shadow-[inset_0_0_0_1px_oklch(0.80_0.09_145)] '
      + 'dark:bg-[oklch(0.28_0.08_145)] dark:text-[oklch(0.82_0.15_145)] dark:shadow-[inset_0_0_0_1px_oklch(0.40_0.10_145)]',
  },
};

function StatusPill({
  tone,
  active,
  onToggle,
  children,
}: {
  tone: StatusTone;
  active: boolean;
  onToggle: () => void;
  children: any;
}) {
  const styles = STATUS_PILL_STYLES[tone];
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      title={active ? 'Fjern filter' : 'Vis kun disse'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium',
        'cursor-pointer select-none',
        'transition-[background-color,color,box-shadow,transform] duration-200 ease-out',
        'active:scale-[0.96]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        active ? styles.active : styles.inactive,
      )}
    >
      {children}
      {active && (
        <X
          size={12}
          strokeWidth={2.75}
          className="-mr-0.5 shrink-0 opacity-70 animate-[bl-fade-in_180ms_ease-out_both]"
          aria-hidden
        />
      )}
    </button>
  );
}

// ── GradeBadge ─────────────────────────────────────────────────────────

function GradeBadge({ grade }: { grade: string }) {
  const hue = getGradeHue(grade);
  return (
    <span
      className="inline-flex items-center rounded-lg border px-3 py-1.5 text-base font-bold tabular-nums"
      style={{
        background: `oklch(0.95 0.05 ${hue})`,
        color: `oklch(0.40 0.14 ${hue})`,
        borderColor: `oklch(0.82 0.08 ${hue} / 0.4)`,
      }}
    >
      {grade}
    </span>
  );
}
