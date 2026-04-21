import type { DropdownItem } from './findskema-cache';

/**
 * Lectio's message compose autocomplete is backed by four separate caches
 * (not AvanceretSkema): bcteacher, bcstudent, bchold, bcgroup. The IDs in
 * these caches are the exact ones the recipient form accepts — using
 * AvanceretSkema's HE/GE ids silently fails validation server-side.
 *
 * The compose page's inline scripts register these via
 * `Autocomplete.registerDataSetUrl('bc<kind>_<afdeling>_y<year>', '/lectio/<school>/cache/DropDown.aspx?type=bc<kind>&...')`.
 * We harvest those URLs directly so we always hit the same endpoints Lectio
 * would, including the cache-busting `dt` param.
 */

const DROPDOWN_CACHE_TTL_MS = 5 * 60 * 1000;
const REGISTER_URL_PATTERN = /registerDataSetUrl\(\s*['"](bc(?:teacher|student|hold|group))_[^'"]+['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g;

const cache = new Map<string, { expiresAt: number; items: DropdownItem[] }>();
const inflight = new Map<string, Promise<DropdownItem[]>>();

export type BeskederRecipientKind = 'bcteacher' | 'bcstudent' | 'bchold' | 'bcgroup';

function collectCacheUrls(doc: Document = document): Map<BeskederRecipientKind, string> {
  const urls = new Map<BeskederRecipientKind, string>();
  for (const script of doc.querySelectorAll('script')) {
    const content = script.textContent;
    if (!content || content.indexOf('registerDataSetUrl') < 0) continue;
    REGISTER_URL_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = REGISTER_URL_PATTERN.exec(content)) !== null) {
      const kind = match[1] as BeskederRecipientKind;
      if (!urls.has(kind)) urls.set(kind, match[2]);
    }
  }
  return urls;
}

async function fetchOne(url: string): Promise<DropdownItem[]> {
  const absolute = new URL(url, window.location.origin).href;
  const now = Date.now();
  const cached = cache.get(absolute);
  if (cached && cached.expiresAt > now) return cached.items;

  const existing = inflight.get(absolute);
  if (existing) return existing;

  const request = (async () => {
    const response = await fetch(absolute, { credentials: 'include' });
    if (!response.ok) return [];
    const data = await response.json();
    const items = Array.isArray(data?.items) ? (data.items as DropdownItem[]) : [];
    cache.set(absolute, { expiresAt: now + DROPDOWN_CACHE_TTL_MS, items });
    return items;
  })();

  inflight.set(absolute, request);
  try {
    return await request;
  } finally {
    inflight.delete(absolute);
  }
}

export async function fetchBeskederRecipientItems(
  doc: Document = document,
): Promise<DropdownItem[]> {
  const urls = collectCacheUrls(doc);
  if (urls.size === 0) return [];

  const results = await Promise.all(
    Array.from(urls.values()).map((url) =>
      fetchOne(url).catch(() => [] as DropdownItem[]),
    ),
  );
  return results.flat();
}
