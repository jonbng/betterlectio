import { getLocaleTag } from './i18n';
import type { LocaleCode } from './i18n';

const COPENHAGEN_TIME_ZONE = 'Europe/Copenhagen';
const AUDIT_PATTERN = /^Redigeret af (.+?),\s*d\.\s*(\d{1,2})\/(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/i;
const AUDIT_SUFFIX_PATTERN = /\s*Redigeret af .+?,\s*d\.\s*\d{1,2}\/\d{1,2}-\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?\s*$/i;

export interface ParsedMessageEditAudit {
  html: string;
  editedAt: Date | null;
}

const copenhagenPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: COPENHAGEN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function zonedParts(date: Date): Record<string, number> {
  return Object.fromEntries(
    copenhagenPartsFormatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
}

function copenhagenDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date | null {
  const target = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = target;

  // Convert Lectio's wall-clock value to an instant without depending on the
  // browser/device time zone. Iteration also accounts for Copenhagen DST.
  for (let i = 0; i < 3; i++) {
    const parts = zonedParts(new Date(instant));
    const represented = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    instant += target - represented;
  }

  const result = new Date(instant);
  const verified = zonedParts(result);
  if (
    verified.year !== year
    || verified.month !== month
    || verified.day !== day
    || verified.hour !== hour
    || verified.minute !== minute
    || verified.second !== second
  ) return null;
  return result;
}

function lastMeaningfulChild(root: HTMLElement): ChildNode | null {
  let node = root.lastChild;
  while (node && node.nodeType === 3 && !(node.textContent || '').trim()) {
    const previous = node.previousSibling;
    node.remove();
    node = previous;
  }
  return node;
}

/**
 * Removes only a complete, terminal Lectio edit audit block. Audit-like text
 * inside a user's message remains untouched.
 */
export function extractMessageEditAudit(html: string): ParsedMessageEditAudit {
  if (!html || typeof DOMParser === 'undefined') return { html, editedAt: null };
  const doc = new DOMParser().parseFromString(`<div id="bl-edit-root">${html}</div>`, 'text/html');
  const root = doc.getElementById('bl-edit-root');
  if (!root) return { html, editedAt: null };

  const candidate = lastMeaningfulChild(root);
  const text = (candidate?.textContent || '').replace(/\s+/g, ' ').trim();
  const match = text.match(AUDIT_PATTERN);
  if (!candidate || !match) return { html, editedAt: null };

  const editedAt = copenhagenDate(
    Number(match[4]),
    Number(match[3]),
    Number(match[2]),
    Number(match[5]),
    Number(match[6]),
    Number(match[7] || '0'),
  );
  if (!editedAt) return { html, editedAt: null };

  candidate.remove();
  return { html: root.innerHTML.trim(), editedAt };
}

/** Strict text-only variant used while validating reaction carrier messages. */
export function stripTerminalMessageEditAuditText(text: string): string {
  return text.replace(AUDIT_SUFFIX_PATTERN, '').trim();
}

export type EditedTimeLabel =
  | { kind: 'justNow' }
  | { kind: 'value'; value: string };

export function formatEditedTime(
  editedAt: Date,
  now: Date,
  locale: LocaleCode,
): EditedTimeLabel {
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - editedAt.getTime()) / 1_000));
  if (elapsedSeconds < 60) return { kind: 'justNow' };

  if (elapsedSeconds < 7 * 24 * 60 * 60) {
    const formatter = new Intl.RelativeTimeFormat(getLocaleTag(locale), { numeric: 'always' });
    if (elapsedSeconds < 60 * 60) {
      return { kind: 'value', value: formatter.format(-Math.floor(elapsedSeconds / 60), 'minute') };
    }
    if (elapsedSeconds < 24 * 60 * 60) {
      return { kind: 'value', value: formatter.format(-Math.floor(elapsedSeconds / 3_600), 'hour') };
    }
    return { kind: 'value', value: formatter.format(-Math.floor(elapsedSeconds / 86_400), 'day') };
  }

  return {
    kind: 'value',
    value: new Intl.DateTimeFormat(getLocaleTag(locale), {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: COPENHAGEN_TIME_ZONE,
    }).format(editedAt),
  };
}
