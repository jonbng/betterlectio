import { useEffect, useState, useRef } from 'preact/hooks';
import { useTranslation, formatWeekdayCapitalized } from '@/lib/i18n';
import { ArrowUpRight, Info, AlertTriangle, BookOpen, Mail, Clock, Flame, Upload, ClipboardList, FileText, Users, Star, CalendarClock, Bell } from 'lucide-react';
import { getHoldHue, getHoldDisplayName } from '@/lib/hold-mapping';
import { fetchMissingOpgaver } from '@/lib/missing-opgaver';
import { getExerciseIdFromUrl, loadIgnoredMissingIds, addIgnoredMissingId } from '@/lib/opgaver-ignored';
import { cn } from '@/lib/utils';
import { loadTeacherNames, getTeacherName, getTeacherContextCardId, type TeacherCache } from '@/lib/teacher-cache';
import { fetchPictureUrl, getCachedPictureUrl, lookupContextCardIdByName, ensureNameIdCache } from '@/lib/findskema-storage';
import { nameToHue } from '@/lib/beskeder-helpers';
import type { ForsideOpgave } from '@/components/ForsideOpgaverCard';
import { getDisplayNameFromLookupId, getPictureUrlFromLookupId, useSchoolStudents, type StudentsMap } from '@/lib/supabase/student-lookup';
import { getSettings } from '@/lib/settings-storage';

// ── Types ────────────────────────────────────────────────────────────

export interface AktuelInfoEntry {
  priority: 1 | 2 | 3;
  html: string;
  text: string;
}

export interface LektieEntry {
  holdCode: string;
  description: string;
  activityUrl: string;
  date: string;
  dateRaw: Date | null;
  fullDescription: string;
}

export interface GenericIslandRow {
  html: string;
  priority: 1 | 2 | 3;
  time?: string;
  timeTitle?: string;
  attention?: boolean;
}

export interface GenericIslandData {
  id: string;
  title: string;
  href?: string;
  infoText?: string;
  rows: GenericIslandRow[];
}

export interface BeskedEntry {
  subject: string;
  subjectFull: string;
  url: string;
  senderShort: string;
  senderFull: string;
  senderType: 'student' | 'teacher' | 'unknown';
  contextCardId: string | null;
  time: string;
  timeRaw: Date | null;
}

// ── Parsers ──────────────────────────────────────────────────────────

export function parseAktuelInfo(island: Element): AktuelInfoEntry[] {
  const table = island.querySelector<HTMLTableElement>(
    '#s_m_Content_Content_AktuelInformationDashboardBlock',
  );
  if (!table) return [];

  const entries: AktuelInfoEntry[] = [];
  table.querySelectorAll('tr').forEach((row) => {
    const cell = row.querySelector<HTMLTableCellElement>('td.infoCol');
    if (!cell) return;

    let priority: 1 | 2 | 3 = 3;
    if (cell.classList.contains('prepend-fonticon-bullit-prio1')) priority = 1;
    else if (cell.classList.contains('prepend-fonticon-bullit-prio2')) priority = 2;

    entries.push({
      priority,
      html: cell.innerHTML,
      text: cell.textContent?.trim() || '',
    });
  });

  return entries;
}

export function parseLektier(island: Element): LektieEntry[] {
  const table = island.querySelector<HTMLTableElement>(
    '#s_m_Content_Content_LektierDashBoardBlock',
  );
  if (!table) return [];

  const entries: LektieEntry[] = [];
  table.querySelectorAll('tr').forEach((row) => {
    const infoCell = row.querySelector<HTMLTableCellElement>('td.infoCol');
    const timeCell = row.querySelector<HTMLTableCellElement>('td.timeCol');
    if (!infoCell) return;

    const link = infoCell.querySelector<HTMLAnchorElement>('a');
    const activityUrl = link?.getAttribute('href') || '';

    // Parse hold code and description from cell text (format: "1x HI: - Description...")
    const cellText = infoCell.textContent?.trim() || '';
    const holdMatch = cellText.match(/^(\S+\s+\S+):\s*(.*)/s);
    const holdCode = holdMatch ? holdMatch[1].trim() : '';
    const description = holdMatch ? holdMatch[2].trim() : cellText;

    // Date from timeCol
    const dateTitle = timeCell?.getAttribute('title') || '';
    const dateText = timeCell?.textContent?.trim() || '';
    let dateRaw: Date | null = null;
    const dMatch = dateTitle.match(/^(\d{1,2})\/(\d{1,2})-(\d{4})\s+(\d{2}):(\d{2})$/);
    if (dMatch) {
      dateRaw = new Date(
        parseInt(dMatch[3]),
        parseInt(dMatch[2]) - 1,
        parseInt(dMatch[1]),
        parseInt(dMatch[4]),
        parseInt(dMatch[5]),
      );
    }

    // Full description from row title
    const rowTitle = row.getAttribute('title') || '';
    // Extract the "Lektier:" section
    const lektierMatch = rowTitle.match(/Lektier:\n([\s\S]*?)(?:\n\nNote:|$)/);
    const fullDescription = lektierMatch
      ? lektierMatch[1].replace(/^- /gm, '').trim()
      : description;

    entries.push({
      holdCode,
      description: cleanDescription(description),
      activityUrl,
      date: dateText,
      dateRaw,
      fullDescription,
    });
  });

  return entries;
}

