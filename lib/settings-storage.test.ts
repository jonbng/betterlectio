import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { FeatureSettingsSchema } from './settings-storage';

describe('forside.showAktuelInfo', () => {
  test('defaults to on for empty settings', () => {
    assert.equal(FeatureSettingsSchema.parse({}).forside.showAktuelInfo, true);
  });

  test('fills in the default when older stored settings omit forside', () => {
    const parsed = FeatureSettingsSchema.parse({
      version: 1,
      visual: { darkMode: true },
    });
    assert.equal(parsed.forside.showAktuelInfo, true);
  });

  test('preserves an explicit off value', () => {
    const parsed = FeatureSettingsSchema.parse({
      version: 1,
      forside: { showAktuelInfo: false },
    });
    assert.equal(parsed.forside.showAktuelInfo, false);
  });
});
