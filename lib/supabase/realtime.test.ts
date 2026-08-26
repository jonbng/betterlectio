import assert from 'node:assert/strict';
import { test } from 'node:test';

let subscribeResponse: { ok: boolean; error?: string } = { ok: true };

(globalThis as typeof globalThis & { browser: unknown }).browser = {
  runtime: {
    async sendMessage(message: { type: string }) {
      if (message.type === 'bl-sb:subscribe') return subscribeResponse;
      throw new Error(`Unexpected message: ${message.type}`);
    },
  },
  storage: { onChanged: { addListener() {} } },
};

const { subscribe } = await import('./realtime');

test('subscribe propagates a background readiness failure', async () => {
  subscribeResponse = { ok: false, error: 'Supabase Realtime subscription timed out' };

  await assert.rejects(
    subscribe({ channel: 'test', table: 'students', schoolId: '94' }),
    /timed out/,
  );
});
