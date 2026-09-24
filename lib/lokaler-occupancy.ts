/**
 * Room list + live occupancy (Android RoomParser / RoomScheduleRepository parity).
 * Sources: FindSkema.aspx?type=lokale + both current-room variants of SkemaAvanceret.aspx
 */

export interface RoomAvailability {
  shortName: string;
  name: string;
  inUse: boolean;
}

export interface RoomListItem {
  id: string;
  shortName: string;
  name: string;
}

export interface RoomWithOccupancy {
  id: string;
  shortName: string;
  name: string;
  /** null means Lectio did not return occupancy for this room. */
  inUse: boolean | null;
}

// v2 distinguishes unknown occupancy from a room that is confirmed free.
const CACHE_PREFIX = 'bl-lokaler-occupancy-v3';

/** Occupancy is live — treat cache as stale quickly. */
export const LOKALER_FRESH_MS = 1000 * 60 * 2;

interface CacheEntry {
  value: RoomWithOccupancy[];
  fetchedAt: number;
}

function readCache(schoolId: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}:${schoolId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed || typeof parsed.fetchedAt !== 'number' || !Array.isArray(parsed.value)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(schoolId: string, value: RoomWithOccupancy[]): void {
  try {
    const envelope: CacheEntry = { value, fetchedAt: Date.now() };
    localStorage.setItem(`${CACHE_PREFIX}:${schoolId}`, JSON.stringify(envelope));
  } catch {
    /* ignore quota errors */
  }
}

export function getCachedLokalerOccupancy(schoolId: string): CacheEntry | null {
  return readCache(schoolId);
}

function idFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const qIndex = href.indexOf('?');
  const query = qIndex >= 0 ? href.slice(qIndex + 1) : href;
  for (const part of query.split('&')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (key.toLowerCase() === 'id' && value) return decodeURIComponent(value);
  }
  return null;
}

function parseRoomAnchor(a: Element): RoomListItem | null {
  const href = a.getAttribute('href');
  const id = idFromHref(href);
  if (!id) return null;
  const symbol = a.querySelector('.findskema-symbol');
  const full = (a.textContent ?? '').replace(/\u00a0/g, ' ').trim();
  if (!full) return null;

  if (symbol) {
    const shortName = (symbol.textContent ?? '').replace(/\u00a0/g, ' ').trim();
    if (!shortName) return null;

    // Lectio places the description directly after the span, without a text
    // separator: <span>10</span>Lærer arbejdsrum. Reading the anchor's
    // textContent therefore produces "10Lærer arbejdsrum".
    const clone = a.cloneNode(true) as Element;
    clone.querySelector('.findskema-symbol')?.remove();
    const name = (clone.textContent ?? '').replace(/\u00a0/g, ' ').trim();
    return { id, shortName, name };
  }

  const match = full.match(/^(\S+)(?:\s+(.*))?$/);
  const shortName = match?.[1] ?? full;
  const name = match?.[2]?.trim() ?? '';
  return { id, shortName, name };
}

/**
 * Parse `FindSkema.aspx?type=lokale` room list.
 */
export function parseRooms(html: string): RoomListItem[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const container =
    doc.getElementById('m_Content_listecontainer') ??
    doc.querySelector('[id*="listecontainer"]');

  const items: RoomListItem[] = [];
  const seen = new Set<string>();

  const add = (item: RoomListItem | null) => {
    if (!item || seen.has(item.id)) return;
    seen.add(item.id);
    items.push(item);
  };

  if (container) {
    const nodes = container.querySelectorAll('tr, li, a[href*="lokale"], a[href*="type=lokale"]');
    nodes.forEach((node) => {
      if (node.tagName.toLowerCase() === 'a') {
        add(parseRoomAnchor(node));
      } else {
        const a = node.querySelector('a[href]');
        if (a) add(parseRoomAnchor(a));
      }
    });
  }

  if (items.length === 0) {
    doc
      .querySelectorAll('a[href*="type=lokale"], a[href*="lokale&"], a[href*="id="]')
      .forEach((a) => add(parseRoomAnchor(a)));
  }

  return items.slice(0, 500);
}

function parseAvailabilityFromHeader(
  header: Element,
  container: Element,
): RoomAvailability | null {
  const text = (header.textContent ?? '').replace(/\u00a0/g, ' ').trim();
  const separator = text.match(/\s[-\u2013\u2014]\s*/);
  const dashIndex = separator?.index ?? -1;
  if (dashIndex <= 0) return null;
  const shortName = text.slice(0, dashIndex).trim();
  const separatorLength = separator?.[0].length ?? 1;
  const name = text.slice(dashIndex + separatorLength).trim();
  // Some schools only configure a room code. Lectio still renders the
  // separator (for example "101 -"), so an empty description is valid.
  if (!shortName) return null;
  const booking = container.querySelector('table');
  const bookingText = booking?.textContent ?? '';
  const notUsed = !booking || /Der er ingen data/i.test(bookingText);
  return { shortName, name, inUse: !notUsed };
}