function cleanDescription(desc: string): string {
  // Shorten overly long descriptions
  const firstLine = desc.split('\n')[0].trim();
  // Remove leading "- " if present
  return firstLine.replace(/^-\s*/, '').trim();
}

export function parseBeskeder(island: Element): { entries: BeskedEntry[]; unreadCount: number } {
  const infoText = island.querySelector('.dashboardLinkHeaderInfoText')?.textContent?.trim() || '';
  const unreadMatch = infoText.match(/(\d+)\s+ulæste/);
  const unreadCount = unreadMatch ? parseInt(unreadMatch[1]) : 0;

  const table = island.querySelector<HTMLTableElement>(
    '#s_m_Content_Content_BeskederInfo',
  );
  if (!table) return { entries: [], unreadCount };

  const entries: BeskedEntry[] = [];
  table.querySelectorAll('tr').forEach((row) => {
    const infoCell = row.querySelector<HTMLTableCellElement>('td.infoCol');
    const nameCell = row.querySelector<HTMLTableCellElement>('td.nameCol');
    const timeCell = row.querySelector<HTMLTableCellElement>('td.timeCol');
    if (!infoCell) return;

    const link = infoCell.querySelector<HTMLAnchorElement>('a');
    const subjectSpan = link?.querySelector('span');

    const senderSpan = nameCell?.querySelector<HTMLSpanElement>('span');
    const senderType: 'student' | 'teacher' | 'unknown' =
      senderSpan?.classList.contains('prepend-fonticon-student') ? 'student' :
      senderSpan?.classList.contains('prepend-fonticon-teacher') ? 'teacher' :
      'unknown';

    const timeTitle = timeCell?.getAttribute('title') || '';
    let timeRaw: Date | null = null;
    const tMatch = timeTitle.match(/^(\d{1,2})\/(\d{1,2})-(\d{4})\s+(\d{2}):(\d{2})$/);
    if (tMatch) {
      timeRaw = new Date(
        parseInt(tMatch[3]),
        parseInt(tMatch[2]) - 1,
        parseInt(tMatch[1]),
        parseInt(tMatch[4]),
        parseInt(tMatch[5]),
      );
    }

    entries.push({
      subject: subjectSpan?.textContent?.trim() || link?.textContent?.trim() || '',
      subjectFull: infoCell.getAttribute('title') || subjectSpan?.textContent?.trim() || '',
      url: link?.getAttribute('href') || '',
      senderShort: senderSpan?.textContent?.trim() || '',
      senderFull: senderSpan?.getAttribute('title') || senderSpan?.textContent?.trim() || '',
      senderType,
      contextCardId: senderSpan?.getAttribute('data-lectioContextCard') || null,
      time: timeCell?.textContent?.trim() || '',
      timeRaw,
    });
  });

  return { entries, unreadCount };
}

// ── Generic island parser (for cards we don't have a custom version for) ──

export function parseGenericIsland(islandContent: Element): GenericIslandData | null {
  const header = islandContent.querySelector('.dashboardLinkHeader');
  if (!header) return null;

  const titleSpan = header.querySelector('.dashboardLinkHeaderText');
  const title = titleSpan?.textContent?.trim() || '';
  if (!title) return null;

  const headerLink = header.querySelector<HTMLAnchorElement>('a.dashboardItemTitle, a');
  const rawHref = headerLink?.getAttribute('href') || undefined;
  const href = rawHref && rawHref !== '#' ? rawHref : undefined;

  const infoText = header.querySelector('.dashboardLinkHeaderInfoText')?.textContent?.trim() || undefined;

  const rows: GenericIslandRow[] = [];
  islandContent.querySelectorAll('table.dashboard tr').forEach((tr) => {
    const infoCell = tr.querySelector<HTMLTableCellElement>('td.infoCol');
    if (!infoCell) {
      // Some "no records" rows use td.norecord
      return;
    }
    let priority: 1 | 2 | 3 = 3;
    if (infoCell.classList.contains('prepend-fonticon-bullit-prio1')) priority = 1;
    else if (infoCell.classList.contains('prepend-fonticon-bullit-prio2')) priority = 2;

    const timeCell = tr.querySelector<HTMLTableCellElement>('td.timeCol');
    const time = timeCell?.textContent?.trim() || undefined;
    const attention = timeCell?.classList.contains('attention') || false;

    rows.push({
      html: infoCell.innerHTML,
      priority,
      time,
      timeTitle: timeCell?.getAttribute('title') || undefined,
      attention,
    });
  });

  return {
    id: islandContent.id || '',
    title,
    href,
    infoText,
    rows,
  };
}

