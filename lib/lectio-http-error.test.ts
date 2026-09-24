import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  describeLectioHttpError,
  isReportableLectioHttpStatus,
} from './lectio-http-error';

const BASE = 'https://www.lectio.dk';

describe('isReportableLectioHttpStatus', () => {
  test('reports client errors (4xx)', () => {
    assert.equal(isReportableLectioHttpStatus(400), true);
    assert.equal(isReportableLectioHttpStatus(404), true);
    assert.equal(isReportableLectioHttpStatus(499), true);
  });

  test('keeps server errors that may expose a bad extension request', () => {
    assert.equal(isReportableLectioHttpStatus(500), true);
    assert.equal(isReportableLectioHttpStatus(501), true);
    assert.equal(isReportableLectioHttpStatus(505), true);
  });

  test('drops transient gateway and availability errors', () => {
    assert.equal(isReportableLectioHttpStatus(502), false);
    assert.equal(isReportableLectioHttpStatus(503), false);
    assert.equal(isReportableLectioHttpStatus(504), false);
  });

  test('drops success and redirect statuses', () => {
    assert.equal(isReportableLectioHttpStatus(0), false);
    assert.equal(isReportableLectioHttpStatus(200), false);
    assert.equal(isReportableLectioHttpStatus(302), false);
  });
});

describe('describeLectioHttpError', () => {
  test('puts the endpoint and status in the message', () => {
    const { message } = describeLectioHttpError(404, `${BASE}/lectio/681/SkemaNy.aspx`);
    assert.equal(message, 'HTTP 404 SkemaNy.aspx');
  });

  test('ignores the numeric school id so repeats across schools share a fingerprint', () => {
    const a = describeLectioHttpError(404, `${BASE}/lectio/681/SkemaNy.aspx`);
    const b = describeLectioHttpError(404, `${BASE}/lectio/42/SkemaNy.aspx`);
    assert.equal(a.fingerprint, b.fingerprint);
    assert.equal(a.fingerprint, 'lectio-http:404:SkemaNy.aspx');
  });

  test('ignores query strings so repeats share a fingerprint', () => {
    const a = describeLectioHttpError(404, `${BASE}/lectio/681/SkemaNy.aspx?week=1`);
    const b = describeLectioHttpError(404, `${BASE}/lectio/681/SkemaNy.aspx?week=2`);
    assert.equal(a.fingerprint, b.fingerprint);
  });

  test('resolves relative URLs against a base', () => {
    const { message } = describeLectioHttpError(403, '/lectio/681/contextcard.aspx', BASE);
    assert.equal(message, 'HTTP 403 contextcard.aspx');
  });

  test('falls back to a placeholder for an unparseable URL', () => {
    const { message } = describeLectioHttpError(404, 'not a url');
    assert.equal(message, 'HTTP 404 unknown');
  });
});
