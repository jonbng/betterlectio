// Content-script proxy for Supabase operations.
// Sends messages to background script and manages local cache reads.

import type {
  TableName,
  FunctionName,
  Filter,
  OrderBy,
  QueryMessage,
  MutateMessage,
  RpcMessage,
  SupabaseMessage,
  SupabaseResponse,
} from './messages';
import {
  cacheKey,
  queryFingerprint,
  readCache,
  writeCache,
  invalidateTable,
} from './cache';

// ── Message sender ──────────────────────────────────────────────────

async function send(msg: SupabaseMessage): Promise<SupabaseResponse> {
  const resp = await browser.runtime.sendMessage(msg);
  // Firefox can return undefined if background script hasn't loaded yet
  if (!resp) return { ok: false, error: 'Background not ready' };
  return resp;
}

// ── Query / Mutate / RPC ────────────────────────────────────────────

export async function sendQuery(
  opts: Omit<QueryMessage, 'type'>,
): Promise<SupabaseResponse> {
  return send({ type: 'bl-sb:query', ...opts });
}

export async function sendMutation(
  opts: Omit<MutateMessage, 'type'>,
): Promise<SupabaseResponse> {
  return send({ type: 'bl-sb:mutate', ...opts });
}

export async function sendRpc(
  fn: FunctionName,
  args: Record<string, unknown>,
): Promise<SupabaseResponse> {
  return send({ type: 'bl-sb:rpc', fn, args });
}

// ── Cached query (stale-while-revalidate) ───────────────────────────

export interface CachedQueryOpts {
  schoolId: string;
  table: TableName;
  select?: string;
  filters?: Filter[];
  order?: OrderBy;
  limit?: number;
  single?: boolean;
}

/**
 * Cache-first query. Reads browser.storage.local directly (no message
 * roundtrip on cache hit). Background-refetches when stale.
 */
export async function cachedQuery<T>(opts: CachedQueryOpts): Promise<T> {
  const key = cacheKey(
    opts.schoolId,
    opts.table,
    queryFingerprint({
      select: opts.select,
      filters: opts.filters,
      order: opts.order,
      limit: opts.limit,
      single: opts.single,
    }),
  );

  // 1. Try cache
  const cached = await readCache<T>(key);

  // Treat a previously-cached null single-row result as a cache miss. Older
  // extension versions could poison the cache with `null` when the query ran
  // before auth landed (RLS returned an empty row). Keep the safety net in
  // both directions so existing users get unstuck without waiting for TTL.
  const cachedIsNullSingle = Boolean(cached && opts.single && cached.data === null);

  if (cached && !cachedIsNullSingle) {
    if (cached.isFresh) {
      return cached.data;
    }
    // Stale — serve cached data, background refetch
    sendQuery({
      table: opts.table,
      select: opts.select,
      filters: opts.filters,
      order: opts.order,
      limit: opts.limit,
      single: opts.single,
    }).then((resp) => {
      if (resp.ok && resp.data !== undefined) {
        writeCache(key, resp.data, opts.table);
      }
    }).catch(() => {});
    return cached.data;
  }

  // 2. Cache miss — fetch and cache
  const resp = await sendQuery({
    table: opts.table,
    select: opts.select,
    filters: opts.filters,
    order: opts.order,
    limit: opts.limit,
    single: opts.single,
  });

  if (!resp.ok) {
    throw new Error(resp.error ?? 'Query failed');
  }

  const data = resp.data as T;
  // Don't persist an empty single-row result. An empty result here is almost
  // always "the row isn't readable yet" (RLS blocked before auth landed, row
  // not upserted yet, transient race) — caching null would mask the next
  // retry for the whole table TTL. Non-single queries can legitimately return
  // `[]`, so only null-guard the single-row case.
  const shouldCache = !(opts.single && data === null);
  if (shouldCache) {
    await writeCache(key, data, opts.table);
  }
  return data;
}

// ── Mutation with cache invalidation ────────────────────────────────

export interface MutationOpts {
  table: TableName;
  method: 'insert' | 'update' | 'upsert' | 'delete';
  data?: Record<string, unknown>;
  filters?: Filter[];
  schoolId: string;
  /** Additional tables to invalidate on success. */
  invalidates?: TableName[];
}

export async function mutate(opts: MutationOpts): Promise<unknown> {
  const resp = await sendMutation({
    table: opts.table,
    method: opts.method,
    data: opts.data,
    filters: opts.filters,
  });

  if (!resp.ok) {
    throw new Error(resp.error ?? 'Mutation failed');
  }

  // Invalidate caches
  const tables = [opts.table, ...(opts.invalidates ?? [])];
  await Promise.all(tables.map((t) => invalidateTable(opts.schoolId, t)));

  return resp.data;
}

// ── Auth helpers ────────────────────────────────────────────────────

export async function getSession(): Promise<{ expires_at: number } | null> {
  try {
    const resp = await send({ type: 'bl-sb:auth:session' });
    return resp.ok ? (resp.session ?? null) : null;
  } catch {
    return null;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session !== null;
}

export async function signOut(): Promise<void> {
  try {
    await send({ type: 'bl-sb:auth:signout' });
  } catch {
    // Non-critical
  }
}
