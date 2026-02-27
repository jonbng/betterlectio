export type FindSkemaTypeKey = 'S' | 'T' | 'K' | 'L' | 'R' | 'H' | 'G';

/**
 * Map Lectio entity ids from AvanceretSkema dropdown to BetterLectio type keys.
 *
 * Examples:
 * - S..., T... = students/teachers
 * - SC... = stamklasser
 * - RO... = lokaler (rooms)
 * - RE... = ressourcer
 * - HE... = hold
 * - GE... = grupper
 */
export function getFindSkemaTypeKeyFromId(id: string): FindSkemaTypeKey {
  if (!id) return 'S';
  if (id.startsWith('URL:')) return 'S';
  const prefix2 = id.substring(0, 2);

  if (prefix2 === 'SC') return 'K';
  if (prefix2 === 'RO') return 'L';
  if (prefix2 === 'RE') return 'R';
  if (prefix2 === 'HE') return 'H';
  if (prefix2 === 'GE') return 'G';

  const prefix1 = id.charAt(0);
  if (prefix1 === 'T') return 'T';
  if (prefix1 === 'K') return 'K';
  if (prefix1 === 'L') return 'L';
  if (prefix1 === 'R') return 'R';
  if (prefix1 === 'H') return 'H';
  if (prefix1 === 'G') return 'G';
  return 'S';
}
