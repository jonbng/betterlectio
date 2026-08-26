import assert from 'node:assert/strict';
import { test } from 'node:test';

const storage = new Map<string, unknown>();
let queryCount = 0;
let cacheReadCount = 0;

// cachedQuery reaches browser.storage directly, while its network fallback
// goes through browser.runtime. Keep this mock limited to that boundary.
(globalThis as typeof globalThis & { browser: unknown }).browser = {
  runtime: {
    async sendMessage(message: { type: string }) {
      if (message.type === 'bl-sb:query') {
        queryCount += 1;
        return { ok: true, data: [{ id: 'network-result' }] };
      }
      throw new Error(`Unexpected message: ${message.type}`);
    },
  },
  storage: {
    local: {
      async get(key: string | null) {
        cacheReadCount += 1;
        if (key === null) return Object.fromEntries(storage);
        const value = storage.get(key);
        return value === undefined ? {} : { [key]: value };
      },
      async set(values: Record<string, unknown>) {
        for (const [key, value] of Object.entries(values)) storage.set(key, value);
      },
      async remove(keys: string | string[]) {
        for (const key of Array.isArray(keys) ? keys : [keys]) storage.delete(key);
      },
    },
  },
};

const { cachedQuery } = await import('./client');
const { cacheKey, queryFingerprint, writeCache } = await import('./cache');

test('cachedQuery bypassCache fetches and overwrites the query cache entry', async () => {
  storage.clear();
  queryCount = 0;
  cacheReadCount = 0;

  const opts = {
    schoolId: '94',
    table: 'students' as const,
    select: 'id,name',
    filters: [{ column: 'school_id', op: 'eq' as const, value: 94 }],
  };
  const key = cacheKey(opts.schoolId, opts.table, queryFingerprint(opts));
  await writeCache(key, [{ id: 'cached-result' }], opts.table);

  assert.deepEqual(await cachedQuery(opts), [{ id: 'cached-result' }]);
  assert.equal(queryCount, 0);
  assert.equal(cacheReadCount, 1);

  assert.deepEqual(
    await cachedQuery({ ...opts, bypassCache: true }),
    [{ id: 'network-result' }],
  );
  assert.equal(queryCount, 1);
  assert.equal(cacheReadCount, 1);
  assert.deepEqual((storage.get(key) as { data: unknown }).data, [{ id: 'network-result' }]);
});
