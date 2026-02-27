/**
 * Page title management for Lectio pages.
 * Sets clean, modern titles instead of the verbose Lectio defaults.
 */

interface TitleConfig {
  /** Base title for the page */
  title: string;
  /** Function to extract dynamic content for the title */
  dynamic?: () => string | null;
  /** Whether to show a badge count (e.g., unread messages) */
  badge?: () => number | null;
}

/**
 * Extract the name and class from viewing another student's page.
 * Matches: "Eleven Name, 1x - Skema" or "Eleven Name(k), 1x - Skema"
 */
function extractStudentInfo(): string | null {
  const title = document.title;
  const match = title.match(/^Eleven\s+(.+?)(?:\([^)]+\))?,\s*(\S+)\s*-/);
  if (match) {
    const fullName = match[1].trim();
    const className = match[2];
    // Use first and last name for brevity
    const nameParts = fullName.split(' ');
    const shortName = nameParts.length > 1
      ? `${nameParts[0]} ${nameParts[nameParts.length - 1]}`
      : fullName;
    return `${shortName} (${className})`;
  }
  return null;
}

/**
 * Extract teacher name from viewing a teacher's page.
 * Matches: "Læreren John Doe - Skema"
 */
function extractTeacherInfo(): string | null {
  const title = document.title;
  const match = title.match(/^Læreren\s+(.+?)\s*-/);
  if (match) {
    return match[1].trim();
  }
  return null;
}

/**
 * Extract room name from viewing a room's schedule.
 * The room info is typically in the main title element.
 */
function extractRoomInfo(): string | null {
  const titleEl = document.querySelector('#s_m_HeaderContent_MainTitle, #m_HeaderContent_MainTitle');
  const text = titleEl?.textContent || '';
  const match = text.match(/^Lokalet\s+(.+?)\s*-/);
  if (match) {
    return match[1].trim();
  }
  return null;
}

/**
 * Extract class/hold name from viewing a class schedule.
 */
function extractClassInfo(): string | null {
  const titleEl = document.querySelector('#s_m_HeaderContent_MainTitle, #m_HeaderContent_MainTitle');
  const text = titleEl?.textContent || '';
  // Match "Stamklassen 1x" or "Holdet 1x MA"
  const match = text.match(/^(?:Stamklassen|Holdet)\s+(.+?)\s*-/);
  if (match) {
    return match[1].trim();
  }
  return null;
}

/**
 * Get the person/entity being viewed for schedule pages.
 */
function getScheduleSubject(): string | null {
  const params = new URLSearchParams(window.location.search);

  if (params.has('elevid')) {
    return extractStudentInfo();
  }
  if (params.has('laererid')) {
    return extractTeacherInfo();
  }
  if (params.has('lokaleid')) {
    return extractRoomInfo();
  }
  if (params.has('klasseid') || params.has('holdid')) {
    return extractClassInfo();
  }

  return null;
}

/**
 * Count unread messages on the messages page.
 * Looks for unread message icons in the message list.
 */
function countUnreadMessages(): number | null {
  // Only count on messages page
  if (!window.location.pathname.toLowerCase().includes('beskeder')) {
    return null;
  }

  // Count unread message icons (munread.gif)
  const unreadIcons = document.querySelectorAll('img[src*="munread.gif"]');
  const count = unreadIcons.length;

  return count > 0 ? count : null;
}

/**
 * Get the FindSkema type from URL for search pages.
 */
function getFindSkemaType(): string | null {
  const params = new URLSearchParams(window.location.search);
  const type = params.get('type')?.toLowerCase();

  const typeMap: Record<string, string> = {
    'elev': 'Elev',
    'laerer': 'Lærer',
    'lokale': 'Lokale',
    'hold': 'Hold',
    'stamklasse': 'Stamklasse',
    'klasse': 'Klasse',
    'ressource': 'Ressource',
    'gruppe': 'Gruppe',
  };

  return type ? typeMap[type] || type : null;
}

/**
 * Page configurations keyed by URL path patterns.
 * Order matters - more specific patterns should come first.
 */
