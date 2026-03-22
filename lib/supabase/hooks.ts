// Preact hooks for Supabase data. Integrate with cachedQuery + storage.onChanged reactivity.

import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import type { TableName, Filter, OrderBy } from './messages';
import { cachedQuery, mutate as sendMutate } from './client';
import { onCacheChange } from './realtime';

// ── useQuery ────────────────────────────────────────────────────────

export interface UseQueryOpts {
  schoolId: string;
  table: TableName;
  select?: string;
  filters?: Filter[];
  order?: OrderBy;
  limit?: number;
  single?: boolean;
  /** Skip the query when false (e.g. waiting for a required param). */
  enabled?: boolean;
}

export interface UseQueryResult<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useQuery<T>(opts: UseQueryOpts): UseQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // Stable identity for deps — only recalculate when values change
  const depsKey = JSON.stringify({
    s: opts.schoolId,
    t: opts.table,
    sl: opts.select,
    f: opts.filters,
    o: opts.order,
    l: opts.limit,
    si: opts.single,
    e: opts.enabled,
  });

  const doFetch = useCallback(async () => {
    if (opts.enabled === false) {
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const result = await cachedQuery<T>({
        schoolId: opts.schoolId,
        table: opts.table,
        select: opts.select,
        filters: opts.filters,
        order: opts.order,
        limit: opts.limit,
        single: opts.single,
      });
      if (mountedRef.current) {
        setData(result);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [depsKey]);

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    doFetch();
    return () => {
      mountedRef.current = false;
    };
  }, [doFetch]);

  // Re-fetch when cache changes (Realtime, mutations, other tabs)
  useEffect(() => {
    if (opts.enabled === false) return;
    return onCacheChange((changedTable) => {
      if (changedTable === opts.table) {
        doFetch();
      }
    });
  }, [opts.table, doFetch, opts.enabled]);

  return { data, isLoading, error, refetch: doFetch };
}

// ── useMutation ─────────────────────────────────────────────────────

export interface UseMutationOpts {
  table: TableName;
  method: 'insert' | 'update' | 'upsert' | 'delete';
  schoolId: string;
  /** Tables to invalidate on success (the mutation's own table is always invalidated). */
  invalidates?: TableName[];
  onSuccess?: (data: unknown) => void;
  onError?: (error: string) => void;
}

export interface UseMutationResult<T> {
  mutate: (data: T, filters?: Filter[]) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export function useMutation<T = Record<string, unknown>>(opts: UseMutationOpts): UseMutationResult<T> {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doMutate = useCallback(async (data: T, filters?: Filter[]) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await sendMutate({
        table: opts.table,
        method: opts.method,
        data: data as Record<string, unknown>,
        filters,
        schoolId: opts.schoolId,
        invalidates: opts.invalidates,
      });
      opts.onSuccess?.(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      opts.onError?.(msg);
    } finally {
      setIsLoading(false);
    }
  }, [opts.table, opts.method, opts.schoolId, JSON.stringify(opts.invalidates)]);

  return { mutate: doMutate, isLoading, error };
}
