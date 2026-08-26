import assert from 'node:assert/strict';
import { test } from 'node:test';

import { installVisiblePoller } from './visible-poller';

class FakeTimers {
  private nextId = 1;
  readonly timers = new Map<number, { callback: () => void; delay: number }>();

  setTimeout = (callback: () => void, delay: number) => {
    const id = this.nextId++;
    this.timers.set(id, { callback, delay });
    return id;
  };

  clearTimeout = (id: number) => {
    this.timers.delete(id);
  };

  runOnlyTimer() {
    assert.equal(this.timers.size, 1);
    const [id, timer] = this.timers.entries().next().value!;
    this.timers.delete(id);
    timer.callback();
  }

  onlyDelay() {
    assert.equal(this.timers.size, 1);
    return this.timers.values().next().value!.delay;
  }
}

function createEnvironment() {
  const window = new EventTarget();
  const document = new EventTarget() as EventTarget & {
    visibilityState: 'visible' | 'hidden';
  };
  document.visibilityState = 'visible';
  const timers = new FakeTimers();

  return { window, document, timers };
}

test('visible poller refreshes immediately, then every 60 seconds while visible', () => {
  const { window, document, timers } = createEnvironment();
  let refreshes = 0;

  const cleanup = installVisiblePoller(() => { refreshes += 1; }, {
    window,
    document,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });

  assert.equal(refreshes, 1);
  assert.equal(timers.onlyDelay(), 60_000);

  timers.runOnlyTimer();
  assert.equal(refreshes, 2);
  assert.equal(timers.onlyDelay(), 60_000);

  cleanup();
});

test('visible poller does not request while hidden and refreshes immediately when visible again', () => {
  const { window, document, timers } = createEnvironment();
  let refreshes = 0;
  const cleanup = installVisiblePoller(() => { refreshes += 1; }, {
    window,
    document,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });

  document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(timers.timers.size, 0);
  assert.equal(refreshes, 1);

  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(refreshes, 2);
  assert.equal(timers.onlyDelay(), 60_000);

  cleanup();
});

test('visible poller continues after a failed refresh', async () => {
  const { window, document, timers } = createEnvironment();
  let refreshes = 0;
  const cleanup = installVisiblePoller(() => {
    refreshes += 1;
    if (refreshes === 1) return Promise.reject(new Error('temporary failure'));
  }, {
    window,
    document,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });

  await Promise.resolve();
  await Promise.resolve();
  timers.runOnlyTimer();
  assert.equal(refreshes, 2);

  cleanup();
});

test('visible poller refreshes on focus, resets its cadence, and never overlaps a refresh', async () => {
  const { window, document, timers } = createEnvironment();
  let refreshes = 0;
  let resolveRefresh: (() => void) | undefined;
  const pendingRefresh = new Promise<void>((resolve) => { resolveRefresh = resolve; });

  const cleanup = installVisiblePoller(() => {
    refreshes += 1;
    return pendingRefresh;
  }, {
    window,
    document,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });

  window.dispatchEvent(new Event('focus'));
  assert.equal(refreshes, 1);
  assert.equal(timers.onlyDelay(), 60_000);

  resolveRefresh!();
  await Promise.resolve();

  window.dispatchEvent(new Event('focus'));
  assert.equal(refreshes, 2);
  assert.equal(timers.onlyDelay(), 60_000);

  cleanup();
  window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(refreshes, 2);
  assert.equal(timers.timers.size, 0);
});
