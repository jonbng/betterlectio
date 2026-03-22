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

function send(msg: SupabaseMessage): Promise<SupabaseResponse> {
  return browser.runtime.sendMessage(msg);
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

  if (cached) {
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
  await writeCache(key, data, opts.table);
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
