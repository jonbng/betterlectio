import { createSearchText, type SearchableItem } from './fuzzy-search';

type AdvancedCategoryKey = 'fag' | 'faggruppe';

const CATEGORY_CONFIG: Record<
  AdvancedCategoryKey,
  { eventTarget: string; listId: string; type: 'F' | 'J' }
> = {
  fag: { eventTarget: 'm$Content$ChangeFagBtn', listId: 'm_Content_fagRL', type: 'F' },
  faggruppe: { eventTarget: 'm$Content$ChangeFaggruppeBtn', listId: 'm_Content_faggruppeRL', type: 'J' },
};

const KNOWN_ENTITY_PARAMS = new Set([
  'elevid',
  'laererid',
  'lokaleid',
  'ressourceid',
  'klasseid',
  'holdid',
  'gruppeid',
]);

function toRelativeLectioUrl(url: URL): string {
  return `${url.pathname}${url.search}`;
}

function extractFormData(doc: Document): URLSearchParams {
  const form = doc.querySelector('form#aspnetForm') || doc.querySelector('form');
  const params = new URLSearchParams();
  if (!form) return params;

  const fields = form.querySelectorAll('input, select, textarea');
  for (const field of fields) {
    const name = field.getAttribute('name');
    if (!name) continue;

    if (field instanceof HTMLInputElement) {
      const type = (field.getAttribute('type') || '').toLowerCase();
      if (type === 'submit' || type === 'button' || type === 'image' || type === 'file' || type === 'reset') {
        continue;
      }
      if ((type === 'checkbox' || type === 'radio') && !field.checked) {
        continue;
      }
      params.append(name, field.value ?? '');
      continue;
    }

    if (field instanceof HTMLSelectElement) {
      params.append(name, field.value ?? '');
      continue;
    }

    if (field instanceof HTMLTextAreaElement) {
      params.append(name, field.value ?? '');
    }
  }

  return params;
}

function parseAdvancedList(
  html: string,
  listId: string,
  type: 'F' | 'J'
): SearchableItem[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const targetList = doc.getElementById(listId);
  const roots: Element[] = [];
  if (targetList) {
    roots.push(targetList);
  }
  const fallbackListContainer = doc.getElementById('m_Content_listecontainer');
  if (fallbackListContainer) {
    roots.push(fallbackListContainer);
  }

  const items: SearchableItem[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    const anchors = root.querySelectorAll('a[href]');
    for (const anchor of anchors) {
      const name = anchor.textContent?.trim();
      const rawHref = anchor.getAttribute('href');
      if (!name || !rawHref) continue;

      const absoluteHref = new URL(rawHref, window.location.origin);
      if (!absoluteHref.pathname.toLowerCase().includes('/skemany.aspx')) continue;

      // Guardrail: if fallback content is just student/teacher lists, don't misclassify them as F/J.
      const hasKnownEntityParam = [...KNOWN_ENTITY_PARAMS].some((param) =>
        absoluteHref.searchParams.has(param)
      );
      if (hasKnownEntityParam) continue;

      const relativeHref = toRelativeLectioUrl(absoluteHref);
      const contextCard = anchor.getAttribute('data-lectiocontextcard')?.trim();
      const id = contextCard || `URL:${encodeURIComponent(relativeHref)}`;
      if (seen.has(id)) continue;
      seen.add(id);

      items.push({
        name,
        id,
        type,
        shortName: null,
        longName: null,
        scheduleUrl: relativeHref,
        searchText: createSearchText(name, null, null),
      });
    }
  }

  return items;
}

export async function fetchAdvancedCategoryItems(
  schoolId: string,
  category: AdvancedCategoryKey
): Promise<SearchableItem[]> {
  const config = CATEGORY_CONFIG[category];
  const advUrl = new URL(`/lectio/${schoolId}/FindSkemaAdv.aspx`, window.location.origin);

  const initialHtml = await fetch(advUrl.href, {
    credentials: 'include',
  }).then((res) => res.text());

  const initialDoc = new DOMParser().parseFromString(initialHtml, 'text/html');
  const formData = extractFormData(initialDoc);
  formData.set('__EVENTTARGET', config.eventTarget);
  formData.set('__EVENTARGUMENT', '');
  formData.set('__LASTFOCUS', '');

  const responseHtml = await fetch(advUrl.href, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  }).then((res) => res.text());

  return parseAdvancedList(responseHtml, config.listId, config.type);
}
