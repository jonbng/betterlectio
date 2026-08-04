import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { DOMParser as LinkedomDOMParser } from 'linkedom';

import {
  buildReferralInviteCandidates,
  getReferralInviteHistory,
  groupDefaultReferralInviteCandidates,
  parseReferralInviteHistory,
  referralInviteBody,
  REFERRAL_INVITE_COOLDOWN_MS,
  REFERRAL_INVITE_SUBJECT,
  searchReferralInviteCandidates,
  stampReferralInviteSent,
} from './referral-invite';
import type { StudentsMap } from './supabase/student-lookup';
import { fetchBeskederRecipientItems } from './beskeder-recipients-cache';
import { parseComposeFromDOM } from './beskeder-thread-parser';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const NOW = Date.parse('2026-08-03T12:00:00Z');

function item(name: string, id: string): [string, string, ...unknown[]] {
  return [name, id, null, null, null, null, null, name, name];
}

describe('referral invite candidates', () => {
  test('keeps eligible students, hides the sender and active BetterLectio users', () => {
    const studentsMap = new Map([
      ['103', {
        id: '103',
        name: 'Foretrukket Navn',
        lectio_first_name: 'Aktiv',
        lectio_last_name: 'Elev',
        custom_pfp_url: null,
        lectio_pfp_url: 'https://example.test/picture.jpg',
        last_seen_at: '2026-08-02T12:00:00Z',
        extension_installed_at: '2026-07-01T00:00:00Z',
        extension_uninstalled_at: null,
        app_installed_at: null,
      }],
      ['104', {
        id: '104',
        name: 'App Elev',
        lectio_first_name: null,
        lectio_last_name: null,
        custom_pfp_url: null,
        lectio_pfp_url: null,
        last_seen_at: null,
        extension_installed_at: null,
        extension_uninstalled_at: null,
        app_installed_at: '2026-07-01T00:00:00Z',
      }],
    ]) as unknown as StudentsMap;

    const candidates = buildReferralInviteCandidates([
      item('Mig Selv (1x 01)', 'S100'),
      item('Alma Andersen (1x 02)', 'S101'),
      item('Bo Birk (2b 03)', 'S102'),
      item('Aktiv Elev (1x 04)', 'S103'),
      item('App Elev (1x 05)', 'S104'),
      item('Lærer Larsen', 'T200'),
    ], {
      schoolId: '94',
      userStudentId: '100',
      studentsMap,
      pinnedPeople: [],
      now: NOW,
    });

    assert.deepEqual(candidates.map((candidate) => candidate.id), ['S101', 'S102']);
  });

  test('shows pinned students first, then remaining classmates', () => {
    const candidates = buildReferralInviteCandidates([
      item('Alma Andersen (1x 02)', 'S101'),
      item('Bo Birk (2b 03)', 'S102'),
      item('Carla Clausen (1x 04)', 'S103'),
    ], {
      schoolId: '94',
      userStudentId: '100',
      studentsMap: null,
      pinnedPeople: [{
        id: 'S102',
        name: 'Bo Birk',
        classCode: '2b 03',
        type: 'S',
        starredAt: 42,
        schoolId: '94',
      }],
      now: NOW,
    });
    const groups = groupDefaultReferralInviteCandidates(candidates, '1x');

    assert.deepEqual(groups.pinned.map((candidate) => candidate.id), ['S102']);
    assert.deepEqual(groups.classmates.map((candidate) => candidate.id), ['S101', 'S103']);
  });

  test('searches the whole eligible school directory', () => {
    const candidates = buildReferralInviteCandidates([
      item('Alma Andersen (1x 02)', 'S101'),
      item('Carl Christian Meding (3z 08)', 'S102'),
    ], {
      schoolId: '94',
      userStudentId: '100',
      studentsMap: null,
      pinnedPeople: [],
      now: NOW,
    });

    assert.equal(searchReferralInviteCandidates(candidates, 'carl meding')[0]?.id, 'S102');
  });
});

describe('referral invite message and cooldown', () => {
  test('uses the fixed short Danish copy', () => {
    assert.equal(REFERRAL_INVITE_SUBJECT, 'BetterLectio');
    assert.equal(referralInviteBody('https://betterlectio.dk/r/100'),
      'Hey, prøv lige BetterLectio: https://betterlectio.dk/r/100',
    );
  });

  test('persists confirmed sends for 30 days and prunes expired entries', () => {
    const storage = new MemoryStorage();
    stampReferralInviteSent('94', '100', 'S101', NOW, storage);

    assert.deepEqual(getReferralInviteHistory('94', '100', NOW + 1, storage), { S101: NOW });
    assert.deepEqual(getReferralInviteHistory(
      '94',
      '100',
      NOW + REFERRAL_INVITE_COOLDOWN_MS,
      storage,
    ), {});
    assert.deepEqual(parseReferralInviteHistory('{"bad":true}', NOW), {});
  });
});

describe('referral invite Lectio compose fixtures', () => {
  test('parses compose controls and fetches only the student recipient cache', async () => {
    const html = readFileSync(
      new URL('../lectio-html/lectio/94/beskeder2-compose.html', import.meta.url),
      'utf8',
    );
    const doc = new LinkedomDOMParser().parseFromString(html, 'text/html') as unknown as Document;
    assert.ok(parseComposeFromDOM(doc));

    const requestedUrls: string[] = [];
    const originalFetch = globalThis.fetch;
    const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      value: { location: { origin: 'https://www.lectio.dk' } },
      configurable: true,
    });
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify({ items: [item('Alma Andersen (1x 02)', 'S101')] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const recipients = await fetchBeskederRecipientItems(doc, ['bcstudent']);
      assert.equal(recipients.length, 1);
      assert.equal(requestedUrls.length, 1);
      assert.match(requestedUrls[0], /type=bcstudent/);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalWindowDescriptor) {
        Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });
});
