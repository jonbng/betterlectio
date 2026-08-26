import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MOBILE_APP_INVITE_REFRESH_TTL_MS,
  installMobileAppInviteRefreshLifecycle,
} from './mobile-app-invite-refresh';

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function createEnvironment() {
  const window = new EventTarget();
  const document = new EventTarget() as EventTarget & {
    visibilityState: 'visible' | 'hidden';
  };
  document.visibilityState = 'visible';
  return { window, document };
}

test('refreshes the exact student once when the popup component enters visibly', () => {
  const { window, document } = createEnvironment();
  const storage = new MemoryStorage();
  let now = 100;
  let refreshes = 0;

  const cleanup = installMobileAppInviteRefreshLifecycle({
    schoolId: '94',
    studentId: '123',
    refresh: () => { refreshes += 1; },
    storage,
    now: () => now,
    window,
    document,
  });

  assert.equal(refreshes, 1);
  cleanup();
});

test('persists the five-minute throttle across component remounts', () => {
  const { window, document } = createEnvironment();
  const storage = new MemoryStorage();
  let now = 100;
  let refreshes = 0;
  const options = {
    schoolId: '94',
    studentId: '123',
    refresh: () => { refreshes += 1; },
    storage,
    now: () => now,
    window,
    document,
  };

  const firstCleanup = installMobileAppInviteRefreshLifecycle(options);
  firstCleanup();
  now += MOBILE_APP_INVITE_REFRESH_TTL_MS - 1;
  const secondCleanup = installMobileAppInviteRefreshLifecycle(options);

  assert.equal(refreshes, 1);
  secondCleanup();
});

test('does not refresh for hidden visibility events', () => {
  const { window, document } = createEnvironment();
  const storage = new MemoryStorage();
  let now = 100;
  let refreshes = 0;
  const cleanup = installMobileAppInviteRefreshLifecycle({
    schoolId: '94',
    studentId: '123',
    refresh: () => { refreshes += 1; },
    storage,
    now: () => now,
    window,
    document,
  });

  document.visibilityState = 'hidden';
  now += MOBILE_APP_INVITE_REFRESH_TTL_MS;
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('focus'));

  assert.equal(refreshes, 1);
  cleanup();
});

test('refreshes on visible and focus returns exactly when the five-minute TTL expires', () => {
  const { window, document } = createEnvironment();
  const storage = new MemoryStorage();
  let now = 100;
  let refreshes = 0;
  const cleanup = installMobileAppInviteRefreshLifecycle({
    schoolId: '94',
    studentId: '123',
    refresh: () => { refreshes += 1; },
    storage,
    now: () => now,
    window,
    document,
  });

  document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  now += MOBILE_APP_INVITE_REFRESH_TTL_MS;
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('focus'));

  assert.equal(refreshes, 2);
  cleanup();
});

test('removes foreground listeners during cleanup', () => {
  const { window, document } = createEnvironment();
  const storage = new MemoryStorage();
  let now = 100;
  let refreshes = 0;
  const cleanup = installMobileAppInviteRefreshLifecycle({
    schoolId: '94',
    studentId: '123',
    refresh: () => { refreshes += 1; },
    storage,
    now: () => now,
    window,
    document,
  });

  cleanup();
  now += MOBILE_APP_INVITE_REFRESH_TTL_MS;
  window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));

  assert.equal(refreshes, 1);
});
