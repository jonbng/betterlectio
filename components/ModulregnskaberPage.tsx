import { useEffect, useMemo, useState } from 'preact/hooks';
import { ChevronDown, AlertCircle, RefreshCw, TrendingUp, TrendingDown, Minus, Users } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { getFullHoldDisplayName, getHoldDisplayName, getHoldHue, registerHold } from '@/lib/hold-mapping';
import {
  fetchAllModulregnskaber,
  getCachedAllModulregnskaber,
  MODULREGNSKAB_FRESH_MS,
  type ModulregnskabData,
  type ModulregnskabRow,
} from '@/lib/modulregnskab-fetch';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: ModulregnskabData[]; refreshing: boolean };

type Severity = 'positive' | 'on-track' | 'slight' | 'warn' | 'bad' | 'neutral';

const AFVIGELSE_VISUAL_CLAMP = 20;

function parseAfvigelse(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/%/g, '').replace(',', '.').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function afvigelseSeverity(raw: string): Severity {
  const n = parseAfvigelse(raw);
  if (n === null) return 'neutral';
  const abs = Math.abs(n);
  if (abs < 3) return 'on-track';
  if (n > 0) return 'positive';
  if (abs < 8) return 'slight';
  if (abs < 15) return 'warn';
  return 'bad';
}

const severityClasses: Record<Severity, string> = {
  'positive': 'text-emerald-700 bg-emerald-500/10 dark:text-emerald-300',
  'on-track': 'text-sky-700 bg-sky-500/10 dark:text-sky-300',
  'slight': 'text-amber-700 bg-amber-500/10 dark:text-amber-300',
  'warn': 'text-orange-700 bg-orange-500/10 dark:text-orange-300',
  'bad': 'text-red-700 bg-red-500/10 dark:text-red-300',
  'neutral': 'text-muted-foreground bg-muted/40',
};

const severityMarkerColor: Record<Severity, string> = {
  'positive': 'oklch(0.68 0.16 145)',
  'on-track': 'oklch(0.62 0.15 235)',
  'slight': 'oklch(0.74 0.15 80)',
  'warn': 'oklch(0.7 0.17 50)',
  'bad': 'oklch(0.62 0.2 25)',
  'neutral': 'oklch(0.6 0.01 285)',
};

function formatSignedPercent(n: number): string {
  const abs = Math.abs(n).toFixed(1).replace('.', ',').replace(/,0$/, '');
  if (n > 0) return `+${abs} %`;
  if (n < 0) return `−${abs} %`;
  return '0 %';
}

function AfholdtMeter({
  afholdt,
  planlagt,
  total,
  norm,
  hue,
  normTitle,
}: {
  afholdt: number;
  planlagt: number;
  total: number;
  norm: number | null;
  hue: number;
  normTitle: string;
}) {
  const progressTarget = Math.max(total, norm ?? 0, 1);
  const heldPct = Math.min(100, (afholdt / progressTarget) * 100);
  const plannedPct = Math.min(100, (planlagt / progressTarget) * 100);
  const normPct = norm !== null && norm > 0 && norm <= progressTarget
    ? (norm / progressTarget) * 100
    : null;

  return (
    <div className="relative h-2 rounded-full bg-muted/40 overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 transition-[width] duration-500 ease-out"
        style={{
          width: `${heldPct}%`,
          backgroundColor: `oklch(0.62 0.16 ${hue})`,
        }}
      />
      <div
        className="absolute inset-y-0 transition-[left,width] duration-500 ease-out"
        style={{
          left: `${heldPct}%`,
          width: `${plannedPct}%`,
          backgroundColor: `oklch(0.62 0.16 ${hue} / 0.3)`,
        }}
      />
      {normPct !== null && (
        <div
          className="absolute inset-y-0 w-0.5 bg-foreground/30"
          style={{ left: `${normPct}%` }}
          title={normTitle}
        />
      )}
    </div>
  );
}

