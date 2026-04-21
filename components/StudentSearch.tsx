import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Clock, Trash2 } from 'lucide-react';
import {
  searchItems,
  createSearchText,
  type SearchableItem,
} from '../lib/fuzzy-search';
import { fetchAvanceretSkemaDropdownItems } from '../lib/findskema-cache';
import { getFindSkemaTypeKeyFromId, type FindSkemaTypeKey } from '../lib/findskema-types';
import { useTranslation } from '@/lib/i18n';

interface RecentSearch {
  name: string;
  id: string;
  url: string;
  timestamp: number;
  itemType: string;
}

// Type configuration for different search modes
type SearchType = 'elev' | 'laerer' | 'stamklasse' | 'lokale' | 'ressource' | 'hold' | 'gruppe' | 'all';

interface TypeConfig {
  typeKeys: FindSkemaTypeKey[];
  urlParam: string;
  placeholder: string;
  badgeClass: string;
}

const TYPE_CONFIG: Record<string, TypeConfig> = {
  elev: {
    typeKeys: ['S', 'L'],
    urlParam: 'elevid',
    placeholder: 'personSearch.placeholders.student',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  },
  laerer: {
    typeKeys: ['T', 'L'],
    urlParam: 'laererid',
    placeholder: 'personSearch.placeholders.teacher',
    badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  },
  stamklasse: {
    typeKeys: ['K'],
    urlParam: 'klasseid',
    placeholder: 'personSearch.placeholders.class',
    badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  },
  lokale: {
    typeKeys: ['L'],
    urlParam: 'lokaleid',
    placeholder: 'personSearch.placeholders.room',
    badgeClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  },
  ressource: {
    typeKeys: ['R'],
    urlParam: 'ressourceid',
    placeholder: 'personSearch.placeholders.resource',
    badgeClass: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
  },
  hold: {
    typeKeys: ['H'],
    urlParam: 'holdid',
    placeholder: 'personSearch.placeholders.hold',
    badgeClass: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
  },
  gruppe: {
    typeKeys: ['G'],
    urlParam: 'gruppeid',
    placeholder: 'personSearch.placeholders.group',
    badgeClass: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  },
  all: {
    typeKeys: ['S', 'T', 'L'],
    urlParam: '',
    placeholder: 'personSearch.placeholders.all',
    badgeClass: '',
  },
};

