import { createContext, type ComponentChildren } from 'preact';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { AlertTriangle, Loader2, RefreshCw, ShieldAlert, X } from 'lucide-react';

import {
  loadExtensionHealth,
  requestExtensionUpdateCheck,
  type ExtensionHealth,
  type ExtensionHealthIssue,
  type ExtensionUpdateCheckResult,
} from '@/lib/extension-health';
import { cn } from '@/lib/utils';

type HealthContextValue = {
  health: ExtensionHealth | null;
  loading: boolean;
  checking: boolean;
  updateResult: ExtensionUpdateCheckResult | null;
  checkForUpdate: () => Promise<ExtensionUpdateCheckResult>;
};

const HealthContext = createContext<HealthContextValue | null>(null);

export function ExtensionHealthProvider({ children }: { children: ComponentChildren }) {
  const [health, setHealth] = useState<ExtensionHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [updateResult, setUpdateResult] = useState<ExtensionUpdateCheckResult | null>(null);

  useEffect(() => {
    let active = true;
    const load = (force = false) => loadExtensionHealth(force).then((next) => {
      if (active) setHealth(next);
    });
    void load().finally(() => {
      if (active) setLoading(false);
    });
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, 6 * 60 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const checkForUpdate = useCallback(async () => {
    setChecking(true);
    setUpdateResult(null);
    const result = await requestExtensionUpdateCheck();
    setUpdateResult(result);
    setChecking(false);
    return result;
  }, []);

  const value = useMemo(
    () => ({ health, loading, checking, updateResult, checkForUpdate }),
    [health, loading, checking, updateResult, checkForUpdate],
  );

  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>;
}

export function useExtensionHealth() {
  const value = useContext(HealthContext);
  if (!value) throw new Error('useExtensionHealth must be used inside ExtensionHealthProvider');
  return value;
}

function updateResultCopy(result: ExtensionUpdateCheckResult | null) {
  if (!result) return null;
  if (result.status === 'update_available') {
    return `Opdateringen${result.version ? ` ${result.version}` : ''} er fundet. Luk browseren helt og åbn den igen for at installere den.`;
  }
  if (result.status === 'no_update') {
    return 'Browseren har ikke fået opdateringen endnu. Luk den helt, åbn den igen, og prøv senere.';
  }
  if (result.status === 'throttled') {
    return 'Browseren tjekkede for nylig og vil ikke tjekke igen endnu. Luk den helt og åbn den igen.';
  }
  if (result.status === 'unsupported') {
    return 'Denne browser kan ikke tjekke manuelt. Luk browseren helt og åbn den igen.';
  }
  return 'Opdateringstjekket mislykkedes. Luk browseren helt og åbn den igen.';
}

export function ExtensionHealthInlineNotice() {
  const { health, checking, updateResult, checkForUpdate } = useExtensionHealth();
  if (!health || (!health.updateAvailable && health.issues.length === 0)) return null;

  const issue = health.issues[0] ?? null;
  const critical = issue?.severity === 'critical';
  const title = issue?.title ?? 'En nyere version er klar';
  const body = issue?.message ?? (
    health.latestAvailableVersion
      ? `Du bruger ${health.installedVersion}. Version ${health.latestAvailableVersion} indeholder fejlrettelser og forbedringer.`
      : 'En nyere version indeholder fejlrettelser og forbedringer.'
  );
  const resultCopy = updateResultCopy(updateResult);

  return (
    <section
      className={cn(
        'shrink-0 rounded-xl border px-3 py-3 text-left',
        critical
          ? 'border-destructive/25 bg-destructive/8'
          : 'border-amber-500/25 bg-amber-500/8',
      )}
      aria-live="polite"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className={cn('mt-0.5 size-4 shrink-0', critical ? 'text-destructive' : 'text-amber-600 dark:text-amber-400')} />
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-xs font-semibold text-foreground text-balance">{title}</h3>
          <p className="m-0 mt-1 text-xs leading-relaxed text-muted-foreground text-pretty">{body}</p>
          {health.updateAvailable ? (
            <p className="m-0 mt-1.5 text-xs leading-relaxed text-foreground/80 text-pretty">
              {issue?.canUpdateToFix && health.latestAvailableVersion
                ? `Version ${health.latestAvailableVersion} retter dette og indeholder også andre fejlrettelser. `
                : ''}
              Opdateringer installeres automatisk. Luk browseren helt og åbn den igen, eller tjek nu.
            </p>
          ) : null}
          {issue?.workaround ? (
            <p className="m-0 mt-1.5 text-xs leading-relaxed text-foreground/80 text-pretty">
              <span className="font-medium">Midlertidig løsning:</span> {issue.workaround}
            </p>
          ) : null}
          {health.issues.length > 1 ? (
            <p className="m-0 mt-1 text-[11px] text-muted-foreground">
              + {health.issues.length - 1} {health.issues.length === 2 ? 'andet kendt problem' : 'andre kendte problemer'}
            </p>
          ) : null}
          {resultCopy ? <p className="m-0 mt-2 text-xs font-medium text-foreground text-pretty">{resultCopy}</p> : null}
          {(health.updateAvailable || issue?.canUpdateToFix) && !updateResult ? (
            <button
              type="button"
              disabled={checking}
              onClick={() => void checkForUpdate()}
              className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-semibold text-background transition-[opacity,transform] hover:opacity-90 active:scale-[0.96] disabled:opacity-60"
            >
              {checking ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              {checking ? 'Tjekker…' : 'Tjek for opdatering'}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function announcementStorageKey(issue: ExtensionHealthIssue, version: string) {
  return `betterlectio_extension_announcement_v1:${issue.id}:${version}`;
}

export function ExtensionHealthAnnouncement() {
  const { health, checking, updateResult, checkForUpdate } = useExtensionHealth();
  const [issue, setIssue] = useState<ExtensionHealthIssue | null>(null);

  useEffect(() => {
    if (!health) return;
    const candidate = health.issues.find(
      (item) => item.severity === 'critical' && item.showAnnouncement,
    );
    if (!candidate) return;

    const key = announcementStorageKey(candidate, health.installedVersion);
    try {
      const raw = localStorage.getItem(key);
      const state = raw ? JSON.parse(raw) as { snoozedUntil?: number } : null;
      if (state?.snoozedUntil && state.snoozedUntil > Date.now()) return;
    } catch {
      // A broken dismissal record should not suppress an important notice.
    }

    const timer = window.setTimeout(() => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      setIssue(candidate);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [health]);

  if (!health || !issue) return null;

  const snooze = () => {
    const key = announcementStorageKey(issue, health.installedVersion);
    try {
      localStorage.setItem(key, JSON.stringify({
        snoozedUntil: Date.now() + issue.snoozeHours * 60 * 60 * 1000,
      }));
    } catch {
      // Closing still works when storage is unavailable.
    }
    setIssue(null);
  };

  const resultCopy = updateResultCopy(updateResult);
  const dialog = (
    <div className="pointer-events-none fixed inset-x-4 top-20 z-[2147483200] flex justify-center sm:inset-x-auto sm:right-5">
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby="bl-extension-health-title"
        className="pointer-events-auto w-[min(420px,calc(100vw-2rem))] rounded-3xl border border-destructive/20 bg-background p-5 shadow-[0_2px_8px_oklch(0_0_0/0.08),0_24px_72px_oklch(0_0_0/0.22)]"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <ShieldAlert className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-destructive">Vigtigt</p>
            <h2 id="bl-extension-health-title" className="m-0 mt-0.5 text-lg font-semibold tracking-tight text-foreground text-balance">
              {issue.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={snooze}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Påmind mig senere"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="m-0 mt-4 text-sm leading-relaxed text-muted-foreground text-pretty">{issue.message}</p>
        {issue.canUpdateToFix && health.latestAvailableVersion ? (
          <p className="m-0 mt-2 text-sm leading-relaxed text-foreground text-pretty">
            Version {health.latestAvailableVersion} retter dette og indeholder også andre fejlrettelser. Opdateringer installeres automatisk, når browseren genstartes.
          </p>
        ) : null}
        {issue.workaround ? (
          <div className="mt-3 rounded-xl bg-muted/60 px-3.5 py-3 text-sm leading-relaxed text-foreground text-pretty">
            <span className="font-semibold">Midlertidig løsning:</span> {issue.workaround}
          </div>
        ) : null}
        {resultCopy ? (
          <p className="m-0 mt-3 rounded-xl bg-primary/8 px-3.5 py-3 text-sm font-medium leading-relaxed text-foreground text-pretty" role="status">
            {resultCopy}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={snooze}
            className="min-h-11 rounded-xl px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Påmind mig senere
          </button>
          {(health.updateAvailable || issue.canUpdateToFix) && !updateResult ? (
            <button
              type="button"
              disabled={checking}
              onClick={() => void checkForUpdate()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-[opacity,transform] hover:opacity-90 active:scale-[0.96] disabled:opacity-60"
            >
              {checking ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {checking ? 'Tjekker…' : 'Tjek for opdatering'}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );

  return createPortal(dialog, document.getElementById('il-root') || document.body);
}

