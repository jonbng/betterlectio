import { beforeAll, describe, expect, test } from 'bun:test';
import { DOMParser as LinkedomDOMParser } from 'linkedom';
import {
  REACTION_EMOJIS,
  buildReactionBody,
  buildReactionCarrierUrl,
  decodeReactionEnvelope,
  encodeReactionEnvelope,
  makeSenderKey,
  normalizeLectioTimestamp,
  parseReactionCarrierHtml,
  parseReactionCarrierUrl,
  resolveThreadReactions,
  type ReactionEnvelopeV1,
  type ReactionMessageShape,
} from '../lib/message-reactions';
import { extractMessageEditAudit, formatEditedTime } from '../lib/message-edit-audit';

beforeAll(() => {
  globalThis.DOMParser = LinkedomDOMParser as unknown as typeof DOMParser;
});

const envelope: ReactionEnvelopeV1 = {
  v: 1,
  op: 'set',
  emoji: '❤️',
  target: {
    senderKey: 'id:U72721772844',
    sentAt: '2026-03-05T14:33:09',
    occurrence: 0,
  },
};

describe('message reaction protocol', () => {
  test('round-trips every supported emoji through UTF-8 base64url', () => {
    for (const emoji of REACTION_EMOJIS) {
      const value = { ...envelope, emoji };
      expect(decodeReactionEnvelope(encodeReactionEnvelope(value))).toEqual(value);
    }
  });

  test('uses an HTTPS download URL whose payload stays in the fragment', () => {
    const url = buildReactionCarrierUrl(envelope);
    expect(url.startsWith('https://betterlectio.dk/download#blr1.')).toBe(true);
    expect(new URL(url).search).toBe('');
    expect(parseReactionCarrierUrl(url)).toEqual(envelope);
  });

  test('rejects alternate hosts, query payloads, damaged data, and unknown emojis', () => {
    const url = buildReactionCarrierUrl(envelope);
    expect(parseReactionCarrierUrl(url.replace('betterlectio.dk', 'example.com'))).toBeNull();
    expect(parseReactionCarrierUrl(url.replace('#blr1.', '?blr1='))).toBeNull();
    expect(decodeReactionEnvelope(encodeReactionEnvelope(envelope).replace(/^./, '!'))).toBeNull();

    const invalid = JSON.stringify({ ...envelope, emoji: '🔥' });
    const encoded = btoa(unescape(encodeURIComponent(invalid)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeReactionEnvelope(encoded)).toBeNull();
  });

  test('renders the configured signature or compact marker', () => {
    expect(buildReactionBody(envelope, true)).toContain(']Sendt med BetterLectio[/url]');
    expect(buildReactionBody(envelope, false)).toContain(']#[/url]');
    const clearEnvelope: ReactionEnvelopeV1 = {
      v: 1,
      op: 'clear',
      emoji: null,
      target: envelope.target,
    };
    const clearBody = buildReactionBody(clearEnvelope, false);
    expect(clearBody).toContain('Fjernede sin reaktion');
    expect(clearBody).not.toContain('❤️');
    expect(decodeReactionEnvelope(encodeReactionEnvelope(clearEnvelope))).toEqual(clearEnvelope);
  });

  test('rejects clear payloads that retain the previous emoji', () => {
    const invalid = JSON.stringify({ ...envelope, op: 'clear' });
    const encoded = btoa(unescape(encodeURIComponent(invalid)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeReactionEnvelope(encoded)).toBeNull();
  });

  test('normalizes portable sender and timestamp locators', () => {
    expect(makeSenderKey(' U123 ', 'Ignored')).toBe('id:U123');
    expect(makeSenderKey('', '  Søren   Jensen ')).toBe('name:søren jensen');
    expect(normalizeLectioTimestamp('5-3-2026 4:07')).toBe('2026-03-05T04:07:00');
  });
});

function carrierHtml(value: ReactionEnvelopeV1, label = 'Sendt med BetterLectio'): string {
  const sentence = value.op === 'set'
    ? `Reagerede med “${value.emoji}”`
    : 'Fjernede sin reaktion';
  return `<p>${sentence}</p><p><a href="${buildReactionCarrierUrl(value)}">${label}</a></p>`;
}

function message(overrides: Partial<ReactionMessageShape> = {}): ReactionMessageShape {
  return {
    senderName: 'Target Person',
    senderContextCardId: 'U72721772844',
    timestamp: '05-03-2026 14:33:09',
    content: '<p>Original message</p>',
    attachments: [],
    isOwnMessage: false,
    editPostbackTarget: '',
    ...overrides,
  };
}

describe('message reaction resolution', () => {
  const target = envelope.target;

  test('hides a valid carrier and attaches its reaction to the target', () => {
    const carrier = message({
      senderName: 'Reactor Person',
      senderContextCardId: 'U-reactor',
      timestamp: '05-03-2026 14:34:00',
      content: carrierHtml(envelope),
    });
    const result = resolveThreadReactions([message(), carrier]);

    expect(result.hiddenCarrierCount).toBe(1);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].reactions[0]).toMatchObject({ emoji: '❤️' });
    expect(result.messages[0].reactions[0].reactors[0].name).toBe('Reactor Person');
  });

  test('ignores the Lectio audit line added when a carrier is edited', () => {
    const edited = carrierHtml(envelope)
      + '<div>Redigeret af Jonathan Arthur Hojer Bangert(k) (2x 17), d. 3/8-2026 09:54</div>';
    expect(parseReactionCarrierHtml(edited)).toEqual(envelope);
    expect(parseReactionCarrierHtml(`${edited}<div>extra text</div>`)).toBeNull();
  });

  test('keeps unresolved and malformed carriers visible', () => {
    const unresolvedEnvelope: ReactionEnvelopeV1 = {
      ...envelope,
      target: { ...target, senderKey: 'id:missing' },
    };
    const unresolved = message({
      senderContextCardId: 'U-reactor',
      content: carrierHtml(unresolvedEnvelope),
    });
    const malformed = message({
      senderContextCardId: 'U-other',
      content: carrierHtml(envelope).replace('Reagerede med', 'Påstod at reagere med'),
    });
    const result = resolveThreadReactions([message(), unresolved, malformed]);

    expect(result.hiddenCarrierCount).toBe(0);
    expect(result.messages).toHaveLength(3);
    expect(parseReactionCarrierHtml(malformed.content)).toBeNull();
  });

  test('uses the latest carrier from each actor and a clear reveals no old emoji', () => {
    const setCarrier = message({
      senderName: 'Own Person',
      senderContextCardId: 'U-own',
      timestamp: '05-03-2026 14:34:00',
      content: carrierHtml(envelope),
      isOwnMessage: true,
      editPostbackTarget: 'edit-set',
    });
    const clearEnvelope: ReactionEnvelopeV1 = {
      v: 1,
      op: 'clear',
      emoji: null,
      target,
    };
    const clearCarrier = message({
      senderName: 'Own Person',
      senderContextCardId: 'U-own',
      timestamp: '05-03-2026 14:35:00',
      content: carrierHtml(clearEnvelope),
      isOwnMessage: true,
      editPostbackTarget: 'edit-clear',
    });
    const result = resolveThreadReactions([message(), setCarrier, clearCarrier]);

    expect(result.hiddenCarrierCount).toBe(2);
    expect(result.messages[0].reactions).toEqual([]);
    expect(result.messages[0].ownEmoji).toBeNull();
    expect(result.messages[0].ownCarrier?.message.editPostbackTarget).toBe('edit-clear');
    expect(clearCarrier.content).not.toContain('❤️');
  });
});

