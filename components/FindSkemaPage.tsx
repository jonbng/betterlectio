import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, Clock, Star, Users, Search, GraduationCap, School, DoorOpen, Box, UsersRound, LayoutGrid, BookOpen, Shapes } from 'lucide-react';
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
} from '../lib/findskema-storage';
import {
  searchItems,
  createSearchText,
  type SearchableItem,
} from '../lib/fuzzy-search';
import { resolveAvanceretSkemaCacheParams } from '../lib/findskema-cache';
import { getFindSkemaTypeKeyFromId } from '../lib/findskema-types';
import { fetchAdvancedCategoryItems } from '../lib/findskema-advanced';

type SearchType = 'elev' | 'laerer' | 'stamklasse' | 'lokale' | 'ressource' | 'hold' | 'gruppe' | 'fag' | 'faggruppe' | 'all';

// Filter configuration with icons and labels
const FILTER_CONFIG = [
  { key: 'S', label: 'Elever', icon: Users, type: 'elev' },
  { key: 'T', label: 'Lærere', icon: GraduationCap, type: 'laerer' },
  { key: 'K', label: 'Klasser', icon: School, type: 'stamklasse' },
  { key: 'L', label: 'Lokaler', icon: DoorOpen, type: 'lokale' },
  { key: 'R', label: 'Ressourcer', icon: Box, type: 'ressource' },
  { key: 'H', label: 'Hold', icon: UsersRound, type: 'hold' },
  { key: 'G', label: 'Grupper', icon: LayoutGrid, type: 'gruppe' },
  { key: 'F', label: 'Fag', icon: BookOpen, type: 'fag' },
  { key: 'J', label: 'Faggrupper', icon: Shapes, type: 'faggruppe' },
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
  fag: 'F',
  faggruppe: 'J',
};

const ALL_FILTER_KEYS = ['S', 'T', 'K', 'L', 'R', 'H', 'G', 'F', 'J'];