// Separate config for badge display (based on actual item type)
const ITEM_TYPE_CONFIG: Record<string, { badgeClass: string; urlParam: string }> = {
  S: { badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300', urlParam: 'elevid' },
  T: { badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300', urlParam: 'laererid' },
  K: { badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300', urlParam: 'klasseid' },
  L: { badgeClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300', urlParam: 'lokaleid' },
  R: { badgeClass: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300', urlParam: 'ressourceid' },
  H: { badgeClass: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300', urlParam: 'holdid' },
  G: { badgeClass: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300', urlParam: 'gruppeid' },
};

const ITEM_TYPE_KEY: Record<string, string> = {
  S: 'personSearch.types.student',
  T: 'personSearch.types.teacher',
  K: 'personSearch.types.class',
  L: 'personSearch.types.room',
  R: 'personSearch.types.resource',
  H: 'personSearch.types.hold',
  G: 'personSearch.types.group',
};

function getTypeFromId(id: string): string {
  const typeKey = getFindSkemaTypeKeyFromId(id);
  for (const [type, config] of Object.entries(TYPE_CONFIG)) {
    if (config.typeKeys.includes(typeKey)) {
      return type;
    }
  }
  return 'elev';
}

function getConfigForId(id: string): TypeConfig {
  const type = getTypeFromId(id);
  return TYPE_CONFIG[type] || TYPE_CONFIG.elev;
}

const RECENT_SEARCHES_KEY = 'bl-recent-searches';
const LEGACY_RECENT_SEARCHES_KEY = 'il-recent-searches';
const MAX_RECENT_SEARCHES = 10;

function getRecentSearches(filterType?: SearchType): RecentSearch[] {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY) ?? localStorage.getItem(LEGACY_RECENT_SEARCHES_KEY);
    if (!localStorage.getItem(RECENT_SEARCHES_KEY) && stored) {
      localStorage.setItem(RECENT_SEARCHES_KEY, stored);
    }
    const all: RecentSearch[] = stored ? JSON.parse(stored) : [];
    if (!filterType || filterType === 'all') {
      return all;
    }
    const config = TYPE_CONFIG[filterType];
    return all.filter(r => config.typeKeys.includes(getFindSkemaTypeKeyFromId(r.id)));
  } catch {
    return [];
  }
}

function saveRecentSearch(search: RecentSearch) {
  const recent = getRecentSearches().filter(r => r.id !== search.id);
  recent.unshift(search);
  localStorage.setItem(
    RECENT_SEARCHES_KEY,
    JSON.stringify(recent.slice(0, MAX_RECENT_SEARCHES))
  );
}

function removeRecentSearch(id: string) {
  const recent = getRecentSearches().filter(r => r.id !== id);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent));
}

interface SearchProps {
  schoolId: string;
  searchType?: SearchType;
}

export function StudentSearch({ schoolId, searchType = 'all' }: SearchProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SearchableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const typeConfig = TYPE_CONFIG[searchType] || TYPE_CONFIG.all;

  // Load autocomplete data
  useEffect(() => {
    async function loadData() {
      try {
        const items = await fetchAvanceretSkemaDropdownItems(schoolId);
        if (items.length === 0) {
          throw new Error('No AvanceretSkema items');
        }

        // Parse items - filter based on searchType prefixes
        // API response format: [title, key, flags, group, cssClass, _que, isContextCard, shortName, longName]
        const allowedTypeKeys = typeConfig.typeKeys;
        const parsed: SearchableItem[] = items
          .filter((item: any[]) => {
            const id = item[1];
            if (!id) return false;
            const typeKey = getFindSkemaTypeKeyFromId(String(id));
            return allowedTypeKeys.includes(typeKey);
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

        setItems(parsed);
        setLoading(false);
      } catch (err) {
        console.error('[StudentSearch] Failed to load data:', err);
        setError(t('personSearch.loadError'));
        setLoading(false);
      }
    }

    loadData();
  }, [schoolId, searchType]);

  // Load recent searches (filtered by type)
  useEffect(() => {
    setRecentSearches(getRecentSearches(searchType));
  }, [searchType]);

  // Handle click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setFocused(true);
      }
      if (e.key === 'Escape') {
        setFocused(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Create a filter set from the allowed prefixes for this search type
  const activeFilters = useMemo(() => new Set(typeConfig.typeKeys), [typeConfig.typeKeys]);

  // Use fuzzy search for better matching
  const filteredItems = useMemo(() => {
    const results = searchItems(items, query, activeFilters, 20);
    return results.map(r => r.item);
  }, [items, query, activeFilters]);

  const handleRemoveRecent = useCallback((e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    e.stopPropagation();
    removeRecentSearch(id);
    setRecentSearches(getRecentSearches());
  }, []);

  const showDropdown = focused && (query.length >= 2 || recentSearches.length > 0);

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl mb-6">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery((e.target as HTMLInputElement).value)}
          onFocus={() => setFocused(true)}
          placeholder={loading ? t('personSearch.placeholders.loading') : t(typeConfig.placeholder as Parameters<typeof t>[0])}
          disabled={loading || !!error}
          className="w-full h-16 px-5 pr-24 rounded-xl border-2 border-input bg-background text-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50 placeholder:text-muted-foreground/60"
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {query ? (
            <button
              onClick={() => setQuery('')}
              className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent transition-[color,background-color] duration-150"
            >
              <X className="size-5" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex h-6 items-center gap-1 rounded border bg-muted px-2 font-mono text-xs text-muted-foreground">
              <span className="text-xs">⌘</span>K
            </kbd>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-popover border-2 border-border rounded-xl shadow-xl overflow-hidden z-50 max-h-[420px] overflow-y-auto">
          {query.length >= 2 ? (
            filteredItems.length > 0 ? (
              <ul className="py-2">
                {filteredItems.map((item) => {
                  const prefix = item.type;
                  const itemConfig = ITEM_TYPE_CONFIG[prefix] || ITEM_TYPE_CONFIG.S;
                  const itemLabel = t((ITEM_TYPE_KEY[prefix] || 'personSearch.types.student') as Parameters<typeof t>[0]);
                  const idNum = item.id.slice(1);
                  const href = `/lectio/${schoolId}/SkemaNy.aspx?${itemConfig.urlParam}=${idNum}`;
                  return (
                    <li key={item.id}>
                      <a
                        href={href}
                        onClick={() => {
                          saveRecentSearch({
                            name: item.name,
                            id: item.id,
                            url: href,
                            timestamp: Date.now(),
                            itemType: prefix,
                          });
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-accent transition-[color,background-color] duration-150 flex items-center gap-3 cursor-pointer"
                      >
                        <span className={`text-xs font-medium px-2 py-1 rounded-md ${itemConfig.badgeClass}`}>
                          {itemLabel}
                        </span>
                        <span className="text-base">{item.name}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-muted-foreground">{t('personSearch.noResults')}</p>
            )
          ) : recentSearches.length > 0 ? (
            <div>
              <div className="px-4 py-3 text-sm font-medium text-muted-foreground border-b border-border flex items-center gap-2 bg-muted/30">
                <Clock className="size-4" />
                {t('personSearch.recentSearches')}
              </div>
              <ul className="py-2">
                {recentSearches.map((recent) => {
                  const prefix = recent.id.charAt(0);
                  const itemConfig = ITEM_TYPE_CONFIG[prefix] || ITEM_TYPE_CONFIG.S;
                  const itemLabel = t((ITEM_TYPE_KEY[prefix] || 'personSearch.types.student') as Parameters<typeof t>[0]);
                  return (
                    <li key={recent.id} className="group">
                      <div className="flex items-center">
                        <a
                          href={recent.url}
                          onClick={() => {
                            saveRecentSearch({ ...recent, timestamp: Date.now() });
                          }}
                          className="flex-1 px-4 py-3 text-left hover:bg-accent transition-[color,background-color] duration-150 flex items-center gap-3"
                        >
                          <span className={`text-xs font-medium px-2 py-1 rounded-md ${itemConfig.badgeClass}`}>
                            {itemLabel}
                          </span>
                          <span className="text-base">{recent.name}</span>
                        </a>
                        <button
                          type="button"
                          onClick={(e) => handleRemoveRecent(e, recent.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 mr-2 hover:bg-destructive/10 rounded-md transition-all"
                          title={t('personSearch.removeFromRecent')}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
