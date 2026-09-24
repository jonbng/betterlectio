import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';

globalThis.DOMParser = DOMParser;

const { fetchLokalerOccupancy, mergeOccupancy, parseAvailabilities, parseRooms } = await import(
  '../lib/lokaler-occupancy.ts'
);
const fixtureUrl = new URL(
  '../lectio-html-2026-09-15/lectio/94/findskema-lokale.html',
  import.meta.url,
);
const html = await Bun.file(fixtureUrl).text();
const rooms = parseRooms(html);

assert.equal(rooms.length, 77);
assert.deepEqual(
  rooms.find((room) => room.id === '3757138673'),
  {
    id: '3757138673',
    shortName: '10',
    name: 'Lærer arbejdsrum',
  },
);
assert.deepEqual(
  rooms.find((room) => room.id === '1360447753'),
  {
    id: '1360447753',
    shortName: '01',
    name: '',
  },
);

const merged = mergeOccupancy(rooms.slice(0, 2), [
  { shortName: '01', name: '01', inUse: true },
]);
assert.equal(merged[0]?.inUse, true);
assert.equal(merged[1]?.inUse, null);

const availabilityHtml = `
  <div id="s_m_Content_Content_LectioDetailIsland1_pa">
    <div id="s_m_Content_Content_printSingleControl1">
      <h2>10 - Lærer arbejdsrum</h2>
      <table><tr><td>Ma 08:15 Matematik</td></tr></table>
    </div>
    <div id="s_m_Content_Content_printSingleControl2">
      <h2>01 –</h2>
      <table><tr><td>Der er ingen data</td></tr></table>
    </div>
  </div>
`;
const availabilities = parseAvailabilities(availabilityHtml);
assert.deepEqual(availabilities, [
  { shortName: '10', name: 'Lærer arbejdsrum', inUse: true },
  { shortName: '01', name: '', inUse: false },
]);

const legacyAvailabilityHtml = `
  <div id="m_Content_LectioDetailIsland1_pa">
    <div id="printSingleControl1">
      <div class="title-medium"><span>Lokale 10 - Lærer arbejdsrum</span></div>
      <table><tr><td>Ma 08:15 Matematik</td></tr></table>
    </div>
    <div id="printSingleControl2">
      <div class="title-medium"><span>Lokale 01 -</span></div>
      <table><tr><td>Der er ingen data...</td></tr></table>
    </div>
  </div>
`;
assert.deepEqual(parseAvailabilities(legacyAvailabilityHtml), [
  { shortName: '10', name: 'Lærer arbejdsrum', inUse: true },
  { shortName: '01', name: '', inUse: false },
]);

const normalizedMerge = mergeOccupancy(
  [{ id: '10', shortName: 'A-10', name: 'Lærer  arbejdsrum' }],
  [{ shortName: 'A-10', name: 'A-10 – Lærer arbejdsrum', inUse: true }],
);
assert.equal(normalizedMerge[0]?.inUse, true);

globalThis.window = { location: { origin: 'https://www.lectio.dk' } };
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
};
let requestCount = 0;
globalThis.fetch = async () => {
  requestCount += 1;
  return {
    ok: true,
    text: async () => (requestCount === 1 ? html : '<html><body></body></html>'),
  };
};
const roomsWithoutOccupancy = await fetchLokalerOccupancy('94');
assert.equal(roomsWithoutOccupancy.length, 77);
assert.ok(roomsWithoutOccupancy.every((room) => room.inUse === null));
assert.equal(requestCount, 3);

console.log('Lokaler occupancy parser tests passed');