function AfvigelseMeter({
  value,
  severity,
}: {
  value: number | null;
  severity: Severity;
}) {
  const color = severityMarkerColor[severity];

  if (value === null) {
    return (
      <div className="relative h-2 rounded-full bg-muted/40 overflow-hidden">
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-foreground/20" />
      </div>
    );
  }

  const clamped = Math.max(-AFVIGELSE_VISUAL_CLAMP, Math.min(AFVIGELSE_VISUAL_CLAMP, value));
  const offsetPct = (clamped / AFVIGELSE_VISUAL_CLAMP) * 50;

  let fillLeft: number;
  let fillWidth: number;
  if (offsetPct >= 0) {
    fillLeft = 50;
    fillWidth = offsetPct;
  } else {
    fillLeft = 50 + offsetPct;
    fillWidth = -offsetPct;
  }

  const markerLeft = 50 + offsetPct;
  const isClamped = Math.abs(value) > AFVIGELSE_VISUAL_CLAMP;

  return (
    <div className="relative h-2 rounded-full bg-muted/40 overflow-visible">
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-foreground/30" />
      <div
        className="absolute inset-y-0 transition-[left,width,background-color] duration-500 ease-out rounded-full"
        style={{
          left: `${fillLeft}%`,
          width: `${fillWidth}%`,
          backgroundColor: `color-mix(in oklch, ${color} 50%, transparent)`,
        }}
      />
      <div
        className={cn(
          'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-1 rounded-full transition-[left,background-color] duration-500 ease-out',
          isClamped && 'h-4 w-1.5',
        )}
        style={{
          left: `${markerLeft}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}

function HoldCard({ data }: { data: ModulregnskabData }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const hue = getHoldHue(data.holdName);
  const displayName = getHoldDisplayName(data.holdName);
  const fullName = getFullHoldDisplayName(data.holdName);
  const row = data.holdRow;
  const teacherRows = useMemo(
    () => data.breakdown.filter((r) => r.kind === 'teacher' && (r.total ?? 0) > 0),
    [data.breakdown],
  );

  const afholdt = (row?.undervisningAfholdt ?? 0) + (row?.andenAfholdt ?? 0);
  const planlagt = (row?.undervisningPlanlagt ?? 0) + (row?.andenPlanlagt ?? 0);
  const total = row?.total ?? afholdt + planlagt;
  const norm = row?.norm ?? null;
  const sev = afvigelseSeverity(row?.afvigelse ?? '');
  const afvigelseNum = parseAfvigelse(row?.afvigelse ?? '');
  const afvigelseDisplay = afvigelseNum === null
    ? row?.afvigelse?.trim() || '–'
    : formatSignedPercent(afvigelseNum);

  const Icon = afvigelseNum === null || sev === 'on-track'
    ? Minus
    : afvigelseNum > 0
      ? TrendingUp
      : TrendingDown;

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden transition-[border-color,background-color] duration-150 hover:border-border">
      <div className="flex items-stretch">
        <div
          className="w-1.5 shrink-0"
          style={{ backgroundColor: `oklch(0.65 0.15 ${hue})` }}
        />
        <div className="flex-1 min-w-0 p-4">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-foreground truncate">
                {displayName || data.holdName}
              </h3>
              {fullName !== displayName && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {fullName}
                </p>
              )}
            </div>
            {row?.afvigelse && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium tabular-nums shrink-0',
                  severityClasses[sev],
                )}
                title={t('modulregnskaberPage.deviationTitle')}
              >
                <Icon className="size-3" />
                {afvigelseDisplay}
              </span>
            )}
          </div>

          {row ? (
            <>
              <div className="grid grid-cols-2 gap-x-5 gap-y-2">
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('modulregnskaberPage.labelAfholdt')}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {Math.round((afholdt / Math.max(total || norm || 1, 1)) * 100)}%
                    </span>
                  </div>
                  <AfholdtMeter
                    afholdt={afholdt}
                    planlagt={planlagt}
                    total={total}
                    norm={norm}
                    hue={hue}
                    normTitle={t('modulregnskaberPage.holdnormTitle', { n: String(norm ?? 0) })}
                  />
                  <div className="mt-1.5 flex items-baseline justify-between text-xs tabular-nums">
                    <span className="text-foreground font-medium">
                      {t('modulregnskaberPage.afholdtOf', { held: String(afholdt), total: String(total) })}
                    </span>
                    {norm !== null && (
                      <span className="text-muted-foreground">
                        {t('modulregnskaberPage.normShort', { n: String(norm) })}
                      </span>
                    )}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('modulregnskaberPage.labelAfvigelse')}
                    </span>
                    {afvigelseNum !== null && (
                      <span
                        className="text-xs tabular-nums"
                        style={{ color: severityMarkerColor[sev] }}
                      >
                        {sev === 'on-track'
                          ? t('modulregnskaberPage.onTrack')
                          : afvigelseNum > 0
                            ? t('modulregnskaberPage.ahead')
                            : t('modulregnskaberPage.behind')}
                      </span>
                    )}
                  </div>
                  <AfvigelseMeter value={afvigelseNum} severity={sev} />
                  <div className="mt-1.5 flex items-baseline justify-between text-xs tabular-nums">
                    <span
                      className="font-medium"
                      style={{
                        color: afvigelseNum === null
                          ? undefined
                          : severityMarkerColor[sev],
                      }}
                    >
                      {afvigelseDisplay}
                    </span>
                    {planlagt > 0 && (
                      <span className="text-muted-foreground">
                        {t('modulregnskaberPage.planlagtShort', { n: String(planlagt) })}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {teacherRows.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="mt-4 flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-[color] duration-150 cursor-pointer"
                >
                  <Users className="size-3.5" />
                  <span>{teacherRows.length === 1 ? t('modulregnskaberPage.teacherSingular', { n: String(teacherRows.length) }) : t('modulregnskaberPage.teacherPlural', { n: String(teacherRows.length) })}</span>
                  <ChevronDown
                    className={cn(
                      'size-3.5 transition-transform duration-200',
                      expanded && 'rotate-180',
                    )}
                  />
                </button>
              )}

              {expanded && teacherRows.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                  {teacherRows.map((tr, i) => (
                    <TeacherRow key={`${tr.label}-${i}`} row={tr} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t('modulregnskaberPage.noData')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TeacherRow({ row }: { row: ModulregnskabRow }) {
  const { t } = useTranslation();
  const afholdt = (row.undervisningAfholdt ?? 0) + (row.andenAfholdt ?? 0);
  const planlagt = (row.undervisningPlanlagt ?? 0) + (row.andenPlanlagt ?? 0);
  const total = row.total ?? afholdt + planlagt;

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-foreground/80 truncate">{row.label}</span>
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
        {t('modulregnskaberPage.teacherAfholdt', { n: String(afholdt) })}
        {planlagt > 0 && <span> · {t('modulregnskaberPage.teacherPlanlagt', { n: String(planlagt) })}</span>}
        {total > 0 && <span className="ml-2 text-foreground font-medium">{total}</span>}
      </span>
    </div>
  );
}

interface ModulregnskaberPageProps {
  schoolId: string;
}

export function ModulregnskaberPage({ schoolId }: ModulregnskaberPageProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const cached = getCachedAllModulregnskaber(schoolId);
    const fresh = cached && cached.complete && Date.now() - cached.fetchedAt < MODULREGNSKAB_FRESH_MS;

    if (cached) {
      for (const d of cached.data) registerHold(d.holdName);
      setState({ kind: 'ready', data: cached.data, refreshing: !fresh });
    } else {
      setState({ kind: 'loading' });
    }

    if (fresh) return () => { cancelled = true; };

    (async () => {
      try {
        const { data } = await fetchAllModulregnskaber(schoolId);
        if (cancelled) return;
        for (const d of data) registerHold(d.holdName);
        setState({ kind: 'ready', data, refreshing: false });
      } catch (err) {
        if (cancelled) return;
        if (cached) {
          setState({ kind: 'ready', data: cached.data, refreshing: false });
        } else {
          setState({
            kind: 'error',
            message: err instanceof Error ? err.message : t('modulregnskaberPage.fetchError'),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [schoolId, reloadKey]);

  const summary = useMemo(() => {
    if (state.kind !== 'ready') return null;
    let afholdt = 0;
    let planlagt = 0;
    let norm = 0;
    let holdCount = 0;
    let warnings = 0;
    let weightedAfvigelseSum = 0;
    let afvigelseWeight = 0;
    for (const d of state.data) {
      const r = d.holdRow;
      if (!r) continue;
      holdCount++;
      const held = (r.undervisningAfholdt ?? 0) + (r.andenAfholdt ?? 0);
      const planned = (r.undervisningPlanlagt ?? 0) + (r.andenPlanlagt ?? 0);
      afholdt += held;
      planlagt += planned;
      norm += r.norm ?? 0;
      const sev = afvigelseSeverity(r.afvigelse ?? '');
      if (sev === 'warn' || sev === 'bad') warnings++;
      const afv = parseAfvigelse(r.afvigelse ?? '');
      if (afv !== null) {
        const weight = r.norm ?? r.total ?? held + planned;
        if (weight > 0) {
          weightedAfvigelseSum += afv * weight;
          afvigelseWeight += weight;
        }
      }
    }
    const afvigelseAvg = afvigelseWeight > 0 ? weightedAfvigelseSum / afvigelseWeight : null;
    return {
      afholdt,
      planlagt,
      norm,
      holdCount,
      total: afholdt + planlagt,
      warnings,
      afvigelseAvg,
    };
  }, [state]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-foreground">{t('modulregnskaberPage.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('modulregnskaberPage.subtitle')}
          </p>
        </div>
        {state.kind === 'ready' && state.refreshing && (
          <div className="shrink-0 inline-flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
            <RefreshCw className="size-3.5 animate-spin" />
            <span>{t('modulregnskaberPage.refreshing')}</span>
          </div>
        )}
      </header>

      {state.kind === 'loading' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-40 rounded-xl border border-border/60 bg-card animate-pulse"
            />
          ))}
        </div>
      )}

      {state.kind === 'error' && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 flex items-start gap-3">
          <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h2 className="font-medium text-foreground">{t('modulregnskaberPage.errorTitle')}</h2>
            <p className="text-sm text-muted-foreground mt-1">{state.message}</p>
            <button
              type="button"
              onClick={() => {
                setState({ kind: 'loading' });
                setReloadKey((k) => k + 1);
              }}
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline cursor-pointer"
            >
              <RefreshCw className="size-3.5" /> {t('modulregnskaberPage.retry')}
            </button>
          </div>
        </div>
      )}

      {state.kind === 'ready' && summary && state.data.length === 0 && (
        <div className="rounded-xl border border-border/60 bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">{t('modulregnskaberPage.noHolds')}</p>
        </div>
      )}

      {state.kind === 'ready' && summary && state.data.length > 0 && (
        <>
          <section className="mb-6 grid grid-cols-2 md:grid-cols-5 gap-3">
            <SummaryStat label={t('modulregnskaberPage.labelHold')} value={summary.holdCount} />
            <SummaryStat label={t('modulregnskaberPage.labelAfholdt')} value={summary.afholdt} />
            <SummaryStat label={t('modulregnskaberPage.labelPlanlagt')} value={summary.planlagt} />
            <SummaryStat label={t('modulregnskaberPage.labelSamletNorm')} value={summary.norm} />
            {summary.afvigelseAvg !== null ? (
              <SummaryAfvigelseStat
                label={t('modulregnskaberPage.labelAvgAfvigelse')}
                value={summary.afvigelseAvg}
              />
            ) : (
              <SummaryStat label={t('modulregnskaberPage.labelAvgAfvigelse')} value={0} />
            )}
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {state.data
              .slice()
              .sort((a, b) => a.holdName.localeCompare(b.holdName, 'da'))
              .map((d) => (
                <HoldCard key={d.holdelementId} data={d} />
              ))}
          </section>
        </>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}

function SummaryAfvigelseStat({ label, value }: { label: string; value: number }) {
  const abs = Math.abs(value);
  const sev: Severity = abs < 3
    ? 'on-track'
    : value > 0
      ? 'positive'
      : abs < 8
        ? 'slight'
        : abs < 15
          ? 'warn'
          : 'bad';
  const color = severityMarkerColor[sev];
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className="mt-1 text-2xl font-semibold tabular-nums"
        style={{ color }}
      >
        {formatSignedPercent(value)}
      </dd>
    </div>
  );
}
