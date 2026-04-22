import { useEffect, useState } from 'preact/hooks';
import { useTranslation, formatWeekdayCapitalized } from '@/lib/i18n';
import { ArrowUpRight, Clock, AlertTriangle, Flame, Upload, Check } from 'lucide-react';
import { getHoldHue, getHoldDisplayName } from '@/lib/hold-mapping';
import { fetchOpgaverScan } from '@/lib/missing-opgaver';
import { getExerciseIdFromUrl, loadIgnoredMissingIds, addIgnoredMissingId } from '@/lib/opgaver-ignored';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────

export interface ForsideOpgave {
  title: string;
  url: string;
  holdCode: string;
  deadline: Date;
  deadlineText: string;
  /** True for exercisemissing assignments fetched from OpgaverElev.aspx */
  isMissing?: boolean;
}

type Urgency = 'overdue' | 'imminent' | 'soon' | 'later' | 'missing' | 'submitted';

const URGENCY_BAR: Record<Urgency, string> = {
  overdue: 'bg-[oklch(0.55_0.22_25)] dark:bg-[oklch(0.58_0.18_25)]',
  missing: 'bg-[oklch(0.5_0.25_25)] dark:bg-[oklch(0.55_0.2_25)]',
  imminent: 'bg-[oklch(0.6_0.18_50)] dark:bg-[oklch(0.58_0.15_50)]',
  soon: 'bg-[oklch(0.72_0.12_80)] dark:bg-[oklch(0.55_0.1_80)]',
  later: 'bg-border',
  submitted: 'bg-[oklch(0.62_0.15_145)] dark:bg-[oklch(0.58_0.13_145)]',
};

const URGENCY_ICON: Record<Urgency, string> = {
  overdue: 'bg-[oklch(0.92_0.05_25)] text-[oklch(0.5_0.22_25)] dark:bg-[oklch(0.22_0.05_25)] dark:text-[oklch(0.72_0.18_25)]',
  missing: 'bg-[oklch(0.88_0.08_25)] text-[oklch(0.45_0.25_25)] dark:bg-[oklch(0.24_0.06_25)] dark:text-[oklch(0.75_0.18_25)]',
  imminent: 'bg-[oklch(0.93_0.04_50)] text-[oklch(0.52_0.18_50)] dark:bg-[oklch(0.22_0.04_50)] dark:text-[oklch(0.72_0.15_50)]',
  soon: 'bg-[oklch(0.95_0.03_80)] text-[oklch(0.55_0.12_80)] dark:bg-[oklch(0.22_0.03_80)] dark:text-[oklch(0.72_0.1_80)]',
  later: 'bg-muted text-muted-foreground',
  submitted: 'bg-[oklch(0.92_0.06_145)] text-[oklch(0.45_0.16_145)] dark:bg-[oklch(0.22_0.05_145)] dark:text-[oklch(0.72_0.14_145)]',
};

const URGENCY_DEADLINE: Record<Urgency, string> = {
  overdue: 'text-[oklch(0.5_0.22_25)] dark:text-[oklch(0.72_0.18_25)] font-bold',
  missing: 'text-[oklch(0.45_0.25_25)] dark:text-[oklch(0.75_0.18_25)] font-bold',
  imminent: 'text-[oklch(0.52_0.18_50)] dark:text-[oklch(0.72_0.15_50)] font-bold',
  soon: 'text-[oklch(0.55_0.12_80)] dark:text-[oklch(0.72_0.1_80)] font-bold',
  later: 'text-foreground font-medium',
  submitted: 'text-muted-foreground font-medium line-through decoration-[1.5px]',
};

