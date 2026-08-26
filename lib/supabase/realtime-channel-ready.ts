export type RealtimeTerminalStatus = 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED';

export interface RealtimeChannelWithStatus {
  subscribe(
    callback: (status: string, error?: Error) => void,
  ): unknown;
}

function isTerminalStatus(status: string): status is RealtimeTerminalStatus {
  return status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED';
}

/**
 * Resolves only after the Supabase socket has actually joined. Terminal states
 * before that point reject the caller. After readiness, Phoenix owns reconnect
 * and rejoin; terminal callbacks must not make a registered channel disappear.
 */
export function waitForRealtimeChannelReady(
  channel: RealtimeChannelWithStatus,
  onTerminalBeforeReady?: (status: RealtimeTerminalStatus, error?: Error) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let ready = false;
    let settled = false;

    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        if (settled) return;
        ready = true;
        settled = true;
        resolve();
        return;
      }

      if (!isTerminalStatus(status)) return;

      if (ready) {
        return;
      }

      if (settled) return;
      settled = true;
      onTerminalBeforeReady?.(status, error);
      const detail = error?.message ? `: ${error.message}` : '';
      reject(new Error(`Supabase Realtime ${status}${detail}`));
    });
  });
}
