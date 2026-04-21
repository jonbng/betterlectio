/**
 * Shared helpers for Beskeder (message) components.
 * Extracted to avoid duplication between BeskederPage and BeskederThreadView.
 */

import { formatMonth, formatWeekdayCapitalized, t } from '@/lib/i18n';

/** Generate a deterministic hue from a name string. */
export function nameToHue(name: string): number {
  const clean = name.replace(/\s*\([^)]*\)/g, '').trim();
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = clean.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

/** Generate initials from a name, stripping parenthetical suffixes. */
export function getInitials(name: string): string {
  const clean = name.replace(/\s*\([^)]*\)/g, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Format a date relative to "now" for the thread list.
 * Today → "14:30", yesterday → "I går 14:30", this week → "Tirsdag 14:30", older → "5. jan"
 */
export function formatRelativeDate(dateText: string, date: Date | null): string {
  if (!date) return dateText;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

  const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  if (diffDays === 0) return timeStr;
  if (diffDays === 1) return `${t('dates.yesterdayCapitalized')} ${timeStr}`;
  if (diffDays > 1 && diffDays < 7) {
    return `${formatWeekdayCapitalized(date)} ${timeStr}`;
  }
  return `${date.getDate()}. ${formatMonth(date, 'short')} ${date.getFullYear() !== now.getFullYear() ? date.getFullYear() : ''}`.trim();
}

/**
 * Format a message date for the thread view.
 * Today → "I dag 14:30", yesterday → "I går 14:30", older → "5. jan 14:30"
 */
export function formatMessageDate(date: Date | null, timestamp: string): string {
  if (!date) return timestamp;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24),
  );

  const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  if (diffDays === 0) return `${t('dates.todayCapitalized')} ${timeStr}`;
  if (diffDays === 1) return `${t('dates.yesterdayCapitalized')} ${timeStr}`;
  return `${date.getDate()}. ${formatMonth(date, 'short')} ${date.getFullYear() !== now.getFullYear() ? date.getFullYear() + ' ' : ''}${timeStr}`;
}
