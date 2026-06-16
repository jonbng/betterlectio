import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { useTranslation } from '@/lib/i18n';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Edit3,
  Search,
  X,
  CheckCircle2,
  Info,
  Loader2,
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
import { cn } from '@/lib/utils';
import { formatMonth, formatWeekdayCapitalized } from '@/lib/i18n';

// ── Types ──────────────────────────────────────────────────────────────

interface FravaerPageProps {
  data: FravaerPageData;
  schoolId: string;
}

// ── Date formatting ────────────────────────────────────────────────────

function formatFullDate(dateISO: string, fallback: string): string {
  if (!dateISO) return fallback || '—';
  const [y, m, d] = dateISO.split('-').map(Number);
  if (!y || !m || !d) return fallback || '—';
  const date = new Date(y, m - 1, d);
  return `${formatWeekdayCapitalized(date)} ${d}. ${formatMonth(date)}`;
}

// Lectio's period picker uses `dd/mm-yyyy`; <input type="date"> uses `yyyy-mm-dd`.
function lectioToISO(lectio: string): string {
  const m = lectio.match(/(\d{1,2})\/(\d{1,2})-(\d{4})/);
  if (!m) return '';
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function isoToLectio(iso: string): string {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const [, yyyy, mm, dd] = m;
  return `${dd}/${mm}-${yyyy}`;
}

// Danish school year runs August → June. Returns `dd/mm-yyyy` for 1 August of
// the current school year relative to `todayISO`.
function schoolYearStartLectio(todayISO: string): string {
  const m = todayISO.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const year = Number(m[1]);
  const month = Number(m[2]);
  const startYear = month >= 8 ? year : year - 1;
  return `01/08-${startYear}`;
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

function absenceColor(pct: number): string {
  if (pct <= 0) return 'oklch(0.72 0.17 145)';
  if (pct < 5) return 'oklch(0.75 0.15 145)';
  if (pct < 10) return 'oklch(0.78 0.14 80)';
  if (pct < 15) return 'oklch(0.75 0.16 55)';
  if (pct < 20) return 'oklch(0.68 0.18 40)';
  return 'oklch(0.62 0.2 25)';
}

function absenceColorClass(pct: number): string {
  if (pct <= 0) return 'text-[oklch(0.72_0.17_145)]';
  if (pct < 5) return 'text-[oklch(0.62_0.17_145)]';
  if (pct < 10) return 'text-[oklch(0.65_0.16_80)]';
  if (pct < 15) return 'text-[oklch(0.60_0.18_55)]';
  if (pct < 20) return 'text-[oklch(0.55_0.20_40)]';
  return 'text-[oklch(0.52_0.22_25)]';
}

type StatusKey = 'fravaerPage.perfect' | 'fravaerPage.fine' | 'fravaerPage.okay' | 'fravaerPage.high' | 'fravaerPage.critical' | 'fravaerPage.veryCritical';

function statusLabelKey(pct: number): StatusKey {
  if (pct <= 0) return 'fravaerPage.perfect';
  if (pct < 5) return 'fravaerPage.fine';
  if (pct < 10) return 'fravaerPage.okay';
  if (pct < 15) return 'fravaerPage.high';
  if (pct < 20) return 'fravaerPage.critical';
  return 'fravaerPage.veryCritical';
}

function hasHoldAbsence(hold: FravaerHoldEntry): boolean {
  return (
    parsePct(hold.almOpgjortPct) > 0 ||
    parsePct(hold.almAarPct) > 0 ||
    parsePct(hold.skrOpgjortPct) > 0 ||
    parsePct(hold.skrAarPct) > 0
  );
}

function isMissingReasonRecord(record: FravaerRecord): boolean {
  return !record.aarsag && !!record.editUrl;
}

// ── Distribution helpers ───────────────────────────────────────────────

interface DistributionSlice {
  label: string;
  hue: number;
  amount: number;
  total: number;
  pct: number;
}

function buildDistribution(holds: FravaerHoldEntry[]): DistributionSlice[] {
  const items: DistributionSlice[] = [];
  let totalAmount = 0;

  for (const hold of holds) {
    // Prefer absolute module counts when available (legacy 9-col layout).
    // Fall back to absence percentage as the slice weight when Lectio only
    // provides percentages (2026-05 compact 5-col layout).
    const { amount: modAmount, total: modTotal } = parseFraction(hold.almOpgjortModuler);
    const pctValue = parsePct(hold.almOpgjortPct);

    let amount: number;
    let total: number;
    if (modAmount > 0) {
      amount = modAmount;
      total = modTotal;
    } else if (pctValue > 0) {
      amount = pctValue;
      total = 0;
    } else {
      continue;
    }

    totalAmount += amount;
    items.push({
      label: getHoldDisplayName(hold.hold) || hold.hold,
      hue: getHoldHue(hold.hold),
      amount,
      total,
      pct: 0,
    });
  }

  for (const item of items) {
    item.pct = totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0;
  }

  return items.sort((a, b) => b.amount - a.amount);
}

// ── Component ──────────────────────────────────────────────────────────

export function FravaerPage({ data: initialData, schoolId }: FravaerPageProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<FravaerPageData>(initialData);
  const [loading, setLoading] = useState(false);

  const [showAllSubjects, setShowAllSubjects] = useState(false);
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);

  // Records
  const [selectedHold, setSelectedHold] = useState<string | null>(null);
  const [showOnlyMissing, setShowOnlyMissing] = useState(false);
  const [recordSearch, setRecordSearch] = useState('');
  const [visibleRecords, setVisibleRecords] = useState(20);
  const searchRef = useRef<HTMLInputElement>(null);

  // Edit sheet
  const [editRecord, setEditRecord] = useState<FravaerRecord | null>(null);
  const [editSheetOpen, setEditSheetOpen] = useState(false);

  useEffect(() => {
    for (const entry of data.holds) {
      registerHold(entry.hold, entry.holdelementId);
    }
  }, [data.holds]);

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleEditClick = (record: FravaerRecord) => {
    setEditRecord(record);
    setEditSheetOpen(true);
  };

  const handleEditSaved = useCallback(async () => {
    setLoading(true);
    try {
      const result = await submitPeriodChange(data.period.start, data.period.end);
      if (result) setData(result);
    } finally {
      setLoading(false);
    }
  }, [data.period]);

  const handlePeriodChange = useCallback(async (start: string, end: string) => {
    if (!start || !end) return;
    setLoading(true);
    try {
      const result = await submitPeriodChange(start, end);
      if (result) setData(result);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Derived data ─────────────────────────────────────────────────────

  const almOpgjort = parsePct(data.totals?.almOpgjortPct || '');
  const almAar = parsePct(data.totals?.almAarPct || '');
  const skrOpgjort = parsePct(data.totals?.skrOpgjortPct || '');
  const skrAar = parsePct(data.totals?.skrAarPct || '');
  const hasSkr = skrOpgjort > 0 || skrAar > 0 || data.holds.some(h => parsePct(h.skrOpgjortPct) > 0 || parsePct(h.skrAarPct) > 0);

  const subjectsWithAbsence = data.holds
    .filter(hasHoldAbsence)
    .sort((a, b) => parsePct(b.almOpgjortPct) - parsePct(a.almOpgjortPct));
  const subjectsWithoutAbsence = data.holds.filter(h => !hasHoldAbsence(h));

  const visibleSubjects = showAllSubjects
    ? [...subjectsWithAbsence, ...subjectsWithoutAbsence]
    : subjectsWithAbsence;

  const hasMissingReasons = data.missingReasons.length > 0;

  const distribution = buildDistribution(data.holds);

  // Records filtering
  const allRecords = showOnlyMissing
    ? data.missingReasons
    : [...data.missingReasons, ...data.records].filter(
        (record, index, records) =>
          records.findIndex(c => c.absid === record.absid) === index,
      );
  const queryLower = recordSearch.toLowerCase().trim();

  const filteredRecords = allRecords.filter(r => {
    if (selectedHold && r.hold !== selectedHold) return false;
    if (queryLower) {
      const searchIn = `${r.hold} ${getHoldDisplayName(r.hold)} ${r.date} ${r.teacher} ${r.aarsag} ${r.note} ${r.bemaerkning} ${r.module}`.toLowerCase();
      if (!searchIn.includes(queryLower)) return false;
    }
    return true;
  });

  const prioritizedRecords = filteredRecords
    .map((record, index) => ({ record, index, isMissing: isMissingReasonRecord(record) }))
    .sort((a, b) => {
      if (a.isMissing !== b.isMissing) return a.isMissing ? -1 : 1;
      const aDate = a.record.dateISO;
      const bDate = b.record.dateISO;
      if (aDate && bDate && aDate !== bDate) return bDate.localeCompare(aDate);
      if (aDate && !bDate) return -1;
      if (!aDate && bDate) return 1;
      return a.index - b.index;
    });

  const shownRecords = prioritizedRecords.slice(0, visibleRecords);

  const recordHolds = [...new Set(allRecords.map(r => r.hold))]
    .filter(Boolean)
    .sort((a, b) => getHoldDisplayName(a).localeCompare(getHoldDisplayName(b), 'da'));

  return (
    <div className={cn('mx-auto max-w-7xl px-10 pb-12 pt-8', loading && 'pointer-events-none opacity-60')}>

      {/* ── Header (matches Lektier/Opgaver) ── */}
      <div className="border-b border-border pb-5 mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[2rem] font-[800] tracking-[-0.02em] text-foreground">{t('fravaerPage.title')}</h1>
          <p className="mt-1 text-base text-muted-foreground">
            {data.studentName && <>{data.studentName} &middot; </>}
            {t('fravaerPage.subjectCount', { n: String(data.holds.length) })} &middot; {t('fravaerPage.recordCount', { n: String(data.records.length + data.missingReasons.length) })}
          </p>
        </div>
        {(data.period.start || data.period.end) && (
          <PeriodSelector
            period={data.period}
            disabled={loading}
            onApply={handlePeriodChange}
          />
        )}
      </div>

      {/* ── Missing reasons banner ────────────── */}
      {hasMissingReasons && (
        <MissingReasonsBanner
          records={data.missingReasons}
          onEdit={handleEditClick}
        />
      )}

      {/* ── Summary section ───────────────────── */}
      {data.totals && (
        <section className="mb-8 animate-[bl-fade-in_350ms_var(--ease-out)_both]">
          <div className={cn(
            'grid gap-5',
            hasSkr ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2',
          )}>
            {/* Almindeligt card */}
            <SummaryCard
              title={t('fravaerPage.regularAbsence')}
              opgjortPct={almOpgjort}
              opgjortDetail={data.totals.almOpgjortModuler}
              aarPct={almAar}
              aarDetail={data.totals.almAarModuler}
              opgjortLabel={t('fravaerPage.assessed')}
              aarLabel={t('fravaerPage.forTheYear')}
              unitLabel={t('fravaerPage.modules')}
            />

            {/* Skriftligt card */}
            {hasSkr && (
              <SummaryCard
                title={t('fravaerPage.writtenAbsence')}
                opgjortPct={skrOpgjort}
                opgjortDetail={data.totals.skrOpgjortTid}
                aarPct={skrAar}
                aarDetail={data.totals.skrAarTid}
                opgjortLabel={t('fravaerPage.assessed')}
                aarLabel={t('fravaerPage.forTheYear')}
                unitLabel={t('fravaerPage.studentHours')}
              />
            )}

            {/* Distribution donut */}
            {distribution.length > 0 && (
              <DistributionCard slices={distribution} />
            )}
          </div>
        </section>
      )}

      {/* ── Per-subject breakdown ─────────────── */}
      {data.holds.length > 0 && (
        <section className="mb-8 space-y-3 animate-[bl-fade-in_350ms_var(--ease-out)_100ms_both]">
          <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            {t('fravaerPage.absencePerSubject')}
          </h2>

          <div className="space-y-1.5">
            {visibleSubjects.map((hold, i) => (
              <SubjectRow
                key={hold.hold}
                hold={hold}
                hasSkr={hasSkr}
                isExpanded={expandedSubject === hold.hold}
                onToggle={() =>
                  setExpandedSubject(expandedSubject === hold.hold ? null : hold.hold)
                }
                onFilterRecords={() => {
                  setSelectedHold(selectedHold === hold.hold ? null : hold.hold);
                  document.getElementById('il-fravaer-records')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                style={{ animationDelay: `${140 + i * 25}ms` }}
              />
            ))}
          </div>

          {subjectsWithoutAbsence.length > 0 && (
            <button
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:scale-[0.97]"
              onClick={() => setShowAllSubjects(v => !v)}
            >
              {showAllSubjects ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showAllSubjects
                ? t('fravaerPage.hideSubjectsWithoutAbsence', { n: String(subjectsWithoutAbsence.length) })
                : t('fravaerPage.subjectsWithoutAbsence', { n: String(subjectsWithoutAbsence.length) })}
            </button>
          )}
        </section>
      )}

      {/* ── Bemærkninger ──────────────────────── */}
      {data.warnings.length > 0 && (
        <WarningsSection warnings={data.warnings} />
      )}

      {/* ── Records ───────────────────────────── */}
      <section id="il-fravaer-records" className="mb-8 space-y-3 animate-[bl-fade-in_350ms_var(--ease-out)_200ms_both]">
        <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          {t('fravaerPage.registrations')}
          <span className="ml-1.5 tabular-nums text-muted-foreground/70">
            {filteredRecords.length}
          </span>
        </h2>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
            <input
              ref={searchRef}
              type="text"
              className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-9 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
              placeholder={t('fravaerPage.searchPlaceholder')}
              value={recordSearch}
              onInput={e => setRecordSearch((e.target as HTMLInputElement).value)}
            />
            {recordSearch && (
              <button
                className="absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setRecordSearch('')}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {hasMissingReasons && (
            <button
              className={cn(
                'inline-flex h-10 items-center gap-1.5 rounded-lg border px-3.5 text-sm font-medium transition-colors duration-150 active:scale-[0.97]',
                showOnlyMissing
                  ? 'border-[oklch(0.65_0.12_50)] bg-[oklch(0.65_0.12_50)] text-white dark:border-[oklch(0.58_0.12_50)] dark:bg-[oklch(0.45_0.10_50)]'
                  : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
              onClick={() => { setShowOnlyMissing(v => !v); setVisibleRecords(20); }}
            >
              <AlertTriangle size={13} />
              {t('fravaerPage.onlyMissing')}
            </button>
          )}
        </div>

        {/* Hold filter pills */}
        {recordHolds.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <FilterPill
              active={selectedHold === null}
              onClick={() => setSelectedHold(null)}
            >
              {t('fravaerPage.allSubjects')}
            </FilterPill>
            {recordHolds.map(hold => (
              <FilterPill
                key={hold}
                active={selectedHold === hold}
                hue={getHoldHue(hold)}
                onClick={() => setSelectedHold(selectedHold === hold ? null : hold)}
              >
                {getHoldDisplayName(hold)}
              </FilterPill>
            ))}
          </div>
        )}

        {/* Records list */}
        {filteredRecords.length === 0 ? (
          <EmptyRecords
            hasFilters={!!(recordSearch || selectedHold || showOnlyMissing)}
            onReset={() => { setRecordSearch(''); setSelectedHold(null); setShowOnlyMissing(false); }}
          />
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
            className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-3 text-sm font-semibold text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:scale-[0.99]"
            onClick={() => setVisibleRecords(v => v + 30)}
          >
            <ChevronDown size={15} />
            {t('fravaerPage.showMore', { n: String(filteredRecords.length - visibleRecords) })}
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

      {loading && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[oklch(1_0_0/0.4)] dark:bg-[oklch(0.1_0_0/0.5)]">
          <Loader2 size={22} className="animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function PeriodSelector({
  period,
  disabled,
  onApply,
}: {
  period: { start: string; end: string };
  disabled: boolean;
  onApply: (startLectio: string, endLectio: string) => void;
}) {
  const { t } = useTranslation();
  const [start, setStart] = useState(lectioToISO(period.start));
  const [end, setEnd] = useState(lectioToISO(period.end));

  // Keep local inputs in sync when the parent swaps in fresh data.
  useEffect(() => {
    setStart(lectioToISO(period.start));
    setEnd(lectioToISO(period.end));
  }, [period.start, period.end]);

  const currentStartLectio = isoToLectio(start);
  const currentEndLectio = isoToLectio(end);
  const dirty =
    currentStartLectio !== period.start || currentEndLectio !== period.end;

  const inputClass =
    'h-9 rounded-lg border border-border bg-card px-2.5 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-150 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:opacity-50 [color-scheme:light] dark:[color-scheme:dark]';

  const apply = (s: string, e: string) => {
    if (!s || !e || disabled) return;
    onApply(s, e);
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        {t('fravaerPage.period')}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="date"
          aria-label={t('fravaerPage.periodFrom')}
          className={inputClass}
          value={start}
          disabled={disabled}
          max={end || undefined}
          onInput={e => setStart((e.target as HTMLInputElement).value)}
        />
        <span className="text-sm text-muted-foreground">–</span>
        <input
          type="date"
          aria-label={t('fravaerPage.periodTo')}
          className={inputClass}
          value={end}
          disabled={disabled}
          min={start || undefined}
          onInput={e => setEnd((e.target as HTMLInputElement).value)}
        />
        <button
          className="inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
          disabled={disabled || !dirty || !start || !end}
          onClick={() => apply(currentStartLectio, currentEndLectio)}
        >
          {t('fravaerPage.applyPeriod')}
        </button>
        <button
          className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
          disabled={disabled}
          onClick={() => apply(schoolYearStartLectio(end || start), period.end)}
        >
          {t('fravaerPage.schoolYear')}
        </button>
      </div>
    </div>
  );
}

function AbsenceRing({ pct, size, strokeWidth }: { pct: number; size: number; strokeWidth: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(pct, 100) / 100) * circumference;

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        className="stroke-muted/40"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        stroke={absenceColor(pct)}
        className="transition-[stroke-dashoffset] duration-700"
        style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
      />
    </svg>
  );
}

function SummaryCard({
  title,
  opgjortPct,
  opgjortDetail,
  aarPct,
  aarDetail,
  opgjortLabel,
  aarLabel,
  unitLabel,
}: {
  title: string;
  opgjortPct: number;
  opgjortDetail: string;
  aarPct: number;
  aarDetail: string;
  opgjortLabel: string;
  aarLabel: string;
  unitLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-5 rounded-xl border border-border bg-card p-5">
      <div className="relative flex shrink-0 items-center justify-center">
        <AbsenceRing pct={opgjortPct} size={96} strokeWidth={8} />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-xl font-extrabold tabular-nums tracking-tight', absenceColorClass(opgjortPct))}>
            {formatPct(opgjortPct)}
          </span>
          <span className={cn('text-[0.6rem] font-bold uppercase tracking-widest', absenceColorClass(opgjortPct))}>
            {t(statusLabelKey(opgjortPct))}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 pt-1">
        <span className="text-sm font-semibold text-foreground">{title}</span>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-xs text-muted-foreground">{opgjortLabel}</span>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className={cn('text-base font-bold tabular-nums', absenceColorClass(opgjortPct))}>
                {formatPct(opgjortPct)}
              </span>
            </div>
            {opgjortDetail && (
              <span className="text-xs tabular-nums text-muted-foreground">{opgjortDetail} {unitLabel}</span>
            )}
          </div>

          <div>
            <span className="text-xs text-muted-foreground">{aarLabel}</span>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className={cn('text-base font-bold tabular-nums', absenceColorClass(aarPct))}>
                {aarPct > 0 ? formatPct(aarPct) : '—'}
              </span>
            </div>
            {aarDetail && (
              <span className="text-xs tabular-nums text-muted-foreground">{aarDetail} {unitLabel}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DistributionCard({ slices }: { slices: DistributionSlice[] }) {
  const totalAmount = slices.reduce((sum, s) => sum + s.amount, 0);
  // When Lectio omits absolute module counts (compact 2026-05 layout),
  // slices fall back to percentage weighting and have `total === 0`.
  // In that mode the totalAmount and per-slice "amount" are absence %, not module counts.
  const isPercentMode = slices.every(s => s.total === 0);

  // Build SVG donut segments
  const donutSize = 96;
  const strokeWidth = 14;
  const radius = (donutSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let cumulativeOffset = 0;
  const segments = slices.map(slice => {
    const segLen = (slice.pct / 100) * circumference;
    const gap = slices.length > 1 ? 3 : 0;
    const seg = {
      ...slice,
      dasharray: `${Math.max(0, segLen - gap)} ${circumference - Math.max(0, segLen - gap)}`,
      dashoffset: -cumulativeOffset,
    };
    cumulativeOffset += segLen;
    return seg;
  });

  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:col-span-2 lg:col-span-1">
      <DistributionTitle />

      <div className="mt-3 flex items-center gap-5">
        {/* SVG donut */}
        <div className="relative flex shrink-0 items-center justify-center">
          <svg width={donutSize} height={donutSize} className="-rotate-90">
            <circle
              cx={donutSize / 2}
              cy={donutSize / 2}
              r={radius}
              fill="none"
              strokeWidth={strokeWidth}
              className="stroke-muted/30"
            />
            {segments.map((seg, i) => (
              <circle
                key={i}
                cx={donutSize / 2}
                cy={donutSize / 2}
                r={radius}
                fill="none"
                strokeWidth={strokeWidth}
                strokeLinecap="butt"
                strokeDasharray={seg.dasharray}
                strokeDashoffset={seg.dashoffset}
                stroke={`oklch(0.62 0.15 ${seg.hue})`}
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {isPercentMode ? (
              <span className="text-base font-bold uppercase tracking-wider text-muted-foreground">%</span>
            ) : (
              <>
                <span className="text-lg font-extrabold tabular-nums text-foreground">{formatNumber(totalAmount)}</span>
                <DistributionModulesLabel />
              </>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-1 flex-col gap-1.5 overflow-hidden">
          {slices.slice(0, 5).map(slice => (
            <div key={slice.label} className="flex items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: `oklch(0.62 0.15 ${slice.hue})` }}
              />
              <span className="min-w-0 truncate text-sm text-foreground">{slice.label}</span>
              <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
                {isPercentMode ? `${formatNumber(slice.amount)}%` : formatNumber(slice.amount)}
              </span>
            </div>
          ))}
          {slices.length > 5 && (
            <span className="pl-[1.125rem] text-xs text-muted-foreground">
              <MoreSubjectsLabel count={slices.length - 5} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DistributionTitle() {
  const { t } = useTranslation();
  return <span className="text-sm font-semibold text-foreground">{t('fravaerPage.distribution')}</span>;
}

function DistributionModulesLabel() {
  const { t } = useTranslation();
  return <span className="text-xs text-muted-foreground">{t('fravaerPage.modules')}</span>;
}

function MoreSubjectsLabel({ count }: { count: number }) {
  const { t } = useTranslation();
  return <>{t('fravaerPage.moreSubjects', { n: String(count) })}</>;
}

function MissingReasonsBanner({
  records,
  onEdit,
}: {
  records: FravaerRecord[];
  onEdit: (r: FravaerRecord) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const sorted = [...records].sort((a, b) => {
    if (a.dateISO && b.dateISO && a.dateISO !== b.dateISO) return b.dateISO.localeCompare(a.dateISO);
    if (a.dateISO && !b.dateISO) return -1;
    if (!a.dateISO && b.dateISO) return 1;
    return 0;
  });
  const preview = expanded ? sorted : sorted.slice(0, 3);
  const hasMore = sorted.length > 3;

  return (
    <section className="mb-7 animate-[bl-fade-in_350ms_var(--ease-out)_both]">
      <div className="overflow-hidden rounded-xl border border-[oklch(0.82_0.08_50)] bg-[oklch(0.99_0.005_50)] dark:border-[oklch(0.32_0.05_50)] dark:bg-[oklch(0.15_0.01_50)]">
        <div className="flex items-center gap-3 px-5 py-3.5">
          <div className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-[oklch(0.92_0.06_50)] text-[oklch(0.52_0.18_50)] dark:bg-[oklch(0.26_0.05_50)] dark:text-[oklch(0.78_0.14_50)]">
            <AlertTriangle size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground">
              {records.length === 1
                ? t('fravaerPage.missingReasonSingular', { n: String(records.length) })
                : t('fravaerPage.missingReasonPlural', { n: String(records.length) })}
            </p>
            <p className="text-sm text-muted-foreground">{t('fravaerPage.requiresAction')}</p>
          </div>
        </div>

        <div className="border-t border-[oklch(0.90_0.04_50)] px-3 pb-2.5 dark:border-[oklch(0.25_0.03_50)]">
          {preview.map((record, i) => {
            const hue = record.hold ? getHoldHue(record.hold) : 200;
            const holdName = record.hold ? getHoldDisplayName(record.hold) : '';
            return (
              <div
                key={`${record.absid}-${i}`}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[oklch(0.96_0.01_50)] dark:hover:bg-[oklch(0.20_0.01_50)]"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: `oklch(0.65 0.16 ${hue})` }}
                  />
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-foreground">
                      {formatFullDate(record.dateISO, record.date || record.uge)}
                    </span>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {holdName && <span className="font-medium">{holdName}</span>}
                      {holdName && record.module && <span>&middot;</span>}
                      {record.module && <span>{record.module}</span>}
                    </div>
                  </div>
                </div>
                <button
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[oklch(0.78_0.08_50/0.5)] bg-card px-3 py-1.5 text-xs font-bold text-[oklch(0.48_0.14_50)] transition-all duration-150 hover:bg-[oklch(0.97_0.01_50)] active:scale-[0.95] dark:border-[oklch(0.45_0.08_50/0.4)] dark:text-[oklch(0.82_0.10_50)] dark:hover:bg-[oklch(0.25_0.01_50)]"
                  onClick={() => onEdit(record)}
                >
                  <Edit3 size={12} />
                  {t('fravaerPage.enterReason')}
                </button>
              </div>
            );
          })}
        </div>

        {hasMore && (
          <button
            className="w-full border-t border-[oklch(0.90_0.04_50)] px-4 py-2.5 text-sm font-bold text-[oklch(0.48_0.14_50)] transition-colors hover:bg-[oklch(0.97_0.01_50)] dark:border-[oklch(0.25_0.03_50)] dark:text-[oklch(0.78_0.12_50)] dark:hover:bg-[oklch(0.20_0.01_50)]"
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? t('fravaerPage.showFewer') : t('fravaerPage.showAll', { n: String(records.length) })}
          </button>
        )}
      </div>
    </section>
  );
}

function SubjectRow({
  hold,
  hasSkr,
  isExpanded,
  onToggle,
  onFilterRecords,
  style,
}: {
  hold: FravaerHoldEntry;
  hasSkr: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onFilterRecords: () => void;
  style?: any;
}) {
  const { t } = useTranslation();
  const hue = getHoldHue(hold.hold);
  const displayName = getHoldDisplayName(hold.hold);
  const almPct = parsePct(hold.almOpgjortPct);
  const almAarPct = parsePct(hold.almAarPct);
  const skrPct = parsePct(hold.skrOpgjortPct);
  const hasAbsence = hasHoldAbsence(hold);

  return (
    <div
      className="animate-[bl-fade-in_300ms_var(--ease-out)_both] overflow-hidden rounded-xl border border-border bg-card transition-colors"
      style={style}
    >
      <button
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/30 active:scale-[0.998]"
        onClick={onToggle}
      >
        <span
          className="size-3 shrink-0 rounded-full"
          style={{ background: `oklch(0.65 0.16 ${hue})` }}
        />

        <span className="min-w-0 flex-1">
          <span className="text-sm font-semibold text-foreground">{displayName}</span>
          {displayName !== hold.hold && (
            <span className="ml-1.5 text-xs text-muted-foreground/60">{hold.hold}</span>
          )}
        </span>

        {hasAbsence ? (
          <div className="flex items-center gap-4">
            {/* Mini bar */}
            <div className="hidden w-28 sm:block">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted/50">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${Math.min(almPct * 2, 100)}%`,
                    background: absenceColor(almPct),
                    transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                />
              </div>
            </div>

            <div className="flex min-w-[3.5rem] flex-col items-end leading-tight">
              <span className={cn('text-sm font-bold tabular-nums', absenceColorClass(almPct))}>
                {hold.almOpgjortPct || '0%'}
              </span>
              {hold.almOpgjortModuler && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {hold.almOpgjortModuler} {t('fravaerPage.modules')}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-end leading-tight">
            <span className="text-sm text-muted-foreground/40">0%</span>
            {hold.almOpgjortModuler && (
              <span className="text-xs tabular-nums text-muted-foreground/60">
                {hold.almOpgjortModuler} {t('fravaerPage.modules')}
              </span>
            )}
          </div>
        )}

        <ChevronDown
          size={15}
          className={cn(
            'shrink-0 text-muted-foreground/40 transition-transform duration-200',
            isExpanded && 'rotate-180',
          )}
        />
      </button>

      {isExpanded && (
        <div className="border-t border-border/50 bg-muted/20 px-5 py-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
            <DetailCell label={t('fravaerPage.almAssessed')} value={hold.almOpgjortPct} detail={hold.almOpgjortModuler} />
            <DetailCell label={t('fravaerPage.almForYear')} value={hold.almAarPct} detail={hold.almAarModuler} />
            <DetailCell label={t('fravaerPage.skrAssessed')} value={hold.skrOpgjortPct} detail={hold.skrOpgjortTid} />
            <DetailCell label={t('fravaerPage.skrForYear')} value={hold.skrAarPct} detail={hold.skrAarTid} />
          </div>
          <button
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/80 active:scale-[0.97]"
            onClick={e => { e.stopPropagation(); onFilterRecords(); }}
          >
            <Search size={13} />
            {t('fravaerPage.showRecordsFor', { name: displayName })}
          </button>
        </div>
      )}
    </div>
  );
}

function DetailCell({ label, value, detail }: { label: string; value: string; detail: string }) {
  const pct = parsePct(value);
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1 flex items-baseline gap-1.5">
        {value ? (
          <>
            <span className={cn('text-base font-bold tabular-nums', absenceColorClass(pct))}>{value}</span>
            {detail && <span className="text-xs tabular-nums text-muted-foreground">{detail}</span>}
          </>
        ) : (
          <span className="text-sm text-muted-foreground/40">&mdash;</span>
        )}
      </div>
    </div>
  );
}

function WarningsSection({ warnings }: { warnings: FravaerWarning[] }) {
  const { t } = useTranslation();
  return (
    <section className="mb-8 space-y-2 animate-[bl-fade-in_350ms_var(--ease-out)_150ms_both]">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        <Info size={13} />
        {t('fravaerPage.notes')}
      </h2>
      {warnings.map((w, i) => (
        <div key={i} className="rounded-xl border border-border bg-card px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{w.dato}</span>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{w.type}</span>
            <span className="text-xs text-muted-foreground">{w.initialer}</span>
          </div>
          {w.note && (
            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{w.note}</p>
          )}
        </div>
      ))}
    </section>
  );
}

function FilterPill({
  active,
  hue,
  onClick,
  children,
}: {
  active: boolean;
  hue?: number;
  onClick: () => void;
  children: any;
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-150 active:scale-[0.96]',
        active
          ? hue != null
            ? 'border-transparent text-foreground'
            : 'border-primary/30 bg-primary/10 text-foreground'
          : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
      style={
        active && hue != null
          ? {
              background: `oklch(0.94 0.05 ${hue})`,
              color: `oklch(0.38 0.12 ${hue})`,
              borderColor: `oklch(0.85 0.08 ${hue})`,
            }
          : undefined
      }
      onClick={onClick}
    >
      {hue != null && (
        <span
          className="size-2 rounded-full"
          style={{ background: `oklch(0.65 0.16 ${hue})` }}
        />
      )}
      {children}
    </button>
  );
}

function EmptyRecords({
  hasFilters,
  onReset,
}: {
  hasFilters: boolean;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-8 py-12 text-center">
      {hasFilters ? (
        <>
          <Search className="size-9 text-muted-foreground/20" />
          <p className="text-sm font-semibold text-foreground">{t('fravaerPage.noResults')}</p>
          <p className="text-sm text-muted-foreground">{t('fravaerPage.tryOtherFilters')}</p>
          <button
            className="mt-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
            onClick={onReset}
          >
            {t('fravaerPage.resetFilters')}
          </button>
        </>
      ) : (
        <>
          <CheckCircle2 className="size-9 text-[oklch(0.72_0.17_145)]/30" />
          <p className="text-sm font-semibold text-foreground">{t('fravaerPage.noRecords')}</p>
          <p className="text-sm text-muted-foreground">{t('fravaerPage.noAbsence')}</p>
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
  const { t } = useTranslation();
  const hue = record.hold ? getHoldHue(record.hold) : 200;
  const holdName = record.hold ? getHoldDisplayName(record.hold) : '';

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card px-5 py-3.5 transition-colors duration-150 hover:bg-accent/20',
        isMissing && 'border-[oklch(0.85_0.06_50)] bg-[oklch(0.995_0.004_50)] dark:border-[oklch(0.30_0.04_50)] dark:bg-[oklch(0.16_0.008_50)]',
        record.fravaerType === 'godskrevet' && 'opacity-55',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          {/* Date line */}
          <div className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: `oklch(0.65 0.16 ${hue})` }}
            />
            <span className="text-sm font-semibold text-foreground">
              {formatFullDate(record.dateISO, record.date || record.uge)}
            </span>
          </div>

          {/* Hold + module + teacher */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-[1.125rem]">
            {holdName && (
              <span
                className="text-sm font-medium"
                style={{ color: `oklch(0.50 0.12 ${hue})` }}
              >
                {holdName}
              </span>
            )}
            {record.module && (
              <span className="text-sm text-muted-foreground">{record.module}</span>
            )}
            {record.teacher && (
              <span className="text-xs text-muted-foreground">&middot; {record.teacher}</span>
            )}
            {record.room && (
              <span className="text-xs text-muted-foreground">{record.room}</span>
            )}
          </div>

          {/* Notes */}
          {(record.bemaerkning || record.note) && (
            <p className="pl-[1.125rem] text-sm text-muted-foreground">
              {record.bemaerkning || record.note}
            </p>
          )}
        </div>

        {/* Right side */}
        <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
          <span className={cn('text-sm font-bold tabular-nums', absenceColorClass(record.fravaerPct))}>
            {record.fravaerPct}%
          </span>

          <div className="flex items-center gap-1.5">
            {record.fravaerType === 'godskrevet' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-[oklch(0.95_0.03_145)] px-2 py-0.5 text-xs font-semibold text-[oklch(0.50_0.14_145)] dark:bg-[oklch(0.22_0.03_145)] dark:text-[oklch(0.72_0.12_145)]">
                <CheckCircle2 size={11} />
                {t('fravaerPage.approved')}
              </span>
            )}

            {record.aarsag && (
              <span className="max-w-40 truncate rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {record.aarsag}
              </span>
            )}

            {isMissing && (
              <span className="inline-flex items-center gap-1 rounded-md bg-[oklch(0.95_0.03_50)] px-2 py-0.5 text-xs font-semibold text-[oklch(0.52_0.14_50)] dark:bg-[oklch(0.22_0.03_50)] dark:text-[oklch(0.78_0.12_50)]">
                <AlertTriangle size={11} />
                {t('fravaerPage.missingReason')}
              </span>
            )}

            {record.editUrl && (
              <button
                className="inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:scale-[0.9]"
                onClick={e => { e.stopPropagation(); onEdit(record); }}
                title={t('fravaerPage.editReason')}
              >
                <Edit3 size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
