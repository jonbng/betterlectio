export interface AvanceretSkemaCacheParams {
  afdelingId: string;
  subcache: string;
}

const AVANCERET_SKEMA_PATTERN = /AvanceretSkema_(\d+)_(\d{4})/;
const DROPDOWN_CACHE_TTL_MS = 5 * 60 * 1000;
const dropdownCache = new Map<string, { expiresAt: number; items: any[] }>();
const dropdownInflight = new Map<string, Promise<any[]>>();

function parseAvanceretSkemaParams(source: string): AvanceretSkemaCacheParams | null {
  const match = source.match(AVANCERET_SKEMA_PATTERN);
  if (!match) return null;
  return { afdelingId: match[1], subcache: match[2] };
}

export async function resolveAvanceretSkemaCacheParams(
  schoolId: string
): Promise<AvanceretSkemaCacheParams | null> {
  const scripts = document.querySelectorAll('script');
  for (const script of scripts) {
    const content = script.textContent;
    if (!content) continue;
    const parsed = parseAvanceretSkemaParams(content);
    if (parsed) return parsed;
  }

  try {
    const advUrl = `${window.location.origin}/lectio/${schoolId}/FindSkemaAdv.aspx`;
    const response = await fetch(advUrl, { credentials: 'include' });
    if (!response.ok) return null;
    const html = await response.text();
    return parseAvanceretSkemaParams(html);
  } catch {
    return null;
  }
}

export async function fetchAvanceretSkemaDropdownItems(schoolId: string): Promise<any[]> {
  const params = await resolveAvanceretSkemaCacheParams(schoolId);
  if (!params) return [];

  const cacheKey = `${schoolId}:${params.afdelingId}:${params.subcache}`;
  const now = Date.now();
  const cached = dropdownCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.items;

  const inflight = dropdownInflight.get(cacheKey);
  if (inflight) return inflight;

  const request = (async () => {
    const url = `${window.location.origin}/lectio/${schoolId}/cache/DropDown.aspx?type=AvanceretSkema&afdeling=${params.afdelingId}&subcache=${params.subcache}`;
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) return [];
    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    dropdownCache.set(cacheKey, {
      expiresAt: now + DROPDOWN_CACHE_TTL_MS,
      items,
    });
    return items;
  })();

  dropdownInflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    dropdownInflight.delete(cacheKey);
  }
}
