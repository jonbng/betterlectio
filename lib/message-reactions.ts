import { stripTerminalMessageEditAuditText } from './message-edit-audit';

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '👎'] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];
export interface MessageLocator {
  senderKey: string;
  sentAt: string;
  occurrence: number;
}

interface ReactionEnvelopeBaseV1 {
  v: 1;
  target: MessageLocator;
}

export interface SetReactionEnvelopeV1 extends ReactionEnvelopeBaseV1 {
  op: 'set';
  emoji: ReactionEmoji;
}

export interface ClearReactionEnvelopeV1 extends ReactionEnvelopeBaseV1 {
  op: 'clear';
  emoji: null;
}

export type ReactionEnvelopeV1 = SetReactionEnvelopeV1 | ClearReactionEnvelopeV1;

export interface ReactionParticipant {
  key: string;
  name: string;
  isOwn: boolean;
}

export interface ReactionGroup {
  emoji: ReactionEmoji;
  reactors: ReactionParticipant[];
}

export interface ReactionMessageShape {
  senderName: string;
  senderContextCardId: string;
  timestamp: string;
  content: string;
  attachments: Array<unknown>;
  isOwnMessage: boolean;
  editPostbackTarget?: string;
}

export interface ParsedReactionCarrier<T extends ReactionMessageShape> {
  message: T;
  envelope: ReactionEnvelopeV1;
  actor: ReactionParticipant;
  index: number;
}

export interface ResolvedReactionMessage<T extends ReactionMessageShape> {
  message: T;
  locator: MessageLocator | null;
  locatorKey: string | null;
  reactions: ReactionGroup[];
  ownCarrier: ParsedReactionCarrier<T> | null;
  ownEmoji: ReactionEmoji | null;
}

export interface ResolvedThreadReactions<T extends ReactionMessageShape> {
  messages: ResolvedReactionMessage<T>[];
  hiddenCarrierCount: number;
}

const DOWNLOAD_URL = 'https://betterlectio.dk/download';
const FRAGMENT_PREFIX = '#blr1.';
const MAX_FRAGMENT_LENGTH = 2_048;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function isReactionEmoji(value: unknown): value is ReactionEmoji {
  return typeof value === 'string'
    && (REACTION_EMOJIS as readonly string[]).includes(value);
}

function isLocator(value: unknown): value is MessageLocator {
  if (!value || typeof value !== 'object') return false;
  const locator = value as Partial<MessageLocator>;
  return typeof locator.senderKey === 'string'
    && locator.senderKey.length > 0
    && locator.senderKey.length <= 256
    && typeof locator.sentAt === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(locator.sentAt)
    && Number.isInteger(locator.occurrence)
    && (locator.occurrence ?? -1) >= 0
    && (locator.occurrence ?? 10) < 10;
}

export function encodeReactionEnvelope(envelope: ReactionEnvelopeV1): string {
  const json = JSON.stringify({
    v: 1,
    op: envelope.op,
    emoji: envelope.emoji,
    target: {
      senderKey: envelope.target.senderKey,
      sentAt: envelope.target.sentAt,
      occurrence: envelope.target.occurrence,
    },
  });
  return bytesToBase64Url(new TextEncoder().encode(json));
}

export function decodeReactionEnvelope(encoded: string): ReactionEnvelopeV1 | null {
  const bytes = base64UrlToBytes(encoded);
  if (!bytes) return null;

  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Partial<ReactionEnvelopeV1>;
    if (value.v !== 1) return null;
    if (!isLocator(value.target)) return null;
    if (value.op === 'set' && !isReactionEmoji(value.emoji)) return null;
    if (value.op === 'clear' && value.emoji !== null) return null;
    if (value.op !== 'set' && value.op !== 'clear') return null;
    return value as ReactionEnvelopeV1;
  } catch {
    return null;
  }
}

export function buildReactionCarrierUrl(envelope: ReactionEnvelopeV1): string {
  return `${DOWNLOAD_URL}${FRAGMENT_PREFIX}${encodeReactionEnvelope(envelope)}`;
}

