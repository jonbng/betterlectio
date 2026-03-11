import { getHoldDisplayName } from '@/lib/hold-mapping';

const CACHE_KEY = 'bl-schedule-today';
const LEGACY_CACHE_KEY = 'il-schedule-today';
const CACHE_TTL = 45 * 60 * 1000; // 45 minutes

export interface ScheduleBlock {
  start: number; // minutes since midnight
  end: number;   // minutes since midnight
  label: string; // hold/subject display name
  holdCode: string; // raw hold code for color
  cancelled?: boolean; // true if "Aflyst"
}

interface CachedSchedule {
  date: string; // ISO date
  schoolId: string;
  blocks: ScheduleBlock[];
  fetchedAt: number; // timestamp
}

function getCacheKey(schoolId: string): string {
  return `${CACHE_KEY}:${schoolId}`;
}

function getLegacyCacheKey(schoolId: string): string {
  return `${LEGACY_CACHE_KEY}:${schoolId}`;
}

/** Parse "8:10" → 490 */
function parseTime(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

/** Get today as YYYY-MM-DD in local timezone */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Try to read a valid cached schedule for today */
export function getCachedSchedule(schoolId: string): ScheduleBlock[] | null {
  try {
    const key = getCacheKey(schoolId);
    const legacyKey = getLegacyCacheKey(schoolId);
    const raw = localStorage.getItem(key) ?? localStorage.getItem(legacyKey);
    if (!localStorage.getItem(key) && raw) {
      localStorage.setItem(key, raw);
    }
    if (!raw) return null;
    const cached: CachedSchedule = JSON.parse(raw);
    if (cached.schoolId !== schoolId) return null;
    if (cached.date !== todayISO()) return null;
    if (Date.now() - cached.fetchedAt > CACHE_TTL) return null;
    return cached.blocks;
  } catch {
    return null;
  }
}

function saveCachedSchedule(schoolId: string, blocks: ScheduleBlock[]): void {
  const data: CachedSchedule = {
    schoolId,
    date: todayISO(),
    blocks,
    fetchedAt: Date.now(),
  };
  try {
    localStorage.setItem(getCacheKey(schoolId), JSON.stringify(data));
  } catch { /* ignore quota errors */ }
}

/** Parse schedule blocks from a fetched Lectio schedule HTML document */
function parseScheduleFromDoc(doc: Document): ScheduleBlock[] {
  const today = todayISO();
  const todayCell = doc.querySelector(`.s2skema td[data-date="${today}"]`);
  if (!todayCell) return [];

  const bricks = todayCell.querySelectorAll<HTMLElement>('.s2skemabrik.s2bgbox.s2brik');
  const blocks: ScheduleBlock[] = [];

  bricks.forEach((brick) => {
    if (brick.style.display === 'none') return;

    const isCancelled = brick.classList.contains('s2cancelled');

    // Parse time from tooltip: "27/2-2026 08:10 til 09:50"
    const tooltip = brick.getAttribute('data-tooltip') || '';
    const timeMatch = tooltip.match(/(\d{1,2}:\d{2})\s+til\s+(\d{1,2}:\d{2})/);
    if (!timeMatch) return;

    const start = parseTime(timeMatch[1]);
    const end = parseTime(timeMatch[2]);

    // Extract hold code from tooltip: "Hold: 1x En" or from context card spans
    let holdCode = '';
    const holdLine = tooltip.match(/^Hold:\s*(.+)$/m);
    if (holdLine) {
      // Take first hold if comma-separated
      holdCode = holdLine[1].split(',')[0].trim();
    }

    const label = holdCode ? getHoldDisplayName(holdCode) : extractTitleFromTooltip(tooltip);

    blocks.push({ start, end, label, holdCode, ...(isCancelled ? { cancelled: true } : {}) });
  });

  blocks.sort((a, b) => a.start - b.start);
  return blocks;
}

/** Extract a display title from tooltip first line (e.g. "Middelalderen" or the hold name) */
function extractTitleFromTooltip(tooltip: string): string {
  const lines = tooltip.split('\n').map(l => l.trim()).filter(Boolean);
  // First line is either the activity title or date line
  for (const line of lines) {
    if (/^\d+\/\d+-\d{4}/.test(line)) continue; // skip date lines
    if (/^(Hold|Lærer|Lokale|Elever|Lektier|Note|Øvrigt):/i.test(line)) continue;
    if (/^(Aflyst|Ændret)!/i.test(line)) continue;
    return line;
  }
  return 'Lektion';
}

/** Fetch today's schedule from the network, parse, and cache */
export async function fetchTodaySchedule(schoolId: string): Promise<ScheduleBlock[]> {
  const url = new URL(`/lectio/${schoolId}/SkemaNy.aspx`, window.location.origin).href;
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`Schedule fetch failed: ${response.status}`);

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks = parseScheduleFromDoc(doc);

  saveCachedSchedule(schoolId, blocks);
  return blocks;
}

/** Get schedule blocks: from cache if fresh, otherwise fetch */
export async function getTodaySchedule(schoolId: string): Promise<ScheduleBlock[]> {
  const cached = getCachedSchedule(schoolId);
  if (cached) return cached;
  return fetchTodaySchedule(schoolId);
}
