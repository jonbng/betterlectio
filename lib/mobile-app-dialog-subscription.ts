type AsyncOperation = () => void | Promise<unknown>;
const RETRY_DELAY_MS = 2_000;

export interface MobileAppInviteDialogSubscriptionOptions {
  channel: string;
  subscribe: AsyncOperation;
  unsubscribe: AsyncOperation;
  /** Reconcile any row update that landed before the socket joined. */
  onReady?: AsyncOperation;
  /** Injectable only to keep retry behavior deterministic in focused tests. */
  setTimeout?: (callback: () => void, delay: number) => number;
  clearTimeout?: (timer: number) => void;
}

/** A Realtime channel name must be private to one visible dialog instance. */
export function createMobileAppInviteChannel(schoolId: string, studentId: string): string {
  const token = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `mobile-app-invite:${schoolId}:${studentId}:${token}`;
}

/**
 * Owns one dialog's Realtime subscription. If a close wins the asynchronous
 * subscribe race, it unsubscribes immediately and again once subscribe has
 * settled, so a delayed subscribe cannot leak a background channel.
 */
export function createMobileAppInviteDialogSubscription(
  options: MobileAppInviteDialogSubscriptionOptions,
): { open: () => void; close: () => void } {
  let open = false;
  let generation = 0;
  let retryTimer: number | null = null;
  const scheduleTimeout = options.setTimeout
    ?? ((callback: () => void, delay: number) => globalThis.setTimeout(callback, delay) as unknown as number);
  const cancelTimeout = options.clearTimeout
    ?? ((timer: number) => globalThis.clearTimeout(timer));

  const clearRetry = () => {
    if (retryTimer === null) return;
    cancelTimeout(retryTimer);
    retryTimer = null;
  };

  const unsubscribeNow = () => {
    try {
      void Promise.resolve(options.unsubscribe()).catch(() => {});
    } catch {
      // Best effort: popup closing must never be blocked by Realtime cleanup.
    }
  };

  const establish = (subscriptionGeneration: number) => {
    if (!open || generation !== subscriptionGeneration) return;
    try {
      void Promise.resolve(options.subscribe())
        .then(() => {
          if (!open || generation !== subscriptionGeneration) {
            unsubscribeNow();
            return;
          }
          try {
            void Promise.resolve(options.onReady?.()).catch(() => {});
          } catch {
            // The active subscription still receives future changes.
          }
        })
        .catch(() => {
          if (!open || generation !== subscriptionGeneration || retryTimer !== null) return;
          retryTimer = scheduleTimeout(() => {
            retryTimer = null;
            establish(subscriptionGeneration);
          }, RETRY_DELAY_MS);
        });
    } catch {
      if (!open || generation !== subscriptionGeneration || retryTimer !== null) return;
      retryTimer = scheduleTimeout(() => {
        retryTimer = null;
        establish(subscriptionGeneration);
      }, RETRY_DELAY_MS);
    }
  };

  return {
    open: () => {
      if (open) return;
      open = true;
      const subscriptionGeneration = ++generation;
      establish(subscriptionGeneration);
    },
    close: () => {
      if (!open) return;
      open = false;
      generation += 1;
      clearRetry();
      unsubscribeNow();
    },
  };
}
