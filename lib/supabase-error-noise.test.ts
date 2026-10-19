import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  isBackgroundNotReadyError,
  isExtensionContextInvalidatedError,
  isNonActionableSupabaseError,
  isSessionExpiredAuthError,
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

describe('isSessionExpiredAuthError', () => {
  test('recognizes the normalized stage message', () => {
    assert.equal(isSessionExpiredAuthError(new Error('Auth failed: session-expired')), true);
  });

  test('recognizes the raw edge error text', () => {
    assert.equal(isSessionExpiredAuthError('Lectio session expired or invalid'), true);
    assert.equal(isSessionExpiredAuthError({ message: 'Lectio session expired or invalid' }), true);
  });

  test('does not suppress other auth failure stages', () => {
    assert.equal(isSessionExpiredAuthError(new Error('Auth failed: edge-error')), false);
    assert.equal(isSessionExpiredAuthError(new Error('QR code invalid or expired')), false);
  });
});

describe('isBackgroundNotReadyError', () => {
  test('recognizes the proxy response for an unreachable background worker', () => {
    assert.equal(isBackgroundNotReadyError(new Error('Background not ready')), true);
    assert.equal(isNonActionableSupabaseError(new Error('Background not ready')), true);
  });

  test('keeps the raw runtime messaging error reportable', () => {
    const raw = new Error('Could not establish connection. Receiving end does not exist.');
    assert.equal(isBackgroundNotReadyError(raw), false);
    assert.equal(isNonActionableSupabaseError(raw), false);
  });
});
