import assert from 'node:assert/strict';
import { test } from 'node:test';

const fakeWindow = new EventTarget();
const fakeDocument = new EventTarget() as EventTarget & { visibilityState: 'visible' | 'hidden' };
fakeDocument.visibilityState = 'visible';

Object.assign(globalThis, {
  window: fakeWindow,
  localStorage: {
    getItem: () => null,
    setItem: () => {},
  },
});

const { installSettingsHydrationLifecycle } = await import('./settings-sync');

// `sonner` skips browser CSS injection when no document exists during module
// evaluation; install this deliberately small event target before the test.
Object.assign(globalThis, { document: fakeDocument });

test('settings hydration lifecycle refreshes only while the document is visible and cleans up', () => {
  let refreshes = 0;
  const cleanup = installSettingsHydrationLifecycle(() => { refreshes += 1; });

  fakeWindow.dispatchEvent(new Event('focus'));
  assert.equal(refreshes, 1);

  fakeDocument.visibilityState = 'hidden';
  fakeDocument.dispatchEvent(new Event('visibilitychange'));
  assert.equal(refreshes, 1);

  fakeDocument.visibilityState = 'visible';
  fakeDocument.dispatchEvent(new Event('visibilitychange'));
  assert.equal(refreshes, 2);

  cleanup();
  fakeWindow.dispatchEvent(new Event('focus'));
  fakeDocument.dispatchEvent(new Event('visibilitychange'));
  assert.equal(refreshes, 2);
});
