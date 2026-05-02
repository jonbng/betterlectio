// browser.storage.local cache layer for Supabase data.
// Content scripts read directly; background writes after fetches.
// storage.onChanged provides cross-context reactivity for free.

import type { TableName } from './messages';

// ── Cache entry shape ───────────────────────────────────────────────

interface CacheEntry<T = unknown> {
  data: T;
  fetchedAt: number;
  ttl: number;
}

// ── Per-table TTL defaults (ms) ─────────────────────────────────────

const DEFAULT_TTL = 15 * 60_000; // 15 min

const TABLE_TTL: Partial<Record<TableName, number>> = {
  schools: 2 * 60 * 60_000,          // 2 hours
  students: 30 * 60_000,             // 30 min
  lessons: 15 * 60_000,              // 15 min
  student_lessons: 15 * 60_000,
  homework_entries: 6 * 60 * 60_000, // 6 hours — effectively immutable join registry; mutations invalidate locally
  student_homework: 5 * 60_000,      // 5 min (user-mutable)
  lesson_mappings: 24 * 60 * 60_000, // 24 hours — admin-curated, mutations invalidate locally
  school_lesson_mappings: 24 * 60 * 60_000,
  student_lessoncontrols: 30 * 60_000,
  user_lesson_overrides: 5 * 60_000,
  week_sync: 15 * 60_000,
  updates: 5 * 60_000,
};

export function getTtl(table: TableName): number {
  return TABLE_TTL[table] ?? DEFAULT_TTL;
}

// ── Key helpers ─────────────────────────────────────────────────────

const CACHE_PREFIX = 'bl-sb:';

export function cacheKey(schoolId: string, table: string, fingerprint: string): string {
  return `${CACHE_PREFIX}${schoolId}:${table}:${fingerprint}`;
}

/** Deterministic fingerprint from query params. */
export function queryFingerprint(params: {
  select?: string;
  filters?: unknown[];
  order?: unknown;
  limit?: number;
  single?: boolean;
}): string {
  return JSON.stringify({
    s: params.select ?? '*',
    f: params.filters ?? [],
    o: params.order ?? null,
    l: params.limit ?? null,
    si: params.single ?? false,
  });
}

export function isCacheKey(key: string): boolean {
  return key.startsWith(CACHE_PREFIX);
}

/** Extract table name from a cache key. */
export function tableFromKey(key: string): string | null {
  if (!isCacheKey(key)) return null;
  const parts = key.slice(CACHE_PREFIX.length).split(':');
  return parts[1] ?? null;
}

// ── Read / Write / Invalidate ───────────────────────────────────────

export interface CacheResult<T> {
  data: T;
  isFresh: boolean;
  isStale: boolean;
  isExpired: boolean;
}

/** Read a cache entry. Returns null on miss or hard-expired entries. */
export async function readCache<T>(key: string): Promise<CacheResult<T> | null> {
  try {
    const result = await browser.storage.local.get(key);
    const entry = result[key] as CacheEntry<T> | undefined;
    if (!entry) return null;

    const age = Date.now() - entry.fetchedAt;
    const isStale = age > entry.ttl;
    const isExpired = age > entry.ttl * 2;

    if (isExpired) {
      // Hard expired — don't serve, clean up
      browser.storage.local.remove(key).catch(() => {});
      return null;
    }

    return {
      data: entry.data,
      isFresh: !isStale,
      isStale,
      isExpired: false,
    };
  } catch {
    return null;
  }
}

/** Write data to cache with table-appropriate TTL. */
export async function writeCache<T>(key: string, data: T, table: TableName): Promise<void> {
  const entry: CacheEntry<T> = {
    data,
    fetchedAt: Date.now(),
    ttl: getTtl(table),
  };
  try {
    await browser.storage.local.set({ [key]: entry });
  } catch {
    // Storage full or other error — non-critical
  }
}

/** Remove all cache entries for a table+school. */
export async function invalidateTable(schoolId: string, table: string): Promise<void> {
  try {
    const prefix = `${CACHE_PREFIX}${schoolId}:${table}:`;
    const all = await browser.storage.local.get(null);
    const keysToRemove = Object.keys(all).filter((k) => k.startsWith(prefix));
    if (keysToRemove.length > 0) {
      await browser.storage.local.remove(keysToRemove);
    }
  } catch {
    // Non-critical
  }
}

/** Remove all Supabase cache entries (all schools, all tables). */
export async function invalidateAll(): Promise<void> {
  try {
    const all = await browser.storage.local.get(null);
    const keysToRemove = Object.keys(all).filter(isCacheKey);
    if (keysToRemove.length > 0) {
      await browser.storage.local.remove(keysToRemove);
    }
  } catch {
    // Non-critical
  }
}
