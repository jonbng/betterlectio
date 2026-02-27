// Fuzzy search utilities for BetterLectio
// Based on fts_fuzzy_match by Forrest Smith (public domain)

const SEQUENTIAL_BONUS = 15; // bonus for adjacent matches
const SEPARATOR_BONUS = 30; // bonus if match occurs after a separator
const CAMEL_BONUS = 30; // bonus if match is uppercase and prev is lower
const FIRST_LETTER_BONUS = 15; // bonus if the first letter is matched

const LEADING_LETTER_PENALTY = -5; // penalty applied for every letter before first match
const MAX_LEADING_LETTER_PENALTY = -15; // maximum penalty for leading letters
const UNMATCHED_LETTER_PENALTY = -1;

/**
 * Normalize a string for search comparison
 * Removes diacritics (æ, ø, å), converts to lowercase, and normalizes separators
 */
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^\p{L}\p{N}]+/gu, ' ') // Treat punctuation/separators as spaces
    .trim()
    .replace(/\s+/g, ' '); // Collapse repeated whitespace
}

/**
 * Check if all query terms appear in the target string (multi-word search)
 * Each term must appear somewhere in the target
 */
export function multiWordMatch(query: string, target: string): boolean {
  const normalizedTarget = normalizeString(target);
  const terms = normalizeString(query).split(/\s+/).filter(t => t.length > 0);

  if (terms.length === 0) return false;

  return terms.every(term => normalizedTarget.includes(term));
}

/**
 * Fuzzy match - returns [matched, score]
 * Characters in pattern must appear in order in str, but not necessarily adjacent
 */
export function fuzzyMatch(pattern: string, str: string): [boolean, number] {
  const recursionLimit = 10;
  const maxMatches = 256;
  const matches: number[] = [];

  return fuzzyMatchRecursive(
    normalizeString(pattern),
    normalizeString(str),
    0,
    0,
    null,
    matches,
    maxMatches,
    0,
    0,
    recursionLimit
  );
}

function fuzzyMatchRecursive(
  pattern: string,
  str: string,
  patternCurIndex: number,
  strCurrIndex: number,
  srcMatches: number[] | null,
  matches: number[],
  maxMatches: number,
  nextMatch: number,
  recursionCount: number,
  recursionLimit: number
): [boolean, number] {
  let outScore = 0;

  if (++recursionCount >= recursionLimit) {
    return [false, outScore];
  }

  if (patternCurIndex === pattern.length || strCurrIndex === str.length) {
    return [false, outScore];
  }

  let recursiveMatch = false;
  let bestRecursiveMatches: number[] = [];
  let bestRecursiveScore = 0;

  let firstMatch = true;
  while (patternCurIndex < pattern.length && strCurrIndex < str.length) {
    if (pattern[patternCurIndex] === str[strCurrIndex]) {
      if (nextMatch >= maxMatches) {
        return [false, outScore];
      }

      if (firstMatch && srcMatches) {
        matches.length = 0;
        matches.push(...srcMatches);
        firstMatch = false;
      }

      const recursiveMatches: number[] = [];
      const [matched, recursiveScore] = fuzzyMatchRecursive(
        pattern,
        str,
        patternCurIndex,
        strCurrIndex + 1,
        matches,
        recursiveMatches,
        maxMatches,
        nextMatch,
        recursionCount,
        recursionLimit
      );

      if (matched) {
        if (!recursiveMatch || recursiveScore > bestRecursiveScore) {
          bestRecursiveMatches = [...recursiveMatches];
          bestRecursiveScore = recursiveScore;
        }
        recursiveMatch = true;
      }

      matches[nextMatch++] = strCurrIndex;
      ++patternCurIndex;
    }
    ++strCurrIndex;
  }

  const matched = patternCurIndex === pattern.length;

  if (matched) {
    outScore = 100;

    // Apply leading letter penalty
    let penalty = LEADING_LETTER_PENALTY * matches[0];
    penalty = Math.max(penalty, MAX_LEADING_LETTER_PENALTY);
    outScore += penalty;

    // Apply unmatched penalty
    const unmatched = str.length - nextMatch;
    outScore += UNMATCHED_LETTER_PENALTY * unmatched;

    // Apply ordering bonuses
    for (let i = 0; i < nextMatch; i++) {
      const currIdx = matches[i];

      if (i > 0) {
        const prevIdx = matches[i - 1];
        if (currIdx === prevIdx + 1) {
          outScore += SEQUENTIAL_BONUS;
        }
      }

      if (currIdx > 0) {
        const neighbor = str[currIdx - 1];
        const curr = str[currIdx];
        // Camel case bonus
        if (neighbor === neighbor.toLowerCase() && curr === curr.toUpperCase()) {
          outScore += CAMEL_BONUS;
        }
        // Separator bonus (space, underscore, hyphen, etc.)
        if (' _-/('.includes(neighbor)) {
          outScore += SEPARATOR_BONUS;
        }
      } else {
        // First letter bonus
        outScore += FIRST_LETTER_BONUS;
      }
    }

    if (recursiveMatch && bestRecursiveScore > outScore) {
      return [true, bestRecursiveScore];
    }
    return [true, outScore];
  }

  return [false, outScore];
}