const PAGE_CONFIGS: Array<{ pattern: RegExp; config: TitleConfig }> = [
  // Schedule pages (with entity parameter)
  {
    pattern: /skemany\.aspx/i,
    config: {
      title: 'Skema',
      dynamic: () => {
        const subject = getScheduleSubject();
        return subject ? `Skema: ${subject}` : null;
      },
    },
  },

  // Find schedule pages
  {
    pattern: /findskema\.aspx/i,
    config: {
      title: 'Find Skema',
      dynamic: () => {
        const type = getFindSkemaType();
        return type ? `Find ${type}` : null;
      },
    },
  },
  {
    pattern: /findskemaadv\.aspx/i,
    config: { title: 'Avanceret Søgning' },
  },

  // Messages
  {
    pattern: /beskeder2?\.aspx/i,
    config: {
      title: 'Beskeder',
      badge: countUnreadMessages,
    },
  },

  // Core pages
  { pattern: /forside\.aspx/i, config: { title: 'Forside' } },
  { pattern: /opgave(?:r)?elev\.aspx/i, config: { title: 'Opgaver' } },
  { pattern: /material_lektieoversigt\.aspx/i, config: { title: 'Lektier' } },
  { pattern: /studieplan\.aspx/i, config: { title: 'Studieplan' } },

  // Grades and absence
  { pattern: /grade_report\.aspx/i, config: { title: 'Karakterer' } },
  { pattern: /fravaerelev/i, config: { title: 'Fravær' } },

  // Calendar and changes
  { pattern: /skemadagsaendringer\.aspx/i, config: { title: 'Dagsændringer' } },
  { pattern: /skemaugeaendringer\.aspx/i, config: { title: 'Ugeændringer' } },
  { pattern: /kalender\.aspx/i, config: { title: 'Kalender' } },

  // Documents and surveys
  { pattern: /dokumentoversigt\.aspx/i, config: { title: 'Dokumenter' } },
  { pattern: /spoergeskema/i, config: { title: 'Spørgeskema' } },
  { pattern: /uvb_list/i, config: { title: 'UV-beskrivelser' } },

  // Account pages
  { pattern: /studentindstillinger\.aspx/i, config: { title: 'Indstillinger' } },
  { pattern: /digitaltstudiekort\.aspx/i, config: { title: 'Studiekort' } },
  { pattern: /elev_sps\.aspx/i, config: { title: 'SPS' } },
  { pattern: /userreservations\.aspx/i, config: { title: 'Bøger' } },

  // Auth pages
  { pattern: /login\.aspx/i, config: { title: 'Log ind' } },
  { pattern: /login_list\.aspx/i, config: { title: 'Vælg Skole' } },
  { pattern: /logout\.aspx/i, config: { title: 'Log ud' } },

  // Activity pages
  {
    pattern: /aktivitet\.aspx/i,
    config: {
      title: 'Aktivitet',
      dynamic: () => {
        // Try to extract subject from the activity header
        const header = document.querySelector('.ls-activity-header, .s2skemabrikalinetop');
        const text = header?.textContent?.trim();
        if (text) {
          // Extract subject code (e.g., "1x DA" -> "DA")
          const match = text.match(/\b([A-ZÆØÅ]{2,})\b/);
          return match ? match[1] : null;
        }
        return null;
      },
    },
  },

  // Help and misc
  { pattern: /mainhelp\.aspx/i, config: { title: 'Hjælp' } },
  { pattern: /default\.aspx/i, config: { title: 'Hovedmenu' } },
];

/**
 * Find the matching page configuration for the current URL.
 */
function findPageConfig(): TitleConfig | null {
  const path = window.location.pathname.toLowerCase();

  for (const { pattern, config } of PAGE_CONFIGS) {
    if (pattern.test(path)) {
      return config;
    }
  }

  return null;
}

/**
 * Generate the page title based on configuration.
 */
function generateTitle(config: TitleConfig): string {
  let title = config.title;

  // Try dynamic title first
  if (config.dynamic) {
    const dynamicTitle = config.dynamic();
    if (dynamicTitle) {
      title = dynamicTitle;
    }
  }

  // Add badge if available
  if (config.badge) {
    const count = config.badge();
    if (count && count > 0) {
      title = `(${count}) ${title}`;
    }
  }

  return `${title} - Lectio`;
}

/**
 * Update the page title to a cleaner format.
 * Call this after DOM is ready.
 */
export function updatePageTitle(): void {
  const config = findPageConfig();

  if (config) {
    const newTitle = generateTitle(config);
    if (document.title !== newTitle) {
      document.title = newTitle;
    }
  }
}

/**
 * Set up a MutationObserver to update title when content changes.
 * Useful for SPAs or pages that update content dynamically.
 */
export function observeTitleChanges(): void {
  // Initial update
  updatePageTitle();

  // Watch for changes to the title element
  const titleEl = document.querySelector('title');
  if (titleEl) {
    const observer = new MutationObserver(() => {
      // Small delay to let Lectio finish its title update
      setTimeout(updatePageTitle, 10);
    });

    observer.observe(titleEl, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  // Also update on navigation (for SPA-like behavior)
  window.addEventListener('popstate', () => {
    setTimeout(updatePageTitle, 100);
  });
}
