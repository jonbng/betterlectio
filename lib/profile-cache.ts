import { getRecentPeople, getStarredPeople } from './findskema-storage';
import { getFullHoldDisplayName } from './hold-mapping';

const PROFILE_CACHE_KEY = 'bl-user-profile';
const LEGACY_PROFILE_CACHE_KEY = 'il-user-profile';
const LOGIN_STATE_KEY = 'bl-login-state';
const LEGACY_LOGIN_STATE_KEY = 'il-login-state';

export interface LoginState {
  isLoggedIn: boolean;
  schoolId: string | null;
  lastChecked: number;
}

export interface UserProfile {
  name: string;
  fullName: string;
  className: string;
  pictureUrl: string | null;
  studentId: string | null;
  schoolId: string | null;
  schoolName: string | null;
  cachedAt: number;
}

function getCurrentSchoolId(): string | null {
  const match = window.location.pathname.match(/\/lectio\/(\d+)\//);
  return match?.[1] || null;
}

function getProfileCacheKey(schoolId: string | null): string {
  return schoolId ? `${PROFILE_CACHE_KEY}:${schoolId}` : PROFILE_CACHE_KEY;
}

export type ScheduleEntityType =
  | 'student'
  | 'teacher'
  | 'class'
  | 'room'
  | 'resource'
  | 'hold'
  | 'group'
  | 'holdelement';

export interface ViewedEntity {
  name: string;
  subtitle: string; // class code for students, or descriptive info for others
  pictureUrl: string | null; // only applicable for students/teachers
  id: string;
  type: ScheduleEntityType;
}

// Keep ViewedPerson as alias for backwards compatibility
export interface ViewedPerson extends ViewedEntity {
  className: string; // alias for subtitle
}

export function getCachedProfile(): UserProfile | null {
  const schoolId = getCurrentSchoolId();
  try {
    const scoped = localStorage.getItem(getProfileCacheKey(schoolId));
    if (scoped) return JSON.parse(scoped);

    // Backwards compatibility with legacy global cache.
    const legacy = localStorage.getItem(LEGACY_PROFILE_CACHE_KEY);
    if (!legacy) return null;
    const parsed = JSON.parse(legacy) as UserProfile;
    if (!schoolId || !parsed.schoolId || parsed.schoolId === schoolId) {
      localStorage.setItem(getProfileCacheKey(schoolId), legacy);
      return parsed;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

export function cacheProfile(profile: UserProfile): void {
  const key = getProfileCacheKey(profile.schoolId || getCurrentSchoolId());
  try {
    localStorage.setItem(key, JSON.stringify(profile));
  } catch {
    // Ignore errors
  }
}

/**
 * Check if the current page indicates the user is logged in.
 * Uses multiple signals: meta tags, body class, mobile menu.
 */
export function isLoggedIn(): boolean {
  // Check for elevid in the start URL meta tag (most reliable)
  const meta = document.querySelector('meta[name="msapplication-starturl"]');
  if (meta?.getAttribute('content')?.includes('elevid=')) {
    return true;
  }

  // Check for masterbody class (only on logged-in pages)
  if (document.body?.classList.contains('masterbody')) {
    return true;
  }

  // Check for logout link in mobile menu
  const logoutLink = document.querySelector('#mobilMereSheetMenuList a[href*="logout.aspx"]');
  if (logoutLink) {
    return true;
  }

  return false;
}

export function getCachedLoginState(): LoginState | null {
  try {
    const stored = localStorage.getItem(LOGIN_STATE_KEY) ?? localStorage.getItem(LEGACY_LOGIN_STATE_KEY);
    if (stored) {
      if (!localStorage.getItem(LOGIN_STATE_KEY)) {
        localStorage.setItem(LOGIN_STATE_KEY, stored);
      }
      return JSON.parse(stored);
    }
  } catch {
    // Ignore errors
  }
  return null;
}

export function cacheLoginState(state: LoginState): void {
  try {
    localStorage.setItem(LOGIN_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore errors
  }
}

export function clearLoginState(): void {
  try {
    localStorage.removeItem(LOGIN_STATE_KEY);
    localStorage.removeItem(LEGACY_LOGIN_STATE_KEY);
    localStorage.removeItem(PROFILE_CACHE_KEY);
    localStorage.removeItem(LEGACY_PROFILE_CACHE_KEY);
    const schoolId = getCurrentSchoolId();
    if (schoolId) {
      localStorage.removeItem(getProfileCacheKey(schoolId));
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Update login state cache. Call this after DOM is ready.
 */
export function updateLoginState(): void {
  const schoolId = window.location.pathname.match(/\/lectio\/(\d+)\//)?.[1] || null;
  const loggedIn = isLoggedIn();

  cacheLoginState({
    isLoggedIn: loggedIn,
    schoolId,
    lastChecked: Date.now(),
  });

  // If logged out, clear profile cache
  if (!loggedIn) {
    clearLoginState();
  }
}

/**
 * Get the logged-in user's student ID from the page.
 * This is found in the meta tag or mobile menu links, not the URL.
 */
export function getLoggedInUserId(): string | null {
  // Try meta tag first: <meta name="msapplication-starturl" content="/lectio/94/forside.aspx?elevid=72721772841">
  const meta = document.querySelector('meta[name="msapplication-starturl"]');
  const metaContent = meta?.getAttribute('content') || '';
  const metaMatch = metaContent.match(/elevid=(\d+)/);
  if (metaMatch) return metaMatch[1];

  // Try mobile menu links that reference logged-in user's pages
  const menuLink = document.querySelector<HTMLAnchorElement>(
    '#mobilMereSheetMenuList a[href*="studieplan.aspx"][href*="elevid="], ' +
    '#mobilMereSheetMenuList a[href*="grade_report.aspx"][href*="elevid="]'
  );
  const linkMatch = menuLink?.href.match(/elevid=(\d+)/);
  if (linkMatch) return linkMatch[1];

  return null;
}

/**
 * Get the ID of the entity whose schedule/page we're viewing from the URL.
 */
export function getViewedEntityId(): { id: string; type: ScheduleEntityType } | null {
  const search = window.location.search;

  const params = new URLSearchParams(search);

  // Handle generic ?type=X&id=Y format (used by lokale, ressource, gruppe from FindSkema)
  const typeParam = params.get('type');
  const genericId = params.get('id');
  if (typeParam && genericId) {
    const typeMap: Record<string, ScheduleEntityType> = {
      lokale: 'room',
      ressource: 'resource',
      gruppe: 'group',
    };
    const mapped = typeMap[typeParam];
    if (mapped) return { id: genericId, type: mapped };
  }

  // Check dedicated URL parameter types
  const patterns: [RegExp, ScheduleEntityType][] = [
    [/elevid=(\d+)/, 'student'],
    [/laererid=(\d+)/, 'teacher'],
    [/klasseid=(\d+)/, 'class'],
    [/lokaleid=(\d+)/, 'room'],
    [/ressourceid=(\d+)/, 'resource'],
    [/holdid=(\d+)/, 'hold'],
    [/gruppeid=(\d+)/, 'group'],
    [/holdelementid=(\d+)/, 'holdelement'],
  ];

  for (const [regex, type] of patterns) {
    const match = search.match(regex);
    if (match) return { id: match[1], type };
  }

  return null;
}

/**
 * @deprecated Use getViewedEntityId instead
 */
export function getViewedPersonId(): { id: string; type: 'student' | 'teacher' } | null {
  const result = getViewedEntityId();
  if (result && (result.type === 'student' || result.type === 'teacher')) {
    return result as { id: string; type: 'student' | 'teacher' };
  }
  return null;
}

/**
 * Check if we're viewing our own page or someone else's.
 */
export function isViewingOwnPage(): boolean {
  const viewed = getViewedEntityId();
  if (!viewed) return true; // No ID in URL = own page

  // Non-person types are always "someone else's" page
  if (viewed.type !== 'student' && viewed.type !== 'teacher') {
    return false;
  }

  const loggedInId = getLoggedInUserId();
  if (!loggedInId) return true; // Can't determine, assume own page

  return viewed.id === loggedInId;
}

/**
 * Extract info about the entity whose schedule we're viewing (when it's not us).
 */
export function extractViewedEntity(): ViewedEntity | null {
  const viewed = getViewedEntityId();
  if (!viewed || isViewingOwnPage()) return null;

  // Extract from main title element
  const titleEl = document.querySelector('#s_m_HeaderContent_MainTitle');
  const titleText = titleEl?.textContent || '';

  let name = '';
  let subtitle = '';
  const isHoldSchedule = viewed.type === 'hold' || viewed.type === 'holdelement';

  const fallbackNameByUrl = new URLSearchParams(window.location.search).get('name')?.trim() || '';

  const lookupNameInStorage = (): string => {
    const prefixes: Record<ScheduleEntityType, string[]> = {
      student: ['S'],
      teacher: ['T'],
      class: ['SC', 'K'],
      room: ['RO', 'L'],
      resource: ['RE', 'R'],
      hold: ['H'],
      group: ['GE', 'G'],
      holdelement: ['HE', 'H', 'GE', 'G'],
    };

    const candidates = (prefixes[viewed.type] || []).map(prefix => `${prefix}${viewed.id}`);

    if (candidates.length === 0) return '';

    const recentMatch = getRecentPeople().find(person => candidates.includes(person.id));
    if (recentMatch?.name) return recentMatch.name;

    const starredMatch = getStarredPeople().find(person => candidates.includes(person.id));
    if (starredMatch?.name) return starredMatch.name;

    return '';
  };
  const storageFallbackName = lookupNameInStorage();

  // Title patterns for different entity types:
  // Student: "Eleven Carl Christian Meding(k), 1x - Skema"
  // Teacher: "Læreren John Doe - Skema"
  // Class: "Stamklassen 1x - Skema" or "Klassen 1x - Skema"
  // Room: "Lokalet A1.01 - Skema"
  // Resource: "Ressourcen X - Skema"
  // Hold: "Holdet 1x En A - Skema"
  // Group: "Gruppen X - Skema"
  // Holdelement: Often same as Hold

  switch (viewed.type) {
    case 'student': {
      const match = titleText.match(/^Eleven\s+(.+?)(?:\([^)]+\))?,\s*(\S+)/);
      if (match) {
        name = match[1].trim();
        subtitle = match[2];
      } else {
        // e.g. DokumentOversigt: "Eleven Navn - Dokumenter" (no klasse segment)
        const noClass = titleText.match(/^Eleven\s+(.+?)(?:\([^)]+\))?\s*-\s*/);
        if (noClass) {
          name = noClass[1].trim();
        }
      }
      break;
    }
    case 'teacher': {
      const match = titleText.match(/^Læreren\s+(.+?)\s*-/);
      if (match) {
        name = match[1].trim();
      }
      break;
    }
    case 'class': {
      // "Stamklassen 1x - Skema" or "Klassen 1x - Skema"
      const match = titleText.match(/^(?:Stam)?[Kk]lassen\s+(.+?)\s*-/);
      if (match) {
        name = match[1].trim();
      }
      break;
    }
    case 'room': {
      const match = titleText.match(/^Lokalet\s+(.+?)\s*-/);
      if (match) {
        name = match[1].trim();
      }
      break;
    }
    case 'resource': {
      const match = titleText.match(/^Ressourcen\s+(.+?)\s*-/);
      if (match) {
        name = match[1].trim();
      }
      break;
    }
    case 'hold':
    case 'holdelement': {
      const match = titleText.match(/^Holdet\s+(.+?)\s*-/);
      if (match) {
        name = match[1].trim();
      }
      break;
    }
    case 'group': {
      const match = titleText.match(/^Gruppen\s+(.+?)\s*-/);
      if (match) {
        name = match[1].trim();
      }
      break;
    }
  }

  // Get picture (only for students/teachers)
  let pictureUrl: string | null = null;
  if (viewed.type === 'student' || viewed.type === 'teacher') {
    const profileImg = document.querySelector('#s_m_HeaderContent_picctrlthumbimage') as HTMLImageElement;
    if (profileImg?.src) {
      const url = new URL(profileImg.src, window.location.origin);
      url.searchParams.set('fullsize', '1');
      pictureUrl = url.toString();
    }
  }

  // Entity titles for some types are inconsistent on Lectio pages.
  // Fallback chain: URL param -> localStorage recents/starred -> generic title parsing.
  if (!name && (viewed.type === 'hold' || viewed.type === 'holdelement' || viewed.type === 'group' || viewed.type === 'room' || viewed.type === 'resource')) {
    name = fallbackNameByUrl || storageFallbackName;
  }

  // If we still couldn't parse the name, try a generic fallback
  if (!name) {
    // Generic pattern: "Something X - Page title" (e.g., "Gruppen Alle 1x-elever - Lærere og elever")
    const genericMatch = titleText.match(/^(.+?)\s*-\s*.+$/);
    if (genericMatch) {
      name = genericMatch[1].trim();
    }
  }

  if (!name) {
    name = fallbackNameByUrl || storageFallbackName || 'Ukendt';
  }

  if (isHoldSchedule) {
    const mappedTitleName = name ? getFullHoldDisplayName(name) : '';
    const mappedFallbackName = fallbackNameByUrl
      ? getFullHoldDisplayName(fallbackNameByUrl)
      : '';

    if (mappedTitleName && mappedTitleName !== name) {
      name = mappedTitleName;
    } else if (mappedFallbackName) {
      name = mappedFallbackName;
    } else if (name) {
      name = getFullHoldDisplayName(name);
    }
  }

  return {
    name,
    subtitle,
    pictureUrl,
    id: viewed.id,
    type: viewed.type,
  };
}

/**
 * @deprecated Use extractViewedEntity instead
 */
export function extractViewedPerson(): ViewedPerson | null {
  const entity = extractViewedEntity();
  if (!entity) return null;

  return {
    ...entity,
    className: entity.subtitle, // Backwards compatibility alias
  };
}

function getSchoolIdFromUrl(): string | null {
  const match = window.location.pathname.match(/\/lectio\/(\d+)\//);
  return match ? match[1] : null;
}

function getSchoolNameFromPage(): string | null {
  // Try meta tag first (format: "Lectio- School Name")
  const meta = document.querySelector('meta[name="application-name"]');
  if (meta) {
    const content = meta.getAttribute('content') || '';
    const match = content.match(/^Lectio-\s*(.+)$/);
    if (match) return match[1];
  }
  // Fallback to title (format: "... - Lectio - School Name")
  const titleMatch = document.title.match(/ - Lectio - (.+)$/);
  if (titleMatch) return titleMatch[1];
  // Last resort
  const el = document.querySelector('.ls-master-header-institution-name');
  return el?.textContent?.trim() || null;
}

export function extractProfileFromPage(): Partial<UserProfile> | null {
  // Only extract profile data when viewing our own page
  if (!isViewingOwnPage()) return null;

  const profile: Partial<UserProfile> = {};

  // Try to extract from the title: "Eleven Name, 1x - Skema" or "Eleven Name(k), 1x - Skema"
  const titleMatch = document.title.match(/^Eleven\s+(.+?)(?:\([^)]+\))?,\s*(\S+)\s*-/);
  if (titleMatch) {
    profile.fullName = titleMatch[1].trim();
    profile.name = profile.fullName.split(' ')[0];
    profile.className = titleMatch[2];
  }

  // Get logged-in user's ID
  profile.studentId = getLoggedInUserId();

  // Extract school info
  profile.schoolId = getSchoolIdFromUrl();
  profile.schoolName = getSchoolNameFromPage();

  // Extract profile picture - only when on own page
  const profileImg = document.querySelector('#s_m_HeaderContent_picctrlthumbimage') as HTMLImageElement;
  if (profileImg?.src) {
    const url = new URL(profileImg.src, window.location.origin);
    url.searchParams.set('fullsize', '1');
    profile.pictureUrl = url.toString();
  }

  // Only return if we have meaningful data
  if (profile.name || profile.pictureUrl || profile.schoolName) {
    return profile;
  }
  return null;
}

export function updateProfileCache(): void {
  const extracted = extractProfileFromPage();
  if (!extracted) return;

  const existing = getCachedProfile();
  const isSameSchool = !existing?.schoolId || !extracted.schoolId || existing.schoolId === extracted.schoolId;
  const prior = isSameSchool ? existing : null;

  // Merge with existing cache, preferring new non-null values
  const updated: UserProfile = {
    name: extracted.name || prior?.name || 'Bruger',
    fullName: extracted.fullName || prior?.fullName || 'Bruger',
    className: extracted.className || prior?.className || '',
    pictureUrl: extracted.pictureUrl || prior?.pictureUrl || null,
    studentId: extracted.studentId || prior?.studentId || null,
    schoolId: extracted.schoolId || prior?.schoolId || null,
    schoolName: extracted.schoolName || prior?.schoolName || null,
    cachedAt: Date.now(),
  };

  // Only cache if we have at least a name and picture
  if (updated.name !== 'Bruger' || updated.pictureUrl) {
    cacheProfile(updated);
  }
}
