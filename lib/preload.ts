/**
 * Preloading utilities for faster navigation
 *
 * Strategy:
 * 1. Prerender skema immediately (most used page)
 * 2. Prerender predicted next pages based on current page
 * 3. Prerender any same-school link on hover (via speculation rules)
 * 4. Fall back to <link rel="prefetch"> on Firefox (no speculation rules)
 */

/**
 * Check if the browser supports Speculation Rules API
 */
export function supportsSpeculationRules(): boolean {
  return HTMLScriptElement.supports?.('speculationrules') ?? false;
}

/**
 * Get predicted next pages based on the current page.
 * Returns relative paths (without /lectio/{schoolId}/ prefix).
 */
function getPredictedPages(): string[] {
  const path = window.location.pathname.toLowerCase();

  if (path.includes('forside.aspx')) {
    return ['skemany.aspx', 'beskeder2.aspx?mappeid=-70'];
  }
  if (path.includes('skema')) {
    return ['forside.aspx', 'beskeder2.aspx?mappeid=-70'];
  }
  if (path.includes('beskeder')) {
    return ['skemany.aspx', 'forside.aspx'];
  }
  if (path.includes('material_lektieoversigt')) {
    return ['skemany.aspx', 'forside.aspx'];
  }
  if (path.includes('opgaverelev')) {
    return ['skemany.aspx', 'forside.aspx'];
  }

  // Default: skema + forside are always good bets
  return ['skemany.aspx', 'forside.aspx'];
}

/**
 * Inject a <script type="speculationrules"> element.
 * Chrome/Edge use these to prerender or prefetch pages.
 */
function injectSpeculationRules(schoolId: string): void {
  const baseUrl = `/lectio/${schoolId}`;
  const onSkema = window.location.pathname.toLowerCase().includes('skema');

  const prerenderList: string[] = [];

  // Always prerender skema immediately (unless already on it)
  if (!onSkema) {
    prerenderList.push(`${baseUrl}/skemany.aspx`);
  }

  // Add predicted pages (skip current page)
  for (const page of getPredictedPages()) {
    const url = `${baseUrl}/${page}`;
    if (!window.location.href.includes(page.split('?')[0])) {
      prerenderList.push(url);
    }
  }

  // Deduplicate
  const uniqueUrls = [...new Set(prerenderList)];

  const rules: any = { prerender: [] };

  // Immediate prerender for top predictions
  if (uniqueUrls.length > 0) {
    rules.prerender.push({
      source: 'list',
      urls: uniqueUrls,
      eagerness: 'immediate',
    });
  }

  // Hover-based prerender for ALL same-school links.
  // eagerness: "moderate" means Chrome prerenders on hover/pointerdown.
  // This replaces our custom hover-prefetch JS entirely for Chrome.
  rules.prerender.push({
    source: 'document',
    where: {
      href_matches: `/lectio/${schoolId}/*`,
    },
    eagerness: 'moderate',
  });

  const script = document.createElement('script');
  script.type = 'speculationrules';
  script.textContent = JSON.stringify(rules);
  document.head.appendChild(script);

  console.log(
    `[BetterLectio] Speculation rules: immediate prerender ${uniqueUrls.length} pages, hover prerender all /lectio/${schoolId}/* links`,
  );
}

/**
 * Setup hover-based prefetching for links (Firefox/Safari fallback).
 * Only fetches when user shows clear intent (200ms hover).
 */
function setupHoverPrefetching(): void {
  const prefetchedUrls = new Set<string>();
  let hoverTimeout: ReturnType<typeof setTimeout> | null = null;

  const handleMouseEnter = (e: Event) => {
    const link = (e.target as Element).closest('a[href]') as HTMLAnchorElement | null;
    if (!link) return;

    const href = link.href;

    // Only prefetch same-origin lectio links
    if (!href || !href.startsWith(window.location.origin)) return;
    if (!href.includes('/lectio/')) return;

    // Skip if already on this page or already prefetched
    if (href === window.location.href) return;
    if (prefetchedUrls.has(href)) return;

    // 200ms delay to filter accidental hovers
    hoverTimeout = setTimeout(() => {
      if (prefetchedUrls.has(href)) return;
      prefetchedUrls.add(href);

      const prefetchLink = document.createElement('link');
      prefetchLink.rel = 'prefetch';
      prefetchLink.href = href;
      prefetchLink.as = 'document';
      document.head.appendChild(prefetchLink);
    }, 200);
  };

  const handleMouseLeave = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
  };

  document.addEventListener('mouseover', handleMouseEnter, { passive: true });
  document.addEventListener('mouseout', handleMouseLeave, { passive: true });
}

/**
 * Initialize preloading
 */
export function initPreloading(schoolId: string): void {
  if (supportsSpeculationRules()) {
    // Chrome/Edge: use Speculation Rules for immediate + hover prerender
    injectSpeculationRules(schoolId);
  } else {
    // Firefox/Safari: prefetch skema + hover-based prefetch for others
    const skemaUrl = `/lectio/${schoolId}/skemany.aspx`;
    if (!window.location.pathname.toLowerCase().includes('skema')) {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = skemaUrl;
      link.as = 'document';
      document.head.appendChild(link);
    }

    setupHoverPrefetching();
  }

  console.log('[BetterLectio] Preloading initialized');
}
