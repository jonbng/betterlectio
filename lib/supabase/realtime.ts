// Reactivity layer for Supabase cache changes.
// Uses browser.storage.onChanged to detect cache updates from any context
// (background Realtime writes, mutations, other tabs).

import { isCacheKey, tableFromKey } from './cache';
import type { TableName } from './messages';

// ── Types ───────────────────────────────────────────────────────────

export type CacheChangeCallback = (table: string, key: string) => void;

// ── Listener registry ───────────────────────────────────────────────

const listeners = new Set<CacheChangeCallback>();
let listenerInstalled = false;

function installListener() {
  if (listenerInstalled) return;
  listenerInstalled = true;

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    for (const key of Object.keys(changes)) {
      if (!isCacheKey(key)) continue;
      const table = tableFromKey(key);
      if (!table) continue;
      for (const cb of listeners) {
        try {
          cb(table, key);
        } catch {
          // Listener threw — ignore
        }
      }
    };
  });
}

/**
 * Subscribe to cache changes for Supabase data.
 * Called whenever a `bl-sb:*` key changes in browser.storage.local.
 * Returns an unsubscribe function.
 */
export function onCacheChange(callback: CacheChangeCallback): () => void {
  installListener();
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Subscribe to changes for a specific table only.
 * Returns an unsubscribe function.
 */
export function onTableChange(table: TableName, callback: () => void): () => void {
  return onCacheChange((changedTable) => {
    if (changedTable === table) callback();
  });
}

// ── Realtime subscription management (content script side) ──────────

export async function subscribe(opts: {
  channel: string;
  table: TableName;
  schoolId: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: string;
}): Promise<void> {
  const response = await browser.runtime.sendMessage({
    type: 'bl-sb:subscribe' as const,
    channel: opts.channel,
    table: opts.table,
    schoolId: opts.schoolId,
    event: opts.event,
    filter: opts.filter,
  }) as { ok?: boolean; error?: unknown } | undefined;

  if (!response?.ok) {
    const message = typeof response?.error === 'string'
      ? response.error
      : 'Supabase Realtime subscription failed';
    throw new Error(message);
  }
}

export async function unsubscribe(channel: string): Promise<void> {
  await browser.runtime.sendMessage({
    type: 'bl-sb:unsubscribe' as const,
    channel,
  });
}
