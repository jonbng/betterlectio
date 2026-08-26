import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useTranslation, formatMonth, formatWeekdayCapitalized, formatWeekday, type TFunction } from '@/lib/i18n';
import { FileText, BookOpen, Download, ArrowUpRight, Check } from 'lucide-react';
import type { Tables } from '@/database.types';
import { getLoggedInUserId } from '@/lib/profile-cache';
import { getHoldHue, getHoldDisplayName } from '@/lib/hold-mapping';
import { useQuery } from '@/lib/supabase/hooks';
import { upsertStudentHomeworkStatus } from '@/lib/supabase/resources';
import { installVisiblePoller } from '@/lib/visible-poller';
import { cn } from '@/lib/utils';
import { captureFeatureUsedOncePerSession, getDistinctId } from '@/lib/posthog';

// ── Types ──────────────────────────────────────────────────────────────

interface HomeworkItem {
  text: string;
  fileUrl: string | null;
  activityUrl: string | null;
  note: string | null;
}

interface LektierEntry {
  entryId: string | null;
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

function formatDisplayDate(date: Date): string {
  return `${formatWeekdayCapitalized(date)} ${date.getDate()}. ${formatMonth(date)}`;
}

function getRelativeLabel(
  date: Date,
  t: TFunction,
): { text: string; type: 'today' | 'tomorrow' | 'soon' | 'later' | 'past' } | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return { text: t('dates.today'), type: 'today' };
  if (diffDays === 1) return { text: t('dates.tomorrow'), type: 'tomorrow' };
  if (diffDays === -1) return { text: t('dates.yesterday'), type: 'past' };
  if (diffDays > 1 && diffDays <= 3) return { text: t('dates.inNDays', { n: diffDays }), type: 'soon' };
  if (diffDays > 3 && diffDays <= 7) return { text: t('dates.inNDays', { n: diffDays }), type: 'later' };
  if (diffDays < -1) return { text: t('dates.nDaysAgo', { n: Math.abs(diffDays) }), type: 'past' };
  return null;
}

// ── Done-state persistence ────────────────────────────────────────────