export interface SearchableItem {
  name: string;
  id: string;
  type: string;
  shortName: string | null;
  longName: string | null;
  scheduleUrl?: string; // Optional explicit URL if ID can't be mapped reliably
  searchText: string; // Pre-computed combined search text
  classGrade?: number; // For classes (type K): computed grade (1, 2, 3, etc.)
}

/**
 * Create a searchable string from all available fields
 */
export function createSearchText(
  name: string,
  shortName: string | null,
  longName: string | null
): string {
  const parts = [name];
  if (shortName) parts.push(shortName);
  if (longName) parts.push(longName);
  return parts.join(' ');
}

function getFuzzyWindowRatio(pattern: string, str: string): number {
  let patternIndex = 0;
  let firstMatch = -1;
  let lastMatch = -1;

  for (let i = 0; i < str.length && patternIndex < pattern.length; i++) {
    if (pattern[patternIndex] === str[i]) {
      if (firstMatch === -1) firstMatch = i;
      lastMatch = i;
      patternIndex += 1;
    }
  }

  if (patternIndex < pattern.length || firstMatch === -1 || lastMatch === -1) {
    return 0;
  }

  const matchWindow = lastMatch - firstMatch + 1;
  return pattern.length / matchWindow;
}

export interface SearchResult {
  item: SearchableItem;
  score: number;
  matchType: 'exact' | 'multiword' | 'fuzzy';
}

/**
 * Search items using a combination of strategies:
 * 1. Exact substring match (highest priority)
 * 2. Multi-word match (all words must appear)
 * 3. Fuzzy match (characters in order, not necessarily adjacent)
 *
 * Results are sorted by match quality and score
 */
export function searchItems(
  items: SearchableItem[],
  query: string,
  activeFilters: Set<string>,
  limit: number = 50
): SearchResult[] {
  if (normalizeString(query).length < 2) return [];

  const normalizedQuery = normalizeString(query);
  const compactQuery = normalizedQuery.replace(/\s+/g, '');
  const results: SearchResult[] = [];

  // Debug: Check for "Alle 1x-elever" specifically
  const debugQuery = normalizedQuery.includes('alle') && normalizedQuery.includes('1x');
  if (debugQuery) {
    const holdItems = items.filter(i => i.type === 'H');
    console.log('[fuzzy-search] DEBUG: Looking for "alle 1x" items');
    console.log('[fuzzy-search] DEBUG: Active filters:', [...activeFilters]);
    console.log('[fuzzy-search] DEBUG: H filter active?', activeFilters.has('H'));
    console.log('[fuzzy-search] DEBUG: Total Hold items (type H):', holdItems.length);
    const matching = holdItems.filter(i => normalizeString(i.searchText).includes('alle 1x'));
    console.log('[fuzzy-search] DEBUG: Hold items matching "alle 1x":', matching.map(i => ({ name: i.name, id: i.id, type: i.type, searchText: i.searchText })));
  }

  for (const item of items) {
    if (!activeFilters.has(item.type)) continue;

    const normalizedSearchText = normalizeString(item.searchText);
    const compactSearchText = normalizedSearchText.replace(/\s+/g, '');

    // Strategy 1: Exact substring match
    if (normalizedSearchText.includes(normalizedQuery)) {
      // Score based on how early the match appears and string length ratio
      const matchIndex = normalizedSearchText.indexOf(normalizedQuery);
      const lengthRatio = normalizedQuery.length / normalizedSearchText.length;
      const score = 200 - matchIndex + lengthRatio * 50;
      results.push({ item, score, matchType: 'exact' });
      continue;
    }

    // Strategy 1b: Compact exact match (ignores spacing differences)
    // Helps match class suffixes like "Eks 25 01" vs "Eks2501".
    if (compactQuery.length >= 4 && compactSearchText.includes(compactQuery)) {
      const matchIndex = compactSearchText.indexOf(compactQuery);
      const lengthRatio = compactQuery.length / compactSearchText.length;
      const score = 180 - matchIndex + lengthRatio * 40;
      results.push({ item, score, matchType: 'exact' });
      continue;
    }

    // Strategy 2: Multi-word match (for queries with spaces)
    if (query.includes(' ') && multiWordMatch(query, item.searchText)) {
      const terms = normalizedQuery.split(/\s+/).filter(t => t.length > 0);
      // Score based on number of terms matched
      const score = 100 + terms.length * 10;
      results.push({ item, score, matchType: 'multiword' });
      continue;
    }

    // Strategy 3: Fuzzy match
    const windowRatio = getFuzzyWindowRatio(normalizedQuery, normalizedSearchText);
    const minWindowRatio =
      normalizedQuery.length <= 3 ? 0.8 : normalizedQuery.length <= 5 ? 0.6 : 0.5;
    const minFuzzyScore =
      normalizedQuery.length <= 3 ? 95 : normalizedQuery.length <= 5 ? 80 : 70;

    const [matched, fuzzyScore] = fuzzyMatch(query, item.searchText);
    if (matched && windowRatio >= minWindowRatio && fuzzyScore >= minFuzzyScore) {
      results.push({ item, score: fuzzyScore, matchType: 'fuzzy' });
    }
  }

  // Sort by match type priority, then by score
  results.sort((a, b) => {
    const typePriority = { exact: 3, multiword: 2, fuzzy: 1 };
    const priorityDiff = typePriority[b.matchType] - typePriority[a.matchType];
    if (priorityDiff !== 0) return priorityDiff;
    return b.score - a.score;
  });

  return results.slice(0, limit);
}
