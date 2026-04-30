import { sendRpc } from '../client';

const TOUCHED_KEY_PREFIX = 'bl-last-seen-touched:';

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function maybeTouchLastSeen(
  studentId: string,
  schoolId: string | number,
): Promise<void> {
  if (!studentId) return;
  const schoolIdNum =
    typeof schoolId === 'number' ? schoolId : parseInt(schoolId, 10);
  if (!Number.isFinite(schoolIdNum) || schoolIdNum <= 0) return;

  const storageKey = `${TOUCHED_KEY_PREFIX}${schoolIdNum}:${studentId}`;
  const today = todayKey();

  try {
    const last = localStorage.getItem(storageKey);
    if (last === today) return;
  } catch {
    return;
  }

  try {
    const resp = await sendRpc('touch_student_last_seen', {
      p_student_id: studentId,
      p_school_id: schoolIdNum,
    });
    if (!resp.ok) return;
    try {
      localStorage.setItem(storageKey, today);
    } catch {
      // localStorage write failure is non-fatal
    }
  } catch {
    // Heartbeat must never break page rendering
  }
}
