import { useEffect, useMemo, useState } from 'preact/hooks';
import { ChevronDown, AlertCircle, RefreshCw, TrendingUp, TrendingDown, Minus, Users } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { getFullHoldDisplayName, getHoldDisplayName, getHoldHue, registerHold } from '@/lib/hold-mapping';
import {
  fetchAllModulregnskaber,
  type ModulregnskabData,
  type ModulregnskabRow,
} from '@/lib/modulregnskab-fetch';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: ModulregnskabData[] };

function parseAfvigelse(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/%/g, '').replace(',', '.').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function afvigelseSeverity(raw: string): 'positive' | 'on-track' | 'slight' | 'warn' | 'bad' | 'neutral' {
  const n = parseAfvigelse(raw);
  if (n === null) return 'neutral';
  if (n >= 0) return 'positive';
  const abs = Math.abs(n);
  if (abs < 3) return 'on-track';
  if (abs < 8) return 'slight';
  if (abs < 15) return 'warn';
  return 'bad';
}

const severityClasses: Record<ReturnType<typeof afvigelseSeverity>, string> = {
  'positive': 'text-emerald-700 bg-emerald-500/10 dark:text-emerald-300',
  'on-track': 'text-emerald-700 bg-emerald-500/10 dark:text-emerald-300',
  'slight': 'text-amber-700 bg-amber-500/10 dark:text-amber-300',
  'warn': 'text-orange-700 bg-orange-500/10 dark:text-orange-300',
  'bad': 'text-red-700 bg-red-500/10 dark:text-red-300',
  'neutral': 'text-muted-foreground bg-muted/40',
};

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
  const progressTarget = Math.max(total, norm ?? 0, 1);
  const heldPct = Math.min(100, (afholdt / progressTarget) * 100);
  const plannedPct = Math.min(100, (planlagt / progressTarget) * 100);
  const sev = afvigelseSeverity(row?.afvigelse ?? '');
  const afvigelseNum = parseAfvigelse(row?.afvigelse ?? '');

  const Icon = afvigelseNum === null
    ? Minus
    : afvigelseNum >= 0
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
          <div className="flex items-start justify-between gap-3 mb-3">
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
                {row.afvigelse}
              </span>
            )}
          </div>

          {row ? (
            <>
              {/* Progress bar */}
              <div className="relative h-2 rounded-full bg-muted/40 overflow-hidden mb-2">
                <div
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${heldPct}%`,
                    backgroundColor: `oklch(0.62 0.16 ${hue})`,
                  }}
                />
                <div
                  className="absolute inset-y-0"
                  style={{
                    left: `${heldPct}%`,
                    width: `${plannedPct}%`,
                    backgroundColor: `oklch(0.62 0.16 ${hue} / 0.3)`,
                  }}
                />
                {norm !== null && norm > 0 && norm <= progressTarget && (
                  <div
                    className="absolute inset-y-0 w-0.5 bg-foreground/30"
                    style={{ left: `${(norm / progressTarget) * 100}%` }}
                    title={t('modulregnskaberPage.holdnormTitle', { n: String(norm) })}
                  />
                )}
              </div>

              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">{t('modulregnskaberPage.labelAfholdt')}</dt>
                  <dd className="font-medium tabular-nums">{afholdt}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('modulregnskaberPage.labelPlanlagt')}</dt>
                  <dd className="font-medium tabular-nums">{planlagt}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('modulregnskaberPage.labelTotal')}</dt>
                  <dd className="font-medium tabular-nums">{total}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('modulregnskaberPage.labelHoldnorm')}</dt>
                  <dd className="font-medium tabular-nums">{norm ?? '–'}</dd>
                </div>
              </dl>

              {teacherRows.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-[color] duration-150 cursor-pointer"
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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState({ kind: 'loading' });
      try {
        const { data } = await fetchAllModulregnskaber(schoolId);
        if (cancelled) return;
        // Register each hold so color/hue reflects settings
        for (const d of data) registerHold(d.holdName);
        setState({ kind: 'ready', data });
      } catch (err) {
        if (cancelled) return;
        setState({
            kind: 'error',
            message: err instanceof Error ? err.message : t('modulregnskaberPage.fetchError'),
          });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  const summary = useMemo(() => {
    if (state.kind !== 'ready') return null;
    let afholdt = 0;
    let planlagt = 0;
    let norm = 0;
    let holdCount = 0;
    let warnings = 0;
    for (const d of state.data) {
      const r = d.holdRow;
      if (!r) continue;
      holdCount++;
      afholdt += (r.undervisningAfholdt ?? 0) + (r.andenAfholdt ?? 0);
      planlagt += (r.undervisningPlanlagt ?? 0) + (r.andenPlanlagt ?? 0);
      norm += r.norm ?? 0;
      const sev = afvigelseSeverity(r.afvigelse ?? '');
      if (sev === 'warn' || sev === 'bad') warnings++;
    }
    return { afholdt, planlagt, norm, holdCount, total: afholdt + planlagt, warnings };
  }, [state]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{t('modulregnskaberPage.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('modulregnskaberPage.subtitle')}
        </p>
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
              onClick={() => setState({ kind: 'loading' })}
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
          <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryStat label={t('modulregnskaberPage.labelHold')} value={summary.holdCount} />
            <SummaryStat label={t('modulregnskaberPage.labelAfholdt')} value={summary.afholdt} />
            <SummaryStat label={t('modulregnskaberPage.labelPlanlagt')} value={summary.planlagt} />
            <SummaryStat label={t('modulregnskaberPage.labelSamletNorm')} value={summary.norm} />
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
