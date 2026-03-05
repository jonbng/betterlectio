// ── Types ──────────────────────────────────────────────────────────────

export interface PersonRef {
  name: string;
  fullName: string;
  type: 'student' | 'teacher' | 'hold' | 'unknown';
}

export interface BeskedThread {
  threadId: string;
  subject: string;
  hasAttachment: boolean;
  isFlagged: boolean;
  isRead: boolean;
  isUnread: boolean;
  latestSender: PersonRef;
  firstSender: PersonRef;
  recipients: PersonRef;
  dateText: string;
  date: Date | null;
  ctlIndex: string;
}

export interface BeskedFolder {
  id: string;
  name: string;
  iconUrl: string;
  isSelected: boolean;
  isExpandable: boolean;
  children: BeskedFolder[];
  /** Postback command argument to select this folder */
  commandArgument: string;
}

export interface BeskederToolbar {
  newMessagePostback: string;
  markAllReadPostback: string;
  showDeletedPostback: string;
  bulkActions: Array<{ value: string; label: string }>;
  bulkActionPostback: string;
  searchText: string;
  searchPostback: string;
}

export interface BeskederPageData {
  folders: BeskedFolder[];
  threads: BeskedThread[];
  toolbar: BeskederToolbar;
  currentFolderName: string;
  currentFolderIcon: string;
  formTokens: Record<string, string>;
  formAction: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

function parsePersonType(className: string): PersonRef['type'] {
  if (className.includes('prepend-fonticon-student')) return 'student';
  if (className.includes('prepend-fonticon-teacher')) return 'teacher';
  if (className.includes('prepend-fonticon-hold')) return 'hold';
  return 'unknown';
}

function parsePersonRef(el: Element | null): PersonRef {
  if (!el) return { name: '', fullName: '', type: 'unknown' };
  const span = el.querySelector('span[class*="prepend-fonticon"]') || el;
  const text = (span.textContent || '').trim();
  const fullName =
    span.getAttribute('title') ||
    el.getAttribute('title') ||
    el.querySelector('[title]')?.getAttribute('title') ||
    text;

  return {
    name: text,
    fullName,
    type: parsePersonType(span.className || ''),
  };
}

const THREAD_ID_RE = /(?:FLAGMESSAGE|VIEWTHREAD|HIDEMESSAGE|UNREADMESSAGE|READMESSAGE|\$LB2\$_MC_\$_)(\d+)/;

function extractThreadId(row: Element): string {
  // Try images first (flag, read, delete icons have onclick)
  const imgs = row.querySelectorAll('img[onclick]');
  for (const img of imgs) {
    const onclick = img.getAttribute('onclick') || '';
    const match = onclick.match(THREAD_ID_RE);
    if (match) return match[1];
  }
  // Try anchors
  const anchors = row.querySelectorAll('a[onclick]');
  for (const a of anchors) {
    const onclick = a.getAttribute('onclick') || '';
    const match = onclick.match(THREAD_ID_RE);
    if (match) return match[1];
  }
  // Try mobile divs
  const divs = row.querySelectorAll('div[onclick]');
  for (const div of divs) {
    const onclick = div.getAttribute('onclick') || '';
    const match = onclick.match(THREAD_ID_RE);
    if (match) return match[1];
  }
  return '';
}

function extractCtlIndex(row: Element): string {
  const el = row.querySelector('[id*="_threadGV_ctl"]');
  if (el) {
    const match = el.id.match(/threadGV_(ctl\d+)/);
    if (match) return match[1];
  }
  return '';
}

/**
 * Parse Lectio date text into a Date.
 * Formats: "HH:mm" (today), "da HH:mm" (this week), "dd/MM-yyyy" (older)
 */
function parseDateText(text: string): Date | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const now = new Date();

  // "HH:mm" — today
  const timeOnly = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (timeOnly) {
    const d = new Date(now);
    d.setHours(parseInt(timeOnly[1], 10), parseInt(timeOnly[2], 10), 0, 0);
    return d;
  }

  // "da HH:mm" — weekday abbreviation + time
  const dayTime = trimmed.match(/^([a-zæøå]+)\s+(\d{1,2}):(\d{2})$/i);
  if (dayTime) {
    const dayAbbrevs: Record<string, number> = {
      'sø': 0, 'ma': 1, 'ti': 2, 'on': 3, 'to': 4, 'fr': 5, 'lø': 6,
    };
    const dayNum = dayAbbrevs[dayTime[1].toLowerCase()];
    if (dayNum !== undefined) {
      const d = new Date(now);
      const currentDay = d.getDay();
      let diff = currentDay - dayNum;
      if (diff < 0) diff += 7;
      d.setDate(d.getDate() - diff);
      d.setHours(parseInt(dayTime[2], 10), parseInt(dayTime[3], 10), 0, 0);
      return d;
    }
  }