function parseAvailabilityRow(row: Element): RoomAvailability | null {
  const header = row.querySelector('h2');
  if (header) return parseAvailabilityFromHeader(header, row);

  // Lectio's older/current-department variant renders e.g.
  // <span>Lokale: 101</span> instead of the newer "101 - Name" h2.
  const label = row.querySelector('.title-medium span') ?? row.querySelector('span');
  const text = (label?.textContent ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/^Lokale\s*:?\s*/i, '')
    .trim();
  if (!text) return null;

  const separator = text.match(/\s[-\u2013\u2014]\s*/);
  const separatorIndex = separator?.index ?? -1;
  const shortName = separatorIndex > 0 ? text.slice(0, separatorIndex).trim() : text;
  const name =
    separatorIndex > 0
      ? text.slice(separatorIndex + (separator?.[0].length ?? 1)).trim()
      : text;

  const booking = row.querySelector('table');
  if (!booking) return null;
  const inUse = !/Der er ingen data/i.test(booking.textContent ?? '');
  return { shortName, name, inUse };
}

/**
 * Parse the `aktuelleallelokaler` / `aktuellelokaler` occupancy island.
 * A room is in use when its booking table does not contain "Der er ingen data".
 */
export function parseAvailabilities(html: string): RoomAvailability[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const island =
    doc.getElementById('m_Content_LectioDetailIsland1_pa') ??
    doc.querySelector('[id*="LectioDetailIsland"]');

  const rooms: RoomAvailability[] = [];
  const seen = new Set<string>();

  const add = (item: RoomAvailability | null) => {
    if (!item) return;
    const key = `${item.name.toLowerCase()}::${item.shortName.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    rooms.push(item);
  };

  if (island) {
    Array.from(island.children).forEach((row) => {
      const id = row.id ?? '';
      const hasPrintId =
        id.startsWith('printSingleControl') ||
        id.toLowerCase().includes('printsingle');
      const hasH2 = !!row.querySelector('h2');
      if (!hasPrintId && !hasH2) return;
      add(parseAvailabilityRow(row));
    });
  }

  if (rooms.length === 0) {
    doc
      .querySelectorAll('[id^="printSingleControl"], [id*="printSingleControl"]')
      .forEach((row) => add(parseAvailabilityRow(row)));
  }

  if (rooms.length === 0) {
    doc.querySelectorAll('h2').forEach((h2) => {
      const parent = h2.parentElement;
      if (!parent) return;
      add(parseAvailabilityFromHeader(h2, parent));
    });
  }

  return rooms;
}

/**
 * Join room list with availability by matching display name (Android/Flutter behavior).
 */
export function mergeOccupancy(
  rooms: RoomListItem[],
  availabilities: RoomAvailability[],
): RoomWithOccupancy[] {
  const normalize = (value: string) =>
    value
      .normalize('NFKC')
      .replace(/\u00a0/g, ' ')
      .replace(/^lokale\s*:?\s*/i, '')
      .replace(/\s*[-\u2013\u2014]\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('da-DK');

  const keysFor = (shortName: string, name: string) => {
    const values = [shortName, name, `${shortName} ${name}`];
    const keys = new Set<string>();
    values.forEach((value) => {
      const normalized = normalize(value);
      if (!normalized) return;
      keys.add(normalized);
      keys.add(normalized.replace(/\s/g, ''));
    });
    return keys;
  };

  const availabilityByKey = new Map<string, RoomAvailability>();
  availabilities.forEach((availability) => {
    keysFor(availability.shortName, availability.name).forEach((key) => {
      if (!availabilityByKey.has(key)) availabilityByKey.set(key, availability);
    });
  });

  return rooms.map((room) => {
    let match: RoomAvailability | undefined;
    for (const key of keysFor(room.shortName, room.name)) {
      match = availabilityByKey.get(key);
      if (match) break;
    }
    return {
      id: room.id,
      shortName: room.shortName,
      name: room.name,
      inUse: match?.inUse ?? null,
    };
  });
}

async function fetchHtml(path: string): Promise<string> {
  const url = new URL(path, window.location.origin).href;
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Kunne ikke hente lokaler (${response.status})`);
  }
  return response.text();
}

export async function fetchLokalerOccupancy(schoolId: string): Promise<RoomWithOccupancy[]> {
  const roomsHtml = await fetchHtml(`/lectio/${schoolId}/FindSkema.aspx?type=lokale`);
  const rooms = parseRooms(roomsHtml);
  if (rooms.length === 0) {
    throw new Error('Kunne ikke aflæse Lectios lokaleliste');
  }

  const availabilityLists = await Promise.all(
    ['aktuelleallelokaler', 'aktuellelokaler'].map(async (type) => {
      try {
        const availHtml = await fetchHtml(
          `/lectio/${schoolId}/SkemaAvanceret.aspx?type=${type}&nosubnav=1&prevurl=FindSkemaAdv.aspx`,
        );
        return parseAvailabilities(availHtml);
      } catch {
        return [];
      }
    }),
  );
  const availabilities = availabilityLists.flat();

  // Occupancy is optional and is not exposed consistently by every school.
  // If neither variant is available, keep the room directory useful and
  // render the statuses as unknown.

  const merged = mergeOccupancy(rooms, availabilities);
  writeCache(schoolId, merged);
  return merged;
}
