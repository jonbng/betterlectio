import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createMobileAppInviteChannel,
  createMobileAppInviteDialogSubscription,
} from './mobile-app-dialog-subscription';

class FakeTimers {
  private nextId = 1;
  readonly timers = new Map<number, { callback: () => void; delay: number }>();

  setTimeout = (callback: () => void, delay: number): number => {
    const id = this.nextId++;
    this.timers.set(id, { callback, delay });
    return id;
  };

  clearTimeout = (id: number): void => {
    this.timers.delete(id);
  };

  runOnly(): void {
    assert.equal(this.timers.size, 1);
    const [id, timer] = this.timers.entries().next().value!;
    this.timers.delete(id);
    timer.callback();
  }
}

test('dialog subscription immediately unsubscribes and compensates if close wins an async subscribe race', async () => {
  let finishSubscribe: (() => void) | undefined;
  const subscribed = new Promise<void>((resolve) => { finishSubscribe = resolve; });
  const calls: string[] = [];
  const lifecycle = createMobileAppInviteDialogSubscription({
    channel: 'mobile-app-invite:94:123:one',
    subscribe: () => {
      calls.push('subscribe');
      return subscribed;
    },
    unsubscribe: () => { calls.push('unsubscribe'); },
  });

  lifecycle.open();
  lifecycle.close();
  assert.deepEqual(calls, ['subscribe', 'unsubscribe']);

  finishSubscribe!();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(calls, ['subscribe', 'unsubscribe', 'unsubscribe']);
});

test('a channel is unique to each dialog instance', () => {
  const first = createMobileAppInviteChannel('94', '123');
  const second = createMobileAppInviteChannel('94', '123');

  assert.notEqual(first, second);
  assert.match(first, /^mobile-app-invite:94:123:/);
});

test('reconciles a scan committed before a deferred channel join with an exact bypass-cache refetch', async () => {
  let finishSubscribe: (() => void) | undefined;
  const subscribed = new Promise<void>((resolve) => { finishSubscribe = resolve; });
  const refetchCalls: Array<{ bypassCache?: boolean } | undefined> = [];
  const lifecycle = createMobileAppInviteDialogSubscription({
    channel: 'mobile-app-invite:94:123:pre-join-scan',
    subscribe: () => subscribed,
    unsubscribe: () => {},
    onReady: () => { refetchCalls.push({ bypassCache: true }); },
  });

  lifecycle.open();
  assert.deepEqual(refetchCalls, []);
  finishSubscribe!();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(refetchCalls, [{ bypassCache: true }]);
  lifecycle.close();
});

test('does not reconcile the UI when the dialog closes before subscription becomes ready', async () => {
  let finishSubscribe: (() => void) | undefined;
  const subscribed = new Promise<void>((resolve) => { finishSubscribe = resolve; });
  let reconciles = 0;
  let unsubscribes = 0;
  const lifecycle = createMobileAppInviteDialogSubscription({
    channel: 'mobile-app-invite:94:123:closed-before-ready',
    subscribe: () => subscribed,
    unsubscribe: () => { unsubscribes += 1; },
    onReady: () => { reconciles += 1; },
  });

  lifecycle.open();
  lifecycle.close();
  finishSubscribe!();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(reconciles, 0);
  assert.equal(unsubscribes, 2);
});

test('does not reconcile a failed join, then retries after two seconds and reconciles once ready', async () => {
  const timers = new FakeTimers();
  let attempts = 0;
  let reconciles = 0;
  const lifecycle = createMobileAppInviteDialogSubscription({
    channel: 'mobile-app-invite:94:123:retry',
    subscribe: () => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new Error('timed out')) : Promise.resolve();
    },
    unsubscribe: () => {},
    onReady: () => { reconciles += 1; },
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });

  lifecycle.open();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(attempts, 1);
  assert.equal(reconciles, 0);
  assert.equal(timers.timers.size, 1);
  assert.equal(timers.timers.values().next().value!.delay, 2_000);

  timers.runOnly();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(attempts, 2);
  assert.equal(reconciles, 1);
  lifecycle.close();
});

test('closing cancels a pending failed-join retry', async () => {
  const timers = new FakeTimers();
  let attempts = 0;
  let unsubscribes = 0;
  const lifecycle = createMobileAppInviteDialogSubscription({
    channel: 'mobile-app-invite:94:123:cancel-retry',
    subscribe: () => {
      attempts += 1;
      return Promise.reject(new Error('channel error'));
    },
    unsubscribe: () => { unsubscribes += 1; },
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });

  lifecycle.open();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(timers.timers.size, 1);

  lifecycle.close();
  assert.equal(timers.timers.size, 0);
  assert.equal(unsubscribes, 1);
  assert.equal(attempts, 1);
});