function getBrowseLimit(typeKey: string, activeFilterCount: number): number {
  if (activeFilterCount === 1) {
    if (typeKey === 'S' || typeKey === 'T') return 32;
    return 50;
  }
  if (activeFilterCount <= 3) {
    if (typeKey === 'S' || typeKey === 'T') return 18;
    return 24;
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
  const [items, setItems] = useState<SearchableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starred, setStarred] = useState<StarredPerson[]>([]);
  const [recents, setRecents] = useState<RecentPerson[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize active filters based on searchType prop
  const getInitialFilters = (): Set<string> => {
    if (searchType === 'all') {
      return new Set(ALL_FILTER_KEYS);
    }
    const prefix = TYPE_TO_PREFIX[searchType];
    return prefix ? new Set([prefix]) : new Set(ALL_FILTER_KEYS);
  };

  const [activeFilters, setActiveFilters] = useState<Set<string>>(getInitialFilters);

  const userProfile = getCachedProfile();

  // Get placeholder text based on active filters
  const placeholderText = useMemo(() => {
    if (activeFilters.size === ALL_FILTER_KEYS.length) {
      return 'Søg efter elever, lærere, klasser, hold, fag...';
    }
    const activeLabels = FILTER_CONFIG
      .filter(f => activeFilters.has(f.key))
      .map(f => f.label.toLowerCase());
    return `Søg efter ${activeLabels.join(', ')}...`;
  }, [activeFilters]);

  // Toggle a filter
  const toggleFilter = useCallback((key: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        // Don't allow removing the last filter
        if (next.size > 1) {
          next.delete(key);
        }
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Select only one filter
  const selectOnlyFilter = useCallback((key: string) => {
    setActiveFilters(new Set([key]));
  }, []);

  // Select all filters
  const selectAllFilters = useCallback(() => {
    setActiveFilters(new Set(ALL_FILTER_KEYS));
  }, []);

  // Load autocomplete data - always load ALL items
  useEffect(() => {
    async function loadData() {
      try {
        const cacheParams = await resolveAvanceretSkemaCacheParams(schoolId);
        const afdelingId = cacheParams?.afdelingId;
        const subcache = cacheParams?.subcache || String(new Date().getFullYear());

        if (!cacheParams || !afdelingId) {
          throw new Error('Could not find afdeling ID');
        }

        const response = await fetch(
          `${window.location.origin}/lectio/${schoolId}/cache/DropDown.aspx?type=AvanceretSkema&afdeling=${afdelingId}&subcache=${subcache}`
        );
        const data = await response.json();

        // Debug: log all unique prefixes in the data
        const prefixes = new Set(data.items.map((item: any[]) => item[1]?.substring(0, 2)));
        console.log('[FindSkemaPage] Unique ID prefixes (first 2 chars):', [...prefixes].sort());
        console.log('[FindSkemaPage] Total items:', data.items.length);

        // Debug: log items that might be "Alle 1x-elever"
        const alleItems = data.items.filter((item: any[]) => item[0]?.toLowerCase().includes('alle'));
        console.log('[FindSkemaPage] Items containing "alle":', alleItems.map((i: any[]) => ({ name: i[0], id: i[1], prefix: i[1]?.substring(0, 2) })));
        // Debug: specifically look for "1x" items
        const items1x = data.items.filter((item: any[]) => item[0]?.toLowerCase().includes('1x'));
        console.log('[FindSkemaPage] Items containing "1x":', items1x.map((i: any[]) => ({ name: i[0], id: i[1], prefix: i[1]?.substring(0, 2) })));

        // Load ALL items - filtering happens in the UI
        // API response format: [title, key, flags, group, cssClass, _que, isContextCard, shortName, longName]
        const parsed: SearchableItem[] = data.items
          .filter((item: any[]) => {
            const id = item[1];
            return id && typeof id === 'string';
          })
          .map((item: any[]) => {
            const name = item[0] as string;
            const id = item[1] as string;
            const shortName = (item[7] as string | null) || null;
            const longName = (item[8] as string | null) || null;
            return {
              name,
              id,
              type: getFindSkemaTypeKeyFromId(id),
              shortName,
              longName,
              searchText: createSearchText(name, shortName, longName),
            };
          });

        // Debug: log parsed items containing "alle"
        const parsedAlleItems = parsed.filter(i => i.name.toLowerCase().includes('alle'));
        console.log('[FindSkemaPage] Parsed items containing "alle":', parsedAlleItems.map(i => ({ name: i.name, id: i.id, type: i.type, searchText: i.searchText })));

        let advancedItems: SearchableItem[] = [];
        try {
          const [fagItems, faggruppeItems] = await Promise.all([
            fetchAdvancedCategoryItems(schoolId, 'fag'),
            fetchAdvancedCategoryItems(schoolId, 'faggruppe'),
          ]);
          advancedItems = [...fagItems, ...faggruppeItems];
        } catch (advancedErr) {
          console.warn('[FindSkemaPage] Failed to load advanced Fag/Faggrupper:', advancedErr);
        }

        const combinedMap = new Map<string, SearchableItem>();
        for (const item of parsed) {
          combinedMap.set(`${item.type}:${item.id}`, item);
        }
        for (const item of advancedItems) {
          const key = `${item.type}:${item.id}`;
          if (!combinedMap.has(key)) {
            combinedMap.set(key, item);
          }
        }

        setItems([...combinedMap.values()]);
        setLoading(false);
      } catch (err) {
        console.error('[FindSkemaPage] Failed to load data:', err);
        setError('Kunne ikke indlæse søgedata');
        setLoading(false);
      }
    }

    loadData();
  }, [schoolId]);

  // Load starred and recents from localStorage
  useEffect(() => {
    setStarred(getStarredPeople());
    setRecents(getRecentPeople());
  }, []);

  // Keyboard shortcut to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        inputRef.current?.blur();
        setQuery('');
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

  const browseSections = useMemo(() => {
    if (showSearchResults) return [];

    const activeCount = activeFilters.size;
    return FILTER_CONFIG
      .filter(({ key }) => activeFilters.has(key))
      .filter(({ key }) => key !== 'S') // Student discovery is handled by the dedicated classmates section
      .map((filter) => {
        const limit = getBrowseLimit(filter.key, activeCount);
        const list = items
          .filter((item) => item.type === filter.key)
          .sort((a, b) => a.name.localeCompare(b.name, 'da-DK'))
          .slice(0, limit);
        return { ...filter, items: list, limit };
      })
      .filter((section) => section.items.length > 0);
  }, [items, activeFilters, showSearchResults]);

  // Get classmates (people in same class as user)
  const classmates = useMemo(() => {
    if (!userProfile?.className) return [];
    const userClass = userProfile.className.toLowerCase();

    return items.filter(item => {
      if (item.type !== 'S') return false;
      // Extract class from name: "Name (1x 05)" -> "1x"
      const match = item.name.match(/\((\d+[a-z])\s*\d*\)$/i);
      if (!match) return false;
      return match[1].toLowerCase() === userClass;
    });
  }, [items, userProfile?.className]);

  // Handle starring
  const handleStarToggle = useCallback((id: string) => {
    const searchItem = items.find(i => i.id === id);
    const recentItem = recents.find(r => r.id === id);
    const starredItem = starred.find(s => s.id === id);

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
  }, [items, recents, starred]);

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
  const showRecents = !showSearchResults && filteredRecents.length > 0 && (settings.data?.recentSearches ?? false);
  const showStarred = !showSearchResults && filteredStarred.length > 0 && (settings.data?.starredPeople ?? false);
  const showClassmates = !showSearchResults && classmates.length > 0 && activeFilters.has('S');

  return (
    <div className="findskema-page pb-2">
      {/* Search Section */}
      <div className="findskema-search-container">
        <div className="findskema-search-wrapper">
          <Search className="findskema-search-icon" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery((e.target as HTMLInputElement).value)}
            placeholder={loading ? 'Indlæser...' : placeholderText}
            disabled={loading || !!error}
            className="findskema-search-input"
          />
          <div className="findskema-search-actions">
            {query ? (
              <button
                onClick={() => setQuery('')}
                className="findskema-clear-btn"
              >
                <X className="size-5" />
              </button>
            ) : (
              <kbd className="findskema-shortcut-hint">
                <span>⌘</span>K
              </kbd>
            )}
          </div>
        </div>
        {error && <p className="findskema-error">{error}</p>}
      </div>

      {/* Filter Pills */}
      <div className="findskema-filters">
        <button
          type="button"
          onClick={selectAllFilters}
          className={`findskema-filter-pill ${activeFilters.size === ALL_FILTER_KEYS.length ? 'is-active' : ''}`}
        >
          Alle
        </button>
        {FILTER_CONFIG.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={(e) => {
              if (e.shiftKey) {
                selectOnlyFilter(key);
              } else {
                toggleFilter(key);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              selectOnlyFilter(key);
            }}
            className={`findskema-filter-pill ${activeFilters.has(key) ? 'is-active' : ''}`}
            title={`Klik for at toggle, shift+klik eller højreklik for kun ${label.toLowerCase()}`}
          >
            <Icon className="size-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Search Results */}
      {showSearchResults && (
        <section className="findskema-section">
          <div className="findskema-section-header">
            <Search className="size-4" />
            <span>Søgeresultater ({filteredItems.length})</span>
          </div>
          {filteredItems.length > 0 ? (
            <div className="findskema-card-grid">
              {filteredItems.map(item => {
                const { displayName, classCode } = parsePersonInfo(item.name);
                return (
                  <PersonCard
                    key={item.id}
                    id={item.id}
                    name={displayName}
                    classCode={classCode}
                    type={item.type}
                    href={item.scheduleUrl || getScheduleUrl(item.id, schoolId)}
                    isStarred={isPersonStarred(item.id)}
                    onStarToggle={handleStarToggle}
                    onClick={() => handleCardClick(item)}
                    schoolId={schoolId}
                    searchQuery={query}
                  />
                );
              })}
            </div>
          ) : (
            <p className="findskema-empty">Ingen resultater fundet</p>
          )}
        </section>
      )}

      {/* Browse Sections */}
      {!showSearchResults && browseSections.map(({ key, label, icon: Icon, items: sectionItems, limit }) => (
        <section key={key} className="findskema-section">
          <div className="findskema-section-header">
            <Icon className="size-4" />
            <span>{label} (viser {sectionItems.length}{sectionItems.length >= limit ? '+' : ''})</span>
          </div>
          <div className="findskema-card-grid">
            {sectionItems.map(item => {
              const { displayName, classCode } = parsePersonInfo(item.name);
              return (
                <PersonCard
                  key={item.id}
                  id={item.id}
                  name={displayName}
                  classCode={classCode}
                  type={item.type}
                  href={item.scheduleUrl || getScheduleUrl(item.id, schoolId)}
                  isStarred={isPersonStarred(item.id)}
                  onStarToggle={handleStarToggle}
                  onClick={() => handleCardClick(item)}
                  schoolId={schoolId}
                  searchQuery={query}
                />
              );
            })}
          </div>
        </section>
      ))}

      {/* Recents Section */}
      {showRecents && (
        <section className="findskema-section">
          <div className="findskema-section-header">
            <Clock className="size-4" />
            <span>Seneste</span>
          </div>
          <div className="findskema-card-grid">
            {filteredRecents.map(recent => (
              <PersonCard
                key={recent.id}
                id={recent.id}
                name={recent.name}
                classCode={recent.classCode}
                type={recent.type}
                href={recent.url}
                isStarred={isPersonStarred(recent.id)}
                onStarToggle={handleStarToggle}
                onRemove={handleRemoveRecent}
                schoolId={schoolId}
                searchQuery={query}
              />
            ))}
          </div>
        </section>
      )}

      {/* Starred Section */}
      {showStarred && (
        <section className="findskema-section">
          <div className="findskema-section-header">
            <Star className="size-4" />
            <span>Favoritter</span>
          </div>
          <div className="findskema-card-grid">
            {filteredStarred.map(person => (
              <PersonCard
                key={person.id}
                id={person.id}
                name={person.name}
                classCode={person.classCode}
                type={person.type}
                href={getScheduleUrl(person.id, schoolId)}
                isStarred={true}
                onStarToggle={handleStarToggle}
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
              />
            ))}
          </div>
        </section>
      )}

      {/* Classmates Section */}
      {showClassmates && (
        <section className="findskema-section">
          <div className="findskema-section-header">
            <Users className="size-4" />
            <span>Klassekammerater ({userProfile?.className})</span>
          </div>
          <div className="findskema-card-grid">
            {classmates.map(item => {
              const { displayName, classCode } = parsePersonInfo(item.name);
              return (
                <PersonCard
                  key={item.id}
                  id={item.id}
                  name={displayName}
                  classCode={classCode}
                  type={item.type}
                  href={getScheduleUrl(item.id, schoolId)}
                  isStarred={isPersonStarred(item.id)}
                  onStarToggle={handleStarToggle}
                  onClick={() => handleCardClick(item)}
                  schoolId={schoolId}
                  searchQuery={query}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Loading State */}
      {loading && (
        <div className="findskema-loading">
          <div className="findskema-spinner" />
          <span>Indlæser data...</span>
        </div>
      )}
    </div>
  );
}
