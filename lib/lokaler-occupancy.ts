/**
 * Room list + live occupancy (Android RoomParser / RoomScheduleRepository parity).
 * Sources: FindSkema.aspx?type=lokale + SkemaAvanceret.aspx?type=aktuelleallelokaler
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
  inUse: boolean;
}

const CACHE_PREFIX = 'bl-lokaler-occupancy-v1';

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
  const full = (a.textContent ?? '').replace(/\u00a0/g, ' ').trim();
  if (!full) return null;
  const parts = full.split(/\s+/, 2);
  const shortName = parts[0] ?? full;
  const name = parts[1]?.trim() || shortName;
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
  const dashIndex = text.indexOf('-');
  if (dashIndex <= 0) return null;
  const shortName = text.slice(0, dashIndex).trim();
  const name = text.slice(dashIndex + 1).trim();
  if (!shortName || !name) return null;
  const booking = container.querySelector('table');
  const bookingText = booking?.textContent ?? '';
  const notUsed = !booking || bookingText.includes('Der er ingen data');
  return { shortName, name, inUse: !notUsed };
}

function parseAvailabilityRow(row: Element): RoomAvailability | null {
  const header = row.querySelector('h2');
  if (!header) return null;
  return parseAvailabilityFromHeader(header, row);
}

/**
 * Parse `SkemaAvanceret.aspx?type=aktuelleallelokaler` occupancy island.
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
  return rooms.map((room) => {
    const match = availabilities.find(
      (it) =>
        it.name.localeCompare(room.name, undefined, { sensitivity: 'accent' }) === 0 ||
        it.shortName.localeCompare(room.shortName, undefined, { sensitivity: 'accent' }) === 0 ||
        it.name.localeCompare(room.shortName, undefined, { sensitivity: 'accent' }) === 0 ||
        `${it.shortName} - ${it.name}`.localeCompare(
          `${room.shortName} - ${room.name}`,
          undefined,
          { sensitivity: 'accent' },
        ) === 0,
    );
    return {
      id: room.id,
      shortName: room.shortName,
      name: room.name,
      inUse: match?.inUse ?? false,
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

  let availabilities: RoomAvailability[] = [];
  try {
    const availHtml = await fetchHtml(
      `/lectio/${schoolId}/SkemaAvanceret.aspx?type=aktuelleallelokaler&nosubnav=1&prevurl=FindSkemaAdv.aspx`,
    );
    availabilities = parseAvailabilities(availHtml);
  } catch {
    /* occupancy page optional — still show rooms as free */
  }

  const merged = mergeOccupancy(rooms, availabilities);
  writeCache(schoolId, merged);
  return merged;
}
