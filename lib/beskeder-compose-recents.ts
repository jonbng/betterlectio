const STORAGE_KEY_PREFIX = 'bl-beskeder-recent-recipients';
const MAX_RECENT_RECIPIENTS = 8;

export interface RecentRecipient {
  id: string;
  name: string;
  type: string;
  timestamp: number;
}

function storageKey(schoolId: string): string {
  return `${STORAGE_KEY_PREFIX}:${schoolId}`;
}

export function getRecentRecipients(schoolId: string): RecentRecipient[] {
  if (!schoolId) return [];
  try {
    const raw = localStorage.getItem(storageKey(schoolId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is RecentRecipient =>
      !!entry && typeof entry.id === 'string' && typeof entry.name === 'string',
    );
  } catch {
    return [];
  }
}

export function addRecentRecipient(
  schoolId: string,
  option: { id: string; name: string; type: string },
): void {
  if (!schoolId || !option?.id || !option?.name) return;
  try {
    const next: RecentRecipient[] = [
      { id: option.id, name: option.name, type: option.type, timestamp: Date.now() },
      ...getRecentRecipients(schoolId).filter((r) => r.id !== option.id),
    ].slice(0, MAX_RECENT_RECIPIENTS);
    localStorage.setItem(storageKey(schoolId), JSON.stringify(next));
  } catch {
    // Ignore
  }
}
