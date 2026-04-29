import { parseFormTokensFromDoc } from '@/lib/iframe-post';
import { parseOpgaverFromDOM, type OpgaveEntry } from '@/components/OpgaverPage';

const CACHE_KEY = 'bl-opgaver-deadlines';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

interface CachedOpgaver {
  schoolId: string;
  fetchedAt: number;
  entries: SerializedOpgave[];
}

type SerializedOpgave = Omit<OpgaveEntry, 'deadline'> & { deadline: string };

function getCacheKey(schoolId: string): string {
  return `${CACHE_KEY}:${schoolId}`;
}

function serialize(entries: OpgaveEntry[]): SerializedOpgave[] {
  return entries.map((e) => ({ ...e, deadline: e.deadline.toISOString() }));
}

function revive(entries: SerializedOpgave[]): OpgaveEntry[] {
  return entries.map((e) => ({ ...e, deadline: new Date(e.deadline) }));
}

/** Read cached opgaver list — returns null if missing, expired, or wrong school. */
export function getCachedOpgaver(schoolId: string): OpgaveEntry[] | null {
  try {
    const raw = localStorage.getItem(getCacheKey(schoolId));
    if (!raw) return null;
    const cached: CachedOpgaver = JSON.parse(raw);
    if (cached.schoolId !== schoolId) return null;
    if (Date.now() - cached.fetchedAt > CACHE_TTL) return null;
    return revive(cached.entries);
  } catch {
    return null;
  }
}

/** Persist opgaver list to school-scoped localStorage. */
export function saveCachedOpgaver(schoolId: string, entries: OpgaveEntry[]): void {
  try {
    const data: CachedOpgaver = {
      schoolId,
      fetchedAt: Date.now(),
      entries: serialize(entries),
    };
    localStorage.setItem(getCacheKey(schoolId), JSON.stringify(data));
  } catch {
    /* ignore quota errors */
  }
}

const _inFlightBySchool = new Map<string, Promise<OpgaveEntry[] | null>>();

/**
 * Fetch the full opgaver list from OpgaverElev.aspx and cache it.
 *
 * The default "Vis kun aktuelle" filter hides older missing assignments and
 * "Vis kun dette semester" hides off-term ones, so if either is checked we
 * postback to uncheck them and re-parse, mirroring the flow used by
 * `lib/missing-opgaver.ts`.
 */
export function fetchAndCacheOpgaver(schoolId: string): Promise<OpgaveEntry[] | null> {
  const existing = _inFlightBySchool.get(schoolId);
  if (existing) return existing;

  const req = (async (): Promise<OpgaveEntry[] | null> => {
    try {
      const pageUrl = `${window.location.origin}/lectio/${schoolId}/OpgaverElev.aspx`;
      const resp = await fetch(pageUrl, { credentials: 'include' });
      if (!resp.ok) return null;

      const html = await resp.text();
      const parser = new DOMParser();
      let doc = parser.parseFromString(html, 'text/html');

      const currentCB = doc.querySelector<HTMLInputElement>(
        '#s_m_Content_Content_CurrentExerciseFilterCB',
      );
      const thisTermCB = doc.querySelector<HTMLInputElement>(
        '#s_m_Content_Content_ShowThisTermOnlyCB',
      );

      const currentChecked = currentCB?.getAttribute('checked') !== null;
      const termChecked = thisTermCB?.getAttribute('checked') !== null;

      // If a filter is on, postback to toggle it and use the response
      if (currentChecked || termChecked) {
        try {
          const { tokens } = parseFormTokensFromDoc(doc);
          const body = new URLSearchParams();
          for (const [key, value] of Object.entries(tokens)) body.set(key, value);

          const eventTarget = currentChecked
            ? 's$m$Content$Content$CurrentExerciseFilterCB'
            : 's$m$Content$Content$ShowThisTermOnlyCB';
          body.set('__EVENTTARGET', eventTarget);
          body.set('__EVENTARGUMENT', '');

          const postResp = await fetch(pageUrl, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
          });

          if (postResp.ok) {
            const postHtml = await postResp.text();
            doc = parser.parseFromString(postHtml, 'text/html');
          }
        } catch {
          // Use the GET doc if postback fails
        }
      }

      const entries = parseOpgaverFromDOM(doc);
      saveCachedOpgaver(schoolId, entries);
      return entries;
    } catch {
      return null;
    } finally {
      _inFlightBySchool.delete(schoolId);
    }
  })();

  _inFlightBySchool.set(schoolId, req);
  return req;
}
