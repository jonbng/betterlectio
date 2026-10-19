import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PostHog } from 'posthog-node';

const captured: Array<{ error: unknown; properties: Record<string, unknown> | undefined }> = [];
PostHog.prototype.captureException = function (
  error: unknown,
  _distinctId?: string,
  properties?: Record<string, unknown>,
) {
  captured.push({ error, properties });
} as PostHog['captureException'];

const { captureException } = await import('./posthog');
const distinctId = 'lectio:12345';

test('reports a rethrown error object once, with the first reporter source', () => {
  captured.length = 0;
  const error = new Error('No response HTML');
  captureException(error, distinctId, { source: 'iframe-post' });
  captureException(error, distinctId, { source: 'beskeder-submit' });

  assert.equal(captured.length, 1);
  assert.equal(captured[0].error, error);
  assert.equal(captured[0].properties?.source, 'iframe-post');
});

test('a skipped attempt does not consume the error object', () => {
  captured.length = 0;
  const error = new Error('No response HTML after identity becomes available');
  captureException(error, undefined, { source: 'iframe-post' });
  captureException(error, distinctId, { source: 'iframe-post' });

  assert.equal(captured.length, 1);
  assert.equal(captured[0].error, error);
});
