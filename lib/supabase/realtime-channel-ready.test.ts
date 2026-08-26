import assert from 'node:assert/strict';
import { test } from 'node:test';

import { waitForRealtimeChannelReady } from './realtime-channel-ready';

class FakeRealtimeChannel {
  private callback: ((status: string, error?: Error) => void) | undefined;

  subscribe(callback: (status: string, error?: Error) => void): this {
    this.callback = callback;
    return this;
  }

  emit(status: string, error?: Error): void {
    this.callback?.(status, error);
  }
}

test('ignores a terminal callback after SUBSCRIBED so the Phoenix channel can auto-rejoin', async () => {
  const channel = new FakeRealtimeChannel();
  let destructiveCleanupCalls = 0;
  let resolved = false;
  const ready = waitForRealtimeChannelReady(channel, () => {
    destructiveCleanupCalls += 1;
  }).then(() => { resolved = true; });

  assert.equal(resolved, false);
  channel.emit('SUBSCRIBED');
  await ready;
  assert.equal(resolved, true);

  channel.emit('CLOSED');
  assert.equal(destructiveCleanupCalls, 0);
});

for (const status of ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']) {
  test(`rejects ${status} before Supabase has subscribed`, async () => {
    const channel = new FakeRealtimeChannel();
    const ready = waitForRealtimeChannelReady(channel);
    channel.emit(status, new Error('socket unavailable'));

    await assert.rejects(ready, new RegExp(status));
  });
}
