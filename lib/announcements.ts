import { getExtensionBrowser } from '@/lib/extension-health';
import { getLocale } from '@/lib/i18n';
import { safeGetManifest } from '@/lib/safe-runtime';
import { sendRpc } from '@/lib/supabase/client';

export type AnnouncementEvent = 'seen' | 'dismissed' | 'clicked';
export type RichTextMark = { type: 'bold' | 'italic' | 'link'; attrs?: { href?: string } };
export type RichTextNode = {
  type: 'doc' | 'paragraph' | 'bulletList' | 'orderedList' | 'listItem' | 'text' | 'hardBreak';
  text?: string; marks?: RichTextMark[]; content?: RichTextNode[];
};
export type ExtensionAnnouncement = {
  id: string; claimToken: string;
  kind: 'feature' | 'tip' | 'news' | 'maintenance' | 'survey' | 'important';
  presentation: 'card' | 'modal';
  design: 'standard' | 'editorial' | 'compact' | 'professional';
  theme: 'brand' | 'blue' | 'violet' | 'amber' | 'neutral';
  eyebrow: string | null; title: string; body: RichTextNode;
  coverUrl: string | null; coverAlt: string | null;
  authorName: string | null; authorRole: string | null; authorAvatarUrl: string | null;
  ctaKind: 'none' | 'url' | 'event'; ctaTarget: string | null; ctaLabel: string | null;
  avoidQuietHours: boolean; avoidClassTime: boolean;
};

const EMPTY_TTL = 15 * 60_000;
const PENDING_KEY = 'bl-announcement-pending-events-v1';
type Pending = { announcementId: string; claimToken: string; event: AnnouncementEvent };

function isAnnouncement(value: unknown): value is ExtensionAnnouncement {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ExtensionAnnouncement>;
  return typeof item.id === 'string' && typeof item.claimToken === 'string' && typeof item.title === 'string'
    && !!item.body && typeof item.body === 'object' && (item.presentation === 'card' || item.presentation === 'modal');
}
function checkKey(studentId: string, page: string) {
  return `bl-announcement-empty-v1:${studentId}:${getExtensionBrowser()}:${safeGetManifest()?.version ?? '0.0.0'}:${page}`;
}
export function shouldCheckAnnouncements(studentId: string, page: string, now = Date.now()) {
  try { const raw = sessionStorage.getItem(checkKey(studentId, page)); return !raw || now - Number(raw) >= EMPTY_TTL; }
  catch { return true; }
}
export async function claimNextAnnouncement(studentId: string, page: string, contextId: string) {
  if (!shouldCheckAnnouncements(studentId, page)) return null;
  const response = await sendRpc('claim_next_announcement', {
    p_browser: getExtensionBrowser(), p_extension_version: safeGetManifest()?.version ?? '0.0.0',
    p_locale: getLocale(), p_page: page, p_context_id: contextId,
  });
  if (!response.ok) throw new Error(response.error ?? 'Announcement check failed');
  if (!isAnnouncement(response.data)) {
    try { sessionStorage.setItem(checkKey(studentId, page), String(Date.now())); } catch {}
    return null;
  }
  return response.data;
}
function readPending(): Pending[] {
  try { const value = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]'); return Array.isArray(value) ? value.slice(-20) : []; }
  catch { return []; }
}
function writePending(items: Pending[]) { try { localStorage.setItem(PENDING_KEY, JSON.stringify(items.slice(-20))); } catch {} }
async function sendEvent(item: Pending) {
  const response = await sendRpc('record_announcement_event', {
    p_announcement_id: item.announcementId, p_claim_token: item.claimToken, p_event: item.event,
  });
  return response.ok && response.data === true;
}
export async function recordAnnouncementEvent(item: Pick<ExtensionAnnouncement, 'id' | 'claimToken'>, event: AnnouncementEvent) {
  const pending = { announcementId: item.id, claimToken: item.claimToken, event };
  try { if (await sendEvent(pending)) return; } catch {}
  const items = readPending().filter((other) => !(other.announcementId === pending.announcementId && other.event === event));
  items.push(pending); writePending(items);
}
export async function flushPendingAnnouncementEvents() {
  const remaining: Pending[] = [];
  for (const item of readPending()) { try { if (!(await sendEvent(item))) remaining.push(item); } catch { remaining.push(item); } }
  writePending(remaining);
}
export function safeAnnouncementUrl(raw: string | null) {
  if (!raw) return null;
  try { const url = new URL(raw); return url.protocol === 'https:' ? url.toString() : null; } catch { return null; }
}
