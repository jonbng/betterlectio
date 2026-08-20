import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { hasBetterLectio, isActiveStudent } from './active-user';

const NOW = Date.parse('2026-08-14T08:00:00Z');

describe('isActiveStudent', () => {
  test('is true within the 14-day heartbeat window', () => {
    assert.equal(isActiveStudent({
      last_seen_at: '2026-08-13T08:00:00Z',
      extension_installed_at: '2026-05-01T00:00:00Z',
      extension_uninstalled_at: null,
    }, NOW), true);
  });

  test('falls back to extension_installed_at when last_seen_at is missing', () => {
    assert.equal(isActiveStudent({
      last_seen_at: null,
      extension_installed_at: '2026-08-14T07:00:00Z',
      extension_uninstalled_at: null,
    }, NOW), true);
  });

  test('is false after uninstall even with a fresh heartbeat', () => {
    assert.equal(isActiveStudent({
      last_seen_at: '2026-08-14T07:00:00Z',
      extension_installed_at: '2026-05-01T00:00:00Z',
      extension_uninstalled_at: '2026-08-01T00:00:00Z',
    }, NOW), false);
  });
});

describe('hasBetterLectio', () => {
  test('is true for an active extension user', () => {
    assert.equal(hasBetterLectio({
      last_seen_at: '2026-08-13T08:00:00Z',
      extension_installed_at: '2026-05-01T00:00:00Z',
      extension_uninstalled_at: null,
      app_installed_at: null,
    }, NOW), true);
  });

  test('is true for app users even without an extension heartbeat', () => {
    assert.equal(hasBetterLectio({
      last_seen_at: null,
      extension_installed_at: null,
      extension_uninstalled_at: null,
      app_installed_at: '2026-07-01T00:00:00Z',
    }, NOW), true);
  });

  test('is false when both signals are absent', () => {
    assert.equal(hasBetterLectio({
      last_seen_at: null,
      extension_installed_at: null,
      extension_uninstalled_at: null,
      app_installed_at: null,
    }, NOW), false);
    assert.equal(hasBetterLectio(null, NOW), false);
  });

  test('is false for a stale extension install without the app', () => {
    assert.equal(hasBetterLectio({
      last_seen_at: '2026-07-01T00:00:00Z',
      extension_installed_at: '2026-05-01T00:00:00Z',
      extension_uninstalled_at: null,
      app_installed_at: null,
    }, NOW), false);
  });
});
