import { sendRpc } from './supabase/client';
import type { DropdownItem } from './findskema-cache';

const ATTEMPT_KEY_PREFIX = 'bl-school-student-count-attempted:';
const CLIENT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function countStudents(items: DropdownItem[]): number {
  let n = 0;
  for (const item of items) {
    const id = item[1];
    if (typeof id !== 'string' || id.length === 0) continue;
    if (id[0] !== 'S' || id[1] === 'C') continue;
    // Lectio marks alumni / inactive entries with `i` in the flags field
    // (index 2). Without this filter we'd be counting every student who
    // ever attended the school. See `Autocomplete.ts`:
    //   isInactive: !!recordArr.flags.match(/i/)
    const flags = item[2];
    if (typeof flags === 'string' && flags.includes('i')) continue;
    n++;
  }
  return n;
}

export function maybeUpdateSchoolStudentCount(
  schoolId: string,
  items: DropdownItem[],
): void {
  const id = parseInt(schoolId, 10);
  if (!Number.isFinite(id) || id <= 0) return;

  const key = `${ATTEMPT_KEY_PREFIX}${schoolId}`;
  try {
    const last = localStorage.getItem(key);
    if (last) {
      const ts = parseInt(last, 10);
      if (Number.isFinite(ts) && Date.now() - ts < CLIENT_COOLDOWN_MS) return;
    }
  } catch {
    return;
  }

  const count = countStudents(items);
  if (count < 1 || count > 50000) return;

  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // localStorage write failure shouldn't block the RPC call
  }

  void sendRpc('update_school_student_count', {
    p_school_id: id,
    p_count: count,
  }).catch(() => {});
}
