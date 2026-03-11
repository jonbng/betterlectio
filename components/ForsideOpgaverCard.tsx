import { useEffect, useState } from 'preact/hooks';
import { ArrowUpRight, Clock, AlertTriangle, Flame, Upload } from 'lucide-react';
import { getHoldHue, getHoldDisplayName } from '@/lib/hold-mapping';
import { fetchMissingOpgaver } from '@/lib/missing-opgaver';
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

type Urgency = 'overdue' | 'imminent' | 'soon' | 'later' | 'missing';

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

interface DeadlineInfo {
  label: string;
  sub: string;
  urgency: Urgency;
  /** 0–1 progress where 1 = deadline reached/passed */
  progress: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

const DANISH_WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];

function fmt2(n: number) {
  return n.toString().padStart(2, '0');
}

function getDeadlineInfo(deadline: Date, isMissing?: boolean): DeadlineInfo {
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const timeStr = `kl. ${fmt2(deadline.getHours())}:${fmt2(deadline.getMinutes())}`;

  // Progress: 1 at deadline, 0 at 7 days out. Clamp 0–1.
  const sevenDaysMs = 7 * 24 * 3600000;
  const progress = Math.max(0, Math.min(1, 1 - diffMs / sevenDaysMs));

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
    const wd = DANISH_WEEKDAYS[deadline.getDay()];
    label = `Om ${calDays} dage`;
    sub = `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${timeStr}`;
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
  const [entries, setEntries] = useState<ForsideOpgave[]>(initialEntries);

  // Background-fetch missing assignments and merge them in
  useEffect(() => {
    fetchMissingOpgaver(schoolId).then((missingRaw) => {
      if (missingRaw.length === 0) return;

      setEntries((prev) => {
        // Build a set of existing URLs for deduplication
        const existingUrls = new Set(prev.map(e => e.url).filter(Boolean));

        const newMissing: ForsideOpgave[] = missingRaw
          .filter(m => !existingUrls.has(m.url))
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

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card">
      {/* Header */}
      <a
        href={opgaverPageUrl}
        className="flex items-center gap-2 border-b border-border px-4 py-3 no-underline transition-colors hover:bg-accent/45"
      >
        <span className="text-sm font-semibold text-foreground">Opgaver</span>
        <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{entries.length}</span>
        <ArrowUpRight size={14} className="ml-auto text-muted-foreground opacity-40 transition-all hover:opacity-80" />
      </a>

      {/* Assignment list */}
      <div className="flex flex-col p-2">
        {entries.map((opgave, i) => {
          const info = getDeadlineInfo(opgave.deadline, opgave.isMissing);
          const hue = getHoldHue(opgave.holdCode);
          const isFirst = i === 0;

          return (
            <a
              key={opgave.url || i}
              href={opgave.url}
              className={cn(
                "relative flex items-center gap-2.5 overflow-hidden rounded-lg border-b border-border/60 bg-card px-3 py-2.5 no-underline transition-colors last:border-b-0 hover:bg-accent/35 animate-in fade-in-0 slide-in-from-bottom-1 duration-300",
                info.urgency === 'missing' && "bg-[oklch(0.97_0.02_25)] hover:bg-[oklch(0.95_0.03_25)] dark:bg-[oklch(0.17_0.02_25)] dark:hover:bg-[oklch(0.2_0.025_25)]",
              )}
              style={{ animationDelay: `${i * 50}ms`, '--hold-hue': hue } as any}
              onClick={(e) => openDetail(e as unknown as MouseEvent, opgave)}
            >
              {/* Urgency bar (bottom) */}
              <div
                className={cn(
                  "absolute bottom-0 left-0 h-0.5 rounded-r transition-[width] duration-400",
                  (info.urgency === 'overdue' || info.urgency === 'missing') && "h-[3px]",
                  URGENCY_BAR[info.urgency],
                )}
                style={{ width: `${info.progress * 100}%` }}
              />

              {/* Icon */}
              <div className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-md", URGENCY_ICON[info.urgency])}>
                {info.urgency === 'missing' ? <Upload size={15} /> :
                 info.urgency === 'overdue' ? <AlertTriangle size={15} /> :
                 info.urgency === 'imminent' ? <Flame size={15} /> :
                 <Clock size={15} />}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <span className={cn("text-xs uppercase tracking-wide whitespace-nowrap", URGENCY_DEADLINE[info.urgency], isFirst && (info.urgency === 'overdue' || info.urgency === 'missing' || info.urgency === 'imminent') && "text-sm")}>
                    {info.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground opacity-60 whitespace-nowrap">{info.sub}</span>
                </div>
                <span className="line-clamp-2 text-sm font-medium text-foreground">{opgave.title}</span>
              </div>

              {/* Hold pill */}
              <span
                className="hold-pill-dynamic shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap"
                style={{ '--hold-hue': hue } as any}
              >
                {getHoldDisplayName(opgave.holdCode)}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
