/**
 * Shared module for fetching missing (exercisemissing) assignments.
 * Used by both ForsideGreeting and ForsideOpgaverCard on the forside.
 * Caches the result so we only fetch OpgaverElev.aspx once per page load.
 */

export interface MissingOpgave {
  title: string;
  hold: string;
  deadline: Date;
  deadlineText: string;
  url: string;
}

const _cachedPromiseBySchool = new Map<string, Promise<MissingOpgave[]>>();

/**
 * Fetch missing (exercisemissing) assignments from the full OpgaverElev.aspx page.
 * The forside widget only shows ~3 upcoming assignments and omits overdue/missing ones,
 * so we need to check the full page to find them.
 *
 * Results are cached per page load — safe to call from multiple components.
 */
export function fetchMissingOpgaver(schoolId: string): Promise<MissingOpgave[]> {
  const existing = _cachedPromiseBySchool.get(schoolId);
  if (existing) return existing;

  const request = (async () => {
    try {
      const url = `${window.location.origin}/lectio/${schoolId}/OpgaverElev.aspx`;
      const resp = await fetch(url, { credentials: 'include' });
      if (!resp.ok) return [];

      const html = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const table = doc.querySelector<HTMLTableElement>('#s_m_Content_Content_ExerciseGV');
      if (!table) return [];

      const missing: MissingOpgave[] = [];
      const rows = table.querySelectorAll('tr');

      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (row.querySelector('th')) continue;
        const cells = row.querySelectorAll<HTMLTableCellElement>('td.OnlyDesktop');
        if (cells.length < 11) continue;

        // Only care about exercisemissing entries
        if (!cells[5].querySelector('.exercisemissing')) continue;

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

        missing.push({ title, hold, deadline, deadlineText, url: linkUrl });
      }

      return missing;
    } catch {
      return [];
    }
  })();

  _cachedPromiseBySchool.set(schoolId, request);
  return request;
}
