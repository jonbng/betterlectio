import { fetchAvanceretSkemaDropdownItems } from './findskema-cache';
import { getFindSkemaTypeKeyFromId } from './findskema-types';
import { transformYearBasedClassName, classGroupsMatch } from './class-name';

/**
 * Resolve a grade-based class name (e.g. "1x") to a Lectio klasseid
 * by searching the AvanceretSkema dropdown for a matching stamklasse.
 */
export async function resolveClassId(
  schoolId: string,
  className: string,
): Promise<string | null> {
  const items = await fetchAvanceretSkemaDropdownItems(schoolId);
  const target = className.trim();

  const classItem = items.find(([itemName, itemId]) => {
    if (!itemId.startsWith('SC')) return false;
    if (getFindSkemaTypeKeyFromId(itemId) !== 'K') return false;
    const raw = itemName.trim();
    const transformed = transformYearBasedClassName(raw);
    if (transformed) {
      return classGroupsMatch(transformed.displayName, target);
    }
    return classGroupsMatch(raw, target) || raw === target;
  });

  if (!classItem) return null;
  return classItem[1].replace(/^SC/, '');
}
