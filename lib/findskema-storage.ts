import { getSettings } from './settings-storage';

const STARRED_KEY = 'il-starred-people';
const RECENTS_KEY = 'il-recent-searches';
const PICTURE_CACHE_KEY = 'il-picture-cache';
const NAME_ID_CACHE_KEY = 'il-name-id-cache';
const MAX_STARRED = 50;
const MAX_RECENTS = 10;
const MAX_CACHED_PICTURES = 1000;
const PICTURE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface StarredPerson {
  id: string;
  name: string;
  classCode: string;
  type: string;
  starredAt: number;
}

export interface RecentPerson {
  id: string;
  name: string;
  classCode: string;
  type: string;
  url: string;
  timestamp: number;
}

export function getStarredPeople(): StarredPerson[] {
  try {
    const stored = localStorage.getItem(STARRED_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function addStarredPerson(person: Omit<StarredPerson, 'starredAt'>): void {
  // Check if starred people feature is enabled
  const settings = getSettings();
  if (!(settings.data?.starredPeople ?? true)) return;

  try {
    const starred = getStarredPeople().filter(p => p.id !== person.id);
    starred.unshift({ ...person, starredAt: Date.now() });
    localStorage.setItem(STARRED_KEY, JSON.stringify(starred.slice(0, MAX_STARRED)));
  } catch {
    // Ignore errors
  }
}

export function removeStarredPerson(id: string): void {
  try {
    const starred = getStarredPeople().filter(p => p.id !== id);
    localStorage.setItem(STARRED_KEY, JSON.stringify(starred));
  } catch {
    // Ignore errors
  }
}

export function isPersonStarred(id: string): boolean {
  return getStarredPeople().some(p => p.id === id);
}

export function toggleStarred(person: Omit<StarredPerson, 'starredAt'>): boolean {
  const isCurrentlyStarred = isPersonStarred(person.id);
  if (isCurrentlyStarred) {
    removeStarredPerson(person.id);
    return false;
  } else {
    addStarredPerson(person);
    return true;
  }
}

export function getRecentPeople(): RecentPerson[] {
  try {
    const stored = localStorage.getItem(RECENTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function addRecentPerson(person: Omit<RecentPerson, 'timestamp'>): void {
  // Check if recent searches feature is enabled
  const settings = getSettings();
  if (!(settings.data?.recentSearches ?? true)) return;

  try {
    const recents = getRecentPeople().filter(p => p.id !== person.id);
    recents.unshift({ ...person, timestamp: Date.now() });
    localStorage.setItem(RECENTS_KEY, JSON.stringify(recents.slice(0, MAX_RECENTS)));
  } catch {
    // Ignore errors
  }
}

export function removeRecentPerson(id: string): void {
  try {
    const recents = getRecentPeople().filter(p => p.id !== id);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
  } catch {
    // Ignore errors
  }
}

export function parsePersonInfo(name: string): { displayName: string; classCode: string } {
  // Input: "Adam Johan Juhl Langkjaer (1c 02)"
  // Output: { displayName: "Adam Johan Juhl Langkjaer", classCode: "1c 02" }
  const match = name.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (match) {
    return {
      displayName: match[1].trim(),
      classCode: match[2].trim(),
    };
  }
  return { displayName: name, classCode: '' };
}

interface ScheduleUrlOptions {
  name?: string;
  type?: 'stamklasse' | 'holdelement';
}

function appendScheduleParams(baseUrl: string, options?: ScheduleUrlOptions): string {
  const url = new URL(baseUrl, window.location.origin);

  if (options?.type) {
    url.searchParams.set('type', options.type);
  }

  const trimmedName = options?.name?.trim();
  if (trimmedName) {
    url.searchParams.set('name', trimmedName);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function getScheduleUrl(id: string, schoolId: string, options?: ScheduleUrlOptions): string {
  if (id.startsWith('URL:')) {
    const encoded = id.slice(4);
    try {
      return appendScheduleParams(decodeURIComponent(encoded), options);
    } catch {
      return `/lectio/${schoolId}/SkemaNy.aspx`;
    }
  }

  const prefix2 = id.substring(0, 2);
  const prefix1 = id.charAt(0);

  const twoCharMap: Record<string, { param: string; start: number; type?: 'stamklasse' | 'holdelement' }> = {
    SC: { param: 'klasseid', start: 2, type: 'stamklasse' },
    RO: { param: 'lokaleid', start: 2 },
    RE: { param: 'ressourceid', start: 2 },
    HE: { param: 'holdelementid', start: 2, type: 'holdelement' },
    GE: { param: 'gruppeid', start: 2 },
  };

  const oneCharMap: Record<string, { param: string; start: number; type?: 'stamklasse' | 'holdelement' }> = {
    S: { param: 'elevid', start: 1 },
    T: { param: 'laererid', start: 1 },
    L: { param: 'lokaleid', start: 1 },
    K: { param: 'klasseid', start: 1, type: 'stamklasse' },
    H: { param: 'holdid', start: 1 },
    G: { param: 'gruppeid', start: 1 },
    R: { param: 'ressourceid', start: 1 },
  };

  const mapped = twoCharMap[prefix2] || oneCharMap[prefix1] || { param: 'elevid', start: 1 };
  const numericId = id.slice(mapped.start);
  const scheduleUrl = new URL(`/lectio/${schoolId}/SkemaNy.aspx`, window.location.origin);
  scheduleUrl.searchParams.set(mapped.param, numericId);

  const typeParam = options?.type || mapped.type;
  if (typeParam) {
    scheduleUrl.searchParams.set('type', typeParam);
  }

  const trimmedName = options?.name?.trim();
  if (trimmedName) {
    scheduleUrl.searchParams.set('name', trimmedName);
  }

  return `${scheduleUrl.pathname}${scheduleUrl.search}`;
}

// Picture cache types and functions
interface PictureCacheEntry {
  url: string | null; // null means no picture available
  cachedAt: number;
}

interface PictureCache {
  [id: string]: PictureCacheEntry;
}

function getPictureCache(): PictureCache {
  try {
    const stored = localStorage.getItem(PICTURE_CACHE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function savePictureCache(cache: PictureCache): void {
  try {
    // Prune old entries if cache is too large
    const entries = Object.entries(cache);
    if (entries.length > MAX_CACHED_PICTURES) {
      // Sort by cachedAt and keep only the most recent
      entries.sort((a, b) => b[1].cachedAt - a[1].cachedAt);
      cache = Object.fromEntries(entries.slice(0, MAX_CACHED_PICTURES));
    }
    localStorage.setItem(PICTURE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore errors
  }
}

export function getCachedPictureUrl(id: string): string | undefined {
  const cache = getPictureCache();
  const entry = cache[id];
  if (!entry || !entry.url) return undefined; // Not in cache or no URL

  // Check if cache is still valid
  if (Date.now() - entry.cachedAt > PICTURE_CACHE_TTL) {
    return undefined; // Expired
  }

  return entry.url;
}

export function cachePictureUrl(id: string, url: string | null): void {
  // Don't cache null values - we'll retry fetching next time
  if (!url) return;

  const cache = getPictureCache();
  cache[id] = { url, cachedAt: Date.now() };
  savePictureCache(cache);
}

export function clearPictureCache(): void {
  try {
    localStorage.removeItem(PICTURE_CACHE_KEY);
  } catch {
    // Ignore errors
  }
}

// Rate limiting for picture fetches
const FETCH_DELAY_MS = 250; // Minimum delay between fetches
const MAX_CONCURRENT_FETCHES = 2; // Only one at a time to avoid rate limiting
let activeFetches = 0;
const fetchQueue: Array<() => void> = [];

function processQueue(): void {
  while (fetchQueue.length > 0 && activeFetches < MAX_CONCURRENT_FETCHES) {
    const next = fetchQueue.shift();
    if (next) next();
  }
}

async function rateLimitedFetch<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const execute = async () => {
      activeFetches++;
      try {
        // Add small delay to spread out requests
        await new Promise(r => setTimeout(r, FETCH_DELAY_MS));
        const result = await fn();
        resolve(result);
      } catch (err) {
        reject(err);
      } finally {
        activeFetches--;
        processQueue();
      }
    };

    if (activeFetches < MAX_CONCURRENT_FETCHES) {
      execute();
    } else {
      fetchQueue.push(execute);
    }
  });
}

// Fetch picture URL from context card (with rate limiting)
export async function fetchPictureUrl(id: string, schoolId: string): Promise<string | null> {
  // Check cache first
  const cached = getCachedPictureUrl(id);
  if (cached !== undefined) {
    return cached;
  }

  return rateLimitedFetch(async () => {
    // Double-check cache in case another request cached it while we were queued
    const rechecked = getCachedPictureUrl(id);
    if (rechecked !== undefined) {
      return rechecked;
    }

    try {
      const response = await fetch(
        `${window.location.origin}/lectio/${schoolId}/contextcard/contextcard.aspx?searchtype=id&lectiocontextcard=${id}`
      );

      if (!response.ok) {
        cachePictureUrl(id, null);
        return null;
      }

      const html = await response.text();

      // Parse HTML to find picture URL
      // Looking for: src="/lectio/94/GetImage.aspx?pictureid=74096224965"
      const match = html.match(/src="([^"]*GetImage\.aspx\?pictureid=\d+)"/);

      if (match) {
        // Convert to absolute URL with fullsize parameter
        const url = new URL(match[1], window.location.origin);
        url.searchParams.set('fullsize', '1');
        const pictureUrl = url.toString();
        cachePictureUrl(id, pictureUrl);
        return pictureUrl;
      }

      // No picture found
      cachePictureUrl(id, null);
      return null;
    } catch {
      // Don't cache errors - let it retry later
      return null;
    }
  });
}

// ── Name → Context Card ID Cache ────────────────────────────────────────

type NameIdCache = Record<string, string>; // normalized name → context card ID

function getNameIdCache(): NameIdCache {
  try {
    const stored = localStorage.getItem(NAME_ID_CACHE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveNameIdCache(cache: NameIdCache): void {
  try {
    localStorage.setItem(NAME_ID_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore
  }
}

function normalizeNameForLookup(name: string): string {
  // Strip class/code suffixes like "(k) (1x)" and normalize whitespace
  return name.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
}

/**
 * Bulk-register name → context card ID mappings.
 * Called from FindSkemaPage after fetching the dropdown data.
 */
export function registerNameIdMappings(entries: Array<{ name: string; id: string }>): void {
  const cache = getNameIdCache();
  for (const { name, id } of entries) {
    const key = normalizeNameForLookup(name);
    if (key && id) cache[key] = id;
  }
  saveNameIdCache(cache);
}

let _nameIdCacheLoading = false;
let _nameIdCacheLoaded = false;
const _nameIdCacheCallbacks: Array<() => void> = [];

/**
 * Ensure the name→ID cache is populated from the FindSkema dropdown.
 * Fetches the AvanceretSkema dropdown data if not already cached.
 * Calls `onReady` when done (immediately if already loaded).
 */
export async function ensureNameIdCache(schoolId: string, onReady?: () => void): Promise<void> {
  // Already populated
  const cache = getNameIdCache();
  if (Object.keys(cache).length > 0 || _nameIdCacheLoaded) {
    onReady?.();
    return;
  }

  if (onReady) _nameIdCacheCallbacks.push(onReady);

  // Already loading — just wait for callbacks
  if (_nameIdCacheLoading) return;
  _nameIdCacheLoading = true;

  try {
    // Resolve afdeling/subcache params
    const { resolveAvanceretSkemaCacheParams } = await import('./findskema-cache');
    const params = await resolveAvanceretSkemaCacheParams(schoolId);
    if (!params) {
      _nameIdCacheLoaded = true;
      _nameIdCacheCallbacks.forEach(cb => cb());
      _nameIdCacheCallbacks.length = 0;
      return;
    }

    const response = await fetch(
      `${window.location.origin}/lectio/${schoolId}/cache/DropDown.aspx?type=AvanceretSkema&afdeling=${params.afdelingId}&subcache=${params.subcache}`
    );
    const data = await response.json();

    const entries: Array<{ name: string; id: string }> = [];
    for (const item of data.items) {
      const id = item[1] as string;
      if (!id || typeof id !== 'string') continue;
      // Only students (S*) and teachers (T*) — skip classes/rooms/etc.
      if (!id.startsWith('S') && !id.startsWith('T')) continue;
      entries.push({ name: item[0] as string, id });
    }

    if (entries.length > 0) registerNameIdMappings(entries);
  } catch {
    // Silently fail
  } finally {
    _nameIdCacheLoaded = true;
    _nameIdCacheLoading = false;
    _nameIdCacheCallbacks.forEach(cb => cb());
    _nameIdCacheCallbacks.length = 0;
  }
}

/**
 * Look up a context card ID by person name.
 * Searches: name-ID cache, starred people, recent searches.
 */
export function lookupContextCardIdByName(name: string): string | null {
  const normalized = normalizeNameForLookup(name);
  if (!normalized) return null;

  // 1. Check dedicated name-ID cache
  const cache = getNameIdCache();
  if (cache[normalized]) return cache[normalized];

  // 2. Check starred people
  for (const p of getStarredPeople()) {
    if (normalizeNameForLookup(p.name) === normalized) return p.id;
  }

  // 3. Check recents
  for (const r of getRecentPeople()) {
    if (normalizeNameForLookup(r.name) === normalized) return r.id;
  }

  return null;
}