export function parseGenericIslands(root: Document | Element, excludeContentIds: string[]): GenericIslandData[] {
  const excludeSet = new Set(excludeContentIds);
  const islands = Array.from(root.querySelectorAll<HTMLElement>('.lf-island'));
  const results: GenericIslandData[] = [];
  for (const island of islands) {
    const content = island.querySelector<HTMLElement>('.islandContent');
    if (!content) continue;
    if (excludeSet.has(content.id)) continue;
    if (!content.querySelector('.dashboardLinkHeader')) continue;
    const data = parseGenericIsland(content);
    if (data && data.rows.length > 0) results.push(data);
  }
  return results;
}

// ── Deadline helpers (reused from ForsideOpgaverCard) ────────────────

type Urgency = 'overdue' | 'imminent' | 'soon' | 'later' | 'missing';

function fmt2(n: number) { return n.toString().padStart(2, '0'); }

function getDeadlineInfo(deadline: Date, isMissing?: boolean) {
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const timeStr = `kl. ${fmt2(deadline.getHours())}:${fmt2(deadline.getMinutes())}`;
  const sevenDaysMs = 7 * 24 * 3600000;
  const progress = Math.max(0, Math.min(1, 1 - diffMs / sevenDaysMs));

  if (isMissing) {
    const absD = Math.floor(Math.abs(diffMs) / 86400000);
    const absH = Math.floor(Math.abs(diffMs) / 3600000);
    let label: string;
    if (absH < 1) label = 'Mangler';
    else if (absH < 24) label = `${absH}t forsinket`;
    else label = `${absD}d forsinket`;
    return { label, sub: 'Mangler aflevering', urgency: 'missing' as Urgency, progress: 1 };
  }

  if (diffMs < 0) {
    const absH = Math.floor(Math.abs(diffMs) / 3600000);
    const absD = Math.floor(Math.abs(diffMs) / 86400000);
    let label: string;
    if (absH < 1) label = 'Overskredet';
    else if (absH < 24) label = `${absH}t forsinket`;
    else label = `${absD}d forsinket`;
    return { label, sub: timeStr, urgency: 'overdue' as Urgency, progress: 1 };
  }

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const deadlineDay = new Date(deadline);
  deadlineDay.setHours(0, 0, 0, 0);
  const calDays = Math.round((deadlineDay.getTime() - todayStart.getTime()) / 86400000);

  const urgency: Urgency =
    diffMs < 24 * 3600000 ? 'imminent' :
    diffMs < 72 * 3600000 ? 'soon' : 'later';

  let label: string;
  let sub: string;

  if (calDays === 0) {
    const mins = Math.floor(diffMs / 60000);
    const hrs = Math.floor(diffMs / 3600000);
    label = mins < 60 ? `Om ${Math.max(1, mins)} min` : `Om ${hrs}t`;
    sub = timeStr;
  } else if (calDays === 1) {
    label = 'I morgen';
    sub = timeStr;
  } else if (calDays === 2) {
    label = 'I overmorgen';
    sub = timeStr;
  } else if (calDays <= 7) {
    label = `Om ${calDays} dage`;
    sub = `${formatWeekdayCapitalized(deadline)} ${timeStr}`;
  } else {
    label = `${deadline.getDate()}/${deadline.getMonth() + 1}`;
    sub = timeStr;
  }

  return { label, sub, urgency, progress };
}

// ── Urgency style maps ──────────────────────────────────────────────

const URGENCY_BAR: Record<Urgency, string> = {
  overdue: 'bg-[oklch(0.55_0.22_25)] dark:bg-[oklch(0.58_0.18_25)]',
  missing: 'bg-[oklch(0.5_0.25_25)] dark:bg-[oklch(0.55_0.2_25)]',
  imminent: 'bg-[oklch(0.6_0.18_50)] dark:bg-[oklch(0.58_0.15_50)]',
  soon: 'bg-[oklch(0.72_0.12_80)] dark:bg-[oklch(0.55_0.1_80)]',
  later: 'bg-border',
};