interface DeadlineInfo {
  label: string;
  sub: string;
  urgency: Urgency;
  /** 0–1 progress where 1 = deadline reached/passed */
  progress: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

function fmt2(n: number) {
  return n.toString().padStart(2, '0');
}

function getDeadlineInfo(deadline: Date, isMissing?: boolean, isSubmitted?: boolean): DeadlineInfo {
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const timeStr = `kl. ${fmt2(deadline.getHours())}:${fmt2(deadline.getMinutes())}`;

  // Progress: 1 at deadline, 0 at 7 days out. Clamp 0–1.
  const sevenDaysMs = 7 * 24 * 3600000;
  const progress = Math.max(0, Math.min(1, 1 - diffMs / sevenDaysMs));

  // Submitted wins over everything — it's done, not urgent.
  if (isSubmitted) {
    const calDays = Math.round(
      (new Date(deadline).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400000,
    );
    let sub: string;
    if (calDays === 0) sub = timeStr;
    else if (calDays === 1) sub = `I morgen ${timeStr}`;
    else if (calDays > 1 && calDays <= 7) sub = `${formatWeekdayCapitalized(deadline)} ${timeStr}`;
    else sub = `${deadline.getDate()}/${deadline.getMonth() + 1} ${timeStr}`;
    return { label: 'Afleveret', sub, urgency: 'submitted', progress: 1 };
  }

  // Missing assignments get their own urgency category
  if (isMissing) {
    const absD = Math.floor(Math.abs(diffMs) / 86400000);
    const absH = Math.floor(Math.abs(diffMs) / 3600000);
    let label: string;
    if (absH < 1) label = 'Mangler';
    else if (absH < 24) label = `${absH}t forsinket`;
    else label = `${absD}d forsinket`;
    return { label, sub: 'Mangler aflevering', urgency: 'missing', progress: 1 };
  }

  if (diffMs < 0) {
    const absH = Math.floor(Math.abs(diffMs) / 3600000);
    const absD = Math.floor(Math.abs(diffMs) / 86400000);
    let label: string;
    if (absH < 1) label = 'Overskredet';
    else if (absH < 24) label = `${absH}t forsinket`;
    else label = `${absD}d forsinket`;
    return { label, sub: timeStr, urgency: 'overdue', progress: 1 };
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

// ── DOM Parser ───────────────────────────────────────────────────────

/** Parse opgave entries from the native Lectio forside table before we replace it */
export function parseForsideOpgaver(island: Element): ForsideOpgave[] {
  const table = island.querySelector<HTMLTableElement>(
    '#s_m_Content_Content_ElevOpgaveAfleveringerDBB',
  );
  if (!table) return [];

  const entries: ForsideOpgave[] = [];

  table.querySelectorAll('tr').forEach((row) => {
    const rowTitle = row.getAttribute('title') || '';
    const holdMatch = rowTitle.match(/^Hold:\s*(.+?),\s*Titel:\s*(.+?),\s*frist:/);
    if (!holdMatch) return;

    const holdCode = holdMatch[1].trim();
    const title = holdMatch[2].trim();

    const link = row.querySelector<HTMLAnchorElement>('td.infoCol a');
    const url = link?.getAttribute('href') || '';

    const timeCell = row.querySelector<HTMLTableCellElement>('td.timeCol');
    const deadlineText = timeCell?.getAttribute('title') || '';
    const dMatch = deadlineText.match(/^(\d{1,2})\/(\d{1,2})-(\d{4})\s+(\d{2}):(\d{2})$/);
    if (!dMatch) return;

    const deadline = new Date(
      parseInt(dMatch[3]),
      parseInt(dMatch[2]) - 1,
      parseInt(dMatch[1]),
      parseInt(dMatch[4]),
      parseInt(dMatch[5]),
    );

    entries.push({ title, url, holdCode, deadline, deadlineText });
  });

  return entries;
}

// ── Component ────────────────────────────────────────────────────────

interface Props {
  initialEntries: ForsideOpgave[];
  opgaverPageUrl: string;
  schoolId: string;
}

export function ForsideOpgaverCard({ initialEntries, opgaverPageUrl, schoolId }: Props) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<ForsideOpgave[]>(initialEntries);
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(() => new Set());

  // Background-fetch assignment status: merge in missing (respecting ignored list)
  // and track which upcoming entries have already been submitted.
  useEffect(() => {
    fetchOpgaverScan(schoolId).then(({ missing: missingRaw, submittedIds: submitted }) => {
      if (submitted.size > 0) setSubmittedIds(submitted);

      if (missingRaw.length === 0) return;

      const ignoredIds = loadIgnoredMissingIds(schoolId);

      setEntries((prev) => {
        // Build a set of existing URLs for deduplication
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

        // Missing assignments go first, then existing sorted by deadline
        const merged = [...newMissing, ...prev];

        // Trigger masonry relayout after render (card height changed)
        requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent('betterlectio:relayoutMasonry'));
        });

        return merged;
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
    <div className="flex flex-col">
      {/* Header */}
      <a
        href={opgaverPageUrl}
        className="flex items-center gap-2 border-b border-border px-3.5 py-[0.6875rem] no-underline transition-[color,background-color] duration-150 hover:bg-accent/40"
      >
        <span className="text-[1.0625rem] font-[650] tracking-[-0.01em] text-foreground">{t('forside.opgaverCard.title')}</span>
        <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold leading-none text-primary-foreground">{entries.length}</span>
        <ArrowUpRight size={14} className="ml-auto text-muted-foreground opacity-40 transition-[opacity,transform] hover:opacity-80 group-hover:translate-x-px group-hover:-translate-y-px" />
      </a>

      {/* Assignment list */}
      <div className="flex flex-col">
        {entries.map((opgave, i) => {
          const exId = getExerciseIdFromUrl(opgave.url);
          const isSubmitted = !opgave.isMissing && !!exId && submittedIds.has(exId);
          const info = getDeadlineInfo(opgave.deadline, opgave.isMissing, isSubmitted);
          const hue = getHoldHue(opgave.holdCode);
          const isFirst = i === 0;

          return (
            <a
              key={opgave.url || i}
              href={opgave.url}
              className={cn(
                "relative flex items-center gap-2.5 overflow-hidden border-b border-border px-3.5 py-2.5 no-underline text-foreground cursor-pointer transition-[color,background-color] duration-150 last:border-b-0 hover:bg-accent/40",
                info.urgency === 'missing' && "bg-[oklch(0.97_0.02_25)] hover:bg-[oklch(0.95_0.03_25)] dark:bg-[oklch(0.17_0.02_25)] dark:hover:bg-[oklch(0.2_0.025_25)]",
                info.urgency === 'submitted' && "bg-[oklch(0.975_0.015_145)] hover:bg-[oklch(0.96_0.022_145)] dark:bg-[oklch(0.17_0.015_145)] dark:hover:bg-[oklch(0.2_0.02_145)]",
              )}
              style={{ animationDelay: `${i * 50}ms`, '--hold-hue': hue, '--anim-i': i } as any}
              onClick={(e) => openDetail(e as unknown as MouseEvent, opgave)}
            >
              {/* Urgency bar (bottom) */}
              <div
                className={cn(
                  "absolute bottom-0 left-0 h-[2px] rounded-r transition-[width] duration-400",
                  (info.urgency === 'missing' || info.urgency === 'submitted') && "h-[3px]",
                  URGENCY_BAR[info.urgency],
                )}
                style={{ width: (info.urgency === 'overdue' || info.urgency === 'missing' || info.urgency === 'submitted') ? '100%' : `${info.progress * 100}%` }}
              />

              {/* Icon */}
              <div className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-md", URGENCY_ICON[info.urgency])}>
                {info.urgency === 'submitted' ? <Check size={16} strokeWidth={2.75} /> :
                 info.urgency === 'missing' ? <Upload size={15} /> :
                 info.urgency === 'overdue' ? <AlertTriangle size={15} /> :
                 info.urgency === 'imminent' ? <Flame size={15} /> :
                 <Clock size={15} />}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1 flex flex-col gap-px">
                <div className="flex items-baseline gap-[0.3125rem]">
                  <span className={cn("text-sm leading-[1.3] whitespace-nowrap", URGENCY_DEADLINE[info.urgency], isFirst && (info.urgency === 'overdue' || info.urgency === 'missing' || info.urgency === 'imminent') && "text-base")}>
                    {info.label}
                  </span>
                  <span className="text-xs text-muted-foreground opacity-60 whitespace-nowrap">{info.sub}</span>
                </div>
                <span className={cn("truncate text-xs leading-[1.4] text-muted-foreground", info.urgency === 'submitted' && "line-through decoration-[1.5px]")}>{opgave.title}</span>
              </div>

              {/* Hold pill + hide button */}
              <div className="shrink-0 flex items-center gap-1.5">
                <span
                  className="hold-pill-dynamic inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold leading-[1.5] whitespace-nowrap"
                  style={{ '--hold-hue': hue } as any}
                >
                  {getHoldDisplayName(opgave.holdCode)}
                </span>
                {opgave.isMissing && (
                  <button
                    title={t('forside.opgaverCard.hide')}
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
