import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';

globalThis.DOMParser = DOMParser;

const { mergeOccupancy, parseRooms } = await import('../lib/lokaler-occupancy.ts');
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

console.log('Lokaler occupancy parser tests passed');
