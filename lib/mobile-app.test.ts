import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  mobileAppDownloadUrlFor,
  recordMobileAppPromotionActiveDay,
  shouldPromoteMobileApp,
} from './mobile-app';

describe('mobile app promotion', () => {
  test('is available regardless of former rollout and intent fields', () => {
    assert.equal(shouldPromoteMobileApp({
      app_eligible: false,
      app_installed_at: null,
      app_qr_scanned_at: '2026-08-02T00:00:00Z',
      marked_android_at: '2026-08-02T00:00:00Z',
      dismissed_app_prompt_at: null,
    }), true);
  });

  test('stops after installation or explicit opt-out', () => {
    assert.equal(shouldPromoteMobileApp({ app_installed_at: '2026-08-03T00:00:00Z' }), false);
    assert.equal(shouldPromoteMobileApp({ dismissed_app_prompt_at: '2026-08-03T00:00:00Z' }), false);
    assert.equal(shouldPromoteMobileApp(null), false);
  });

  test('builds a tracked platform-neutral download URL', () => {
    assert.equal(mobileAppDownloadUrlFor(), 'https://betterlectio.dk/download/app');
    assert.equal(
      mobileAppDownloadUrlFor('123_Ab-c'),
      'https://betterlectio.dk/download/app?u=123_Ab-c',
    );
  });

  test('requires activity on two distinct local calendar days', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };

    assert.equal(recordMobileAppPromotionActiveDay('123', new Date(2026, 8, 18, 10), storage), 1);
    assert.equal(recordMobileAppPromotionActiveDay('123', new Date(2026, 8, 18, 22), storage), 1);
    assert.equal(recordMobileAppPromotionActiveDay('123', new Date(2026, 8, 19, 8), storage), 2);
  });

  test('recovers active-day eligibility from corrupt storage', () => {
    const values = new Map<string, string>([['bl-mobile-app-active-days:123', '{bad']]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };

    assert.equal(recordMobileAppPromotionActiveDay('123', new Date(2026, 8, 18, 10), storage), 1);
  });
});