  // "dd/MM-yyyy"
  const fullDate = trimmed.match(/^(\d{1,2})\/(\d{2})-(\d{4})$/);
  if (fullDate) {
    return new Date(
      parseInt(fullDate[3], 10),
      parseInt(fullDate[2], 10) - 1,
      parseInt(fullDate[1], 10),
    );
  }

  return null;
}

// ── Folder Parser ──────────────────────────────────────────────────────

function parseFolderNode(node: Element): BeskedFolder | null {
  const nodeId = node.getAttribute('lec-node-id');
  if (!nodeId) return null;

  const container = node.querySelector(':scope > .TreeNode-container');
  if (!container) return null;

  const anchor = container.querySelector('.TreeNode');
  const titleEl = container.querySelector('.TreeNode-title');
  const iconEl = container.querySelector('.TreeNode-icon') as HTMLImageElement | null;

  const isSelected = anchor?.classList.contains('selectedFolder') ?? false;
  const name = titleEl?.textContent?.trim() || '';
  const iconUrl = iconEl?.src || '';

  // Check for sublists (Hold, Grupper)
  const sublist = node.querySelector(':scope > [lec-role="ltv-sublist"]');
  const isExpandable = !!sublist;
  const children: BeskedFolder[] = [];

  if (sublist) {
    const childNodes = sublist.querySelectorAll(':scope > [lec-role="treeviewnodecontainer"]');
    for (const child of childNodes) {
      const childFolder = parseFolderNode(child);
      if (childFolder) children.push(childFolder);
    }
  }

  return {
    id: nodeId,
    name,
    iconUrl,
    isSelected,
    isExpandable,
    children,
    commandArgument: nodeId,
  };
}

export function parseFoldersFromDOM(): BeskedFolder[] {
  const tree = document.getElementById('s_m_Content_Content_ListGridSelectionTree');
  if (!tree) return [];

  const folders: BeskedFolder[] = [];
  const topNodes = tree.querySelectorAll(':scope > [lec-role="treeviewnodecontainer"]');
  for (const node of topNodes) {
    const folder = parseFolderNode(node);
    if (folder) folders.push(folder);
  }

  return folders;
}

// ── Thread Parser ──────────────────────────────────────────────────────

export function parseThreadsFromDOM(): BeskedThread[] {
  const table = document.getElementById('s_m_Content_Content_threadGV_ctl00') as HTMLTableElement | null;
  if (!table) return [];

  const rows = table.querySelectorAll('tr');
  const threads: BeskedThread[] = [];

  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 9) continue; // Skip header row (has <th>)

    const threadId = extractThreadId(row);
    if (!threadId) continue;

    const ctlIndex = extractCtlIndex(row);

    // Cell 1: Flag
    const flagImg = cells[1]?.querySelector('img') as HTMLImageElement | null;
    const isFlagged = flagImg?.src?.includes('flagon') ?? false;

    // Cell 2: Read/unread
    const readImg = cells[2]?.querySelector('img') as HTMLImageElement | null;
    const isReadByImg = readImg?.src?.includes('mread') ?? true;
    const isUnread = row.classList.contains('unread') || (readImg?.src?.includes('munread') ?? false);
    const isRead = !isUnread && isReadByImg;

    // Cell 3: Subject + attachment
    const subjectLink = cells[3]?.querySelector('a');
    const subject = (subjectLink?.textContent || '').trim();
    const hasAttachment = !!cells[3]?.querySelector('.prepend-fonticon-dokumenter');

    // Cell 4: Latest sender
    const latestSender = parsePersonRef(cells[4]);

    // Cell 5: First sender
    const firstSender = parsePersonRef(cells[5]);

    // Cell 6: Recipients
    const recipients = parsePersonRef(cells[6]);

    // Cell 7: Date
    const dateText = (cells[7]?.textContent || '').trim();
    const date = parseDateText(dateText);

    threads.push({
      threadId,
      subject,
      hasAttachment,
      isFlagged,
      isRead,
      isUnread,
      latestSender,
      firstSender,
      recipients,
      dateText,
      date,
      ctlIndex,
    });
  }

  return threads;
}

// ── Toolbar Parser ─────────────────────────────────────────────────────

export function parseToolbarFromDOM(): BeskederToolbar {
  const newMessagePostback = document.getElementById('s_m_Content_Content_NewMessageLnk')
    ? 's$m$Content$Content$NewMessageLnk'
    : '';

  const markAllReadPostback = 's$m$Content$Content$MarkReadButton';
  const showDeletedPostback = 's$m$Content$Content$ctl02';

  const bulkSelect = document.getElementById('s_m_Content_Content_MarkChkDD') as HTMLSelectElement | null;
  const bulkActions: Array<{ value: string; label: string }> = [];
  if (bulkSelect) {
    for (const option of bulkSelect.options) {
      if (option.value !== '-1') {
        bulkActions.push({ value: option.value, label: option.textContent || '' });
      }
    }
  }

  const searchInput = document.getElementById('s_m_Content_Content_SPSearchText_tb') as HTMLInputElement | null;

  return {
    newMessagePostback,
    markAllReadPostback,
    showDeletedPostback,
    bulkActions,
    bulkActionPostback: 's$m$Content$Content$MarkChkDD',
    searchText: searchInput?.value || '',
    searchPostback: 's$m$Content$Content$SPSearchBtn',
  };
}

