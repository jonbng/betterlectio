import assert from 'node:assert/strict';
import { test } from 'node:test';

const storage = new Map<string, unknown>();
let queryCount = 0;

(globalThis as typeof globalThis & { browser: unknown }).browser = {
  runtime: {
    async sendMessage(message: { type: string }) {
      if (message.type === 'bl-sb:query') {
        queryCount += 1;
        return { ok: true, data: [{ id: `network-${queryCount}` }] };
      }
      throw new Error(`Unexpected message: ${message.type}`);
    },
  },
  storage: {
    local: {
      async get(key: string | null) {
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

const { getUserSettingsRow, getUserSchoolThemes } = await import('./user-settings');

test('settings and school-theme readers can bypass their cached queries', async () => {
  storage.clear();
  queryCount = 0;

  await getUserSettingsRow('user-1');
  await getUserSchoolThemes('user-1');
  assert.equal(queryCount, 2);

  await getUserSettingsRow('user-1');
  await getUserSchoolThemes('user-1');
  assert.equal(queryCount, 2);

  await getUserSettingsRow('user-1', { bypassCache: true });
  await getUserSchoolThemes('user-1', { bypassCache: true });
  assert.equal(queryCount, 4);
});
