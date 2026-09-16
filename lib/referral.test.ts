import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

const storage = new Map<string, unknown>();

(globalThis as typeof globalThis & { browser: unknown }).browser = {
  storage: {
    local: {
      async get(key: string) {
        const value = storage.get(key);
        return value === undefined ? {} : { [key]: value };
      },
      async set(values: Record<string, unknown>) {
        for (const [key, value] of Object.entries(values)) storage.set(key, value);
      },
    },
  },
};

const { maybeFinalizeReferral } = await import('./referral');

beforeEach(() => {
  storage.clear();
});

function options(studentId: string) {
  return {
    studentId,
    schoolId: '123',
    accessToken: 'user-jwt',
    extensionVersion: '0.0.38',
  };
}

test('marks a parsed 2xx outcome as definitive', async () => {
  let requests = 0;
  globalThis.fetch = async (_input, init) => {
    requests += 1;
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), 'Bearer user-jwt');
    assert.ok(headers.get('apikey'));
    return Response.json({ attributed: false, reason: 'no_cookie' });
  };

  assert.deepEqual(await maybeFinalizeReferral(options('student-success')), {
    attributed: false,
    reason: 'no_cookie',
  });
  assert.equal(await maybeFinalizeReferral(options('student-success')), null);
  assert.equal(requests, 1);
});

test('retries after transport and server failures', async () => {
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    if (requests === 1) throw new TypeError('offline');
    if (requests === 2) return new Response('unavailable', { status: 503 });
    return Response.json({ attributed: true, referrerStudentId: 'referrer' });
  };

  assert.equal(await maybeFinalizeReferral(options('student-retry')), null);
  assert.equal(await maybeFinalizeReferral(options('student-retry')), null);
  assert.deepEqual(await maybeFinalizeReferral(options('student-retry')), {
    attributed: true,
    referrerStudentId: 'referrer',
  });
  assert.equal(requests, 3);
});
