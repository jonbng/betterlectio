import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  isExtensionRejection,
  isExtensionScriptUrl,
  isExtensionWindowError,
} from './page-error-origin';

const LECTIO_VENDOR = 'https://www.lectio.dk/lectio/content/vendor.bundle.js?DummyID=abc';

describe('isExtensionScriptUrl', () => {
  test('recognizes extension origins in every supported browser', () => {
    assert.equal(isExtensionScriptUrl('chrome-extension://abc/content-scripts/content.js'), true);
    assert.equal(isExtensionScriptUrl('moz-extension://abc/content-scripts/content.js'), true);
    assert.equal(isExtensionScriptUrl('safari-web-extension://ABC/content-scripts/content.js'), true);
  });

  test('rejects Lectio page and script URLs', () => {
    assert.equal(isExtensionScriptUrl(LECTIO_VENDOR), false);
    assert.equal(isExtensionScriptUrl('https://www.lectio.dk/lectio/94/forside.aspx'), false);
    assert.equal(isExtensionScriptUrl(undefined), false);
  });
});

describe('isExtensionWindowError', () => {
  test('ignores errors thrown by Lectio page scripts', () => {
    const error = new TypeError("null is not an object (evaluating 'g.config')");
    assert.equal(isExtensionWindowError(LECTIO_VENDOR, error), false);
  });

  test('ignores unattributable cross-origin script errors', () => {
    assert.equal(isExtensionWindowError('', null), false);
  });

  test('keeps errors from extension scripts', () => {
    assert.equal(
      isExtensionWindowError('safari-web-extension://ABC/content-scripts/content.js', null),
      true,
    );
  });

  test('falls back to the stack when the filename is missing', () => {
    const error = new Error('boom');
    error.stack = 'render@moz-extension://abc/content-scripts/content.js:1:2';
    assert.equal(isExtensionWindowError('', error), true);
  });
});

describe('isExtensionRejection', () => {
  test('keeps rejections with an extension stack frame', () => {
    const error = new Error('boom');
    error.stack = 'Error: boom\n    at load (chrome-extension://abc/content-scripts/content.js:1:2)';
    assert.equal(isExtensionRejection(error), true);
  });

  test('ignores rejections from Lectio page scripts', () => {
    const error = new Error('Focus target was not found.');
    error.stack = `focus@${LECTIO_VENDOR}:1:2`;
    assert.equal(isExtensionRejection(error), false);
  });

  test('ignores reasons without a stack', () => {
    assert.equal(isExtensionRejection('rejected'), false);
    assert.equal(isExtensionRejection({ message: 'rejected' }), false);
    assert.equal(isExtensionRejection(undefined), false);
  });

  test('tolerates a stack getter that throws', () => {
    const reason = Object.defineProperty({}, 'stack', {
      get() {
        throw new Error('cross-world access');
      },
    });
    assert.equal(isExtensionRejection(reason), false);
  });
});
