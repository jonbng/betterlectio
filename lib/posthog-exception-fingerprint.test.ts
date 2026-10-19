import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PostHog } from 'posthog-node';

const captured: Array<Record<string, unknown> | undefined> = [];
PostHog.prototype.captureException = function (
  _error: unknown,
  _distinctId?: string,
  properties?: Record<string, unknown>,
) {
  captured.push(properties);
} as PostHog['captureException'];

const { captureException } = await import('./posthog');

test('semantic fingerprints keep the action while separating unrelated failures', () => {
  captureException(new Error('permission denied for function upsert_user_lesson_override_v2'), 'lectio:12345', {
    source: 'hold-mapping-sync', action: 'seed-known-mappings',
  });
  captureException(new Error('Could not establish connection. Receiving end does not exist.'), 'lectio:12345', {
    source: 'hold-mapping-sync', action: 'seed-known-mappings',
  });

  assert.equal(captured.length, 2);
  assert.notEqual(captured[0]?.$exception_fingerprint, captured[1]?.$exception_fingerprint);
  assert.match(String(captured[0]?.$exception_fingerprint), /seed-known-mappings/);
});
