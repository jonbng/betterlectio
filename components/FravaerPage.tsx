import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import {
  PieChart, Pie, Cell,
  ResponsiveContainer,
} from 'recharts';
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit3,
  Filter,
  Search,
  TrendingDown,
  X,
  CheckCircle2,
  Info,
  Loader2,
  BarChart3,
} from 'lucide-react';
import { getHoldHue, getHoldDisplayName, registerHold } from '@/lib/hold-mapping';
import {
  type FravaerPageData,
  type FravaerHoldEntry,
  type FravaerRecord,
  type FravaerWarning,
  submitPeriodChange,
} from '@/lib/fravaer-parse';
import { FravaerEditSheet } from '@/components/FravaerEditSheet';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { cn } from '@/lib/utils';

const PieAny = Pie as any;
const PieChartAny = PieChart as any;
const ResponsiveContainerAny = ResponsiveContainer as any;
const ChartContainerAny = ChartContainer as any;
const ChartTooltipAny = ChartTooltip as any;

// ── Types ──────────────────────────────────────────────────────────────

interface FravaerPageProps {
  data: FravaerPageData;
  schoolId: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

function parsePct(str: string): number {
  if (!str) return 0;
  return parseFloat(str.replace('%', '').replace(',', '.')) || 0;
}

function parseFraction(str: string): { amount: number; total: number } {
  if (!str) return { amount: 0, total: 0 };

  const [amountPart = '', totalPart = ''] = str.split('/');
  return {
    amount: parseFloat(amountPart.trim().replace(',', '.')) || 0,
    total: parseFloat(totalPart.trim().replace(',', '.')) || 0,
  };
}

function formatPct(n: number): string {
  return n.toFixed(1).replace('.', ',') + '%';
}

function formatNumber(n: number): string {
  if (Math.abs(n - Math.round(n)) < 0.001) return String(Math.round(n));
  return n.toFixed(1).replace('.', ',');
}

/** OKLCH color for a given absence percentage (green → yellow → orange → red) */
function absenceColor(pct: number): string {
  if (pct <= 0) return 'oklch(0.72 0.17 145)';   // green
  if (pct < 5) return 'oklch(0.75 0.15 145)';     // green-ish
  if (pct < 10) return 'oklch(0.78 0.14 80)';     // yellow-green
  if (pct < 15) return 'oklch(0.75 0.16 55)';     // orange
  if (pct < 20) return 'oklch(0.68 0.18 40)';     // dark orange
  return 'oklch(0.62 0.2 25)';                     // red
}

/** OKLCH fill for donut chart segments */
function donutSegmentColor(pct: number, isAbsence: boolean): string {
  if (!isAbsence) return 'oklch(0.85 0.02 265)';  // light muted (attendance)
  return absenceColor(pct);
}

// ── Period Presets ─────────────────────────────────────────────────────

interface PeriodPreset {
  key: string;
  label: string;
  getRange: () => { start: string; end: string };
}

/** Lectio date format: dd/mm-yyyy */
function ddmmyyyy(d: Date): string {
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear()}`;
}

/** Convert Lectio dd/mm-yyyy to HTML date input yyyy-mm-dd */
function lectioToISO(lectio: string): string {
  const m = lectio.match(/^(\d{2})\/(\d{2})-(\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Convert HTML date input yyyy-mm-dd to Lectio dd/mm-yyyy */
function isoToLectio(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[3]}/${m[2]}-${m[1]}`;
}

function getPeriodPresets(): PeriodPreset[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based

  // Danish school year: Aug 1 → Jun 30
  const schoolYearStart = month >= 7
    ? new Date(year, 7, 1)      // Aug 1 this year
    : new Date(year - 1, 7, 1); // Aug 1 last year
  const schoolYearEnd = month >= 7
    ? new Date(year + 1, 5, 30)
    : new Date(year, 5, 30);

  return [
    {
      key: 'year',
      label: 'Hele året',
      getRange: () => ({ start: ddmmyyyy(schoolYearStart), end: ddmmyyyy(schoolYearEnd) }),
    },
    {
      key: '30d',
      label: 'Sidste 30 dage',
      getRange: () => {
        const from = new Date(now);
        from.setDate(from.getDate() - 30);
        return { start: ddmmyyyy(from), end: ddmmyyyy(now) };
      },
    },
    {
      key: '90d',
      label: 'Sidste 3 mdr.',
      getRange: () => {
        const from = new Date(now);
        from.setMonth(from.getMonth() - 3);
        return { start: ddmmyyyy(from), end: ddmmyyyy(now) };
      },
    },
    {
      key: 'month',
      label: 'Denne måned',
      getRange: () => {
        const from = new Date(year, month, 1);
        const to = new Date(year, month + 1, 0);
        return { start: ddmmyyyy(from), end: ddmmyyyy(to) };
      },
    },
  ];
}

// ── Sort helpers ──────────────────────────────────────────────────────

