import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, Clock, Pin, Users, Search, GraduationCap, School, DoorOpen, Box, UsersRound, LayoutGrid, Sparkles } from 'lucide-react';
import { PersonCard } from './PersonCard';
import { getCachedProfile } from '../lib/profile-cache';

import { getSettings } from '../lib/settings-storage';
import {
  getStarredPeople,
  getRecentPeople,
  addRecentPerson,
  removeRecentPerson,
  toggleStarred,
  isPersonStarred,
  parsePersonInfo,
  getScheduleUrl,
  type StarredPerson,
  type RecentPerson,
  registerNameIdMappings,
} from '../lib/findskema-storage';
import {
  searchItems,
  createSearchText,
  type SearchableItem,
} from '../lib/fuzzy-search';
import { fetchAvanceretSkemaDropdownItems } from '../lib/findskema-cache';
import { getFindSkemaTypeKeyFromId } from '../lib/findskema-types';
import { getMyTeacherIds } from '../lib/my-teachers';
import { getFullHoldDisplayName } from '../lib/hold-mapping';
import { classGroupsMatch, transformYearBasedClassName, transformYearBasedHoldName } from '../lib/class-name';
import { useSchoolStudents, getStudentIdFromPersonId, getNameAliasesFromLookupId } from '../lib/supabase/student-lookup';

type SearchType = 'elev' | 'laerer' | 'stamklasse' | 'lokale' | 'ressource' | 'hold' | 'gruppe' | 'all';

// Filter configuration with icons and labels
const FILTER_CONFIG = [
  { key: 'S', label: 'Elever', icon: Users, type: 'elev' },
  { key: 'T', label: 'Lærere', icon: GraduationCap, type: 'laerer' },
  { key: 'K', label: 'Klasser', icon: School, type: 'stamklasse' },
  { key: 'L', label: 'Lokaler', icon: DoorOpen, type: 'lokale' },
  { key: 'R', label: 'Ressourcer', icon: Box, type: 'ressource' },
  { key: 'H', label: 'Hold', icon: UsersRound, type: 'hold' },
  { key: 'G', label: 'Grupper', icon: LayoutGrid, type: 'gruppe' },
] as const;

// Map search type to prefix
const TYPE_TO_PREFIX: Record<string, string> = {
  elev: 'S',
  laerer: 'T',
  stamklasse: 'K',
  lokale: 'L',
  ressource: 'R',
  hold: 'H',
  gruppe: 'G',
};

const ALL_FILTER_KEYS = ['S', 'T', 'K', 'L', 'R', 'H', 'G'];

function getBrowseLimit(typeKey: string, singleFilter: boolean): number {
  if (singleFilter) {
    if (typeKey === 'G') return Number.POSITIVE_INFINITY;
    if (typeKey === 'S' || typeKey === 'T') return 32;
    return 50;
  }
  if (typeKey === 'S' || typeKey === 'T') return 12;
  return 10;
}

interface FindSkemaPageProps {
  schoolId: string;
  searchType?: SearchType;
}