// ── Form Tokens ────────────────────────────────────────────────────────

export function parseFormTokens(): { tokens: Record<string, string>; action: string } {
  const form = document.getElementById('aspnetForm') as HTMLFormElement | null;
  const actionRaw = form?.getAttribute('action') || '';
  const action = actionRaw
    ? new URL(actionRaw, window.location.href).href
    : window.location.href;

  const tokens: Record<string, string> = {};
  if (form) {
    form.querySelectorAll<HTMLInputElement>('input[type="hidden"][name]').forEach((input) => {
      const name = input.name?.trim();
      if (!name) return;
      tokens[name] = input.value ?? '';
    });
  }

  return { tokens, action };
}

// ── Current Folder Info ────────────────────────────────────────────────

function parseCurrentFolder(): { name: string; iconUrl: string } {
  const label = document.getElementById('s_m_Content_Content_MessageFolderLabel');
  const icon = document.getElementById('s_m_Content_Content_FolderIcon') as HTMLImageElement | null;
  return {
    name: label?.textContent?.trim() || 'Beskeder',
    iconUrl: icon?.src || '',
  };
}

// ── Main Parser ────────────────────────────────────────────────────────

export function parseBeskederFromDOM(): BeskederPageData {
  const folders = parseFoldersFromDOM();
  const threads = parseThreadsFromDOM();
  const toolbar = parseToolbarFromDOM();
  const { name: currentFolderName, iconUrl: currentFolderIcon } = parseCurrentFolder();
  const { tokens: formTokens, action: formAction } = parseFormTokens();

  return {
    folders,
    threads,
    toolbar,
    currentFolderName,
    currentFolderIcon,
    formTokens,
    formAction,
  };
}

// ── Postback Helpers ───────────────────────────────────────────────────

/** Trigger a Lectio __doPostBack from our component. */
export function doPostBack(eventTarget: string, eventArgument: string): void {
  const form = document.getElementById('aspnetForm') as HTMLFormElement | null;
  if (!form) return;

  const targetInput = form.querySelector<HTMLInputElement>('[name="__EVENTTARGET"]');
  const argInput = form.querySelector<HTMLInputElement>('[name="__EVENTARGUMENT"]');

  if (targetInput) targetInput.value = eventTarget;
  if (argInput) argInput.value = eventArgument;

  form.submit();
}

/** Open a message thread. */
export function openThread(threadId: string): void {
  doPostBack('__Page', `$LB2$_MC_$_${threadId}`);
}

/** Toggle flag on a thread. */
export function toggleFlag(threadId: string): void {
  doPostBack('__Page', `FLAGMESSAGE_${threadId}`);
}

/** Toggle read/unread on a thread. */
export function toggleRead(threadId: string, currentlyRead: boolean): void {
  doPostBack('__Page', currentlyRead ? `UNREADMESSAGE_${threadId}` : `READMESSAGE_${threadId}`);
}

/** Delete/restore a thread. */
export function deleteThread(threadId: string): void {
  doPostBack('__Page', `HIDEMESSAGE_${threadId}`);
}

/** Select a folder. */
export function selectFolder(commandArgument: string): void {
  doPostBack('s$m$Content$Content$ListGridSelectionTree', commandArgument);
}

/** Create a new message. */
export function newMessage(): void {
  doPostBack('s$m$Content$Content$NewMessageLnk', '');
}

/** Mark all messages as read. */
export function markAllRead(): void {
  doPostBack('s$m$Content$Content$MarkReadButton', '');
}

/** Execute a bulk action on checked messages. */
export function executeBulkAction(value: string): void {
  const select = document.getElementById('s_m_Content_Content_MarkChkDD') as HTMLSelectElement | null;
  if (select) select.value = value;
  doPostBack('s$m$Content$Content$MarkChkDD', '');
}

/** Toggle checkbox for a thread in the original DOM. */
export function toggleThreadCheckbox(ctlIndex: string, checked: boolean): void {
  const cb = document.getElementById(
    `s_m_Content_Content_threadGV_${ctlIndex}_threadCB`,
  ) as HTMLInputElement | null;
  if (cb) cb.checked = checked;
}

/** Execute search. */
export function executeSearch(query: string): void {
  const input = document.getElementById('s_m_Content_Content_SPSearchText_tb') as HTMLInputElement | null;
  if (input) input.value = query;
  doPostBack('s$m$Content$Content$SPSearchBtn', '');
}
