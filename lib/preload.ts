/**
 * Preloading utilities for faster navigation
 *
 * Conservative approach:
 * 1. Only prerender skema (most used page) on page load
 * 2. Prefetch other pages on hover (200ms delay)
 */

// Track what we've already prefetched to avoid duplicates
const prefetchedUrls = new Set<string>();

/**
 * Check if the browser supports Speculation Rules API
 */
export function supportsSpeculationRules(): boolean {
  return HTMLScriptElement.supports?.('speculationrules') ?? false;
}

/**
 * Add speculation rules for a single priority URL (skema)
 * Uses conservative prerendering - only one page at a time
 */
function addSkemaSpeculationRule(skemaUrl: string): void {
  if (!supportsSpeculationRules()) return;
  if (prefetchedUrls.has(skemaUrl)) return;

  // Don't prerender if we're already on skema
  if (window.location.pathname.includes('skema')) return;

  prefetchedUrls.add(skemaUrl);

  const rules = {
    prerender: [{
      source: 'list',
      urls: [skemaUrl],
      eagerness: 'immediate', // always have skema ready
    }],
  };

  const script = document.createElement('script');
  script.type = 'speculationrules';
  script.textContent = JSON.stringify(rules);
  document.head.appendChild(script);

  console.log('[BetterLectio] Will prerender skema on idle');
}

/**
 * Setup hover-based prefetching for links
 * Only fetches when user shows clear intent (200ms hover)
 */
export function setupHoverPrefetching(): void {
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

    // 200ms delay to filter accidental hovers and reduce request noise
    hoverTimeout = setTimeout(() => {
      if (prefetchedUrls.has(href)) return;
      prefetchedUrls.add(href);

      // Use link prefetch (gentler than fetch)
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      link.as = 'document';
      document.head.appendChild(link);

      console.log('[BetterLectio] Prefetching:', href);
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
 * Initialize preloading - conservative approach
 */
export function initPreloading(schoolId: string): void {
  const baseUrl = `/lectio/${schoolId}`;
  const skemaUrl = `${baseUrl}/skemany.aspx`;

  // Don't prefetch skema if we're already on it
  const onSkema = window.location.pathname.includes('skema');

  if (supportsSpeculationRules()) {
    // Chrome/Edge: prerender skema immediately
    if (!onSkema) {
      addSkemaSpeculationRule(skemaUrl);
    }
  } else if (!onSkema && !prefetchedUrls.has(skemaUrl)) {
    // Firefox/Safari: at least prefetch skema
    prefetchedUrls.add(skemaUrl);
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = skemaUrl;
    link.as = 'document';
    document.head.appendChild(link);
    console.log('[BetterLectio] Prefetching skema (no speculation rules)');
  }

  // Hover-based prefetching for everything else
  setupHoverPrefetching();

  console.log('[BetterLectio] Preloading initialized');
}
