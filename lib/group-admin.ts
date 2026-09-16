export interface HoldGroupLink {
  label: string;
  url: string;
}

function safeLectioUrl(raw: string | null, baseUrl: string): string | null {
  if (!raw || raw.trim() === '#') return null;
  try {
    const base = new URL(baseUrl);
    const url = new URL(raw, base);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.origin !== base.origin || !url.pathname.toLowerCase().startsWith('/lectio/')) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function getGroupEditUrl(doc: Document, baseUrl: string): string | null {
  const link = doc.querySelector<HTMLAnchorElement>(
    'a[id="s_m_Content_Content_editgrplink"], a[id$="_editgrplink"]',
  );
  if (!link) return null;

  const classes = Array.from(link.classList).map((name) => name.toLowerCase());
  const disabled = classes.includes('aspnetdisabled')
    || link.hasAttribute('disabled')
    || link.getAttribute('aria-disabled') === 'true';
  if (disabled) return null;

  return safeLectioUrl(link.getAttribute('href'), baseUrl);
}

export function parseHoldGroupLinks(doc: Document, baseUrl: string): HoldGroupLink[] {
  const container = doc.querySelector('#s_m_Content_Content_holdgruppeIsland_pa');
  if (!container) return [];

  const seen = new Set<string>();
  const links: HoldGroupLink[] = [];
  container.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
    const label = anchor.textContent?.replace(/\s+/g, ' ').trim() || '';
    const url = safeLectioUrl(anchor.getAttribute('href'), baseUrl);
    if (!label || !url || seen.has(url)) return;
    seen.add(url);
    links.push({ label, url });
  });
  return links;
}
