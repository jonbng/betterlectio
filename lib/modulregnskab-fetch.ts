export interface ModulregnskabRow {
  kind: 'hold' | 'uden-kreditering' | 'teacher' | 'unknown';
  label: string;
  undervisningAfholdt: number | null;
  undervisningPlanlagt: number | null;
  andenAfholdt: number | null;
  andenPlanlagt: number | null;
  total: number | null;
  norm: number | null;
  afvigelse: string;
}

export interface ModulregnskabData {
  holdelementId: string;
  holdName: string;
  holdRow: ModulregnskabRow | null;
  breakdown: ModulregnskabRow[];
}

export interface HoldListing {
  holdelementId: string;
  holdName: string;
}

const STUDIEPLAN_CACHE_PREFIX = 'bl-modulregnskab-hold-list-v1';
const MODULREGNSKAB_CACHE_PREFIX = 'bl-modulregnskab-data-v1';
const HOLD_LIST_TTL = 1000 * 60 * 60 * 6;
const MODULREGNSKAB_TTL = 1000 * 60 * 10;

interface CachedEnvelope<T> {
  value: T;
  fetchedAt: number;
}

function readCache<T>(key: string, ttl: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEnvelope<T>;
    if (!parsed || typeof parsed.fetchedAt !== 'number') return null;
    if (Date.now() - parsed.fetchedAt > ttl) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T): void {
  try {
    const envelope: CachedEnvelope<T> = { value, fetchedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    /* ignore quota errors */
  }
}

function toNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/,/g, '.').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractCells(row: HTMLTableRowElement): string[] {
  return Array.from(row.querySelectorAll('td')).map((c) => c.textContent?.replace(/\u00a0/g, ' ').trim() ?? '');
}

function classifyRow(firstCell: HTMLTableCellElement, label: string): ModulregnskabRow['kind'] {
  const hasIndent = !!firstCell.querySelector('.IndentedBlock, div.IndentedBlock, DIV.IndentedBlock');
  if (!hasIndent) return 'hold';
  const italicText = firstCell.querySelector('i')?.textContent?.trim().toLowerCase() ?? '';
  if (italicText.includes('uden lærerkreditering') || label.toLowerCase().includes('uden lærerkreditering')) {
    return 'uden-kreditering';
  }
  return 'teacher';
}

export function parseModulregnskab(
  html: string,
  holdelementId: string,
): ModulregnskabData | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const title = doc.querySelector('#s_m_HeaderContent_MainTitle')?.textContent?.trim() ?? '';
  const holdName = title.replace(/^Holdet\s+/i, '').replace(/\s*-\s*Modulregnskab.*$/i, '').trim() || holdelementId;

  const table = doc.querySelector<HTMLTableElement>('#s_m_Content_Content_afholdtelektionertbl');
  if (!table) {
    return { holdelementId, holdName, holdRow: null, breakdown: [] };
  }

  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tr'));
  const dataRows = rows.filter((r) => r.querySelectorAll('td').length >= 8);

  let holdRow: ModulregnskabRow | null = null;
  const breakdown: ModulregnskabRow[] = [];

  for (const row of dataRows) {
    const firstCell = row.querySelector<HTMLTableCellElement>('td');
    if (!firstCell) continue;
    const cells = extractCells(row);
    // Columns: label | undervisningAfholdt | undervisningPlanlagt | andenAfholdt | andenPlanlagt | total | norm | afvigelse
    const label = cells[0] ?? '';
    const kind = classifyRow(firstCell, label);
    const record: ModulregnskabRow = {
      kind,
      label,
      undervisningAfholdt: toNumber(cells[1] ?? ''),
      undervisningPlanlagt: toNumber(cells[2] ?? ''),
      andenAfholdt: toNumber(cells[3] ?? ''),
      andenPlanlagt: toNumber(cells[4] ?? ''),
      total: toNumber(cells[5] ?? ''),
      norm: toNumber(cells[6] ?? ''),
      afvigelse: cells[7] ?? '',
    };
    if (kind === 'hold') {
      holdRow = record;
    } else {
      breakdown.push(record);
    }
  }

  return { holdelementId, holdName, holdRow, breakdown };
}

export async function fetchHoldListFromStudieplan(schoolId: string): Promise<HoldListing[]> {
  const cacheKey = `${STUDIEPLAN_CACHE_PREFIX}:${schoolId}`;
  const cached = readCache<HoldListing[]>(cacheKey, HOLD_LIST_TTL);
  if (cached) return cached;

  const url = new URL(`/lectio/${schoolId}/studieplan.aspx`, window.location.origin).href;
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`Kunne ikke hente studieplan (${response.status})`);
  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const seen = new Map<string, string>();
  const anchors = doc.querySelectorAll<HTMLAnchorElement>('a[href*="holdelementid="]');
  anchors.forEach((a) => {
    const href = a.getAttribute('href') ?? '';
    const match = href.match(/holdelementid=(\d+)/i);
    if (!match) return;
    const id = match[1];
    const name = a.textContent?.trim() ?? '';
    if (!name) return;
    if (!seen.has(id)) seen.set(id, name);
  });

  const listings: HoldListing[] = Array.from(seen.entries()).map(([holdelementId, holdName]) => ({
    holdelementId,
    holdName,
  }));

  writeCache(cacheKey, listings);
  return listings;
}

export async function fetchModulregnskab(
  schoolId: string,
  holdelementId: string,
): Promise<ModulregnskabData> {
  const cacheKey = `${MODULREGNSKAB_CACHE_PREFIX}:${schoolId}:${holdelementId}`;
  const cached = readCache<ModulregnskabData>(cacheKey, MODULREGNSKAB_TTL);
  if (cached) return cached;

  const url = new URL(
    `/lectio/${schoolId}/subnav/modulregnskab.aspx?holdelementid=${holdelementId}`,
    window.location.origin,
  ).href;
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`Kunne ikke hente modulregnskab (${response.status})`);
  const html = await response.text();
  const parsed = parseModulregnskab(html, holdelementId);
  if (!parsed) throw new Error('Kunne ikke parse modulregnskab');
  writeCache(cacheKey, parsed);
  return parsed;
}

export async function fetchAllModulregnskaber(
  schoolId: string,
): Promise<{ listings: HoldListing[]; data: ModulregnskabData[] }> {
  const listings = await fetchHoldListFromStudieplan(schoolId);
  const results = await Promise.all(
    listings.map(async (l) => {
      try {
        const data = await fetchModulregnskab(schoolId, l.holdelementId);
        return { ...data, holdName: data.holdName || l.holdName };
      } catch {
        return {
          holdelementId: l.holdelementId,
          holdName: l.holdName,
          holdRow: null,
          breakdown: [],
        } satisfies ModulregnskabData;
      }
    }),
  );
  return { listings, data: results };
}
