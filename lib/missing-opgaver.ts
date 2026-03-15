/**
 * Shared module for fetching missing assignments from OpgaverElev.aspx.
 * Used by both ForsideGreeting and ForsideOpgaverCard on the forside.
 * Caches the result so we only fetch once per page load.
 */

import { parseFormTokensFromDoc } from '@/lib/iframe-post';

export interface MissingOpgave {
  title: string;
  hold: string;
  deadline: Date;
  deadlineText: string;
  url: string;
}

const _cachedPromiseBySchool = new Map<string, Promise<MissingOpgave[]>>();

// Same thresholds as OpgaverPage — 0 elevtimer assignments are low-importance
const MAX_AGE_DAYS = 60;
const MAX_AGE_ZERO_TIME_DAYS = 7;

/**
 * Detect missing status from a status cell.
 * Lectio uses either the `.exercisemissing` class OR plain text like
 * "Ikke afleveret", "Mangler", "Ej afleveret" — we must check both.
 */
function isMissingCell(cell: HTMLTableCellElement): boolean {
  if (cell.querySelector('.exercisemissing')) return true;
  const text = cell.textContent?.trim().toLowerCase() || '';
  return text.includes('ikke afleveret') || text.includes('mangler') || text.includes('ej afleveret');
}

function parseStudentHours(raw: string): number {
  const parsed = Number.parseFloat(raw.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Parse missing assignment rows from an OpgaverElev.aspx Document.
 * Applies the same age/importance filter as OpgaverPage:
 *   - 0 elevtimer → only if ≤ 7 days past deadline
 *   - >0 elevtimer → only if ≤ 60 days past deadline
 */
function parseMissingFromDoc(doc: Document): MissingOpgave[] {
  const table = doc.querySelector<HTMLTableElement>('#s_m_Content_Content_ExerciseGV');
  if (!table) return [];

  const now = new Date();
  const missing: MissingOpgave[] = [];
  const rows = table.querySelectorAll('tr');

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (row.querySelector('th')) continue;
    const cells = row.querySelectorAll<HTMLTableCellElement>('td.OnlyDesktop');
    if (cells.length < 11) continue;

    if (!isMissingCell(cells[5])) continue;

    const hold = cells[1].textContent?.trim() || '';
    const titleLink = cells[2].querySelector<HTMLAnchorElement>('a');
    const title = titleLink?.textContent?.trim() || cells[2].textContent?.trim() || '';
    const linkUrl = titleLink?.getAttribute('href') || '';
    const deadlineText = cells[3].textContent?.trim() || '';
    const dMatch = deadlineText.match(/^(\d{1,2})\/(\d{1,2})-(\d{4})\s+(\d{2}):(\d{2})$/);
    if (!dMatch) continue;

    const deadline = new Date(
      parseInt(dMatch[3]),
      parseInt(dMatch[2]) - 1,
      parseInt(dMatch[1]),
      parseInt(dMatch[4]),
      parseInt(dMatch[5]),
    );

    // Age filter: match OpgaverPage's isActiveMissingForUpcoming logic
    const studentHours = parseStudentHours(cells[4].textContent || '');
    const maxAgeDays = studentHours <= 0 ? MAX_AGE_ZERO_TIME_DAYS : MAX_AGE_DAYS;
    const ageMs = now.getTime() - deadline.getTime();
    if (ageMs > maxAgeDays * 24 * 60 * 60 * 1000) continue;

    missing.push({ title, hold, deadline, deadlineText, url: linkUrl });
  }

  return missing;
}

/**
 * Fetch missing assignments from OpgaverElev.aspx.
 *
 * The default "Vis kun aktuelle" filter hides older missing assignments,
 * so we always POST back to uncheck it when no missing are found initially.
 *
 * Results are cached per page load — safe to call from multiple components.
 */
export function fetchMissingOpgaver(schoolId: string): Promise<MissingOpgave[]> {
  const existing = _cachedPromiseBySchool.get(schoolId);
  if (existing) return existing;

  const request = (async () => {
    try {
      const pageUrl = `${window.location.origin}/lectio/${schoolId}/OpgaverElev.aspx`;
      const resp = await fetch(pageUrl, { credentials: 'include' });
      if (!resp.ok) return [];

      const html = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // First try: parse from the initial GET response
      let missing = parseMissingFromDoc(doc);
      if (missing.length > 0) return missing;

      // The default "Vis kun aktuelle" filter hides older missing assignments.
      // POST back to uncheck it and try again.
      const filterCB = doc.querySelector<HTMLInputElement>(
        '#s_m_Content_Content_CurrentExerciseFilterCB',
      );
      if (!filterCB) return missing;

      const isFiltered = filterCB.getAttribute('checked') !== null;
      if (!isFiltered) return missing;

      try {
        const { tokens } = parseFormTokensFromDoc(doc);
        const body = new URLSearchParams();

        for (const [key, value] of Object.entries(tokens)) {
          body.set(key, value);
        }

        // Postback target to toggle the checkbox; absence of the field = unchecked
        body.set('__EVENTTARGET', 's$m$Content$Content$CurrentExerciseFilterCB');
        body.set('__EVENTARGUMENT', '');

        const postResp = await fetch(pageUrl, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });

        if (postResp.ok) {
          const postHtml = await postResp.text();
          const postDoc = parser.parseFromString(postHtml, 'text/html');
          missing = parseMissingFromDoc(postDoc);
        }
      } catch {
        // If the postback fails, return whatever we got from the initial GET
      }

      return missing;
    } catch {
      return [];
    }
  })();

  _cachedPromiseBySchool.set(schoolId, request);
  return request;
}