describe('Lectio message edit audit', () => {
  test('extracts the terminal audit block and interprets it as Copenhagen time', () => {
    const result = extractMessageEditAudit(
      '<p>Hej <strong>verden</strong></p>'
      + '<div>Redigeret af Jonathan Arthur Hojer Bangert(k) (2x 17), d. 3/8-2026 09:54</div>',
    );
    expect(result.html).toBe('<p>Hej <strong>verden</strong></p>');
    expect(result.editedAt?.toISOString()).toBe('2026-08-03T07:54:00.000Z');
  });

  test('keeps malformed and non-terminal audit-like content visible', () => {
    const invalid = '<p>Hej</p><div>Redigeret af Elev, d. 31/2-2026 09:54</div>';
    expect(extractMessageEditAudit(invalid)).toEqual({ html: invalid, editedAt: null });

    const followed = '<p>Hej</p><div>Redigeret af Elev, d. 3/8-2026 09:54</div><p>Eftertekst</p>';
    expect(extractMessageEditAudit(followed)).toEqual({ html: followed, editedAt: null });
  });

  test('formats relative time through six days and switches at seven days', () => {
    const editedAt = new Date('2026-08-03T07:54:00Z');
    expect(formatEditedTime(editedAt, new Date('2026-08-03T07:54:30Z'), 'da')).toEqual({ kind: 'justNow' });
    expect(formatEditedTime(editedAt, new Date('2026-08-03T07:59:30Z'), 'da')).toEqual({
      kind: 'value',
      value: 'for 5 minutter siden',
    });
    expect(formatEditedTime(editedAt, new Date('2026-08-10T07:54:00Z'), 'en').value).not.toContain('ago');
  });
});
