import { parseFormTokens, doPostBack } from './beskeder-parser';
import { getCachedProfile } from './profile-cache';

// ── Types ──────────────────────────────────────────────────────────────

export interface ThreadRecipient {
  name: string;
  contextCardId: string; // e.g. 'U72721772844'
}

export interface ThreadMessage {
  senderName: string;
  senderContextCardId: string;
  timestamp: string;
  date: Date | null;
  title: string;
  content: string; // HTML content (BBCode already rendered by Lectio)
  attachments: Array<{ name: string; url: string }>;
  isOwnMessage: boolean;
}

export interface ThreadReplyForm {
  titleInputId: string;
  bodyTextareaId: string;
  sendPostbackTarget: string;
  cancelPostbackTarget: string;
  currentTitle: string;
  /** Hidden input that holds the uploaded file's serializedId JSON */
  attachDocumentIdInput: HTMLInputElement | null;
  /** Postback target for the attachment chooser (e.g. "s$m$...AttachmentDocChooser") */
  attachPostbackTarget: string;
  notifyDropdownEl: HTMLSelectElement | null;
}

export interface BeskederThreadData {
  recipients: ThreadRecipient[];
  messages: ThreadMessage[];
  replyForm: ThreadReplyForm | null;
  formTokens: Record<string, string>;
  formAction: string;
  threadSubject: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

function parseDateTimestamp(text: string): Date | null {
  // Format: "DD-MM-YYYY HH:MM:SS"
  const match = text.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;

  return new Date(
    parseInt(match[3], 10),
    parseInt(match[2], 10) - 1,
    parseInt(match[1], 10),
    parseInt(match[4], 10),
    parseInt(match[5], 10),
    parseInt(match[6], 10),
  );
}

function getLoggedInContextCardId(): string {
  // From the page header: <div ... data-lectioContextCard="S72721772841">
  // But messages use U-prefixed IDs (U72721772844)
  // We match by name instead
  return '';
}

function isOwnMessage(senderName: string): boolean {
  const profile = getCachedProfile();
  if (!profile) return false;

  // profile.fullName is like "Jonathan Arthur Hojer Bangert"
  // senderName is like "Jonathan Arthur Hojer Bangert(k) (1x 17)"
  // Check if the sender name starts with the profile name
  const profileName = profile.fullName || profile.name;
  if (!profileName) return false;

  return senderName.startsWith(profileName);
}

// ── Parsers ────────────────────────────────────────────────────────────

function parseRecipients(doc: Document = document): ThreadRecipient[] {
  const container = doc.getElementById(
    's_m_Content_Content_MessageThreadCtrl_RecipientsReadMode',
  );
  if (!container) return [];

  const recipients: ThreadRecipient[] = [];
  const spans = container.querySelectorAll('span[data-lectioContextCard]');

  for (const span of spans) {
    const contextCardId = span.getAttribute('data-lectioContextCard') || '';
    const name = (span.textContent || '').trim();
    if (name) {
      recipients.push({ name, contextCardId });
    }
  }

  return recipients;
}

function parseMessages(doc: Document = document): ThreadMessage[] {
  const table = doc.getElementById(
    's_m_Content_Content_MessageThreadCtrl_MessagesGV',
  ) as HTMLTableElement | null;
  if (!table) return [];

  const messages: ThreadMessage[] = [];
  const rows = table.querySelectorAll('tr');

  for (const row of rows) {
    const gridRowMessage = row.querySelector('#GridRowMessage, [id="GridRowMessage"]');
    if (!gridRowMessage) continue;

    // Skip the reply form row (class="noprint")
    const classAttr = gridRowMessage.getAttribute('class') || '';
    if (classAttr.includes('noprint')) continue;

    // Sender
    const senderEl = gridRowMessage.querySelector('.message-thread-message-sender');
    if (!senderEl) continue;

    const senderSpan = senderEl.querySelector('span[data-lectioContextCard]');
    const senderContextCardId = senderSpan?.getAttribute('data-lectioContextCard') || '';
    const senderText = (senderEl.textContent || '').trim();

    // Parse "Name, DD-MM-YYYY HH:MM:SS"
    const senderParts = senderText.split(',');
    const timestampRaw = senderParts.length > 1 ? senderParts.slice(-1)[0].trim() : '';
    const senderName = senderSpan?.textContent?.trim() || senderParts[0].trim();
    const date = parseDateTimestamp(timestampRaw);

    // Title
    const headerEl = gridRowMessage.querySelector('.message-thread-message-header');
    const title = (headerEl?.textContent || '').trim();

    // Content
    const contentEl = gridRowMessage.querySelector('.message-thread-message-content');
    const content = contentEl?.innerHTML?.trim() || '';

    // Attachments
    const attachments: Array<{ name: string; url: string }> = [];
    const attachContainer = gridRowMessage.querySelector('.message-buttons-options-container');
    if (attachContainer) {
      const links = attachContainer.querySelectorAll('a[href]');
      for (const link of links) {
        const href = link.getAttribute('href');
        const name = (link.textContent || '').trim();
        if (href && name && !href.startsWith('#') && !href.startsWith('javascript:')) {
          const absoluteUrl = new URL(href, window.location.origin).href;
          attachments.push({ name, url: absoluteUrl });
        }
      }
    }

    messages.push({
      senderName,
      senderContextCardId,
      timestamp: timestampRaw,
      date,
      title,
      content,
      attachments,
      isOwnMessage: isOwnMessage(senderName),
    });
  }

  return messages;
}

function parseReplyForm(doc: Document = document): ThreadReplyForm | null {
  const table = doc.getElementById(
    's_m_Content_Content_MessageThreadCtrl_MessagesGV',
  ) as HTMLTableElement | null;
  if (!table) return null;

  // Find the reply row (GridRowMessage with class noprint)
  const rows = table.querySelectorAll('tr');
  for (const row of rows) {
    const gridRow = row.querySelector('#GridRowMessage, [id="GridRowMessage"]');
    if (!gridRow) continue;

    const classAttr = gridRow.getAttribute('class') || '';
    if (!classAttr.includes('noprint')) continue;

    // Title input
    const titleInput = gridRow.querySelector(
      'input[id*="EditModeHeaderTitleTB_tb"]',
    ) as HTMLInputElement | null;

    // Body textarea
    const bodyTextarea = gridRow.querySelector(
      'textarea[id*="EditModeContentBBTB_TbxNAME_tb"]',
    ) as HTMLTextAreaElement | null;

    // Send button: find the <a> inside .buttonfilled that has SendMessageBtn
    const sendBtn = gridRow.querySelector(
      'a[id*="SendMessageBtn"]',
    ) as HTMLAnchorElement | null;
    const sendOnclick = sendBtn?.getAttribute('onclick') || '';
    const sendMatch = sendOnclick.match(/__doPostBack\('([^']+)'/);

    // Cancel button
    const cancelBtn = gridRow.querySelector(
      'a[id*="BackMessageBtn"]',
    ) as HTMLAnchorElement | null;
    const cancelOnclick = cancelBtn?.getAttribute('onclick') || '';
    const cancelMatch = cancelOnclick.match(/__doPostBack\('([^']+)'/);

    // Attachment: hidden input for selectedDocumentId + postback target
    const attachDocIdInput = gridRow.querySelector(
      'input[id*="AttachmentDocChooser_selectedDocumentId"]',
    ) as HTMLInputElement | null;

    // Extract postback target from the chooser button's onclick or the panel's script
    let attachPostbackTarget = '';
    const chooserBtn = gridRow.querySelector(
      'a[id*="AttachmentDocChooser_choosedocBtn"]',
    ) as HTMLAnchorElement | null;
    if (chooserBtn) {
      // The postback target is the panel ID with dots: "s$m$...AttachmentDocChooser"
      // Derive from the hidden input's name (which uses $ separators)
      const hiddenName = attachDocIdInput?.getAttribute('name') || '';
      // name is like "s$m$...$AttachmentDocChooser$selectedDocumentId" — strip last segment
      attachPostbackTarget = hiddenName.replace(/\$selectedDocumentId$/, '');
    }

    // Notify options dropdown (e.g. "Notificer kun ...", "Notificer alle")
    const notifyDropdown = gridRow.querySelector(
      'select[id*="NotifyOptionsDD"]',
    ) as HTMLSelectElement | null;

    if (!titleInput || !bodyTextarea || !sendMatch) return null;

    return {
      titleInputId: titleInput.id,
      bodyTextareaId: bodyTextarea.id,
      sendPostbackTarget: sendMatch[1],
      cancelPostbackTarget: cancelMatch ? cancelMatch[1] : '',
      currentTitle: titleInput.value || '',
      attachDocumentIdInput: attachDocIdInput,
      attachPostbackTarget,
      notifyDropdownEl: notifyDropdown,
    };
  }

  return null;
}

function parseThreadSubject(messages: ThreadMessage[]): string {
  // The thread subject is the first message's title (without "Re: " prefix)
  if (messages.length === 0) return 'Besked';
  const first = messages[0].title;
  return first.replace(/^Re:\s*/i, '').trim() || 'Besked';
}

// ── Main Parser ────────────────────────────────────────────────────────

export function parseThreadFromDOM(doc: Document = document): BeskederThreadData {
  const recipients = parseRecipients(doc);
  const messages = parseMessages(doc);
  const replyForm = parseReplyForm(doc);
  const { tokens: formTokens, action: formAction } = parseFormTokens(doc);
  const threadSubject = parseThreadSubject(messages);

  return {
    recipients,
    messages,
    replyForm,
    formTokens,
    formAction,
    threadSubject,
  };
}

// ── State Detection ────────────────────────────────────────────────────

export function isThreadViewState(doc: Document = document): boolean {
  const threadHeader = doc.getElementById(
    's_m_Content_Content_MessageThreadCtrl_messageThreadHeaderDiv',
  );
  if (!threadHeader) return false;

  // Must have RecipientsReadMode (thread view has read-only recipients)
  const readMode = doc.getElementById(
    's_m_Content_Content_MessageThreadCtrl_RecipientsReadMode',
  );
  return !!readMode;
}

export function isComposeState(doc: Document = document): boolean {
  const threadHeader = doc.getElementById(
    's_m_Content_Content_MessageThreadCtrl_messageThreadHeaderDiv',
  );
  if (!threadHeader) return false;

  // Compose has the recipient edit mode input
  const addRecipientInput = doc.getElementById(
    's_m_Content_Content_MessageThreadCtrl_addRecipientDD_inp',
  );
  // And no RecipientsReadMode
  const readMode = doc.getElementById(
    's_m_Content_Content_MessageThreadCtrl_RecipientsReadMode',
  );
  return !!addRecipientInput && !readMode;
}

// ── Compose Types ─────────────────────────────────────────────────────

export interface ComposeRecipient {
  name: string;
  removePostbackTarget: string;
}

export interface ComposeFormData {
  recipients: ComposeRecipient[];
  autocompleteContainerEl: HTMLElement;
  noReplyCheckbox: HTMLInputElement | null;
  nativeTitleInput: HTMLInputElement;
  nativeBodyTextarea: HTMLTextAreaElement;
  sendPostbackTarget: string;
  cancelPostbackTarget: string;
  attachPanelEl: HTMLElement | null;
  currentTitle: string;
  currentBody: string;
}

// ── Compose Parser ────────────────────────────────────────────────────

export function parseComposeFromDOM(doc: Document = document): ComposeFormData | null {
  // Autocomplete container (the searchbox with input + hidden AddRecipientBtn)
  const autocompleteContainer = doc.querySelector(
    '#s_m_Content_Content_MessageThreadCtrl_RecipientsEditMode .ls-searchbox-container-outlined',
  ) as HTMLElement | null;
  if (!autocompleteContainer) return null;

  // Title input
  const titleInput = doc.querySelector(
    'input[id*="EditModeHeaderTitleTB_tb"]',
  ) as HTMLInputElement | null;

  // Body textarea
  const bodyTextarea = doc.querySelector(
    'textarea[id*="EditModeContentBBTB_TbxNAME_tb"]',
  ) as HTMLTextAreaElement | null;

  if (!titleInput || !bodyTextarea) return null;

  // Send button postback target
  const sendBtn = doc.querySelector(
    'a[id*="SendMessageBtn"]',
  ) as HTMLAnchorElement | null;
  const sendOnclick = sendBtn?.getAttribute('onclick') || '';
  const sendMatch = sendOnclick.match(/__doPostBack\('([^']+)'/);
  if (!sendMatch) return null;

  // Cancel button postback target
  const cancelBtn = doc.querySelector(
    'a[id*="BackMessageBtn"]',
  ) as HTMLAnchorElement | null;
  const cancelOnclick = cancelBtn?.getAttribute('onclick') || '';
  const cancelMatch = cancelOnclick.match(/__doPostBack\('([^']+)'/);

  // Recipients from ThreadRecipientsGV
  // Each row: <td>Name</td><td><a href="javascript:__doPostBack('...GV','DEL$0')">...</a></td>
  const recipients: ComposeRecipient[] = [];
  const recipientTable = doc.getElementById(
    's_m_Content_Content_MessageThreadCtrl_ThreadRecipientsGV',
  ) as HTMLTableElement | null;
  if (recipientTable) {
    const rows = recipientTable.querySelectorAll('tr');
    for (const row of rows) {
      // Skip "no records" rows
      if (row.querySelector('.noRecord')) continue;

      const nameCell = row.querySelector('td:first-child');
      if (!nameCell) continue;
      const name = (nameCell.textContent || '').trim();
      if (!name) continue;

      // Remove link uses href="javascript:__doPostBack(...)", not onclick
      const removeLink = row.querySelector('a[href*="__doPostBack"]') as HTMLAnchorElement | null;
      const removeHref = removeLink?.getAttribute('href') || '';
      const removeMatch = removeHref.match(/__doPostBack\(&#39;([^&]+)&#39;,&#39;([^&]+)&#39;\)/)
        || removeHref.match(/__doPostBack\('([^']+)','([^']+)'\)/);

      if (removeMatch) {
        // postback target = first arg, argument = second (e.g. 'DEL$0')
        recipients.push({
          name,
          removePostbackTarget: `${removeMatch[1]}:${removeMatch[2]}`,
        });
      } else {
        // Fallback: no remove button found, still show the recipient
        recipients.push({ name, removePostbackTarget: '' });
      }
    }
  }

  // "Skal ikke kunne besvares" checkbox
  const noReplyCheckbox = doc.getElementById(
    's_m_Content_Content_MessageThreadCtrl_RepliesNotAllowedChkBox',
  ) as HTMLInputElement | null;

  // Attachment panel
  const attachPanel = doc.querySelector(
    '[id*="AttachmentDocChooser_panel"]',
  ) as HTMLElement | null;

  return {
    recipients,
    autocompleteContainerEl: autocompleteContainer,
    noReplyCheckbox,
    nativeTitleInput: titleInput,
    nativeBodyTextarea: bodyTextarea,
    sendPostbackTarget: sendMatch[1],
    cancelPostbackTarget: cancelMatch ? cancelMatch[1] : '',
    attachPanelEl: attachPanel,
    currentTitle: titleInput.value || '',
    currentBody: bodyTextarea.value || '',
  };
}

// ── Actions ────────────────────────────────────────────────────────────

const BETTERLECTIO_SIGNATURE =
  '\n\n[url=https://chromewebstore.google.com/detail/betterlectio/cbopfnaegoknpplkngoppmmomppimhkh]Sendt med BetterLectio[/url]';

/**
 * Returns true when the signature should be skipped — i.e. the only recipient
 * is a single teacher (context card ID starts with "T").
 */
export function shouldSkipSignature(doc: Document = document): boolean {
  // Thread view (read-only recipients)
  const readMode = doc.getElementById(
    's_m_Content_Content_MessageThreadCtrl_RecipientsReadMode',
  );
  if (readMode) {
    const spans = readMode.querySelectorAll('span[data-lectioContextCard]');
    return spans.length === 1 && (spans[0].getAttribute('data-lectioContextCard') || '').startsWith('T');
  }

  // Compose view (editable recipients table)
  const table = doc.getElementById(
    's_m_Content_Content_MessageThreadCtrl_ThreadRecipientsGV',
  ) as HTMLTableElement | null;
  if (table && !table.querySelector('.noRecord')) {
    const cards = table.querySelectorAll('[data-lectioContextCard]');
    if (cards.length === 1 && (cards[0].getAttribute('data-lectioContextCard') || '').startsWith('T')) {
      return true;
    }
    // Fallback: if no context cards in table, count rows
    if (cards.length === 0) {
      const rows = table.querySelectorAll('tr');
      // Single recipient row — check if name looks like a teacher (has abbreviation pattern)
      // Can't reliably detect teacher without context card, so don't skip
      return false;
    }
  }

  return false;
}

export function sendReply(replyForm: ThreadReplyForm, title: string, body: string): void {
  const titleInput = document.getElementById(replyForm.titleInputId) as HTMLInputElement | null;
  const bodyTextarea = document.getElementById(replyForm.bodyTextareaId) as HTMLTextAreaElement | null;

  if (!titleInput || !bodyTextarea) return;

  titleInput.value = title;
  const sig = shouldSkipSignature() ? '' : BETTERLECTIO_SIGNATURE;
  bodyTextarea.value = body + sig;

  doPostBack(replyForm.sendPostbackTarget, '');
}

export function cancelReply(replyForm: ThreadReplyForm): void {
  if (!replyForm.cancelPostbackTarget) return;
  doPostBack(replyForm.cancelPostbackTarget, '');
}

// ── Signature Stripping ────────────────────────────────────────────────

export function stripSignatures(html: string): string {
  let result = html;

  // Strip BetterLectio signatures (rendered BBCode)
  result = result.replace(
    /<a[^>]*href=["']https?:\/\/chromewebstore\.google\.com\/detail\/betterlectio\/[^"']*["'][^>]*>Sendt med BetterLectio<\/a>/gi,
    '',
  );

  // Strip plain text BetterLectio signature
  result = result.replace(/\[url=[^\]]*chromewebstore\.google\.com\/detail\/betterlectio\/[^\]]*\]Sendt med BetterLectio\[\/url\]/gi, '');
  result = result.replace(/\[Sent med BetterLectio\]\([^)]*\)/gi, '');

  // Strip Lectio+ signatures
  result = result.replace(
    /<a[^>]*href=["']https?:\/\/lectio\.plus\/[^"']*["'][^>]*>Sendt fra Lectio\+<\/a>/gi,
    '',
  );
  result = result.replace(/&lt;a href=["']?https?:\/\/lectio\.plus\/[^"']*?["']?[^&]*&gt;Sendt fra Lectio\+&lt;\/a&gt;/gi, '');
  result = result.replace(/Sendt fra Lectio\+/g, '');

  // Strip plain text BetterLectio fallbacks
  result = result.replace(/&lt;a href=["']?https?:\/\/[^"']*?jonathanb\.dk[^"']*?["']?[^&]*&gt;Sendt fra BetterLectio&lt;\/a&gt;/gi, '');
  result = result.replace(/\[Sent med BetterLectio\]\([^)]*\)/gi, '');

  // Clean up trailing whitespace/newlines left by stripping
  result = result.replace(/(\s*<br\s*\/?\s*>\s*)+$/i, '');
  result = result.replace(/\s+$/, '');

  return result;
}
