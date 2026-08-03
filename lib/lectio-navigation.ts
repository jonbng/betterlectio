export interface LectioNavigationItem {
  label: string;
  href: string;
  active: boolean;
  sourceId: string | null;
  nativeAction: boolean;
}

export interface LectioNavigationSnapshot {
  schoolName: string;
  contextTitle: string | null;
  contextId: string | null;
  contextImageUrl: string | null;
  globalItems: LectioNavigationItem[];
  primaryItems: LectioNavigationItem[];
  secondaryItems: LectioNavigationItem[];
  searchItem: LectioNavigationItem | null;
}

/**
 * Native routes whose secondary tabs are combined into one BetterLectio page.
 * Keep this explicit: a secondary row should only disappear when the active
 * redesign genuinely exposes the content from every native tab.
 */
const MERGED_SECONDARY_NAVIGATION_ROUTES = [
  /\/subnav\/fravaerelev(?:_fravaersaarsager)?\.aspx$/i,
];

export function isSecondaryNavigationMerged(pathname: string): boolean {
  return MERGED_SECONDARY_NAVIGATION_ROUTES.some((route) => route.test(pathname));
}

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function itemFromAnchor(anchor: HTMLAnchorElement): LectioNavigationItem | null {
  const label = cleanText(anchor.textContent);
  if (!label) return null;

  const hrefAttr = anchor.getAttribute('href') || '#';
  const wrapper = anchor.closest('.buttonlink, .buttonoutlined');
  return {
    label,
    href: hrefAttr,
    active:
      wrapper?.classList.contains('ls-subnav-active') === true ||
      anchor.hasAttribute('current-page'),
    sourceId: anchor.id || null,
    nativeAction:
      hrefAttr === '#' ||
      Boolean(anchor.getAttribute('onclick')),
  };
}

function itemsFrom(root: ParentNode | null): LectioNavigationItem[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLAnchorElement>(':scope > .buttonlink > a, :scope > .buttonoutlined > a'))
    .map(itemFromAnchor)
    .filter((item): item is LectioNavigationItem => Boolean(item));
}

/**
 * Capture Lectio's navigation before the original DOM is moved under
 * #il-original-content. The live page is authoritative: schools, roles and
 * entity types expose different contextual rows.
 */
export function parseLectioNavigation(doc: Document = document): LectioNavigationSnapshot {
  const masterMenu = doc.querySelector<HTMLElement>('nav[id$="_mastermenu"]');
  const masterGroups = masterMenu ? Array.from(masterMenu.children) : [];
  const globalItems = masterGroups.flatMap((group) =>
    Array.from(group.querySelectorAll<HTMLAnchorElement>('.buttonoutlined > a'))
      .map(itemFromAnchor)
      .filter((item): item is LectioNavigationItem => Boolean(item)),
  );
  const searchAnchor = masterMenu?.querySelector<HTMLAnchorElement>('a[id$="_mastersearchbtn"]') ?? null;
  const contextTitle = doc.querySelector<HTMLElement>('.ls-master-pageheader .maintitle');
  const contextImage = doc.querySelector<HTMLImageElement>('.ls-master-pageheader .thumber img');

  return {
    schoolName: cleanText(doc.querySelector('.ls-master-header-institution-name')?.textContent) || 'Lectio',
    contextTitle: cleanText(contextTitle?.textContent) || null,
    contextId: contextTitle?.dataset.lectiocontextcard ?? contextTitle?.getAttribute('data-lectioContextCard') ?? null,
    contextImageUrl: contextImage?.src || null,
    globalItems,
    primaryItems: itemsFrom(doc.querySelector('.ls-subnav1')),
    secondaryItems: itemsFrom(doc.querySelector('.ls-subnav2')),
    searchItem: searchAnchor ? itemFromAnchor(searchAnchor) : null,
  };
}

export function activateNativeNavigationItem(item: LectioNavigationItem): boolean {
  if (!item.nativeAction || !item.sourceId) return false;
  const source = document.getElementById(item.sourceId) as HTMLAnchorElement | null;
  if (!source) return false;
  source.click();
  return true;
}
