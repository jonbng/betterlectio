import { useEffect, useMemo, useState } from 'preact/hooks';
import { AlertCircle, DoorOpen, RefreshCw } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { getScheduleUrl } from '@/lib/findskema-storage';
import {
  fetchLokalerOccupancy,
  getCachedLokalerOccupancy,
  LOKALER_FRESH_MS,
  type RoomWithOccupancy,
} from '@/lib/lokaler-occupancy';

type OccupancyFilter = 'all' | 'free' | 'busy';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; rooms: RoomWithOccupancy[]; refreshing: boolean };

interface LokalerPageProps {
  schoolId: string;
}

export function LokalerPage({ schoolId }: LokalerPageProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [filter, setFilter] = useState<OccupancyFilter>('free');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const cached = getCachedLokalerOccupancy(schoolId);
    const fresh = cached && Date.now() - cached.fetchedAt < LOKALER_FRESH_MS;

    if (cached) {
      setState({ kind: 'ready', rooms: cached.value, refreshing: !fresh });
    } else {
      setState({ kind: 'loading' });
    }

    if (fresh) return () => { cancelled = true; };

    (async () => {
      try {
        const rooms = await fetchLokalerOccupancy(schoolId);
        if (cancelled) return;
        setState({ kind: 'ready', rooms, refreshing: false });
      } catch (err) {
        if (cancelled) return;
        if (cached) {
          setState({ kind: 'ready', rooms: cached.value, refreshing: false });
        } else {
          setState({
            kind: 'error',
            message: err instanceof Error ? err.message : t('lokalerPage.fetchError'),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [schoolId, reloadKey]);

  const counts = useMemo(() => {
    if (state.kind !== 'ready') return { all: 0, free: 0, busy: 0 };
    let free = 0;
    let busy = 0;
    for (const room of state.rooms) {
      if (room.inUse) busy++;
      else free++;
    }
    return { all: state.rooms.length, free, busy };
  }, [state]);

  const visibleRooms = useMemo(() => {
    if (state.kind !== 'ready') return [];
    const filtered = state.rooms.filter((room) => {
      if (filter === 'free') return !room.inUse;
      if (filter === 'busy') return room.inUse;
      return true;
    });
    return filtered.slice().sort((a, b) => {
      if (a.inUse !== b.inUse) return a.inUse ? 1 : -1;
      return a.shortName.localeCompare(b.shortName, 'da');
    });
  }, [state, filter]);

  const retry = () => {
    setState({ kind: 'loading' });
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-foreground">{t('lokalerPage.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('lokalerPage.subtitle')}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2 mt-1">
          {state.kind === 'ready' && state.refreshing && (
            <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="size-3.5 animate-spin" />
              <span>{t('lokalerPage.refreshing')}</span>
            </div>
          )}
          {state.kind === 'ready' && !state.refreshing && (
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-[color,background-color] duration-150 cursor-pointer"
              title={t('lokalerPage.refresh')}
            >
              <RefreshCw className="size-3.5" />
              {t('lokalerPage.refresh')}
            </button>
          )}
        </div>
      </header>

      {state.kind === 'loading' && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-14 rounded-xl border border-border/60 bg-card animate-pulse"
            />
          ))}
        </div>
      )}

      {state.kind === 'error' && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 flex items-start gap-3">
          <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h2 className="font-medium text-foreground">{t('lokalerPage.errorTitle')}</h2>
            <p className="text-sm text-muted-foreground mt-1">{state.message}</p>
            <button
              type="button"
              onClick={retry}
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline cursor-pointer"
            >
              <RefreshCw className="size-3.5" /> {t('lokalerPage.retry')}
            </button>
          </div>
        </div>
      )}

      {state.kind === 'ready' && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <FilterChip
              active={filter === 'all'}
              onClick={() => setFilter('all')}
              label={t('lokalerPage.filterAll')}
              count={counts.all}
            />
            <FilterChip
              active={filter === 'free'}
              onClick={() => setFilter('free')}
              label={t('lokalerPage.filterFree')}
              count={counts.free}
              tone="free"
            />
            <FilterChip
              active={filter === 'busy'}
              onClick={() => setFilter('busy')}
              label={t('lokalerPage.filterBusy')}
              count={counts.busy}
              tone="busy"
            />
          </div>

          {state.rooms.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-card p-10 text-center">
              <DoorOpen className="size-8 text-muted-foreground mx-auto mb-3 opacity-60" />
              <p className="text-sm text-muted-foreground">{t('lokalerPage.empty')}</p>
            </div>
          ) : visibleRooms.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-card p-10 text-center">
              <p className="text-sm text-muted-foreground">
                {filter === 'free'
                  ? t('lokalerPage.emptyFree')
                  : filter === 'busy'
                    ? t('lokalerPage.emptyBusy')
                    : t('lokalerPage.empty')}
              </p>
            </div>
          ) : (
            <ul className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/50">
              {visibleRooms.map((room) => {
                const href = getScheduleUrl(`L${room.id}`, schoolId, {
                  name: `${room.shortName} ${room.name}`.trim(),
                });
                return (
                  <li key={room.id}>
                    <a
                      href={href}
                      className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-accent/50 transition-colors duration-150"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate">
                          {room.shortName}
                          <span className="font-normal text-muted-foreground">
                            {' '}· {room.name}
                          </span>
                        </div>
                      </div>
                      <OccupancyBadge inUse={room.inUse} />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone?: 'free' | 'busy';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-[background-color,border-color,color] duration-150 cursor-pointer',
        active
          ? tone === 'free'
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : tone === 'busy'
              ? 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300'
              : 'border-border bg-accent text-foreground'
          : 'border-border/60 bg-card text-muted-foreground hover:text-foreground hover:bg-accent/50',
      )}
    >
      {label}
      <span className="tabular-nums text-xs opacity-80">{count}</span>
    </button>
  );
}

function OccupancyBadge({ inUse }: { inUse: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'shrink-0 inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        inUse
          ? 'bg-orange-500/10 text-orange-700 dark:text-orange-300'
          : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      )}
    >
      {inUse ? t('lokalerPage.inUse') : t('lokalerPage.free')}
    </span>
  );
}