export function FindSkemaPage({ schoolId, searchType = 'all' }: FindSkemaPageProps) {
  // Initialize query from URL param if returning from a schedule page
  const [query, setQuery] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('q') || '';
  });
  const [rawItems, setRawItems] = useState<SearchableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starred, setStarred] = useState<StarredPerson[]>([]);
  const [recents, setRecents] = useState<RecentPerson[]>([]);
  const [myTeacherIds, setMyTeacherIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const { studentsMap } = useSchoolStudents(schoolId, { refreshOnMount: true });

  // Initialize active filter based on searchType prop — single-select or 'all'
  const getInitialFilter = (): string => {
    if (searchType === 'all') return 'all';
    const prefix = TYPE_TO_PREFIX[searchType];
    return prefix || 'all';
  };

  const [activeFilter, setActiveFilter] = useState<string>(getInitialFilter);

  // Derive a Set for filtering logic (all keys when 'all', single key otherwise)
  const activeFilters = useMemo(() => {
    if (activeFilter === 'all') return new Set(ALL_FILTER_KEYS);
    return new Set([activeFilter]);
  }, [activeFilter]);

  const userProfile = getCachedProfile();

  // Get placeholder text based on active filter
  const placeholderText = useMemo(() => {
    if (activeFilter === 'all') {
      return 'Søg efter elever, lærere, klasser, hold...';
    }
    const config = FILTER_CONFIG.find(f => f.key === activeFilter);
    return config ? `Søg efter ${config.label.toLowerCase()}...` : 'Søg...';
  }, [activeFilter]);

  // Load autocomplete data - always load ALL items
  useEffect(() => {
    async function loadData() {
      try {
        const items = await fetchAvanceretSkemaDropdownItems(schoolId);
        if (items.length === 0) {
          throw new Error('No AvanceretSkema items');
        }

        // Load ALL items - filtering happens in the UI
        // API response format: [title, key, flags, group, cssClass, _que, isContextCard, shortName, longName]
        const parsed: SearchableItem[] = items
          .filter((item: any[]) => {
            const id = item[1];
            return id && typeof id === 'string';
          })
          .map((item: any[]) => {
            const rawName = item[0] as string;
            const id = item[1] as string;
            const shortName = (item[7] as string | null) || null;
            const longName = (item[8] as string | null) || null;
            const type = getFindSkemaTypeKeyFromId(id);

            // Transform class names from year-based to grade-based (e.g. "2025x" → "1x")
            if (type === 'K') {
              const transformed = transformYearBasedClassName(rawName);
              if (transformed) {
                return {
                  name: transformed.displayName,
                  id,
                  type,
                  shortName,
                  longName,
                  searchText: createSearchText(transformed.displayName, shortName, longName) + ' ' + rawName,
                  classGrade: transformed.grade,
                };
              }
            }

            // Transform class prefix in hold names (e.g. "2025x HI" → "1x HI")
            if (type === 'H') {
              const transformedHold = transformYearBasedHoldName(rawName) ?? rawName;
              const displayName = getFullHoldDisplayName(transformedHold);
              return {
                name: displayName,
                id,
                type,
                shortName,
                longName,
                searchText: createSearchText(displayName, shortName, longName) + ' ' + transformedHold + ' ' + rawName,
              };
            }

            return {
              name: rawName,
              id,
              type,
              shortName,
              longName,
              searchText: createSearchText(rawName, shortName, longName),
            };
          });

        setRawItems(parsed);
        setLoading(false);

        // Cache name → context card ID mappings for profile picture lookups (e.g. in messages)
        const nameMappings = parsed
          .filter(p => p.type === 'S' || p.type === 'T')
          .map(p => ({ name: p.name, id: p.id }));
        if (nameMappings.length > 0) registerNameIdMappings(schoolId, nameMappings);
      } catch (err) {
        console.error('[FindSkemaPage] Failed to load data:', err);
        setError('Kunne ikke indlæse søgedata');
        setLoading(false);
      }
    }

    loadData();
  }, [schoolId]);

  const items = useMemo(() => {
    return rawItems.map((item) => {
      if (item.type !== 'S') return item;

      const aliases = getNameAliasesFromLookupId(studentsMap, item.id, item.name);
      if (aliases.length === 0) return item;

      return {
        ...item,
        searchText: `${item.searchText} ${aliases.join(' ')}`.trim(),
      };
    });
  }, [rawItems, studentsMap]);

  // Load starred and recents from localStorage
  useEffect(() => {
    setStarred(getStarredPeople());
    setRecents(getRecentPeople());
  }, []);

  // Load the student's own teacher IDs (from their schedule)
  useEffect(() => {
    getMyTeacherIds(schoolId).then(ids => {
      if (ids.size > 0) setMyTeacherIds(ids);
    });
  }, [schoolId]);

  // Keyboard shortcut to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        inputRef.current?.blur();
        setQuery('');
        return;
      }
      // Auto-focus search on any printable character
      if (
        document.activeElement !== inputRef.current &&
        e.key.length === 1 &&
        !e.metaKey && !e.ctrlKey && !e.altKey
      ) {
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter items based on search query and active filters using fuzzy search
  const filteredItems = useMemo(() => {
    const results = searchItems(items, query, activeFilters, 50);
    return results.map(r => r.item);
  }, [items, query, activeFilters]);

  const showSearchResults = query.length >= 2;

  // Get the student's own teachers from their schedule
  const myTeachers = useMemo(() => {
    if (myTeacherIds.size === 0) return [];
    return items
      .filter(item => item.type === 'T' && myTeacherIds.has(item.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'da-DK'));
  }, [items, myTeacherIds]);

  const browseSections = useMemo(() => {
    // Only show browse sections when a specific filter is selected (not "Alle")
    if (showSearchResults || activeFilter === 'all') return [];

    // Students are handled by the classmates section, teachers by myTeachers section
    if (activeFilter === 'S' || activeFilter === 'T') return [];

    const limit = getBrowseLimit(activeFilter, true);
    const config = FILTER_CONFIG.find(f => f.key === activeFilter);
    if (!config) return [];

    const list = items
      .filter((item) => {
        if (item.type !== activeFilter) return false;
        // For classes, only show active ones (grade 1-3) in browse view
        if (item.type === 'K' && (item.classGrade == null || item.classGrade < 1 || item.classGrade > 3)) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'da-DK'))
      .slice(0, limit);

    if (list.length === 0) return [];
    return [{ ...config, items: list, limit }];
  }, [items, activeFilter, showSearchResults]);

  // Get classmates (people in same class as user)
  const classmates = useMemo(() => {
    if (!userProfile?.className) return [];
    const userClass = userProfile.className.toLowerCase();

    return items.filter(item => {
      if (item.type !== 'S') return false;
      const { classCode } = parsePersonInfo(item.name);
      if (!classCode) return false;
      return classGroupsMatch(classCode, userClass);
    });
  }, [items, userProfile?.className]);

  // Handle starring
  const handleStarToggle = useCallback((id: string) => {
    const searchItem = items.find(i => i.id === id);
    const recentItem = recents.find(r => r.id === id);
    const starredItem = starred.find(s => s.id === id);
    const wasStarred = isPersonStarred(id);

    if (searchItem) {
      const { displayName, classCode } = parsePersonInfo(searchItem.name);
      toggleStarred({
        id,
        name: displayName,
        classCode,
        type: searchItem.type,
      });
    } else if (recentItem) {
      toggleStarred({
        id,
        name: recentItem.name,
        classCode: recentItem.classCode,
        type: recentItem.type,
      });
    } else if (starredItem) {
      toggleStarred({
        id,
        name: starredItem.name,
        classCode: starredItem.classCode,
        type: starredItem.type,
      });
    }
    setStarred(getStarredPeople());

  }, [items, recents, starred, schoolId]);

  // Handle removing from recents
  const handleRemoveRecent = useCallback((id: string) => {
    removeRecentPerson(id);
    setRecents(getRecentPeople());
  }, []);

  // Handle card click (add to recents)
  const handleCardClick = useCallback((item: SearchableItem) => {
    const { displayName, classCode } = parsePersonInfo(item.name);
    const url = item.scheduleUrl || getScheduleUrl(item.id, schoolId);
    addRecentPerson({
      id: item.id,
      name: displayName,
      classCode,
      type: item.type,
      url,
    });
  }, [schoolId]);

  // Filter recents and starred based on active filters
  const filteredRecents = useMemo(() => {
    return recents.filter(r => activeFilters.has(r.type));
  }, [recents, activeFilters]);

  const filteredStarred = useMemo(() => {
    return starred.filter(s => activeFilters.has(s.type));
  }, [starred, activeFilters]);

  // Get settings for data features
  const settings = getSettings();

  // Determine which sections to show
  const pinningEnabled = settings.data?.starredPeople ?? false;
  const showRecents = !showSearchResults && filteredRecents.length > 0 && (settings.data?.recentSearches ?? false);
  const showStarred = !showSearchResults && filteredStarred.length > 0 && pinningEnabled;
  const showClassmates = !showSearchResults && classmates.length > 0 && activeFilters.has('S');
  const showMyTeachers = !showSearchResults && myTeachers.length > 0 && activeFilters.has('T');

  const hasBL = (personId: string) => {
    const sid = getStudentIdFromPersonId(personId);
    if (!sid || !studentsMap) return false;
    const s = studentsMap.get(sid);
    return !!(s?.has_extension || s?.has_app);
  };

  // BetterLectio filter state
  const [blFilterActive, setBlFilterActive] = useState(false);

  // Count BL users school-wide
  const schoolBLCount = useMemo(() => {
    if (!studentsMap) return 0;
    let count = 0;
    for (const s of studentsMap.values()) {
      if (s.has_extension || s.has_app) count++;
    }
    return count;
  }, [studentsMap]);

  // Count BL users among classmates
  const classmatesBLCount = useMemo(() => {
    return classmates.filter(item => hasBL(item.id)).length;
  }, [classmates, studentsMap]);

  // Only show BL filter if >= 20 BL users at the school
  const showBLFilter = schoolBLCount >= 20;

  // Apply BL filter to classmates
  const displayedClassmates = useMemo(() => {
    if (!blFilterActive) return classmates;
    return classmates.filter(item => hasBL(item.id));
  }, [classmates, blFilterActive, studentsMap]);

  const getPersonCardHref = useCallback((personId: string, fallbackHref: string) => {
    const sid = getStudentIdFromPersonId(personId);
    if (sid && userProfile?.studentId === sid) {
      return `${window.location.origin}/lectio/${schoolId}/indstillinger/studentIndstillinger.aspx`;
    }
    return fallbackHref;
  }, [schoolId, userProfile?.studentId]);

  return (
    <div className="min-h-full bg-background pb-2">
      {/* Search Section */}
      <div className="px-6 pt-8 pb-0">
        <div className="relative max-w-[800px] mx-auto">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 size-6 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery((e.target as HTMLInputElement).value)}
            placeholder={loading ? 'Indlæser...' : placeholderText}
            disabled={loading || !!error}
            className="w-full h-16 pl-14 pr-20 text-xl rounded-2xl border-2 border-border bg-background text-foreground shadow-[0_4px_12px_oklch(0_0_0/0.05)] transition-all duration-200 placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:shadow-[0_4px_12px_oklch(0_0_0/0.1),0_0_0_3px_color-mix(in_oklch,var(--ring)_20%,transparent)] disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="p-2 text-muted-foreground rounded-lg transition-all duration-150 hover:text-foreground hover:bg-accent"
              >
                <X className="size-5" />
              </button>
            ) : (
              <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 font-mono text-xs text-muted-foreground bg-muted border border-border rounded-md">
                <span>⌘</span>K
              </kbd>
            )}
          </div>
        </div>
        {error && <p className="mt-3 text-center text-destructive text-sm">{error}</p>}
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2 px-6 py-4 max-w-[800px] mx-auto justify-center">
        <button
          type="button"
          onClick={() => setActiveFilter('all')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-full border transition-all duration-150 select-none ${
            activeFilter === 'all'
              ? 'bg-primary text-primary-foreground border-primary hover:bg-[color-mix(in_oklch,var(--primary)_90%,black)]'
              : 'bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground'
          }`}
        >
          Alle
        </button>
        {FILTER_CONFIG.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveFilter(activeFilter === key ? 'all' : key)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-full border transition-all duration-150 select-none ${
              activeFilter === key
                ? 'bg-primary text-primary-foreground border-primary hover:bg-[color-mix(in_oklch,var(--primary)_90%,black)]'
                : 'bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground'
            }`}
          >
            <Icon className="size-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Search Results */}
      {showSearchResults && (
        <section className="mb-6">
          <div className="flex items-center gap-2 px-6 py-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            <Search className="size-4" />
            <span>Søgeresultater ({filteredItems.length})</span>
          </div>
          {filteredItems.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 px-6">
              {filteredItems.map(item => {
                const { displayName, classCode } = parsePersonInfo(item.name);
                return (
                  <PersonCard
                    key={item.id}
                    id={item.id}
                    name={displayName}
                    classCode={classCode}
                    type={item.type}
                    href={getPersonCardHref(item.id, item.scheduleUrl || getScheduleUrl(item.id, schoolId))}
                    isStarred={isPersonStarred(item.id)}
                    onStarToggle={handleStarToggle}
                    showPinButton={pinningEnabled}
                    onClick={() => handleCardClick(item)}
                    schoolId={schoolId}
                    searchQuery={query}
                    hasBetterLectio={hasBL(item.id)}
                    studentsMap={studentsMap}
                  />
                );
              })}
            </div>
          ) : (
            <p className="px-6 py-8 text-center text-muted-foreground">Ingen resultater fundet</p>
          )}
        </section>
      )}

      {/* Browse Sections */}
      {!showSearchResults && browseSections.map(({ key, label, icon: Icon, items: sectionItems, limit }) => (
        <section key={key} className="mb-6">
          <div className="flex items-center gap-2 px-6 py-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            <Icon className="size-4" />
            <span>{label} (viser {sectionItems.length}{sectionItems.length >= limit ? '+' : ''})</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 px-6">
            {sectionItems.map(item => {
              const { displayName, classCode } = parsePersonInfo(item.name);
              return (
                <PersonCard
                  key={item.id}
                  id={item.id}
                  name={displayName}
                  classCode={classCode}
                  type={item.type}
                  href={getPersonCardHref(item.id, item.scheduleUrl || getScheduleUrl(item.id, schoolId))}
                  isStarred={isPersonStarred(item.id)}
                  onStarToggle={handleStarToggle}
                  showPinButton={pinningEnabled}
                  onClick={() => handleCardClick(item)}
                  schoolId={schoolId}
                  searchQuery={query}
                  hasBetterLectio={hasBL(item.id)}
                  studentsMap={studentsMap}
                />
              );
            })}
          </div>
        </section>
      ))}

      {/* Recents Section */}
      {showRecents && (
        <section className="mb-6">
          <div className="flex items-center gap-2 px-6 py-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            <Clock className="size-4" />
            <span>Seneste</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 px-6">
            {filteredRecents.map(recent => (
              <PersonCard
                key={recent.id}
                id={recent.id}
                name={recent.name}
                classCode={recent.classCode}
                type={recent.type}
                href={getPersonCardHref(recent.id, recent.url)}
                isStarred={isPersonStarred(recent.id)}
                onStarToggle={handleStarToggle}
                showPinButton={pinningEnabled}
                onRemove={handleRemoveRecent}
                schoolId={schoolId}
                searchQuery={query}
                hasBetterLectio={hasBL(recent.id)}
                studentsMap={studentsMap}
              />
            ))}
          </div>
        </section>
      )}

      {/* Starred Section */}
      {showStarred && (
        <section className="mb-6">
          <div className="flex items-center gap-2 px-6 py-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            <Pin className="size-4" />
            <span>Fastgjorte</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 px-6">
            {filteredStarred.map(person => (
              <PersonCard
                key={person.id}
                id={person.id}
                name={person.name}
                classCode={person.classCode}
                type={person.type}
                href={getPersonCardHref(person.id, getScheduleUrl(person.id, schoolId))}
                isStarred={true}
                onStarToggle={handleStarToggle}
                showPinButton={pinningEnabled}
                onClick={() => {
                  addRecentPerson({
                    id: person.id,
                    name: person.name,
                    classCode: person.classCode,
                    type: person.type,
                    url: getScheduleUrl(person.id, schoolId),
                  });
                }}
                schoolId={schoolId}
                searchQuery={query}
                hasBetterLectio={hasBL(person.id)}
                studentsMap={studentsMap}
              />
            ))}
          </div>
        </section>
      )}

      {/* My Teachers Section */}
      {showMyTeachers && (
        <section className="mb-6">
          <div className="flex items-center gap-2 px-6 py-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            <GraduationCap className="size-4" />
            <span>Mine lærere</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 px-6">
            {myTeachers.map(item => {
              const { displayName, classCode } = parsePersonInfo(item.name);
              return (
                <PersonCard
                  key={item.id}
                  id={item.id}
                  name={displayName}
                  classCode={classCode}
                  type={item.type}
                  href={getPersonCardHref(item.id, getScheduleUrl(item.id, schoolId))}
                  isStarred={isPersonStarred(item.id)}
                  onStarToggle={handleStarToggle}
                  showPinButton={pinningEnabled}
                  onClick={() => handleCardClick(item)}
                  schoolId={schoolId}
                  searchQuery={query}
                  hasBetterLectio={hasBL(item.id)}
                  studentsMap={studentsMap}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Classmates Section */}
      {showClassmates && (
        <section className="mb-6">
          <div className="flex items-center justify-between px-6 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              <Users className="size-4" />
              <span>Klassekammerater ({userProfile?.className})</span>
            </div>
            {showBLFilter && (
              <button
                type="button"
                onClick={() => setBlFilterActive(!blFilterActive)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-150 select-none ${
                  blFilterActive
                    ? 'bg-primary text-primary-foreground border-primary hover:bg-[color-mix(in_oklch,var(--primary)_90%,black)]'
                    : 'bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                }`}
              >
                <Sparkles className="size-3" />
                <span>{classmatesBLCount}/{classmates.length}</span>
              </button>
            )}
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 px-6">
            {displayedClassmates.map(item => {
              const { displayName, classCode } = parsePersonInfo(item.name);
              return (
                <PersonCard
                  key={item.id}
                  id={item.id}
                  name={displayName}
                  classCode={classCode}
                  type={item.type}
                  href={getPersonCardHref(item.id, getScheduleUrl(item.id, schoolId))}
                  isStarred={isPersonStarred(item.id)}
                  onStarToggle={handleStarToggle}
                  showPinButton={pinningEnabled}
                  onClick={() => handleCardClick(item)}
                  schoolId={schoolId}
                  searchQuery={query}
                  hasBetterLectio={hasBL(item.id)}
                  studentsMap={studentsMap}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center gap-4 px-6 py-12 text-muted-foreground">
          <div className="size-8 border-2 border-border border-t-primary rounded-full animate-spin" />
          <span>Indlæser data...</span>
        </div>
      )}
    </div>
  );
}