const URGENCY_ICON: Record<Urgency, string> = {
  overdue: 'bg-[oklch(0.92_0.05_25)] text-[oklch(0.5_0.22_25)] dark:bg-[oklch(0.22_0.05_25)] dark:text-[oklch(0.72_0.18_25)]',
  missing: 'bg-[oklch(0.88_0.08_25)] text-[oklch(0.45_0.25_25)] dark:bg-[oklch(0.24_0.06_25)] dark:text-[oklch(0.75_0.18_25)]',
  imminent: 'bg-[oklch(0.93_0.04_50)] text-[oklch(0.52_0.18_50)] dark:bg-[oklch(0.22_0.04_50)] dark:text-[oklch(0.72_0.15_50)]',
  soon: 'bg-[oklch(0.95_0.03_80)] text-[oklch(0.55_0.12_80)] dark:bg-[oklch(0.22_0.03_80)] dark:text-[oklch(0.72_0.1_80)]',
  later: 'bg-muted text-muted-foreground',
};

const URGENCY_DEADLINE: Record<Urgency, string> = {
  overdue: 'text-[oklch(0.5_0.22_25)] dark:text-[oklch(0.72_0.18_25)] font-bold',
  missing: 'text-[oklch(0.45_0.25_25)] dark:text-[oklch(0.75_0.18_25)] font-bold',
  imminent: 'text-[oklch(0.52_0.18_50)] dark:text-[oklch(0.72_0.15_50)] font-bold',
  soon: 'text-[oklch(0.55_0.12_80)] dark:text-[oklch(0.72_0.1_80)] font-bold',
  later: 'text-foreground font-medium',
};

// ── Relative time for beskeder ──────────────────────────────────────

