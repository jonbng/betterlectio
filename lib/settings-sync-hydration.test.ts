import assert from 'node:assert/strict';
import { test } from 'node:test';

const {
  createHydrationRequestCoordinator,
  hydrateSettingsFromSupabase,
  hydrateSchoolThemesFromSupabase,
} = await import('./settings-sync');

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function assertNewerRequestStaysCoalesced(): Promise<void> {
  const coordinator = createHydrationRequestCoordinator();
  const firstDeferred = deferred<boolean>();
  const secondDeferred = deferred<boolean>();

  const first = coordinator.run(true, () => firstDeferred.promise);
  const second = coordinator.run(true, () => secondDeferred.promise);

  firstDeferred.resolve(false);
  await first;

  const coalesced = coordinator.run(false, () => {
    assert.fail('the newer in-flight request should have been reused');
  });
  assert.strictEqual(coalesced, second);

  secondDeferred.resolve(false);
  await second;
}

test('settings hydration keeps the newer forced request coalesced after the older one settles', async () => {
  await assertNewerRequestStaysCoalesced();
});

test('theme hydration keeps the newer forced request coalesced after the older one settles', async () => {
  await assertNewerRequestStaysCoalesced();
});

const cachedQueryReads: string[] = [];
const hydratedQueryTables: string[] = [];
const hydrationLocalStorage = new Map<string, string>();

(globalThis as typeof globalThis & { browser: unknown }).browser = {
  runtime: {
    async sendMessage(message: { type: string; table?: string }) {
      if (message.type === 'bl-sb:auth:ensure') return { ok: true };
      if (message.type === 'bl-sb:auth:session') {
        return { ok: true, session: { expires_at: Date.now() + 60_000, user_id: 'user-1' } };
      }
      if (message.type === 'bl-sb:query') {
        hydratedQueryTables.push(message.table ?? '');
        return {
          ok: true,
          data: message.table === 'user_settings' ? null : [],
        };
      }
      throw new Error(`Unexpected message: ${message.type}`);
    },
  },
  storage: {
    local: {
      async get(key: string) {
        cachedQueryReads.push(key);
        return {
          [key]: { data: key.includes('user_settings') ? null : [], fetchedAt: Date.now(), ttl: 60_000 },
        };
      },
      async set() {},
      async remove() {},
    },
  },
};

Object.assign(globalThis, {
  window: Object.assign(new EventTarget(), {
    location: { pathname: '/lectio/94/forside.aspx' },
  }),
  document: {
    querySelector: () => ({
      getAttribute: () => '/lectio/94/forside.aspx?elevid=123456',
    }),
  },
  localStorage: {
    getItem: (key: string) => hydrationLocalStorage.get(key) ?? null,
    setItem: (key: string, value: string) => { hydrationLocalStorage.set(key, value); },
  },
});

test('due and forced settings/theme hydrations bypass cached query entries', async () => {
  hydratedQueryTables.length = 0;
  cachedQueryReads.length = 0;
  hydrationLocalStorage.clear();

  await Promise.all([
    hydrateSettingsFromSupabase(),
    hydrateSchoolThemesFromSupabase(true),
  ]);

  assert.deepEqual(hydratedQueryTables.sort(), ['user_school_themes', 'user_settings']);
  assert.deepEqual(cachedQueryReads, []);
});
