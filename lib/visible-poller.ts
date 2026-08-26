export interface VisiblePollerEnvironment {
  window?: EventTarget;
  document?: EventTarget & { visibilityState?: string };
  setTimeout?: (callback: () => void, delay: number) => number;
  clearTimeout?: (timer: number) => void;
}

export interface VisiblePollerOptions extends VisiblePollerEnvironment {
  intervalMs?: number;
}

/**
 * Refreshes immediately and at a fixed cadence while a document is visible.
 * Focus and visibility return refresh immediately and restart that cadence.
 */
export function installVisiblePoller(
  refresh: () => void | Promise<unknown>,
  options: VisiblePollerOptions = {},
): () => void {
  const pollWindow = options.window ?? window;
  const pollDocument = options.document ?? document;
  const scheduleTimeout = options.setTimeout
    ?? ((callback: () => void, delay: number) => globalThis.setTimeout(callback, delay) as unknown as number);
  const cancelTimeout = options.clearTimeout
    ?? ((timer: number) => globalThis.clearTimeout(timer));
  const intervalMs = options.intervalMs ?? 60_000;

  let active = true;
  let refreshInFlight = false;
  let timer: number | null = null;

  const isVisible = () => pollDocument.visibilityState === 'visible';

  const clearSchedule = () => {
    if (timer === null) return;
    cancelTimeout(timer);
    timer = null;
  };

  const refreshIfPossible = () => {
    if (!active || !isVisible() || refreshInFlight) return;

    refreshInFlight = true;
    try {
      const result = refresh();
      if (!result || typeof (result as Promise<unknown>).then !== 'function') {
        refreshInFlight = false;
        return;
      }
      Promise.resolve(result).then(
        () => { refreshInFlight = false; },
        () => {
          // Keep the current UI state; the next scheduled attempt can recover.
          refreshInFlight = false;
        },
      );
    } catch {
      refreshInFlight = false;
    }
  };

  const scheduleNext = () => {
    clearSchedule();
    if (!active || !isVisible()) return;

    timer = scheduleTimeout(() => {
      timer = null;
      refreshIfPossible();
      scheduleNext();
    }, intervalMs);
  };

  const refreshAndResetCadence = () => {
    if (!isVisible()) return;
    scheduleNext();
    refreshIfPossible();
  };

  const onVisibilityChange = () => {
    if (isVisible()) refreshAndResetCadence();
    else clearSchedule();
  };

  pollWindow.addEventListener('focus', refreshAndResetCadence);
  pollDocument.addEventListener('visibilitychange', onVisibilityChange);
  refreshAndResetCadence();

  return () => {
    active = false;
    clearSchedule();
    pollWindow.removeEventListener('focus', refreshAndResetCadence);
    pollDocument.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
