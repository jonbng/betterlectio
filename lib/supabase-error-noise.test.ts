import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  isExtensionContextInvalidatedError,
  isTransientNetworkError,
} from './supabase-error-noise';

describe('isTransientNetworkError', () => {
  test('recognizes browser fetch failures', () => {
    assert.equal(isTransientNetworkError(new TypeError('Failed to fetch')), true);
    assert.equal(isTransientNetworkError('NetworkError when attempting to fetch resource.'), true);
    assert.equal(isTransientNetworkError({ message: 'Load failed' }), true);
  });

  test('does not suppress ordinary application failures', () => {
    assert.equal(isTransientNetworkError(new Error('Invalid assignment response')), false);
  });
});

describe('isExtensionContextInvalidatedError', () => {
  test('recognizes invalidated runtime errors in common shapes', () => {
    assert.equal(isExtensionContextInvalidatedError(new Error('Extension context invalidated.')), true);
    assert.equal(isExtensionContextInvalidatedError({ message: 'Extension context invalidated.' }), true);
  });

  test('does not suppress unrelated extension errors', () => {
    assert.equal(isExtensionContextInvalidatedError(new Error('Could not establish connection')), false);
  });
});