export function parseReactionCarrierUrl(rawUrl: string): ReactionEnvelopeV1 | null {
  if (!rawUrl || rawUrl.length > MAX_FRAGMENT_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(rawUrl, DOWNLOAD_URL);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' || url.hostname !== 'betterlectio.dk') return null;
  if (url.pathname.replace(/\/$/, '') !== '/download' || url.search) return null;
  if (!url.hash.startsWith(FRAGMENT_PREFIX)) return null;
  return decodeReactionEnvelope(url.hash.slice(FRAGMENT_PREFIX.length));
}

export function buildReactionBody(
  envelope: ReactionEnvelopeV1,
  showSignature: boolean,
): string {
  const sentence = envelope.op === 'set'
    ? `Reagerede med “${envelope.emoji}”`
    : 'Fjernede sin reaktion';
  const linkText = showSignature ? 'Sendt med BetterLectio' : '#';
  return `${sentence}\n\n[url=${buildReactionCarrierUrl(envelope)}]${linkText}[/url]`;
}

export function makeSenderKey(contextCardId: string, senderName: string): string {
  const id = contextCardId.trim();
  if (id) return `id:${id}`;
  const normalizedName = senderName
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('da-DK');
  return normalizedName ? `name:${normalizedName}` : '';
}

export function normalizeLectioTimestamp(timestamp: string): string | null {
  const match = timestamp.match(
    /(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!match) return null;
  const pad = (value: string) => value.padStart(2, '0');
  return `${match[3]}-${pad(match[2])}-${pad(match[1])}T${pad(match[4])}:${match[5]}:${match[6] || '00'}`;
}

export function messageLocatorKey(locator: MessageLocator): string {
  return `${locator.senderKey}\u001f${locator.sentAt}\u001f${locator.occurrence}`;
}

function htmlTextWithoutElement(root: HTMLElement, element: Element): string {
  const clone = root.cloneNode(true) as HTMLElement;
  const anchors = Array.from(clone.querySelectorAll('a'));
  const originalAnchors = Array.from(root.querySelectorAll('a'));
  const index = originalAnchors.indexOf(element as HTMLAnchorElement);
  if (index >= 0) anchors[index]?.remove();
  clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  return (clone.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseReactionCarrierHtml(html: string): ReactionEnvelopeV1 | null {
  if (!html || typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(`<div id="bl-reaction-root">${html}</div>`, 'text/html');
  const root = doc.getElementById('bl-reaction-root');
  if (!root) return null;

  const matches = Array.from(root.querySelectorAll('a[href]'))
    .map((anchor) => ({ anchor, envelope: parseReactionCarrierUrl(anchor.getAttribute('href') || '') }))
    .filter((entry): entry is { anchor: HTMLAnchorElement; envelope: ReactionEnvelopeV1 } => !!entry.envelope);
  if (matches.length !== 1) return null;

  const { anchor, envelope } = matches[0];
  const label = (anchor.textContent || '').replace(/\s+/g, ' ').trim();
  if (label !== 'Sendt med BetterLectio' && label !== '#') return null;

  const expected = envelope.op === 'set'
    ? `Reagerede med “${envelope.emoji}”`
    : 'Fjernede sin reaktion';
  return stripTerminalMessageEditAuditText(htmlTextWithoutElement(root, anchor)) === expected
    ? envelope
    : null;
}

function deriveLocator(
  message: ReactionMessageShape,
  occurrences: Map<string, number>,
): MessageLocator | null {
  const senderKey = makeSenderKey(message.senderContextCardId, message.senderName);
  const sentAt = normalizeLectioTimestamp(message.timestamp);
  if (!senderKey || !sentAt) return null;
  const base = `${senderKey}\u001f${sentAt}`;
  const occurrence = occurrences.get(base) ?? 0;
  occurrences.set(base, occurrence + 1);
  return { senderKey, sentAt, occurrence };
}

export function resolveThreadReactions<T extends ReactionMessageShape>(
  messages: T[],
): ResolvedThreadReactions<T> {
  const carrierCandidates = messages.map((message, index) => {
    if (message.attachments.length > 0) return null;
    const envelope = parseReactionCarrierHtml(message.content);
    if (!envelope) return null;
    const actorKey = makeSenderKey(message.senderContextCardId, message.senderName);
    if (!actorKey) return null;
    return {
      message,
      envelope,
      actor: {
        key: actorKey,
        name: message.senderName,
        isOwn: message.isOwnMessage,
      },
      index,
    } satisfies ParsedReactionCarrier<T>;
  });

  const occurrences = new Map<string, number>();
  const locators = new Map<number, MessageLocator>();
  const targetIndex = new Map<string, number>();
  messages.forEach((message, index) => {
    if (carrierCandidates[index]) return;
    const locator = deriveLocator(message, occurrences);
    if (!locator) return;
    locators.set(index, locator);
    targetIndex.set(messageLocatorKey(locator), index);
  });

  const carriersByTarget = new Map<number, Map<string, ParsedReactionCarrier<T>>>();
  const resolvedCarrierIndexes = new Set<number>();
  carrierCandidates.forEach((carrier) => {
    if (!carrier) return;
    const index = targetIndex.get(messageLocatorKey(carrier.envelope.target));
    if (index === undefined || index >= carrier.index) return;
    resolvedCarrierIndexes.add(carrier.index);
    const actors = carriersByTarget.get(index) ?? new Map<string, ParsedReactionCarrier<T>>();
    actors.set(carrier.actor.key, carrier);
    carriersByTarget.set(index, actors);
  });

  const resolvedMessages: ResolvedReactionMessage<T>[] = [];
  messages.forEach((message, index) => {
    if (resolvedCarrierIndexes.has(index)) return;
    const locator = locators.get(index) ?? null;
    const actors = carriersByTarget.get(index);
    const groups = new Map<ReactionEmoji, ReactionParticipant[]>();
    let ownCarrier: ParsedReactionCarrier<T> | null = null;
    let ownEmoji: ReactionEmoji | null = null;

    actors?.forEach((carrier) => {
      if (carrier.actor.isOwn) ownCarrier = carrier;
      if (carrier.envelope.op === 'clear') return;
      const reactors = groups.get(carrier.envelope.emoji) ?? [];
      reactors.push(carrier.actor);
      groups.set(carrier.envelope.emoji, reactors);
      if (carrier.actor.isOwn) ownEmoji = carrier.envelope.emoji;
    });

    resolvedMessages.push({
      message,
      locator,
      locatorKey: locator ? messageLocatorKey(locator) : null,
      reactions: REACTION_EMOJIS
        .filter((emoji) => groups.has(emoji))
        .map((emoji) => ({ emoji, reactors: groups.get(emoji)! })),
      ownCarrier,
      ownEmoji,
    });
  });

  return {
    messages: resolvedMessages,
    hiddenCarrierCount: resolvedCarrierIndexes.size,
  };
}
