const STORAGE_KEY = 'bl-posthog-lifecycle-events';

export interface PendingLifecycleEvent {
  event: string;
  properties?: Record<string, unknown>;
}

async function readEvents(): Promise<PendingLifecycleEvent[]> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY];
    if (!stored) return [];
    const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeEvents(events: PendingLifecycleEvent[]): Promise<void> {
  try {
    if (events.length === 0) {
      await browser.storage.local.remove(STORAGE_KEY);
      return;
    }
    await browser.storage.local.set({ [STORAGE_KEY]: events });
  } catch {
    // Ignore storage errors.
  }
}

export async function queueLifecycleEvent(event: string, properties?: Record<string, unknown>): Promise<void> {
  const events = await readEvents();
  events.push({ event, properties });
  await writeEvents(events);
}

export async function consumeLifecycleEvents(): Promise<PendingLifecycleEvent[]> {
  const events = await readEvents();
  await writeEvents([]);
  return events;
}