type SortKey = 'hold' | 'almOpgjort' | 'almAar' | 'skrOpgjort' | 'skrAar';
type SortDir = 'asc' | 'desc';
type DistributionMetric = 'alm' | 'skr';

interface SubjectDistributionItem {
  label: string;
  hue: number;
  amount: number;
  total: number;
  share: number;
}

function hasHoldAbsence(hold: FravaerHoldEntry): boolean {
  return (
    parsePct(hold.almOpgjortPct) > 0 ||
    parsePct(hold.almAarPct) > 0 ||
    parsePct(hold.skrOpgjortPct) > 0 ||
    parsePct(hold.skrAarPct) > 0
  );
}

function sortHolds(holds: FravaerHoldEntry[], key: SortKey, dir: SortDir): FravaerHoldEntry[] {
  const sorted = [...holds];
  sorted.sort((a, b) => {
    let cmp: number;
    switch (key) {
      case 'hold':
        cmp = getHoldDisplayName(a.hold).localeCompare(getHoldDisplayName(b.hold), 'da');
        break;
      case 'almOpgjort':
        cmp = parsePct(a.almOpgjortPct) - parsePct(b.almOpgjortPct);
        break;
      case 'almAar':
        cmp = parsePct(a.almAarPct) - parsePct(b.almAarPct);
        break;
      case 'skrOpgjort':
        cmp = parsePct(a.skrOpgjortPct) - parsePct(b.skrOpgjortPct);
        break;
      case 'skrAar':
        cmp = parsePct(a.skrAarPct) - parsePct(b.skrAarPct);
        break;
      default:
        cmp = 0;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

function buildSubjectDistribution(holds: FravaerHoldEntry[], metric: DistributionMetric): {
  items: SubjectDistributionItem[];
  totalAmount: number;
  totalPossible: number;
} {
  const grouped = new Map<string, { label: string; hue: number; amount: number; total: number }>();

  for (const hold of holds) {
    const detail = metric === 'alm' ? hold.almOpgjortModuler : hold.skrOpgjortTid;
    const { amount, total } = parseFraction(detail);
    if (amount <= 0) continue;

    const label = getHoldDisplayName(hold.hold) || hold.hold;
    const key = label.toLowerCase();
    const existing = grouped.get(key);

    if (existing) {
      existing.amount += amount;
      existing.total += total;
      continue;
    }

    grouped.set(key, {
      label,
      hue: getHoldHue(hold.hold),
      amount,
      total,
    });
  }

  const values = Array.from(grouped.values());
  const totalAmount = values.reduce((sum, item) => sum + item.amount, 0);
  const totalPossible = values.reduce((sum, item) => sum + item.total, 0);

  const items = values
    .sort((a, b) => b.amount - a.amount)
    .map((item) => ({
      ...item,
      share: totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0,
    }));

  return { items, totalAmount, totalPossible };
}

function isMissingReasonRecord(record: FravaerRecord): boolean {
  return !record.aarsag && !!record.editUrl;
}

// ── Component ──────────────────────────────────────────────────────────

export function FravaerPage({ data: initialData, schoolId }: FravaerPageProps) {
  const [data, setData] = useState<FravaerPageData>(initialData);
  const [loading, setLoading] = useState(false);

  // Period inputs
  const [periodStart, setPeriodStart] = useState(data.period.start);
  const [periodEnd, setPeriodEnd] = useState(data.period.end);

  // Table sort
  const [sortKey, setSortKey] = useState<SortKey>('almOpgjort');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showZeroAbsenceHolds, setShowZeroAbsenceHolds] = useState(false);

  // Records filters
  const [selectedHold, setSelectedHold] = useState<string | null>(null);
  const [showOnlyMissing, setShowOnlyMissing] = useState(false);
  const [recordSearch, setRecordSearch] = useState('');
  const [visibleRecords, setVisibleRecords] = useState(20);
  const searchRef = useRef<HTMLInputElement>(null);
  const [showAllTopMissing, setShowAllTopMissing] = useState(false);

  // Edit sheet
  const [editRecord, setEditRecord] = useState<FravaerRecord | null>(null);
  const [editSheetOpen, setEditSheetOpen] = useState(false);

  const [distributionMetric, setDistributionMetric] = useState<DistributionMetric>('alm');

  // Register holds for the hold-mapping system
  useEffect(() => {
    for (const entry of data.holds) {
      registerHold(entry.hold, entry.holdelementId);
    }
  }, [data.holds]);

  // Sync period inputs when data changes
  useEffect(() => {
    setPeriodStart(data.period.start);
    setPeriodEnd(data.period.end);
  }, [data.period]);

  useEffect(() => {
    setShowZeroAbsenceHolds(false);
  }, [data.holds]);

  const hasWrittenDistribution = data.holds.some((hold) => parseFraction(hold.skrOpgjortTid).amount > 0);

  useEffect(() => {
    if (distributionMetric === 'skr' && !hasWrittenDistribution) {
      setDistributionMetric('alm');
    }
  }, [distributionMetric, hasWrittenDistribution]);

  // ── Period change handler ──────────────────────────────────────────

  const handlePeriodSubmit = useCallback(async (start: string, end: string) => {
    setLoading(true);
    try {
      const result = await submitPeriodChange(start, end);
      if (result) {
        setData(result);
        setVisibleRecords(20);
      }
    } catch (err) {
      console.error('[BetterLectio] Period change failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePreset = (preset: PeriodPreset) => {
    const { start, end } = preset.getRange();
    setPeriodStart(start);
    setPeriodEnd(end);
    handlePeriodSubmit(start, end);
  };

  const handleCustomPeriod = () => {
    if (periodStart && periodEnd) {
      handlePeriodSubmit(periodStart, periodEnd);
    }
  };

  // ── Edit handler ───────────────────────────────────────────────────

  const handleEditClick = (record: FravaerRecord) => {
    setEditRecord(record);
    setEditSheetOpen(true);
  };

  const handleEditSaved = useCallback(async () => {
    // Refetch data to get updated reasons
    setLoading(true);
    try {
      const result = await submitPeriodChange(data.period.start, data.period.end);
      if (result) setData(result);
    } finally {
      setLoading(false);
    }
  }, [data.period]);

  // ── Sorted holds ──────────────────────────────────────────────────

  const sortedHolds = sortHolds(data.holds, sortKey, sortDir);
  const nonZeroHolds = sortedHolds.filter(hasHoldAbsence);
  const zeroAbsenceHolds = sortedHolds.filter((hold) => !hasHoldAbsence(hold));
  const visibleHolds = showZeroAbsenceHolds ? sortedHolds : nonZeroHolds;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  // ── Records filtering ─────────────────────────────────────────────

  // Convert current Lectio period (dd/mm-yyyy) to ISO for date comparison
  const periodStartISO = lectioToISO(periodStart);
  const periodEndISO = lectioToISO(periodEnd);

  const allRecords = showOnlyMissing
    ? data.missingReasons
    : [...data.missingReasons, ...data.records].filter((record, index, records) =>
        records.findIndex((candidate) => candidate.absid === record.absid) === index,
      );
  const queryLower = recordSearch.toLowerCase().trim();

  const filteredRecords = allRecords.filter(r => {
    // Client-side period filter (fraværsårsager page has no server-side period filter)
    if (r.dateISO && periodStartISO && periodEndISO) {
      if (r.dateISO < periodStartISO || r.dateISO > periodEndISO) return false;
    }
    if (selectedHold && r.hold !== selectedHold) return false;
    if (queryLower) {
      const searchIn = `${r.hold} ${r.date} ${r.teacher} ${r.aarsag} ${r.note} ${r.bemaerkning} ${r.module}`.toLowerCase();
      if (!searchIn.includes(queryLower)) return false;
    }
    return true;
  });

  const prioritizedRecords = filteredRecords
    .map((record, index) => ({ record, index, isMissing: isMissingReasonRecord(record) }))
    .sort((a, b) => {
      if (a.isMissing !== b.isMissing) return a.isMissing ? -1 : 1;
      return a.index - b.index;
    });

  const shownRecords = prioritizedRecords.slice(0, visibleRecords);
  const hasMissingReasons = data.missingReasons.length > 0;
  const topMissingRecords = showAllTopMissing ? data.missingReasons : data.missingReasons.slice(0, 4);
  const hasCollapsedTopMissing = data.missingReasons.length > 4;

  // ── Chart data ────────────────────────────────────────────────────

  const almOpgjort = parsePct(data.totals?.almOpgjortPct || '');
  const skrOpgjort = parsePct(data.totals?.skrOpgjortPct || '');

  const donutAlm = [
    { name: 'Fravær', value: almOpgjort, isAbsence: true },
    { name: 'Fremmøde', value: Math.max(0, 100 - almOpgjort), isAbsence: false },
  ];
  const donutSkr = [
    { name: 'Fravær', value: skrOpgjort, isAbsence: true },
    { name: 'Fremmøde', value: Math.max(0, 100 - skrOpgjort), isAbsence: false },
  ];

  const subjectDistribution = buildSubjectDistribution(data.holds, distributionMetric);

  // Unique holds from records for filter pills
  const recordHolds = [...new Set(allRecords.map(r => r.hold))].filter(Boolean).sort((a, b) =>
    getHoldDisplayName(a).localeCompare(getHoldDisplayName(b), 'da')
  );

  const presets = getPeriodPresets();

  return (
    <div className={cn("mx-auto max-w-[1080px] space-y-4 px-8 pb-12 pt-10 max-sm:px-4 max-sm:pb-8 max-sm:pt-6", loading && "pointer-events-none opacity-70")}>
      {/* ── Header ─────────────────────────────── */}
      <div className="border-b border-border pb-5 mb-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-[2rem] leading-none font-extrabold tracking-[-0.03em] text-foreground max-sm:text-2xl">Fravær</h1>
          {data.studentName && (
            <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-sm font-medium text-muted-foreground">{data.studentName}</span>
          )}
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {data.holds.length} fag &middot; {data.records.length} registreringer
        </p>
      </div>

      {/* ── Warnings banner ────────────────────── */}
      {data.warnings.length > 0 && (
        <div className="mb-6 flex gap-3 rounded-xl border border-[oklch(0.90_0.06_50)] bg-[oklch(0.97_0.02_50)] px-4 py-3 text-sm text-[oklch(0.45_0.12_50)] dark:border-[oklch(0.35_0.06_50)] dark:bg-[oklch(0.25_0.03_50)] dark:text-[oklch(0.80_0.10_50)]">
          <AlertTriangle size={16} />
          <div className="flex flex-col gap-1 leading-relaxed">
            {data.warnings.map((w, i) => (
              <div key={i}>
                <strong>{w.hold}</strong> {w.type}: {w.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {hasMissingReasons && (
        <section className="mb-5 rounded-xl border border-border bg-card p-4">
          <div>
            <span className="inline-flex items-center gap-1 text-[0.71rem] font-bold tracking-[0.05em] uppercase text-[oklch(0.5_0.14_50)] dark:text-[oklch(0.8_0.11_50)]">
              <AlertTriangle size={13} />
              Kræver handling
            </span>
            <p className="mt-1 text-base font-bold leading-tight text-foreground">
              {data.missingReasons.length} registrering{data.missingReasons.length === 1 ? '' : 'er'} mangler fraværsårsag
            </p>
            <p className="mt-1 text-[0.83rem] text-muted-foreground">
              Her er dem, der mangler din handling lige nu.
            </p>
          </div>

          <div className="mt-3 grid gap-2.5">
            {topMissingRecords.map((record, index) => (
              <TopMissingReasonCard
                key={`${record.absid}-${index}`}
                record={record}
                onEdit={handleEditClick}
              />
            ))}
          </div>

          {hasCollapsedTopMissing && (
            <button
              className="mt-3 inline-flex items-center justify-center px-3 py-1.5 text-[0.78rem] font-bold text-[oklch(0.45_0.14_50)] hover:underline hover:underline-offset-[0.18rem]"
              onClick={() => setShowAllTopMissing((value) => !value)}
            >
              {showAllTopMissing
                ? 'Vis færre'
                : `Vis alle ${data.missingReasons.length} manglende`}
            </button>
          )}
        </section>
      )}

      {/* ── Period picker ──────────────────────── */}
      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Calendar size={14} className="mr-0.5 shrink-0 text-muted-foreground/50" />
          {presets.map(p => (
            <button
              key={p.key}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => handlePreset(p)}
              disabled={loading}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            className="h-9 rounded-md border border-border bg-card px-2.5 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
            value={lectioToISO(periodStart)}
            onInput={(e) => {
              const iso = (e.target as HTMLInputElement).value;
              if (iso) setPeriodStart(isoToLectio(iso));
            }}
          />
          <span className="text-sm text-muted-foreground">&ndash;</span>
          <input
            type="date"
            className="h-9 rounded-md border border-border bg-card px-2.5 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
            value={lectioToISO(periodEnd)}
            onInput={(e) => {
              const iso = (e.target as HTMLInputElement).value;
              if (iso) setPeriodEnd(isoToLectio(iso));
            }}
          />
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-[filter,opacity] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleCustomPeriod}
            disabled={loading || !periodStart || !periodEnd}
          >
            {loading ? <Loader2 size={14} className="animate-spin text-primary" /> : 'Vis'}
          </button>
        </div>
      </div>

      {/* ── Summary donuts ─────────────────────── */}
      {data.totals && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          <DonutCard
            label="Almindeligt"
            pct={almOpgjort}
            chartData={donutAlm}
            detail={data.totals.almOpgjortModuler}
            subLabel={data.totals.almAarPct ? `Året: ${data.totals.almAarPct}` : ''}
          />
          <DonutCard
            label="Skriftligt"
            pct={skrOpgjort}
            chartData={donutSkr}
            detail={data.totals.skrOpgjortTid}
            subLabel={data.totals.skrAarPct ? `Året: ${data.totals.skrAarPct}` : ''}
          />
        </div>
      )}

      {/* ── Per-hold breakdown ─────────────────── */}
      {data.holds.length > 0 && (
        <section className="mb-10 space-y-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
              <BarChart3 size={16} />
              Fravær per fag
            </h2>
          </div>

          <SubjectDistributionCard
            metric={distributionMetric}
            hasWrittenDistribution={hasWrittenDistribution}
            items={subjectDistribution.items}
            totalAmount={subjectDistribution.totalAmount}
            totalPossible={subjectDistribution.totalPossible}
            onMetricChange={setDistributionMetric}
          />

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <SortHeader label="Fag" sortKey="hold" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Alm. opgjort" sortKey="almOpgjort" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Alm. år" sortKey="almAar" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Skr. opgjort" sortKey="skrOpgjort" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Skr. år" sortKey="skrAar" current={sortKey} dir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {visibleHolds.length === 0 && (
                  <tr>
                    <td className="bg-muted/35 px-3.5 py-4 text-center text-[0.82rem] text-muted-foreground" colSpan={5}>
                      Ingen fag med registreret fravær i den valgte periode.
                    </td>
                  </tr>
                )}

                {visibleHolds.map((h, i) => {
                  const hue = getHoldHue(h.hold);
                  return (
                    <tr key={i} className="border-t border-border/50 transition-colors hover:bg-muted/30" style={{ '--hold-hue': hue } as any}>
                      <td className="flex items-center gap-2 whitespace-nowrap px-3.5 py-4 font-medium text-foreground">
                        <span className="size-2 rounded-full [background:oklch(0.65_0.16_var(--hold-hue,265))]" />
                        {getHoldDisplayName(h.hold)}
                        {getHoldDisplayName(h.hold) !== h.hold && (
                          <span className="ml-1 text-xs text-muted-foreground/70">{h.hold}</span>
                        )}
                      </td>
                      <td className="px-3.5 py-4">
                        <PctCell pct={h.almOpgjortPct} detail={h.almOpgjortModuler} />
                      </td>
                      <td className="px-3.5 py-4">
                        <PctCell pct={h.almAarPct} detail={h.almAarModuler} />
                      </td>
                      <td className="px-3.5 py-4">
                        <PctCell pct={h.skrOpgjortPct} detail={h.skrOpgjortTid} />
                      </td>
                      <td className="px-3.5 py-4">
                        <PctCell pct={h.skrAarPct} detail={h.skrAarTid} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {zeroAbsenceHolds.length > 0 && (
            <button
              className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => setShowZeroAbsenceHolds((value) => !value)}
            >
              {showZeroAbsenceHolds ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              {showZeroAbsenceHolds
                ? `Skjul ${zeroAbsenceHolds.length} fag uden fravær`
                : `Vis ${zeroAbsenceHolds.length} fag uden fravær`}
            </button>
          )}
        </section>
      )}

      {/* ── Records section ────────────────────── */}
      <section className="mb-8 space-y-3">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Clock size={16} />
            Fraværsregistreringer
            <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{filteredRecords.length}</span>
          </h2>
        </div>

        {/* Records toolbar */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-10 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
              placeholder="Søg i registreringer..."
              value={recordSearch}
              onInput={(e) => setRecordSearch((e.target as HTMLInputElement).value)}
            />
            {recordSearch && (
              <button className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" onClick={() => setRecordSearch('')}>
                <X size={14} />
              </button>
            )}
          </div>

          {hasMissingReasons && (
            <button
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                showOnlyMissing && 'border-[oklch(0.50_0.14_50)] bg-[oklch(0.50_0.14_50)] text-[oklch(0.98_0.01_50)] dark:border-[oklch(0.55_0.14_50)] dark:bg-[oklch(0.55_0.14_50)]',
              )}
              onClick={() => { setShowOnlyMissing(!showOnlyMissing); setVisibleRecords(20); }}
            >
              <AlertTriangle size={13} />
              {showOnlyMissing ? 'Vis alle' : 'Kun manglende'}
            </button>
          )}
        </div>

        {/* Hold filter pills */}
        {recordHolds.length > 1 && (
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                selectedHold === null && 'border-[oklch(0.88_0.08_265)] bg-[oklch(0.94_0.06_265)] text-[oklch(0.4_0.16_265)] dark:border-[oklch(0.4_0.08_265)] dark:bg-[oklch(0.3_0.06_265)] dark:text-[oklch(0.8_0.1_265)]',
              )}
              onClick={() => setSelectedHold(null)}
            >
              Alle fag
            </button>
            {recordHolds.map(hold => (
              <button
                key={hold}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  selectedHold === hold && 'border-[oklch(0.88_0.08_265)] bg-[oklch(0.94_0.06_265)] text-[oklch(0.4_0.16_265)] dark:border-[oklch(0.4_0.08_265)] dark:bg-[oklch(0.3_0.06_265)] dark:text-[oklch(0.8_0.1_265)]',
                )}
                onClick={() => setSelectedHold(selectedHold === hold ? null : hold)}
                style={{ '--hold-hue': getHoldHue(hold) } as any}
              >
                <span className="inline-block size-2 rounded-full [background:oklch(0.65_0.16_var(--hold-hue,265))]" />
                {getHoldDisplayName(hold)}
              </button>
            ))}
          </div>
        )}

        {/* Records list */}
        {filteredRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-background px-8 py-12 text-center text-muted-foreground">
            {recordSearch || selectedHold || showOnlyMissing ? (
              <>
                <Search className="mb-1 size-10 text-muted-foreground/30" />
                <p className="text-base font-semibold text-foreground">Ingen resultater</p>
                <p className="text-sm text-muted-foreground">Prøv at ændre dine filtre</p>
                <button
                  className="mt-3 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
                  onClick={() => { setRecordSearch(''); setSelectedHold(null); setShowOnlyMissing(false); }}
                >
                  Nulstil filtre
                </button>
              </>
            ) : (
              <>
                <CheckCircle2 className="mb-1 size-10 text-muted-foreground/30" />
                <p className="text-base font-semibold text-foreground">Ingen registreringer</p>
                <p className="text-sm text-muted-foreground">Intet fravær i den valgte periode</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {shownRecords.map(({ record, isMissing }, i) => (
              <RecordCard
                key={`${record.absid}-${i}`}
                record={record}
                isMissing={isMissing}
                onEdit={handleEditClick}
              />
            ))}
          </div>
        )}

        {filteredRecords.length > visibleRecords && (
          <button
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => setVisibleRecords(v => v + 20)}
          >
            <ChevronDown size={16} />
            Vis flere ({filteredRecords.length - visibleRecords} resterende)
          </button>
        )}
      </section>

      {/* ── Edit Sheet ─────────────────────────── */}
      <FravaerEditSheet
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        record={editRecord}
        onSaved={handleEditSaved}
      />

      {/* Loading overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[oklch(1_0_0/0.5)] pointer-events-none dark:bg-[oklch(0.15_0_0/0.5)]">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function TopMissingReasonCard({
  record,
  onEdit,
}: {
  record: FravaerRecord;
  onEdit: (r: FravaerRecord) => void;
}) {
  const hue = record.hold ? getHoldHue(record.hold) : 200;
  const holdName = record.hold ? getHoldDisplayName(record.hold) : '';
  const secondaryText = [record.teacher, record.room].filter(Boolean).join(' · ');
  const detailText = record.bemaerkning || record.note;

  return (
    <div
      className="flex items-start justify-between gap-3 rounded-2xl border border-border/75 bg-background/82 p-3.5 shadow-[inset_3px_0_0_oklch(0.65_0.16_var(--hold-hue,50))] dark:bg-background/60 max-sm:flex-col max-sm:items-stretch"
      style={{ '--hold-hue': hue } as any}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.82rem] font-bold text-foreground">{record.date || record.uge}</span>
          {record.module && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.72rem] text-muted-foreground">{record.module}</span>
          )}
          <span className="text-[0.74rem] font-extrabold" style={{ color: absenceColor(record.fravaerPct) }}>
            {record.fravaerPct}%
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.78rem] text-muted-foreground">
          {holdName && (
            <span className="font-bold text-[oklch(0.5_0.1_var(--hold-hue,265))] dark:text-[oklch(0.74_0.1_var(--hold-hue,265))]" style={{ '--hold-hue': hue } as any}>
              {holdName}
            </span>
          )}
          {secondaryText && (
            <span className="opacity-80">{secondaryText}</span>
          )}
        </div>

        {detailText && (
          <p className="mt-1.5 text-[0.78rem] leading-relaxed text-muted-foreground">{detailText}</p>
        )}
      </div>

      <button
        className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1 rounded-full border border-[color-mix(in_oklch,oklch(0.72_0.12_50)_45%,var(--border))] bg-[oklch(0.99_0.006_50/0.9)] px-3 py-1.5 text-[0.74rem] font-bold text-[oklch(0.45_0.14_50)] transition-all hover:-translate-y-px hover:border-[oklch(0.65_0.12_50/0.85)] hover:bg-[oklch(0.995_0.004_50)] dark:border-[oklch(0.58_0.11_50/0.42)] dark:bg-[oklch(0.3_0.018_50/0.9)] dark:text-[oklch(0.86_0.09_50)] max-sm:w-full"
        onClick={() => onEdit(record)}
      >
        <Edit3 size={13} />
        Rediger
      </button>
    </div>
  );
}

function DonutCard({
  label,
  pct,
  chartData,
  detail,
  subLabel,
}: {
  label: string;
  pct: number;
  chartData: Array<{ name: string; value: number; isAbsence: boolean }>;
  detail: string;
  subLabel: string;
}) {
  const color = absenceColor(pct);

  return (
    <div className="flex items-start gap-5 rounded-2xl border border-border bg-card px-6 py-5 shadow-[0_12px_28px_oklch(0_0_0/0.05)] max-sm:gap-4 max-sm:px-4 max-sm:py-4">
      <div className="relative size-[120px] shrink-0 max-sm:size-[90px]">
        <ResponsiveContainerAny width={120} height={120}>
          <PieChartAny>
            <PieAny
              data={chartData}
              dataKey="value"
              innerRadius={38}
              outerRadius={54}
              startAngle={90}
              endAngle={-270}
              paddingAngle={2}
              stroke="none"
            >
              {chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={donutSegmentColor(pct, entry.isAbsence)}
                />
              ))}
            </PieAny>
          </PieChartAny>
        </ResponsiveContainerAny>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xl font-bold tracking-tight max-sm:text-base" style={{ color }}>
          {formatPct(pct)}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[0.9rem] font-semibold text-foreground">{label}</span>
        {detail && <span className="text-sm text-muted-foreground">{detail}</span>}
        {subLabel && <span className="text-xs text-muted-foreground/80">{subLabel}</span>}
      </div>
    </div>
  );
}

function SubjectDistributionCard({
  metric,
  hasWrittenDistribution,
  items,
  totalAmount,
  totalPossible,
  onMetricChange,
}: {
  metric: DistributionMetric;
  hasWrittenDistribution: boolean;
  items: SubjectDistributionItem[];
  totalAmount: number;
  totalPossible: number;
  onMetricChange: (metric: DistributionMetric) => void;
}) {
  const unitShort = metric === 'alm' ? 'mod.' : 'elevt.';
  const unitLong = metric === 'alm' ? 'moduler' : 'elevtimer';
  const topSubject = items[0];
  const chartData = items.map((item, index) => ({
    ...item,
    configKey: `subject${index}`,
    fill: `var(--color-subject${index})`,
  }));
  const chartConfig = chartData.reduce((acc, item) => {
    acc[item.configKey] = {
      label: item.label,
      color: `oklch(0.68 0.14 ${item.hue})`,
    };
    return acc;
  }, {
    amount: {
      label: unitLong,
    },
  } as ChartConfig);

  return (
    <div className="mb-4 rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-4 max-sm:flex-col">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-bold text-foreground">Fordeling af fravær</h3>
          <p className="text-[0.8125rem] text-muted-foreground">
            Se hvilke fag dit opgjorte fravær fylder mest i.
          </p>
          {topSubject && (
            <p className="text-[0.8125rem] text-[oklch(0.44_0.12_265)] dark:text-[oklch(0.78_0.08_265)]">
              Mest i <strong>{topSubject.label}</strong> med {formatPct(topSubject.share)}
            </p>
          )}
        </div>

        {hasWrittenDistribution && (
          <div className="flex overflow-hidden rounded-md border border-border">
            <button
              className={cn(
                'bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                metric === 'alm' && 'bg-[oklch(0.94_0.06_265)] text-[oklch(0.4_0.16_265)] dark:bg-[oklch(0.3_0.06_265)] dark:text-[oklch(0.8_0.1_265)]',
              )}
              onClick={() => onMetricChange('alm')}
            >
              Almindeligt
            </button>
            <button
              className={cn(
                'border-l border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                metric === 'skr' && 'bg-[oklch(0.94_0.06_265)] text-[oklch(0.4_0.16_265)] dark:bg-[oklch(0.3_0.06_265)] dark:text-[oklch(0.8_0.1_265)]',
              )}
              onClick={() => onMetricChange('skr')}
            >
              Skriftligt
            </button>
          </div>
        )}
      </div>

      {items.length > 0 ? (
        <div className="grid grid-cols-[minmax(220px,280px)_minmax(0,1fr)] items-center gap-5 max-sm:grid-cols-1">
          <div className="flex justify-center">
            <div className="relative size-[220px] max-sm:size-[184px]">
              <ChartContainerAny
                config={chartConfig}
                className="size-full max-h-[220px] max-sm:max-h-[184px]"
              >
                <PieChart>
                  <ChartTooltipAny
                    cursor={false}
                    content={<ChartTooltipContent hideLabel />}
                  />
                  <PieAny
                    data={chartData}
                    dataKey="amount"
                    nameKey="configKey"
                    innerRadius={58}
                    outerRadius={88}
                    startAngle={90}
                    endAngle={-270}
                    paddingAngle={chartData.length > 1 ? 2 : 0}
                    strokeWidth={0}
                  >
                    {chartData.map((item) => (
                      <Cell
                        key={item.label}
                        fill={item.fill}
                      />
                    ))}
                  </PieAny>
                </PieChart>
              </ChartContainerAny>

              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[1.7rem] leading-none font-extrabold tracking-[-0.03em] text-foreground max-sm:text-[1.4rem]">{formatNumber(totalAmount)}</span>
                <span className="mt-1 text-[0.8rem] font-semibold text-[oklch(0.45_0.12_265)] dark:text-[oklch(0.78_0.08_265)]">{unitShort}</span>
                <span className="mt-1 text-xs text-muted-foreground">
                  ud af {formatNumber(totalPossible)}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-2.5">
            {items.map((item) => (
              <div key={item.label} className="flex items-start gap-3 rounded-xl border border-border/70 bg-background/82 px-3.5 py-3 dark:bg-background/58">
                <span
                  className="mt-0.5 size-3 shrink-0 rounded-full [background:oklch(0.68_0.14_var(--hold-hue))] shadow-[0_0_0_0.25rem_oklch(0.68_0.14_var(--hold-hue)/0.14)]"
                  style={{ '--hold-hue': item.hue } as any}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3 max-sm:flex-col max-sm:items-start max-sm:gap-1">
                    <span className="min-w-0 text-sm font-semibold text-foreground">{item.label}</span>
                    <span className="shrink-0 text-sm font-bold text-[oklch(0.45_0.12_265)] dark:text-[oklch(0.8_0.08_265)]">{formatPct(item.share)}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatNumber(item.amount)}/{formatNumber(item.total)} {unitLong}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-muted/55 px-4 py-3 text-sm text-muted-foreground">
          Intet {metric === 'alm' ? 'almindeligt' : 'skriftligt'} fravær i den valgte periode.
        </div>
      )}
    </div>
  );
}

function SortHeader({
  label,
  sortKey: key,
  current,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = current === key;
  return (
    <th
      className={cn("cursor-pointer select-none whitespace-nowrap px-3.5 py-2.5 text-left text-xs font-semibold tracking-[0.04em] uppercase text-muted-foreground transition-colors hover:text-foreground", isActive && "text-foreground")}
      onClick={() => onSort(key)}
    >
      {label}
      {isActive && (
        dir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />
      )}
    </th>
  );
}

function PctCell({ pct, detail }: { pct: string; detail: string }) {
  const num = parsePct(pct);
  const color = absenceColor(num);

  return (
    <div className="flex min-w-20 flex-col gap-1">
      {pct && (
        <>
          <span className="block h-1 w-full overflow-hidden rounded bg-muted/60">
            <span
              className="block h-full rounded transition-[width]"
              style={{ width: `${Math.min(num, 100)}%`, background: color }}
            />
          </span>
          <span className="text-[0.8125rem] font-semibold" style={{ color }}>{pct}</span>
          {detail && <span className="text-[0.6875rem] text-muted-foreground/70">{detail}</span>}
        </>
      )}
    </div>
  );
}

function RecordCard({
  record,
  isMissing,
  onEdit,
}: {
  record: FravaerRecord;
  isMissing: boolean;
  onEdit: (r: FravaerRecord) => void;
}) {
  const hue = record.hold ? getHoldHue(record.hold) : 200;
  const holdName = record.hold ? getHoldDisplayName(record.hold) : '';

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card px-4 py-3 [border-left:3px_solid_oklch(0.65_0.16_var(--hold-hue,265))] transition-[box-shadow,border-color] hover:shadow-[0_2px_8px_oklch(0_0_0/0.05)]',
        isMissing && 'border-l-[oklch(0.65_0.18_50)] bg-[linear-gradient(135deg,oklch(0.99_0.006_50),oklch(0.975_0.018_50)),var(--card)] shadow-[0_10px_22px_oklch(0.78_0.08_50/0.08)] dark:border-l-[oklch(0.60_0.16_50)] dark:bg-[linear-gradient(135deg,oklch(0.22_0.012_50),oklch(0.25_0.02_50)),var(--card)] dark:shadow-[0_10px_22px_oklch(0_0_0/0.2)]',
        record.fravaerType === 'godskrevet' && 'border-l-[oklch(0.65_0.14_145)] opacity-70',
      )}
      style={{ '--hold-hue': hue } as any}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.8125rem] font-semibold text-foreground">{record.date || record.uge}</span>
            {record.module && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{record.module}</span>
            )}
            <span className="text-xs font-bold" style={{ color: absenceColor(record.fravaerPct) }}>
              {record.fravaerPct}%
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {holdName && (
              <span className="text-[oklch(0.50_0.10_var(--hold-hue,265))] dark:text-[oklch(0.72_0.10_var(--hold-hue,265))]" style={{ '--hold-hue': hue } as any}>
                {holdName}
              </span>
            )}
            {record.teacher && (
              <span className="opacity-80">{record.teacher}</span>
            )}
            {record.room && (
              <span className="opacity-80">{record.room}</span>
            )}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {record.fravaerType === 'godskrevet' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[oklch(0.96_0.03_145)] px-2 py-0.5 text-[0.6875rem] font-semibold text-[oklch(0.55_0.14_145)] dark:bg-[oklch(0.25_0.03_145)] dark:text-[oklch(0.72_0.12_145)]">
              <CheckCircle2 size={13} />
              Godskrevet
            </span>
          )}
          {record.aarsag && (
            <span className="max-w-48 truncate rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{record.aarsag}</span>
          )}
          {isMissing && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[oklch(0.96_0.03_50)] px-2 py-0.5 text-[0.6875rem] font-semibold text-[oklch(0.55_0.14_50)] dark:bg-[oklch(0.25_0.03_50)] dark:text-[oklch(0.75_0.12_50)]">
              <AlertTriangle size={12} />
              Mangler årsag
            </span>
          )}
          {record.editUrl && (
            <button
              className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onEdit(record); }}
              title="Rediger årsag"
            >
              <Edit3 size={13} />
            </button>
          )}
        </div>
      </div>
      {(record.bemaerkning || record.note) && (
        <div className="mt-2 flex flex-col gap-1 border-t border-border/40 pt-2">
          {record.bemaerkning && (
            <span className="flex items-start gap-1 text-xs leading-relaxed text-muted-foreground">
              <Info size={12} />
              {record.bemaerkning}
            </span>
          )}
          {record.note && (
            <span className="flex items-start gap-1 text-xs leading-relaxed text-muted-foreground">{record.note}</span>
          )}
        </div>
      )}
    </div>
  );
}