function getLektierStorageKey(): string {
  const m = window.location.pathname.match(/\/lectio\/(\d+)\//);
  const schoolId = m ? m[1] : '0';
  const studentId = getLoggedInUserId() || 'anon';
  return `il-lektier-done-${schoolId}-${studentId}`;
}

function loadDoneSet(): Set<string> {
  try {
    const raw = localStorage.getItem(getLektierStorageKey());
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch { return new Set(); }
}

function saveDoneSet(done: Set<string>): void {
  localStorage.setItem(getLektierStorageKey(), JSON.stringify([...done]));
}

function getCurrentSchoolId(): string | null {
  const match = window.location.pathname.match(/\/lectio\/(\d+)\//);
  return match?.[1] ?? null;
}

function entryKey(entry: LektierEntry): string {
  return entry.entryId || legacyEntryKey(entry);
}

function legacyEntryKey(entry: LektierEntry): string {
  return entry.activityUrl || `${entry.dateText}-${entry.hold}`;
}

function extractHomeworkEntryId(activityUrl: string, dataBrikId?: string | null): string | null {
  try {
    const url = new URL(activityUrl, window.location.origin);
    const fromQuery = url.searchParams.get('absid') || url.searchParams.get('id');
    if (fromQuery) return fromQuery;
  } catch {
    // Ignore parse failures and fall through to regex checks.
  }

  const fromUrl = activityUrl.match(/[?&](?:absid|id)=(\d+)/i)?.[1];
  if (fromUrl) return fromUrl;

  return dataBrikId?.match(/^ABS(\d+)$/i)?.[1] ?? null;
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
    const entryId = extractHomeworkEntryId(activityUrl, activityLink.getAttribute('data-brikid'));
    const tooltipData = parseTooltip(tooltip);
    const fallbackMeta = parseFallbackActivityMeta(activityLink);
    const contextMeta = parseContextCardMeta(activityLink);
    const fallbackDate = parseDateFromDateText(dateText);
    if (!tooltipData && !fallbackDate) continue;

    // Homework items & note from third cell
    const { items, note } = parseHomeworkCell(homeworkCell);

    entries.push({
      entryId,
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

type HomeworkEntryRow = Tables<'homework_entries'>;
type StudentHomeworkRow = Tables<'student_homework'>;

interface PendingHomeworkUpdate {
  clientUpdatedAt: string;
  isDone: boolean;
}

interface RemoteHomeworkStatus {
  clientUpdatedAt: string | null;
  isDone: boolean;
}

function getHomeworkItemsPayload(entry: LektierEntry) {
  return entry.homeworkItems.map((item, index) => ({
    id: `${entry.entryId || legacyEntryKey(entry)}_${index}`,
    text: item.text,
    file_url: item.fileUrl,
    activity_url: item.activityUrl,
    note: item.note,
  }));
}

export function LektierPage({ entries }: LektierPageProps) {
  const { t } = useTranslation();
  const days = groupByDay(entries);
  const totalFiles = entries.reduce((sum, e) =>
    sum + e.homeworkItems.filter(i => i.fileUrl).length, 0);

  const schoolId = useMemo(() => getCurrentSchoolId(), []);
  const studentId = useMemo(() => getLoggedInUserId(), []);
  const visibleEntryIds = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.entryId).filter((entryId): entryId is string => !!entryId))),
    [entries],
  );

  const [localDoneSet, setLocalDoneSet] = useState<Set<string>>(loadDoneSet);
  const [pendingSync, setPendingSync] = useState<Record<string, PendingHomeworkUpdate>>({});

  const { data: homeworkRows } = useQuery<HomeworkEntryRow[]>({
    schoolId: schoolId ?? '0',
    table: 'homework_entries',
    filters: [
      { column: 'school_id', op: 'eq', value: Number(schoolId) },
      { column: 'entry_id', op: 'in', value: visibleEntryIds },
    ],
    enabled: Boolean(schoolId && visibleEntryIds.length > 0),
  });

  const { data: studentHomeworkRows, refetch: refetchStudentHomework } = useQuery<StudentHomeworkRow[]>({
    schoolId: schoolId ?? '0',
    table: 'student_homework',
    filters: [{ column: 'student_id', op: 'eq', value: studentId }],
    enabled: Boolean(schoolId && studentId),
    skipInitialFetch: true,
    refetchOnCacheChange: false,
  });

  useEffect(() => {
    if (!schoolId || !studentId) return;
    return installVisiblePoller(() => refetchStudentHomework({ bypassCache: true }));
  }, [schoolId, studentId, refetchStudentHomework]);

  const remoteStatusByEntryId = useMemo(() => {
    if (!homeworkRows || !studentHomeworkRows) return null;

    const entryIdByHomeworkId = new Map(homeworkRows.map((row) => [row.id, row.entry_id]));
    const next = new Map<string, RemoteHomeworkStatus>();

    for (const row of studentHomeworkRows) {
      const entryId = entryIdByHomeworkId.get(row.homework_id);
      if (!entryId) continue;

      next.set(entryId, {
        clientUpdatedAt: row.client_updated_at,
        isDone: row.is_done,
      });
    }

    return next;
  }, [homeworkRows, studentHomeworkRows]);

  useEffect(() => {
    if (!remoteStatusByEntryId || Object.keys(pendingSync).length === 0) return;

    setPendingSync((current) => {
      let changed = false;
      const next = { ...current };

      for (const [entryId, pending] of Object.entries(current)) {
        const remote = remoteStatusByEntryId.get(entryId);
        if (!remote?.clientUpdatedAt) continue;
        if (remote.clientUpdatedAt < pending.clientUpdatedAt) continue;

        delete next[entryId];
        changed = true;
      }

      return changed ? next : current;
    });
  }, [pendingSync, remoteStatusByEntryId]);

  const effectiveDoneSet = useMemo(() => {
    const next = new Set<string>();

    for (const entry of entries) {
      const key = entryKey(entry);

      if (!entry.entryId) {
        if (localDoneSet.has(key)) next.add(key);
        continue;
      }

      const pending = pendingSync[key];
      const remote = remoteStatusByEntryId?.get(entry.entryId) ?? null;

      if (pending) {
        const remoteIsFreshEnough = Boolean(
          remote?.clientUpdatedAt && remote.clientUpdatedAt >= pending.clientUpdatedAt,
        );

        if (!remoteIsFreshEnough) {
          if (pending.isDone) next.add(key);
          continue;
        }
      }

      if (remote?.isDone) next.add(key);
    }

    return next;
  }, [entries, localDoneSet, pendingSync, remoteStatusByEntryId]);

  const toggleDone = useCallback((entry: LektierEntry) => {
    const key = entryKey(entry);

    const nextIsDone = !effectiveDoneSet.has(key);

    if (studentId) {
      captureFeatureUsedOncePerSession('homework_toggle', getDistinctId(studentId), {
        school_id: schoolId,
        has_entry_id: Boolean(entry.entryId),
        is_done: nextIsDone,
      });
    }

    if (!schoolId || !studentId || !entry.entryId) {
      setLocalDoneSet((prev) => {
        const next = new Set(prev);
        if (nextIsDone) next.add(key);
        else next.delete(key);
        saveDoneSet(next);
        return next;
      });
      return;
    }

    const clientUpdatedAt = new Date().toISOString();
    setPendingSync((prev) => ({
      ...prev,
      [key]: {
        clientUpdatedAt,
        isDone: nextIsDone,
      },
    }));

    void upsertStudentHomeworkStatus(
      schoolId,
      studentId,
      entry.entryId,
      nextIsDone,
      'extension',
      clientUpdatedAt,
      {
        displayDate: entry.dateText,
        hold: entry.hold,
        lessonDate: entry.date.toISOString().slice(0, 10),
        note: entry.note,
        room: entry.room || null,
        teacher: entry.teacherName || null,
        title: entry.activityTitle,
        itemsJson: getHomeworkItemsPayload(entry),
      },
    ).catch((error: unknown) => {
      console.warn('[BetterLectio] Failed to sync lektier completion:', error);

      setPendingSync((prev) => {
        const pending = prev[key];
        if (!pending || pending.clientUpdatedAt !== clientUpdatedAt) return prev;

        const next = { ...prev };
        delete next[key];
        return next;
      });
    });
  }, [effectiveDoneSet, schoolId, studentId]);

  const doneCount = entries.filter(e => effectiveDoneSet.has(entryKey(e))).length;
  const totalCount = entries.length;
  const progressPct = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

  return (
    <div className="mx-auto max-w-7xl px-10 pb-12 pt-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-5 mb-7">
        <div>
          <h1 className="text-[2rem] font-[800] tracking-[-0.02em] text-foreground">{t('lektierPage.title')}</h1>
          <p className="mt-1 text-base text-muted-foreground">{t('lektierPage.next14Days')}</p>
        </div>
        <div className="flex items-center gap-7">
          {/* Progress ring */}
          {totalCount > 0 && (
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="relative size-11">
                <svg aria-hidden="true" className="size-11 -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18" cy="18" r="15"
                    fill="none"
                    stroke="oklch(0.92 0.01 265)"
                    strokeWidth="3"
                    className="dark:stroke-[oklch(0.25_0.01_285)]"
                  />
                  <circle
                    cx="18" cy="18" r="15"
                    fill="none"
                    stroke="oklch(0.55 0.15 145)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${progressPct * 0.9425} 94.25`}
                    className="transition-[stroke-dasharray] duration-500 ease-out dark:stroke-[oklch(0.65_0.13_145)]"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">
                  {doneCount}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-foreground">{doneCount}/{totalCount}</span>
                <span className="text-xs text-muted-foreground">{t('lektierPage.done')}</span>
              </div>
            </div>
          )}
          <div className="flex min-w-20 flex-col px-3 py-2 text-center">
            <span className="text-4xl font-[800] text-foreground">{entries.length}</span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">{t('lektierPage.modules')}</span>
          </div>
          {totalFiles > 0 && (
            <div className="flex min-w-20 flex-col px-3 py-2 text-center">
              <span className="text-4xl font-[800] text-foreground">{totalFiles}</span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">{t('lektierPage.files')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {days.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-14 text-center">
          <BookOpen className="mb-3 size-7 text-muted-foreground" />
          <p className="text-base font-semibold text-foreground">{t('lektierPage.noHomework')}</p>
          <p className="text-sm text-muted-foreground">{t('lektierPage.noHomeworkMessage')}</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {days.map((day, dayIdx) => {
            const relative = getRelativeLabel(day.date, t);

            return (
              <div
                key={day.date.toISOString()}
                className={cn(
                  'flex items-start gap-8 border-t border-border py-8 first:border-t-0 first:pt-0 animate-[bl-fade-in_350ms_var(--ease-out)_both]',
                  relative?.type === 'today' && '[&_.lektier-date-number]:text-[oklch(0.42_0.16_145)] [&_.lektier-date-weekday]:text-[oklch(0.42_0.16_145)] dark:[&_.lektier-date-number]:text-[oklch(0.7_0.14_145)] dark:[&_.lektier-date-weekday]:text-[oklch(0.7_0.14_145)]',
                  relative?.type === 'tomorrow' && '[&_.lektier-date-number]:text-[oklch(0.45_0.18_265)] [&_.lektier-date-weekday]:text-[oklch(0.45_0.18_265)] dark:[&_.lektier-date-number]:text-[oklch(0.72_0.14_265)] dark:[&_.lektier-date-weekday]:text-[oklch(0.72_0.14_265)]',
                )}
                style={{ animationDelay: `${dayIdx * 40}ms` }}
              >
                {/* Date column */}
                <div className="sticky top-4 flex w-20 shrink-0 flex-col items-center pt-1">
                  <div className="lektier-date-number text-[2.75rem] font-[800] tracking-[-0.04em] leading-none text-foreground">{day.date.getDate()}</div>
                  <div className="lektier-date-weekday text-[0.875rem] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    {formatWeekday(day.date, 'short').replace(/\.$/, '').toLowerCase()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatMonth(day.date, 'short').replace(/\.$/, '')}
                  </div>
                  {relative && (
                    <div
                      className={cn(
                        'mt-2 rounded-full px-2.5 py-0.5 text-xs font-medium text-foreground',
                        relative.type === 'today' && 'bg-[oklch(0.95_0.06_145)] text-[oklch(0.42_0.16_145)] dark:bg-[oklch(0.26_0.06_145)] dark:text-[oklch(0.7_0.14_145)]',
                        relative.type === 'tomorrow' && 'bg-[oklch(0.95_0.06_265)] text-[oklch(0.45_0.18_265)] dark:bg-[oklch(0.26_0.06_265)] dark:text-[oklch(0.72_0.14_265)]',
                        relative.type === 'soon' && 'bg-[oklch(0.95_0.05_80)] text-[oklch(0.44_0.14_80)] dark:bg-[oklch(0.26_0.05_80)] dark:text-[oklch(0.72_0.11_80)]',
                        relative.type === 'later' && 'bg-muted/40 text-muted-foreground',
                        relative.type === 'past' && 'bg-[oklch(0.97_0.01_25)] text-[oklch(0.46_0.04_25)]',
                      )}
                    >
                      {relative.text}
                    </div>
                  )}
                </div>

                {/* Cards column */}
                <div className="flex flex-1 flex-col gap-3">
                  {day.entries.map((entry, idx) => {
                    const hue = getHoldHue(entry.hold);
                    const contentItems = entry.homeworkItems.filter(i => !i.fileUrl);
                    const fileItems = entry.homeworkItems.filter(i => i.fileUrl);
                    const hasContent = contentItems.length > 0 || entry.note || fileItems.length > 0;
                    const key = entryKey(entry);
                    const isDone = effectiveDoneSet.has(key);

                    return (
                      <div
                        key={idx}
                        className={cn(
                          "overflow-hidden rounded-xl border border-border border-l-4 bg-card transition-[background-color,opacity,transform] duration-200 ease-out active:scale-[0.99]",
                          isDone
                            ? "border-l-[oklch(0.78_0.1_145)] dark:border-l-[oklch(0.45_0.1_145)] opacity-60 hover:opacity-80"
                            : "border-l-[oklch(0.68_0.2_var(--hold-hue,265))] dark:border-l-[oklch(0.58_0.16_var(--hold-hue,265))] hover:bg-accent/30",
                        )}
                        style={{ '--hold-hue': hue } as any}
                      >
                        {/* Always-visible header row */}
                        <div className="flex items-center gap-3 p-4">
                          <button
                            type="button"
                            onClick={() => toggleDone(entry)}
                            aria-label={isDone ? t('lektierPage.markNotDone') : t('lektierPage.markDone')}
                            className={cn(
                              "group/check relative flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.9] before:absolute before:-inset-2.5 before:content-['']",
                              isDone
                                ? "border-[oklch(0.55_0.15_145)] bg-[oklch(0.55_0.15_145)] dark:border-[oklch(0.6_0.13_145)] dark:bg-[oklch(0.6_0.13_145)]"
                                : "border-[oklch(0.8_0.03_var(--hold-hue,265))] hover:border-[oklch(0.6_0.1_145)] hover:bg-[oklch(0.95_0.03_145)] dark:border-[oklch(0.35_0.02_285)] dark:hover:border-[oklch(0.5_0.1_145)] dark:hover:bg-[oklch(0.25_0.04_145)]",
                            )}
                          >
                            <Check
                              size={14}
                              strokeWidth={3}
                              className={cn(
                                "transition-[transform,opacity] duration-150 ease-out",
                                isDone
                                  ? "scale-100 opacity-100 text-white"
                                  : "scale-[0.4] opacity-0 text-[oklch(0.55_0.15_145)] group-hover/check:scale-75 group-hover/check:opacity-40",
                              )}
                            />
                          </button>
                          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
                            <a
                              href={entry.activityUrl}
                              className={cn(
                                "font-semibold no-underline transition-[color] duration-150 ease-out cursor-pointer",
                                isDone
                                  ? "text-base text-muted-foreground line-through decoration-muted-foreground/40"
                                  : "text-xl text-foreground hover:text-[oklch(0.5_0.16_var(--hold-hue,265))]",
                              )}
                            >
                              {getHoldDisplayName(entry.hold)}
                              {!isDone && entry.activityTitle && (
                                <span className="ml-1.5 text-muted-foreground font-normal">&mdash; {entry.activityTitle}</span>
                              )}
                            </a>
                            <span className="text-sm text-muted-foreground">
                              {entry.module && <span>{entry.module}</span>}
                              {entry.module && entry.timeRange && <span className="mx-1">&middot;</span>}
                              {entry.timeRange && <span>{entry.timeRange}</span>}
                              {isDone && (
                                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[oklch(0.95_0.03_145)] px-2 py-0.5 text-xs font-medium text-[oklch(0.45_0.12_145)] dark:bg-[oklch(0.25_0.04_145)] dark:text-[oklch(0.65_0.1_145)]">
                                  <Check size={10} strokeWidth={3} />
                                  {t('lektierPage.done')}
                                </span>
                              )}
                            </span>
                          </div>
                        </div>

                        {/* Collapsible content — grid row trick for smooth height animation */}
                        <div
                          className="grid transition-[grid-template-rows] duration-200 ease-out"
                          style={{ gridTemplateRows: isDone ? '0fr' : '1fr' }}
                        >
                          <div className="overflow-hidden">
                            <div className="space-y-3 px-4 pb-4 pt-0">
                              <div className="flex flex-wrap items-center gap-1.5 pl-9 text-sm text-muted-foreground">
                                {entry.teacherName && (
                                  <span title={entry.teacherAbbrev || undefined}>{entry.teacherName}</span>
                                )}
                                {entry.teacherName && entry.room && (
                                  <span className="size-[3px] rounded-full bg-muted-foreground/40" />
                                )}
                                {entry.room && <span>{entry.room}</span>}
                              </div>

                              {hasContent && (
                                <div className="space-y-3 border-t border-border pt-3 pl-9">
                                  {/* Teacher instruction */}
                                  {entry.note && (
                                    <div className="rounded-md border-l-[3px] border-l-[oklch(0.7_0.15_var(--hold-hue,265))] bg-[oklch(0.96_0.025_var(--hold-hue,265))] px-3 py-2.5 text-sm text-foreground dark:border-l-[oklch(0.5_0.14_var(--hold-hue,265))] dark:bg-[oklch(0.22_0.04_var(--hold-hue,265))]">
                                      {entry.note}
                                    </div>
                                  )}

                                  {/* Homework content items */}
                                  {contentItems.length > 0 && (
                                    <div className="space-y-2">
                                      {contentItems.map((item, itemIdx) => (
                                        <div key={itemIdx} className="flex items-start gap-2 py-1">
                                          <BookOpen size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
                                          <div className="min-w-0 space-y-1">
                                            {item.activityUrl ? (
                                              <a href={item.activityUrl!} className="inline-flex items-center gap-1 text-sm font-medium text-foreground no-underline hover:text-[oklch(0.42_0.16_var(--hold-hue,265))]">
                                                <span>{item.text}</span>
                                                <ArrowUpRight size={13} className="text-muted-foreground transition-transform" />
                                              </a>
                                            ) : (
                                              <span className="text-sm text-foreground">{item.text}</span>
                                            )}
                                            {item.note && (
                                              <div className="text-sm text-muted-foreground">{item.note}</div>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* File attachments */}
                                  {fileItems.length > 0 && (
                                    <div className="grid gap-2">
                                      {fileItems.map((item, itemIdx) => (
                                        <a key={itemIdx} href={item.fileUrl!} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-2 rounded-md border border-[oklch(0.93_0.02_250)] bg-[oklch(0.975_0.012_250)] px-2.5 py-2 no-underline transition-[color,background-color] duration-150 hover:bg-[oklch(0.96_0.025_250)] dark:border-[oklch(0.3_0.02_250)] dark:bg-[oklch(0.2_0.02_250)] dark:hover:bg-[oklch(0.24_0.03_250)]">
                                          <div className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-[oklch(0.93_0.04_250)] text-[oklch(0.5_0.15_250)] dark:bg-[oklch(0.24_0.03_250)] dark:text-[oklch(0.65_0.1_250)]">
                                            <FileText size={18} />
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium text-foreground">{item.text}</span>
                                            {item.note && (
                                              <span className="block truncate text-sm text-muted-foreground">{item.note}</span>
                                            )}
                                          </div>
                                          <Download size={16} className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
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
