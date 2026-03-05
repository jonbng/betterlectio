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

function ddmmyyyy(d: Date): string {
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear()}`;
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

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  // ── Records filtering ─────────────────────────────────────────────

  const allRecords = showOnlyMissing
    ? data.missingReasons
    : [...data.missingReasons, ...data.records].filter((record, index, records) =>
        records.findIndex((candidate) => candidate.absid === record.absid) === index,
      );
  const queryLower = recordSearch.toLowerCase().trim();

  const filteredRecords = allRecords.filter(r => {
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
    <div className={`il-fravaer-page${loading ? ' is-loading' : ''}`}>
      {/* ── Header ─────────────────────────────── */}
      <div className="il-fravaer-header">
        <div className="il-fravaer-header-top">
          <h1 className="il-fravaer-title">Fravær</h1>
          {data.studentName && (
            <span className="il-fravaer-student">{data.studentName}</span>
          )}
        </div>
        <p className="il-fravaer-subtitle">
          {data.holds.length} fag &middot; {data.records.length} registreringer
        </p>
      </div>

      {/* ── Warnings banner ────────────────────── */}
      {data.warnings.length > 0 && (
        <div className="il-fravaer-warnings">
          <AlertTriangle size={16} />
          <div className="il-fravaer-warnings-content">
            {data.warnings.map((w, i) => (
              <div key={i} className="il-fravaer-warning-item">
                <strong>{w.hold}</strong> {w.type}: {w.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {hasMissingReasons && (
        <section className="il-fravaer-attention-panel">
          <div className="il-fravaer-attention-header">
            <span className="il-fravaer-attention-kicker">
              <AlertTriangle size={13} />
              Kræver handling
            </span>
            <p className="il-fravaer-attention-title">
              {data.missingReasons.length} registrering{data.missingReasons.length === 1 ? '' : 'er'} mangler fraværsårsag
            </p>
            <p className="il-fravaer-attention-text">
              Her er dem, der mangler din handling lige nu.
            </p>
          </div>

          <div className="il-fravaer-attention-list">
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
              className="il-fravaer-attention-more"
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
      <div className="il-fravaer-period">
        <div className="il-fravaer-period-presets">
          <Calendar size={14} className="il-fravaer-period-icon" />
          {presets.map(p => (
            <button
              key={p.key}
              className="il-fravaer-period-preset"
              onClick={() => handlePreset(p)}
              disabled={loading}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="il-fravaer-period-custom">
          <input
            type="text"
            className="il-fravaer-period-input"
            value={periodStart}
            onInput={(e) => setPeriodStart((e.target as HTMLInputElement).value)}
            placeholder="dd/mm-yyyy"
          />
          <span className="il-fravaer-period-sep">&ndash;</span>
          <input
            type="text"
            className="il-fravaer-period-input"
            value={periodEnd}
            onInput={(e) => setPeriodEnd((e.target as HTMLInputElement).value)}
            placeholder="dd/mm-yyyy"
          />
          <button
            className="il-fravaer-period-btn"
            onClick={handleCustomPeriod}
            disabled={loading || !periodStart || !periodEnd}
          >
            {loading ? <Loader2 size={14} className="il-fravaer-spinner" /> : 'Vis'}
          </button>
        </div>
      </div>

      {/* ── Summary donuts ─────────────────────── */}
      {data.totals && (
        <div className="il-fravaer-summary-row">
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
        <section className="il-fravaer-holds-section">
          <div className="il-fravaer-section-header">
            <h2 className="il-fravaer-section-title">
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

          <div className="il-fravaer-holds-table-wrap">
            <table className="il-fravaer-holds-table">
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
                {sortedHolds.map((h, i) => {
                  const hue = getHoldHue(h.hold);
                  return (
                    <tr key={i} className="il-fravaer-hold-row" style={{ '--hold-hue': hue } as any}>
                      <td className="il-fravaer-hold-cell">
                        <span className="il-fravaer-hold-dot" />
                        {getHoldDisplayName(h.hold)}
                        {getHoldDisplayName(h.hold) !== h.hold && (
                          <span className="il-fravaer-hold-code">{h.hold}</span>
                        )}
                      </td>
                      <td>
                        <PctCell pct={h.almOpgjortPct} detail={h.almOpgjortModuler} />
                      </td>
                      <td>
                        <PctCell pct={h.almAarPct} detail={h.almAarModuler} />
                      </td>
                      <td>
                        <PctCell pct={h.skrOpgjortPct} detail={h.skrOpgjortTid} />
                      </td>
                      <td>
                        <PctCell pct={h.skrAarPct} detail={h.skrAarTid} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Records section ────────────────────── */}
      <section className="il-fravaer-records-section">
        <div className="il-fravaer-section-header">
          <h2 className="il-fravaer-section-title">
            <Clock size={16} />
            Fraværsregistreringer
            <span className="il-fravaer-section-count">{filteredRecords.length}</span>
          </h2>
        </div>

        {/* Records toolbar */}
        <div className="il-fravaer-records-toolbar">
          <div className="il-fravaer-records-search">
            <Search size={14} className="il-fravaer-search-icon" />
            <input
              ref={searchRef}
              type="text"
              className="il-fravaer-search-input"
              placeholder="Søg i registreringer..."
              value={recordSearch}
              onInput={(e) => setRecordSearch((e.target as HTMLInputElement).value)}
            />
            {recordSearch && (
              <button className="il-fravaer-search-clear" onClick={() => setRecordSearch('')}>
                <X size={14} />
              </button>
            )}
          </div>

          {hasMissingReasons && (
            <button
              className={`il-fravaer-missing-btn${showOnlyMissing ? ' is-active' : ''}`}
              onClick={() => { setShowOnlyMissing(!showOnlyMissing); setVisibleRecords(20); }}
            >
              <AlertTriangle size={13} />
              {showOnlyMissing ? 'Vis alle' : 'Kun manglende'}
            </button>
          )}
        </div>

        {/* Hold filter pills */}
        {recordHolds.length > 1 && (
          <div className="il-fravaer-record-filters">
            <button
              className={`il-fravaer-filter-pill${selectedHold === null ? ' is-active' : ''}`}
              onClick={() => setSelectedHold(null)}
            >
              Alle fag
            </button>
            {recordHolds.map(hold => (
              <button
                key={hold}
                className={`il-fravaer-filter-pill${selectedHold === hold ? ' is-active' : ''}`}
                onClick={() => setSelectedHold(selectedHold === hold ? null : hold)}
                style={{ '--hold-hue': getHoldHue(hold) } as any}
              >
                <span className="il-fravaer-filter-dot" />
                {getHoldDisplayName(hold)}
              </button>
            ))}
          </div>
        )}

        {/* Records list */}
        {filteredRecords.length === 0 ? (
          <div className="il-fravaer-empty">
            {recordSearch || selectedHold || showOnlyMissing ? (
              <>
                <Search className="il-fravaer-empty-icon" />
                <p className="il-fravaer-empty-title">Ingen resultater</p>
                <p className="il-fravaer-empty-sub">Prøv at ændre dine filtre</p>
                <button
                  className="il-fravaer-empty-reset"
                  onClick={() => { setRecordSearch(''); setSelectedHold(null); setShowOnlyMissing(false); }}
                >
                  Nulstil filtre
                </button>
              </>
            ) : (
              <>
                <CheckCircle2 className="il-fravaer-empty-icon" />
                <p className="il-fravaer-empty-title">Ingen registreringer</p>
                <p className="il-fravaer-empty-sub">Intet fravær i den valgte periode</p>
              </>
            )}
          </div>
        ) : (
          <div className="il-fravaer-records-list">
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
            className="il-fravaer-show-more"
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
        <div className="il-fravaer-loading-overlay">
          <Loader2 size={24} className="il-fravaer-spinner" />
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
      className="il-fravaer-attention-item"
      style={{ '--hold-hue': hue } as any}
    >
      <div className="il-fravaer-attention-item-copy">
        <div className="il-fravaer-attention-item-top">
          <span className="il-fravaer-attention-item-date">{record.date || record.uge}</span>
          {record.module && (
            <span className="il-fravaer-attention-item-module">{record.module}</span>
          )}
          <span className="il-fravaer-attention-item-pct" style={{ color: absenceColor(record.fravaerPct) }}>
            {record.fravaerPct}%
          </span>
        </div>

        <div className="il-fravaer-attention-item-meta">
          {holdName && (
            <span className="il-fravaer-attention-item-hold" style={{ '--hold-hue': hue } as any}>
              {holdName}
            </span>
          )}
          {secondaryText && (
            <span className="il-fravaer-attention-item-secondary">{secondaryText}</span>
          )}
        </div>

        {detailText && (
          <p className="il-fravaer-attention-item-note">{detailText}</p>
        )}
      </div>

      <button
        className="il-fravaer-attention-item-edit"
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
    <div className="il-fravaer-donut-card">
      <div className="il-fravaer-donut-chart">
        <ResponsiveContainer width={120} height={120}>
          <PieChart>
            <Pie
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
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="il-fravaer-donut-center" style={{ color }}>
          {formatPct(pct)}
        </div>
      </div>
      <div className="il-fravaer-donut-info">
        <span className="il-fravaer-donut-label">{label}</span>
        {detail && <span className="il-fravaer-donut-detail">{detail}</span>}
        {subLabel && <span className="il-fravaer-donut-sub">{subLabel}</span>}
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

  return (
    <div className="il-fravaer-distribution-card">
      <div className="il-fravaer-distribution-top">
        <div className="il-fravaer-distribution-copy">
          <h3 className="il-fravaer-distribution-title">Fordeling af fravær</h3>
          <p className="il-fravaer-distribution-subtitle">
            Se hvilke fag dit opgjorte fravær fylder mest i.
          </p>
          {topSubject && (
            <p className="il-fravaer-distribution-highlight">
              Mest i <strong>{topSubject.label}</strong> med {formatPct(topSubject.share)}
            </p>
          )}
        </div>

        {hasWrittenDistribution && (
          <div className="il-fravaer-view-toggle">
            <button
              className={`il-fravaer-view-btn${metric === 'alm' ? ' is-active' : ''}`}
              onClick={() => onMetricChange('alm')}
            >
              Almindeligt
            </button>
            <button
              className={`il-fravaer-view-btn${metric === 'skr' ? ' is-active' : ''}`}
              onClick={() => onMetricChange('skr')}
            >
              Skriftligt
            </button>
          </div>
        )}
      </div>

      {items.length > 0 ? (
        <div className="il-fravaer-distribution-body">
          <div className="il-fravaer-distribution-chart-wrap">
            <div className="il-fravaer-distribution-chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={items}
                    dataKey="amount"
                    nameKey="label"
                    innerRadius={58}
                    outerRadius={88}
                    startAngle={90}
                    endAngle={-270}
                    paddingAngle={items.length > 1 ? 2 : 0}
                    stroke="none"
                  >
                    {items.map((item) => (
                      <Cell
                        key={item.label}
                        fill={`oklch(0.68 0.14 ${item.hue})`}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              <div className="il-fravaer-distribution-center">
                <span className="il-fravaer-distribution-center-value">{formatNumber(totalAmount)}</span>
                <span className="il-fravaer-distribution-center-unit">{unitShort}</span>
                <span className="il-fravaer-distribution-center-meta">
                  ud af {formatNumber(totalPossible)}
                </span>
              </div>
            </div>
          </div>

          <div className="il-fravaer-distribution-list">
            {items.map((item) => (
              <div key={item.label} className="il-fravaer-distribution-item">
                <span
                  className="il-fravaer-distribution-dot"
                  style={{ '--hold-hue': item.hue } as any}
                />
                <div className="il-fravaer-distribution-item-copy">
                  <div className="il-fravaer-distribution-item-row">
                    <span className="il-fravaer-distribution-item-label">{item.label}</span>
                    <span className="il-fravaer-distribution-item-share">{formatPct(item.share)}</span>
                  </div>
                  <div className="il-fravaer-distribution-item-detail">
                    {formatNumber(item.amount)}/{formatNumber(item.total)} {unitLong}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="il-fravaer-distribution-empty">
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
      className={`il-fravaer-th${isActive ? ' is-sorted' : ''}`}
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
    <div className="il-fravaer-pct-cell">
      {pct && (
        <>
          <span className="il-fravaer-pct-bar-bg">
            <span
              className="il-fravaer-pct-bar-fill"
              style={{ width: `${Math.min(num, 100)}%`, background: color }}
            />
          </span>
          <span className="il-fravaer-pct-value" style={{ color }}>{pct}</span>
          {detail && <span className="il-fravaer-pct-detail">{detail}</span>}
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
      className={`il-fravaer-record${isMissing ? ' is-missing' : ''}${record.fravaerType === 'godskrevet' ? ' is-godskrevet' : ''}`}
      style={{ '--hold-hue': hue } as any}
    >
      <div className="il-fravaer-record-main">
        <div className="il-fravaer-record-left">
          <div className="il-fravaer-record-top">
            <span className="il-fravaer-record-date">{record.date || record.uge}</span>
            {record.module && (
              <span className="il-fravaer-record-module">{record.module}</span>
            )}
            <span className="il-fravaer-record-pct" style={{ color: absenceColor(record.fravaerPct) }}>
              {record.fravaerPct}%
            </span>
          </div>
          <div className="il-fravaer-record-details">
            {holdName && (
              <span className="il-fravaer-record-hold" style={{ '--hold-hue': hue } as any}>
                {holdName}
              </span>
            )}
            {record.teacher && (
              <span className="il-fravaer-record-teacher">{record.teacher}</span>
            )}
            {record.room && (
              <span className="il-fravaer-record-room">{record.room}</span>
            )}
          </div>
        </div>
        <div className="il-fravaer-record-right">
          {record.fravaerType === 'godskrevet' && (
            <span className="il-fravaer-record-godskrevet">
              <CheckCircle2 size={13} />
              Godskrevet
            </span>
          )}
          {record.aarsag && (
            <span className="il-fravaer-record-aarsag">{record.aarsag}</span>
          )}
          {isMissing && (
            <span className="il-fravaer-record-no-aarsag">
              <AlertTriangle size={12} />
              Mangler årsag
            </span>
          )}
          {record.editUrl && (
            <button
              className="il-fravaer-record-edit"
              onClick={(e) => { e.stopPropagation(); onEdit(record); }}
              title="Rediger årsag"
            >
              <Edit3 size={13} />
            </button>
          )}
        </div>
      </div>
      {(record.bemaerkning || record.note) && (
        <div className="il-fravaer-record-extra">
          {record.bemaerkning && (
            <span className="il-fravaer-record-bemærkning">
              <Info size={12} />
              {record.bemaerkning}
            </span>
          )}
          {record.note && (
            <span className="il-fravaer-record-note">{record.note}</span>
          )}
        </div>
      )}
    </div>
  );
}