function relativeTime(date: Date | null): string {
  if (!date) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (mins < 1) return 'lige nu';
  if (mins < 60) return `${mins} min`;
  if (hours < 24) return `${hours}t`;
  if (days < 7) return `${days}d`;
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

// ── Lektie date grouping ────────────────────────────────────────────

function groupLektierByDate(entries: LektieEntry[], unknownLabel: string): { label: string; entries: LektieEntry[] }[] {
  const groups: Map<string, LektieEntry[]> = new Map();
  for (const entry of entries) {
    const key = entry.date || unknownLabel;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(entry);
  }
  return Array.from(groups.entries()).map(([label, entries]) => ({ label, entries }));
}

// ── Card Header ─────────────────────────────────────────────────────

function CardHeader({
  title,
  href,
  count,
  countColor,
  icon: Icon,
}: {
  title: string;
  href: string;
  count?: number;
  countColor?: string;
  icon: any;
}) {
  return (
    <a
      href={href}
      className="group flex items-center gap-2.5 px-4 py-3 no-underline transition-[background-color] duration-150 hover:bg-accent/30"
    >
      <div className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon size={15} strokeWidth={2} />
      </div>
      <span className="text-base font-semibold tracking-[-0.01em] text-foreground">{title}</span>
      {count != null && count > 0 && (
        <span className={cn(
          "inline-flex min-w-5 h-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold leading-none",
          countColor || "bg-primary text-primary-foreground",
        )}>
          {count}
        </span>
      )}
      <ArrowUpRight
        size={14}
        className="ml-auto text-muted-foreground opacity-0 transition-[opacity,transform] group-hover:opacity-60 group-hover:translate-x-px group-hover:-translate-y-px"
      />
    </a>
  );
}

// ── Aktuel Information Card ─────────────────────────────────────────

const PRIO_STYLES = {
  1: {
    dot: 'bg-[oklch(0.55_0.22_25)] dark:bg-[oklch(0.65_0.18_25)]',
    bg: 'bg-[oklch(0.97_0.015_25)] dark:bg-[oklch(0.17_0.015_25)]',
    text: 'text-[oklch(0.4_0.12_25)] dark:text-[oklch(0.8_0.08_25)]',
  },
  2: {
    dot: 'bg-[oklch(0.6_0.18_50)] dark:bg-[oklch(0.65_0.15_50)]',
    bg: '',
    text: 'text-foreground',
  },
  3: {
    dot: 'bg-[oklch(0.7_0.06_265)] dark:bg-[oklch(0.5_0.06_265)]',
    bg: '',
    text: 'text-foreground',
  },
};

function AktuelInfoCard({ entries, schoolId }: { entries: AktuelInfoEntry[]; schoolId: string }) {
  const { t } = useTranslation();
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <CardHeader
        title={t('forside.cards.aktuelInfo')}
        href={`/lectio/${schoolId}/forside.aspx`}
        icon={Info}
      />
      <div className="flex flex-col">
        {entries.map((entry, i) => {
          const styles = PRIO_STYLES[entry.priority];
          return (
            <div
              key={i}
              className={cn(
                "flex items-start gap-2.5 border-t border-border px-4 py-2.5 text-sm leading-[1.5]",
                styles.bg,
              )}
            >
              <span className={cn("mt-[0.4375rem] size-[0.375rem] shrink-0 rounded-full", styles.dot)} />
              <span
                className={cn("min-w-0 flex-1 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-primary/80", styles.text)}
                dangerouslySetInnerHTML={{ __html: entry.html }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Lektier Card ────────────────────────────────────────────────────

function LektierCard({ entries, schoolId }: { entries: LektieEntry[]; schoolId: string }) {
  const { t } = useTranslation();
  if (entries.length === 0) return null;

  const groups = groupLektierByDate(entries, t('forside.cards.unknownDate'));

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <CardHeader
        title={t('forside.cards.lektier')}
        href={`/lectio/${schoolId}/material_lektieoversigt.aspx`}
        count={entries.length}
        icon={BookOpen}
      />
      <div className="flex flex-col">
        {groups.map((group, gi) => (
          <div key={gi}>
            {/* Date group label */}
            <div className={cn(
              "flex items-center gap-2 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
              gi > 0 && "border-t border-border",
            )}>
              {group.label}
            </div>
            {/* Lektie items */}
            {group.entries.map((lektie, li) => {
              const hue = getHoldHue(lektie.holdCode);
              const displayName = getHoldDisplayName(lektie.holdCode);
              return (
                <a
                  key={li}
                  href={lektie.activityUrl}
                  className="group/lektie flex items-start gap-2.5 border-t border-border/60 px-4 py-2.5 no-underline transition-[background-color] duration-150 hover:bg-accent/30 cursor-pointer"
                  title={lektie.fullDescription}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const href = lektie.activityUrl;
                    const activityUrl = href.startsWith('/') ? `${window.location.origin}${href}` : href;
                    window.dispatchEvent(
                      new CustomEvent('betterlectio:openActivityModal', { detail: { url: activityUrl } }),
                    );
                  }}
                >
                  {/* Hold pill */}
                  <span
                    className="hold-pill-dynamic mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold leading-[1.5] whitespace-nowrap"
                    style={{ '--hold-hue': hue } as any}
                  >
                    {displayName}
                  </span>
                  {/* Description */}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium leading-[1.5] text-foreground group-hover/lektie:text-foreground">
                    {lektie.description}
                  </span>
                </a>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Opgaver Card ────────────────────────────────────────────────────

function OpgaverCard({ initialEntries, schoolId }: { initialEntries: ForsideOpgave[]; schoolId: string }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<ForsideOpgave[]>(initialEntries);

  useEffect(() => {
    fetchMissingOpgaver(schoolId).then((missingRaw) => {
      if (missingRaw.length === 0) return;
      const ignoredIds = loadIgnoredMissingIds(schoolId);
      setEntries((prev) => {
        const existingUrls = new Set(prev.map(e => e.url).filter(Boolean));
        const newMissing: ForsideOpgave[] = missingRaw
          .filter(m => {
            if (existingUrls.has(m.url)) return false;
            const id = getExerciseIdFromUrl(m.url);
            return !id || !ignoredIds.has(id);
          })
          .map(m => ({
            title: m.title,
            url: m.url,
            holdCode: m.hold,
            deadline: m.deadline,
            deadlineText: m.deadlineText,
            isMissing: true,
          }));
        if (newMissing.length === 0) return prev;
        requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent('betterlectio:relayoutMasonry'));
        });
        return [...newMissing, ...prev];
      });
    });
  }, [schoolId]);

  const openDetail = (e: MouseEvent, opgave: ForsideOpgave) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(
      new CustomEvent('betterlectio:openOpgaveDetail', {
        detail: {
          entry: {
            title: opgave.title,
            url: opgave.url,
            hold: opgave.holdCode,
            deadline: opgave.deadline,
            deadlineText: opgave.deadlineText,
            studentTime: '',
            status: opgave.isMissing ? 'mangler' as const : 'venter' as const,
            absence: '',
            awaiting: '',
            note: '',
            grade: '',
            gradeExtra: '',
          },
        },
      }),
    );
  };

  const dismissMissing = (e: Event, opgave: ForsideOpgave) => {
    e.preventDefault();
    e.stopPropagation();
    const id = getExerciseIdFromUrl(opgave.url);
    if (!id) return;
    addIgnoredMissingId(schoolId, id);
    setEntries((prev) => prev.filter((o) => o !== opgave));
    window.dispatchEvent(new CustomEvent('betterlectio:dismissMissing', { detail: { exerciseId: id } }));
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('betterlectio:relayoutMasonry'));
    });
  };

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <CardHeader
        title={t('forside.cards.opgaver')}
        href={`/lectio/${schoolId}/OpgaverElev.aspx`}
        count={entries.length}
        icon={Clock}
      />
      <div className="flex flex-col">
        {entries.map((opgave, i) => {
          const info = getDeadlineInfo(opgave.deadline, opgave.isMissing);
          const hue = getHoldHue(opgave.holdCode);

          return (
            <a
              key={opgave.url || i}
              href={opgave.url}
              className={cn(
                "relative flex items-center gap-2.5 overflow-hidden border-t border-border px-4 py-2.5 no-underline text-foreground cursor-pointer transition-[background-color] duration-150 hover:bg-accent/30",
                info.urgency === 'missing' && "bg-[oklch(0.97_0.02_25)] hover:bg-[oklch(0.95_0.03_25)] dark:bg-[oklch(0.17_0.02_25)] dark:hover:bg-[oklch(0.2_0.025_25)]",
              )}
              onClick={(e) => openDetail(e as unknown as MouseEvent, opgave)}
            >
              {/* Urgency bar */}
              <div
                className={cn(
                  "absolute bottom-0 left-0 h-[2px] rounded-r transition-[width] duration-400",
                  info.urgency === 'missing' && "h-[3px]",
                  URGENCY_BAR[info.urgency],
                )}
                style={{ width: (info.urgency === 'overdue' || info.urgency === 'missing') ? '100%' : `${info.progress * 100}%` }}
              />

              {/* Icon */}
              <div className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-md", URGENCY_ICON[info.urgency])}>
                {info.urgency === 'missing' ? <Upload size={15} /> :
                 info.urgency === 'overdue' ? <AlertTriangle size={15} /> :
                 info.urgency === 'imminent' ? <Flame size={15} /> :
                 <Clock size={15} />}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1 flex flex-col gap-px">
                <div className="flex items-baseline gap-[0.3125rem]">
                  <span className={cn("text-sm font-medium leading-[1.3] whitespace-nowrap", URGENCY_DEADLINE[info.urgency])}>
                    {info.label}
                  </span>
                  <span className="text-xs text-muted-foreground opacity-60 whitespace-nowrap">{info.sub}</span>
                </div>
                <span className="truncate text-sm leading-[1.4] text-muted-foreground">{opgave.title}</span>
              </div>

              {/* Hold pill + dismiss */}
              <div className="shrink-0 flex items-center gap-1.5">
                <span
                  className="hold-pill-dynamic inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold leading-[1.5] whitespace-nowrap"
                  style={{ '--hold-hue': hue } as any}
                >
                  {getHoldDisplayName(opgave.holdCode)}
                </span>
                {opgave.isMissing && (
                  <button
                    title="Skjul"
                    className="inline-flex size-6 items-center justify-center rounded-md opacity-40 transition-opacity hover:opacity-100"
                    style={{ background: 'none', border: 'none', padding: 0 }}
                    onClick={(e) => dismissMissing(e as unknown as Event, opgave)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <path d="M10.733 5.076a10.744 10.744 0 0 1 1.267-.076c7 0 11 8 11 8a18.45 18.45 0 0 1-2.16 3.071" />
                      <path d="M14.12 14.12a3 3 0 0 1-4.242-4.242" />
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <line x1="2" x2="22" y1="2" y2="22" />
                    </svg>
                  </button>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ── Beskeder Card ───────────────────────────────────────────────────

function BeskedSenderAvatar({
  besked,
  schoolId,
  nameIdReady,
  studentsMap,
}: {
  besked: BeskedEntry;
  schoolId: string;
  nameIdReady: boolean;
  studentsMap: StudentsMap | null;
}) {
  const rawDisplayName = besked.senderFull || besked.senderShort;
  const contextCardId = besked.contextCardId || lookupContextCardIdByName(rawDisplayName, schoolId);
  const displayName = getDisplayNameFromLookupId(studentsMap, contextCardId, rawDisplayName);
  const initials = getInitials(displayName);
  const hue = nameToHue(displayName);
  const preferredPictureUrl = getPictureUrlFromLookupId(studentsMap, contextCardId);

  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (preferredPictureUrl) {
      setImgError(false);
      setPictureUrl(preferredPictureUrl);
      fetchedRef.current = null;
      return;
    }

    if (!contextCardId) return;

    const fetchKey = `${schoolId}:${contextCardId}`;
    if (fetchedRef.current === fetchKey) return;
    fetchedRef.current = fetchKey;
    setImgError(false);
    setPictureUrl(null);

    const cached = getCachedPictureUrl(contextCardId);
    if (cached !== undefined) {
      if (cached) setPictureUrl(cached);
      return;
    }

    fetchPictureUrl(contextCardId, schoolId).then((url) => {
      if (url) setPictureUrl(url);
    });
  }, [contextCardId, preferredPictureUrl, schoolId, nameIdReady]);

  if (pictureUrl && !imgError) {
    return (
      <img
        src={pictureUrl}
        alt={displayName}
        className="size-8 shrink-0 rounded-full object-cover object-top"
        title={displayName}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold [background:oklch(0.92_0.03_var(--avatar-hue))] text-[oklch(0.35_0.08_var(--avatar-hue))] dark:[background:oklch(0.28_0.04_var(--avatar-hue))] dark:text-[oklch(0.76_0.08_var(--avatar-hue))]"
      style={{ '--avatar-hue': hue } as any}
      title={displayName}
    >
      {initials}
    </div>
  );
}

function BeskederCard({ entries, unreadCount, schoolId }: { entries: BeskedEntry[]; unreadCount: number; schoolId: string }) {
  const { t } = useTranslation();
  const [teacherCache, setTeacherCache] = useState<TeacherCache | null>(null);
  const [nameIdReady, setNameIdReady] = useState(false);
  const { studentsMap } = useSchoolStudents(schoolId);

  useEffect(() => {
    let cancelled = false;
    loadTeacherNames(schoolId).then((cache) => {
      if (!cancelled && cache) setTeacherCache(cache);
    });
    ensureNameIdCache(schoolId, () => {
      if (!cancelled) setNameIdReady(true);
    });
    return () => { cancelled = true; };
  }, [schoolId]);

  if (entries.length === 0) return null;

  // Resolve teacher abbreviations to full names
  const resolved = entries.map((besked) => {
    if (besked.senderType !== 'teacher' || !teacherCache) return besked;
    const abbrev = besked.senderShort;
    const fullName = getTeacherName(teacherCache, abbrev);
    const ctxId = besked.contextCardId || getTeacherContextCardId(teacherCache, abbrev);
    if (!fullName && !ctxId) return besked;
    return {
      ...besked,
      senderFull: fullName || besked.senderFull,
      contextCardId: ctxId || besked.contextCardId,
    };
  });

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <CardHeader
        title={t('forside.cards.beskeder')}
        href={`/lectio/${schoolId}/beskeder2.aspx`}
        count={unreadCount}
        countColor={unreadCount > 0
          ? "bg-[oklch(0.55_0.22_25)] text-white dark:bg-[oklch(0.6_0.18_25)]"
          : undefined}
        icon={Mail}
      />
      <div className="flex flex-col">
        {resolved.map((besked, i) => {
          const displayName = getDisplayNameFromLookupId(
            studentsMap,
            besked.contextCardId,
            besked.senderFull || besked.senderShort,
          );

          return (
            <a
              key={besked.url || i}
              href={besked.url}
              className="group/msg flex items-center gap-3 border-t border-border px-4 py-2.5 no-underline transition-[background-color] duration-150 hover:bg-accent/30"
            >
              <BeskedSenderAvatar besked={besked} schoolId={schoolId} nameIdReady={nameIdReady} studentsMap={studentsMap} />

              {/* Content */}
              <div className="min-w-0 flex-1 flex flex-col gap-px">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-medium leading-[1.3] text-foreground group-hover/msg:text-foreground">
                    {besked.subject}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground/60 tabular-nums">
                    {relativeTime(besked.timeRaw)}
                  </span>
                </div>
                <span className="truncate text-sm leading-[1.4] text-muted-foreground" title={displayName}>
                  {besked.senderType === 'teacher' && teacherCache
                    ? (getTeacherName(teacherCache, besked.senderShort) || besked.senderShort)
                    : displayName}
                </span>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function getInitials(name: string): string {
  if (!name) return '?';
  // If it's initials already (e.g. "ED", "MR", "Pe"), use as-is
  if (name.length <= 3 && !name.includes(' ')) return name.toUpperCase();
  // Otherwise take first letters of first two words
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name[0].toUpperCase();
}

// ── Generic native island card ──────────────────────────────────────

const GENERIC_ICON_MAP: Array<[RegExp, any]> = [
  [/registrer/i, ClipboardList],
  [/fravær|fravaer/i, ClipboardList],
  [/spørgeskema|spoergeskema/i, ClipboardList],
  [/karakter/i, Star],
  [/bøger|boger/i, BookOpen],
  [/hold|gruppe/i, Users],
  [/aftale|kalender/i, CalendarClock],
  [/note|note|påmindelse/i, Bell],
];

function getGenericIcon(title: string): any {
  for (const [pattern, icon] of GENERIC_ICON_MAP) {
    if (pattern.test(title)) return icon;
  }
  return FileText;
}

function GenericCard({ data, schoolId }: { data: GenericIslandData; schoolId: string }) {
  if (data.rows.length === 0) return null;

  const icon = getGenericIcon(data.title);
  const countMatch = data.infoText?.match(/^\s*(\d+)/);
  const count = countMatch ? parseInt(countMatch[1]) : undefined;
  const href = data.href || `/lectio/${schoolId}/forside.aspx`;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <CardHeader title={data.title} href={href} icon={icon} count={count} />
      <div className="flex flex-col">
        {data.rows.map((row, i) => {
          const styles = PRIO_STYLES[row.priority];
          return (
            <div
              key={i}
              className={cn(
                "flex items-start gap-2.5 border-t border-border px-4 py-2.5 text-sm leading-[1.5]",
                styles.bg,
              )}
              title={row.timeTitle}
            >
              <span className={cn("mt-[0.4375rem] size-[0.375rem] shrink-0 rounded-full", styles.dot)} />
              <span
                className={cn(
                  "min-w-0 flex-1 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-primary/80 [&_span]:!whitespace-normal",
                  styles.text,
                )}
                dangerouslySetInnerHTML={{ __html: row.html }}
              />
              {row.time && (
                <span
                  className={cn(
                    "shrink-0 text-xs tabular-nums whitespace-nowrap",
                    row.attention
                      ? "text-[oklch(0.5_0.22_25)] dark:text-[oklch(0.72_0.18_25)] font-semibold"
                      : "text-muted-foreground/70",
                  )}
                >
                  {row.time}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Dashboard Component ─────────────────────────────────────────────

interface DashboardProps {
  aktuelInfo: AktuelInfoEntry[];
  lektier: LektieEntry[];
  opgaver: ForsideOpgave[];
  beskeder: BeskedEntry[];
  unreadCount: number;
  schoolId: string;
  extras?: GenericIslandData[];
}

export function ForsideDashboard({
  aktuelInfo,
  lektier,
  opgaver,
  beskeder,
  unreadCount,
  schoolId,
  extras = [],
}: DashboardProps) {
  const [, setSettingsTick] = useState(0);
  useEffect(() => {
    const onChange = () => setSettingsTick((n) => n + 1);
    window.addEventListener('betterlectio:forsideSettingsChanged', onChange);
    window.addEventListener('betterlectio:settings-hydrated', onChange);
    return () => {
      window.removeEventListener('betterlectio:forsideSettingsChanged', onChange);
      window.removeEventListener('betterlectio:settings-hydrated', onChange);
    };
  }, []);

  const showAktuelInfo = getSettings().forside?.showAktuelInfo ?? true;

  // Alternate extras between left and right columns so they fill in masonry-style
  const leftExtras = extras.filter((_, i) => i % 2 === 0);
  const rightExtras = extras.filter((_, i) => i % 2 === 1);

  return (
    <div className="il-forside-dashboard-grid grid grid-cols-1 gap-6 pb-10">
      {/* Left column */}
      <div className="flex flex-col gap-6">
        {showAktuelInfo && (
          <div className="animate-[bl-fade-in_350ms_var(--ease-out)_both]" style={{ animationDelay: '0ms' }}>
            <AktuelInfoCard entries={aktuelInfo} schoolId={schoolId} />
          </div>
        )}
        <div className="animate-[bl-fade-in_350ms_var(--ease-out)_both]" style={{ animationDelay: '60ms' }}>
          <LektierCard entries={lektier} schoolId={schoolId} />
        </div>
        {leftExtras.map((extra, i) => (
          <div
            key={extra.id || `left-extra-${i}`}
            className="animate-[bl-fade-in_350ms_var(--ease-out)_both]"
            style={{ animationDelay: `${120 + i * 60}ms` }}
          >
            <GenericCard data={extra} schoolId={schoolId} />
          </div>
        ))}
      </div>
      {/* Right column */}
      <div className="flex flex-col gap-6">
        <div className="animate-[bl-fade-in_350ms_var(--ease-out)_both]" style={{ animationDelay: '30ms' }}>
          <OpgaverCard initialEntries={opgaver} schoolId={schoolId} />
        </div>
        <div className="animate-[bl-fade-in_350ms_var(--ease-out)_both]" style={{ animationDelay: '90ms' }}>
          <BeskederCard entries={beskeder} unreadCount={unreadCount} schoolId={schoolId} />
        </div>
        {rightExtras.map((extra, i) => (
          <div
            key={extra.id || `right-extra-${i}`}
            className="animate-[bl-fade-in_350ms_var(--ease-out)_both]"
            style={{ animationDelay: `${150 + i * 60}ms` }}
          >
            <GenericCard data={extra} schoolId={schoolId} />
          </div>
        ))}
      </div>
    </div>
  );
}
