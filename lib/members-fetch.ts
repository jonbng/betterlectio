export interface Member {
  id: string; // Full ID with prefix (e.g. "S72721771682")
  firstName: string;
  lastName: string;
  classCode: string;
  type: 'S' | 'T';
  pictureUrl: string | null;
}

function normalizeMembersUrl(href: string): string {
  const url = new URL(href, window.location.origin);
  url.searchParams.set('reporttype', 'withpics');
  return url.href;
}

function dedupeUrls(urls: string[]): string[] {
  return [...new Set(urls)];
}

function getMembersLinksFromSubnav(doc: Document): HTMLAnchorElement[] {
  return Array.from(
    doc.querySelectorAll<HTMLAnchorElement>(
      [
        '#s_m_HeaderContent_subnavigator_navigatortbl a[href*="subnav/members.aspx"]',
        '#m_HeaderContent_subnavigator_navigatortbl a[href*="subnav/members.aspx"]',
      ].join(', '),
    ),
  );
}

export function getMembersFetchUrlsFromDocument(doc: Document = document): string[] {
  const links = getMembersLinksFromSubnav(doc);
  if (links.length === 0) {
    return [];
  }

  const normalizedLinks = links.map((link) => normalizeMembersUrl(link.href));
  const combinedLink = normalizedLinks.find((href) => {
    const url = new URL(href);
    return url.searchParams.get('showteachers') === '1' && url.searchParams.get('showstudents') === '1';
  });

  if (combinedLink) {
    return [combinedLink];
  }

  const teacherLinks = normalizedLinks.filter((href) => new URL(href).searchParams.get('showteachers') === '1');
  const studentLinks = normalizedLinks.filter((href) => new URL(href).searchParams.get('showstudents') === '1');
  const preferred = dedupeUrls([
    ...teacherLinks.slice(0, 1),
    ...studentLinks.slice(0, 1),
  ]);

  if (preferred.length > 0) {
    return preferred;
  }

  return dedupeUrls(normalizedLinks.slice(0, 1));
}

function isLectioErrorDocument(doc: Document): boolean {
  const pageTitle = doc.title.trim();
  if (pageTitle.startsWith('Fejl')) {
    return true;
  }

  const mainTitle = doc.querySelector('#MainTitle, .maintitle')?.textContent?.trim();
  if (mainTitle === 'Fejl') {
    return true;
  }

  return doc.body?.textContent?.includes('Der opstod en ukendt fejl') ?? false;
}

/**
 * Parse members from a fetched members.aspx document (withpics format).
 * Columns: Foto, Type, ID, Fornavn, Efternavn
 */
export function parseMembersFromDocument(doc: Document): Member[] {
  const members: Member[] = [];
  const table = doc.querySelector<HTMLTableElement>(
    '#s_m_Content_Content_laerereleverpanel_alm_gv, #m_Content_Content_laerereleverpanel_alm_gv'
  );

  if (!table) return members;

  const rows = table.querySelectorAll('tr:not(:first-child)');

  rows.forEach((row) => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 5) return;

    const contextCard = cells[0].getAttribute('data-lectioContextCard');
    if (!contextCard) return;

    const type = contextCard.charAt(0);
    if (type !== 'S' && type !== 'T') return;

    const img = cells[0].querySelector('img');
    const pictureSrc = img?.getAttribute('src') || '';
    const pictureUrl = pictureSrc ? new URL(pictureSrc, window.location.origin).toString() : null;

    const classCodeSpan = cells[2].querySelector('.noWrap');
    const classCode = classCodeSpan?.textContent?.trim() || '';

    const firstNameLink = cells[3].querySelector('a');
    const firstName = firstNameLink?.textContent?.trim() || '';

    const lastNameSpan = cells[4].querySelector('.noWrap');
    const lastName = lastNameSpan?.textContent?.trim() || '';

    members.push({
      id: contextCard,
      firstName,
      lastName,
      classCode,
      type,
      pictureUrl,
    });
  });

  return members;
}

export async function fetchMembersFromUrls(urls: string[]): Promise<Member[]> {
  if (urls.length === 0) {
    throw new Error('Kunne ikke finde medlemmer-link på siden');
  }

  const results = await Promise.allSettled(
    urls.map(async (href) => {
      const response = await fetch(href, { credentials: 'include' });
      if (!response.ok) {
        throw new Error(`Kunne ikke hente medlemmer (${response.status})`);
      }

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      if (isLectioErrorDocument(doc)) {
        throw new Error('Lectio returnerede en fejlside');
      }

      return parseMembersFromDocument(doc);
    }),
  );

  const responses: Member[][] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      responses.push(result.value);
    }
  }
  if (responses.length === 0) {
    throw new Error('Kunne ikke hente medlemmer');
  }

  const membersById = new Map<string, Member>();
  for (const members of responses) {
    for (const member of members) {
      membersById.set(member.id, member);
    }
  }

  return [...membersById.values()];
}
