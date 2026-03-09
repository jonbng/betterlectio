// ── No-reload message submission layer ──────────────────────────────────
//
// All message actions use hidden iframe POSTs instead of native doPostBack
// to avoid full page reloads. ASP.NET ViewState is stateful: each response
// contains new tokens, so operations are serialized via a mutex.

import { postFormViaHiddenIframe, parseFormTokensFromDoc, isSessionExpired } from './iframe-post';
import {
  parseFoldersFromDOM,
  parseThreadsFromDOM,
  parseToolbarFromDOM,
  type BeskedThread,
  type BeskedFolder,
  type BeskederToolbar,
} from './beskeder-parser';
import type {
  ThreadMessage,
  ThreadRecipient,
  ComposeRecipient,
} from './beskeder-thread-parser';

// ── Types ──────────────────────────────────────────────────────────────

export interface FormState {
  tokens: Record<string, string>;
  action: string;
}

export interface AttachedFile {
  name: string;
  /** Postback target + argument for DEL, e.g. "s$m$...AttachmentsGV" and "DEL$0" */
  deleteTarget: string;
  deleteArgument: string;
}

export type SubmitError =
  | { kind: 'session_expired' }
  | { kind: 'parse_failure'; message: string }
  | { kind: 'timeout' }
  | { kind: 'viewstate_mismatch' }
  | { kind: 'unknown'; message: string };

export type SubmitResult<T> =
  | { success: true; formState: FormState; data: T }
  | { success: false; error: SubmitError };

// ── Mutex ──────────────────────────────────────────────────────────────
// ASP.NET ViewState is sequential — each POST returns new tokens that
// must be used for the next request. This mutex serializes operations.

let mutexPromise: Promise<void> = Promise.resolve();

function withMutex<T>(fn: () => Promise<T>): Promise<T> {
  const prev = mutexPromise;
  let resolve: () => void;
  mutexPromise = new Promise<void>((r) => { resolve = r; });
  return prev.then(fn).finally(() => resolve!());
}

// ── Helpers ────────────────────────────────────────────────────────────

function buildFields(
  formState: FormState,
  overrides: Record<string, string>,
): Record<string, string> {
  return { ...formState.tokens, ...overrides };
}

function handleError(err: unknown): SubmitResult<never> {
  if (err instanceof Error) {
    if (err.message === 'Submission timeout') {
      return { success: false, error: { kind: 'timeout' } };
    }
  }
  const msg = err instanceof Error ? err.message : String(err);
  return { success: false, error: { kind: 'unknown', message: msg } };
}

function parseNewFormState(doc: Document): FormState | null {
  const { tokens, action } = parseFormTokensFromDoc(doc);
  if (!('__VIEWSTATE' in tokens) && !('__VIEWSTATEX' in tokens)) return null;
  return { tokens, action };
}

function checkSessionAndParse(doc: Document): { expired: boolean; formState: FormState | null } {
  if (isSessionExpired(doc)) {
    return { expired: true, formState: null };
  }
  return { expired: false, formState: parseNewFormState(doc) };
}

// ── Thread List Operations ─────────────────────────────────────────────

export function toggleFlagViaIframe(
  formState: FormState,
  threadId: string,
  currentlyFlagged: boolean,
): Promise<SubmitResult<{ isFlagged: boolean }>> {
  return withMutex(async () => {
    try {
      const command = currentlyFlagged ? `UNFLAGMESSAGE_${threadId}` : `FLAGMESSAGE_${threadId}`;
      const fields = buildFields(formState, {
        __EVENTTARGET: '__Page',
        __EVENTARGUMENT: command,
      });

      const doc = await postFormViaHiddenIframe(formState.action, fields);
      const { expired, formState: newState } = checkSessionAndParse(doc);
      if (expired) return { success: false, error: { kind: 'session_expired' } };
      if (!newState) return { success: false, error: { kind: 'parse_failure', message: 'No tokens in response' } };

      // Determine new flag state from response
      const threads = parseThreadsFromDOM(doc);
      const thread = threads.find(t => t.threadId === threadId);
      const isFlagged = thread?.isFlagged ?? !currentlyFlagged;

      return { success: true, formState: newState, data: { isFlagged } };
    } catch (err) {
      return handleError(err);
    }
  });
}

export function toggleReadViaIframe(
  formState: FormState,
  threadId: string,
  currentlyRead: boolean,
): Promise<SubmitResult<{ isRead: boolean }>> {
  return withMutex(async () => {
    try {
      const command = currentlyRead ? `UNREADMESSAGE_${threadId}` : `READMESSAGE_${threadId}`;
      const fields = buildFields(formState, {
        __EVENTTARGET: '__Page',
        __EVENTARGUMENT: command,
      });

      const doc = await postFormViaHiddenIframe(formState.action, fields);
      const { expired, formState: newState } = checkSessionAndParse(doc);
      if (expired) return { success: false, error: { kind: 'session_expired' } };
      if (!newState) return { success: false, error: { kind: 'parse_failure', message: 'No tokens in response' } };

      return { success: true, formState: newState, data: { isRead: !currentlyRead } };
    } catch (err) {
      return handleError(err);
    }
  });
}

export function deleteThreadViaIframe(
  formState: FormState,
  threadId: string,
): Promise<SubmitResult<void>> {
  return withMutex(async () => {
    try {
      const fields = buildFields(formState, {
        __EVENTTARGET: '__Page',
        __EVENTARGUMENT: `HIDEMESSAGE_${threadId}`,
      });

      const doc = await postFormViaHiddenIframe(formState.action, fields);
      const { expired, formState: newState } = checkSessionAndParse(doc);
      if (expired) return { success: false, error: { kind: 'session_expired' } };
      if (!newState) return { success: false, error: { kind: 'parse_failure', message: 'No tokens in response' } };

      return { success: true, formState: newState, data: undefined };
    } catch (err) {
      return handleError(err);
    }
  });
}

export function selectFolderViaIframe(
  formState: FormState,
  commandArgument: string,
): Promise<SubmitResult<{
  threads: BeskedThread[];
  folders: BeskedFolder[];
  toolbar: BeskederToolbar;
  currentFolderName: string;
  currentFolderIcon: string;
}>> {
  return withMutex(async () => {
    try {
      const fields = buildFields(formState, {
        __EVENTTARGET: 's$m$Content$Content$ListGridSelectionTree',
        __EVENTARGUMENT: commandArgument,
      });

      const doc = await postFormViaHiddenIframe(formState.action, fields);
      const { expired, formState: newState } = checkSessionAndParse(doc);
      if (expired) return { success: false, error: { kind: 'session_expired' } };
      if (!newState) return { success: false, error: { kind: 'parse_failure', message: 'No tokens in response' } };

      const threads = parseThreadsFromDOM(doc);
      const folders = parseFoldersFromDOM(doc);
      const toolbar = parseToolbarFromDOM(doc);

      const label = doc.getElementById('s_m_Content_Content_MessageFolderLabel');
      const icon = doc.getElementById('s_m_Content_Content_FolderIcon') as HTMLImageElement | null;
      const currentFolderName = label?.textContent?.trim() || 'Beskeder';
      const currentFolderIcon = icon?.src || '';

      return {
        success: true,
        formState: newState,
        data: { threads, folders, toolbar, currentFolderName, currentFolderIcon },
      };
    } catch (err) {
      return handleError(err);
    }
  });
}

export function executeSearchViaIframe(
  formState: FormState,
  query: string,
): Promise<SubmitResult<{
  threads: BeskedThread[];
  toolbar: BeskederToolbar;
}>> {
  return withMutex(async () => {
    try {
      const fields = buildFields(formState, {
        __EVENTTARGET: 's$m$Content$Content$SPSearchBtn',
        __EVENTARGUMENT: '',
        's$m$Content$Content$SPSearchText$tb': query,
      });

      const doc = await postFormViaHiddenIframe(formState.action, fields);
      const { expired, formState: newState } = checkSessionAndParse(doc);
      if (expired) return { success: false, error: { kind: 'session_expired' } };
      if (!newState) return { success: false, error: { kind: 'parse_failure', message: 'No tokens in response' } };

      const threads = parseThreadsFromDOM(doc);
      const toolbar = parseToolbarFromDOM(doc);

      return { success: true, formState: newState, data: { threads, toolbar } };
    } catch (err) {
      return handleError(err);
    }
  });
}

export function executeBulkActionViaIframe(
  formState: FormState,
  value: string,
): Promise<SubmitResult<{
  threads: BeskedThread[];
}>> {
  return withMutex(async () => {
    try {
      const fields = buildFields(formState, {
        __EVENTTARGET: 's$m$Content$Content$MarkChkDD',
        __EVENTARGUMENT: '',
        's$m$Content$Content$MarkChkDD': value,
      });

      const doc = await postFormViaHiddenIframe(formState.action, fields);
      const { expired, formState: newState } = checkSessionAndParse(doc);
      if (expired) return { success: false, error: { kind: 'session_expired' } };
      if (!newState) return { success: false, error: { kind: 'parse_failure', message: 'No tokens in response' } };

      const threads = parseThreadsFromDOM(doc);

      return { success: true, formState: newState, data: { threads } };
    } catch (err) {
      return handleError(err);
    }
  });
}

export function markAllReadViaIframe(
  formState: FormState,
): Promise<SubmitResult<{
  threads: BeskedThread[];
}>> {
  return withMutex(async () => {
    try {
      const fields = buildFields(formState, {
        __EVENTTARGET: 's$m$Content$Content$MarkReadButton',
        __EVENTARGUMENT: '',
      });

      const doc = await postFormViaHiddenIframe(formState.action, fields);
      const { expired, formState: newState } = checkSessionAndParse(doc);
      if (expired) return { success: false, error: { kind: 'session_expired' } };
      if (!newState) return { success: false, error: { kind: 'parse_failure', message: 'No tokens in response' } };

      const threads = parseThreadsFromDOM(doc);

      return { success: true, formState: newState, data: { threads } };
    } catch (err) {
      return handleError(err);
    }
  });
}

export function refreshThreadListViaIframe(
  formState: FormState,
): Promise<SubmitResult<{
  threads: BeskedThread[];
  folders: BeskedFolder[];
  toolbar: BeskederToolbar;
  currentFolderName: string;
  currentFolderIcon: string;
}>> {
  return withMutex(async () => {
    try {
      // Send a no-op post to refresh server state while preserving current folder/search context.
      const doc = await postFormViaHiddenIframe(formState.action, buildFields(formState, {}));
      const { expired, formState: newState } = checkSessionAndParse(doc);
      if (expired) return { success: false, error: { kind: 'session_expired' } };
      if (!newState) return { success: false, error: { kind: 'parse_failure', message: 'No tokens in response' } };

      const threads = parseThreadsFromDOM(doc);
      const folders = parseFoldersFromDOM(doc);
      const toolbar = parseToolbarFromDOM(doc);

      const label = doc.getElementById('s_m_Content_Content_MessageFolderLabel');
      const icon = doc.getElementById('s_m_Content_Content_FolderIcon') as HTMLImageElement | null;
      const currentFolderName = label?.textContent?.trim() || 'Beskeder';
      const currentFolderIcon = icon?.src || '';

      return {
        success: true,
        formState: newState,
        data: { threads, folders, toolbar, currentFolderName, currentFolderIcon },
      };
    } catch (err) {
      return handleError(err);
    }
  });
}

// ── Thread View Operations ─────────────────────────────────────────────

const BETTERLECTIO_SIGNATURE =
  '\n\n[url=https://chromewebstore.google.com/detail/betterlectio/cbopfnaegoknpplkngoppmmomppimhkh]Sendt med BetterLectio[/url]';

/** Serializable reply form fields that may change between postbacks (ctl index shifts). */
export interface ReplyFormTargets {
  sendPostbackTarget: string;
  titleFieldName: string;
  bodyFieldName: string;
  attachPostbackTarget: string;
  attachDocIdFieldName: string;
  currentTitle: string;
}

export function sendReplyViaIframe(
  formState: FormState,
  sendPostbackTarget: string,
  titleInputName: string,
  bodyTextareaName: string,
  title: string,
  body: string,
  skipSignature: boolean,
): Promise<SubmitResult<{
  messages: ThreadMessage[];
  recipients: ThreadRecipient[];
  replyFormTargets: ReplyFormTargets | null;
}>> {
  return withMutex(async () => {
    try {
      const sig = skipSignature ? '' : BETTERLECTIO_SIGNATURE;
      const fields = buildFields(formState, {
        __EVENTTARGET: sendPostbackTarget,
        __EVENTARGUMENT: '',
        [titleInputName]: title,
        [bodyTextareaName]: body + sig,
      });

      const doc = await postFormViaHiddenIframe(formState.action, fields);
      const { expired, formState: newState } = checkSessionAndParse(doc);
      if (expired) return { success: false, error: { kind: 'session_expired' } };
      if (!newState) return { success: false, error: { kind: 'parse_failure', message: 'No tokens in response' } };

      // Parse updated thread from response
      const { parseThreadFromDOM } = await import('./beskeder-thread-parser');
      const threadData = parseThreadFromDOM(doc);

      // Extract updated reply form targets (ctl index may have shifted)
      let replyFormTargets: ReplyFormTargets | null = null;
      if (threadData.replyForm) {
        const rf = threadData.replyForm;
        const titleFN = rf.titleInputId?.replace(/_/g, '$') || '';
        const bodyFN = rf.bodyTextareaId?.replace(/_/g, '$') || '';
        const attachDocName = rf.attachDocumentIdInput?.getAttribute('name') || '';
        replyFormTargets = {
          sendPostbackTarget: rf.sendPostbackTarget,
          titleFieldName: titleFN,
          bodyFieldName: bodyFN,
          attachPostbackTarget: rf.attachPostbackTarget,
          attachDocIdFieldName: attachDocName,
          currentTitle: rf.currentTitle,
        };
      }

      return {
        success: true,
        formState: newState,
        data: {
          messages: threadData.messages,
          recipients: threadData.recipients,
          replyFormTargets,
        },
      };
    } catch (err) {
      return handleError(err);
    }
  });
}

export function refreshThreadViaIframe(
  formState: FormState,
): Promise<SubmitResult<{
  messages: ThreadMessage[];
  recipients: ThreadRecipient[];
  replyFormTargets: ReplyFormTargets | null;
}>> {
  return withMutex(async () => {
    try {
      // No-op roundtrip to fetch latest messages/replies without navigating.
      const doc = await postFormViaHiddenIframe(formState.action, buildFields(formState, {}));
      const { expired, formState: newState } = checkSessionAndParse(doc);
      if (expired) return { success: false, error: { kind: 'session_expired' } };
      if (!newState) return { success: false, error: { kind: 'parse_failure', message: 'No tokens in response' } };

      const { parseThreadFromDOM } = await import('./beskeder-thread-parser');
      const threadData = parseThreadFromDOM(doc);

      let replyFormTargets: ReplyFormTargets | null = null;
      if (threadData.replyForm) {
        const rf = threadData.replyForm;
        const titleFN = rf.titleInputId?.replace(/_/g, '$') || '';
        const bodyFN = rf.bodyTextareaId?.replace(/_/g, '$') || '';
        const attachDocName = rf.attachDocumentIdInput?.getAttribute('name') || '';
        replyFormTargets = {
          sendPostbackTarget: rf.sendPostbackTarget,
          titleFieldName: titleFN,
          bodyFieldName: bodyFN,
          attachPostbackTarget: rf.attachPostbackTarget,
          attachDocIdFieldName: attachDocName,
          currentTitle: rf.currentTitle,
        };
      }

      return {
        success: true,
        formState: newState,
        data: {
          messages: threadData.messages,
          recipients: threadData.recipients,
          replyFormTargets,
        },
      };
    } catch (err) {
      return handleError(err);
    }
  });
}

// ── Compose Operations ─────────────────────────────────────────────────

export function addRecipientViaIframe(
  formState: FormState,
  addBtnTarget: string,
  autocompleteInputName: string,
  autocompleteInputValue: string,
  autocompleteHiddenInputName?: string,
  autocompleteHiddenInputValue?: string,
): Promise<SubmitResult<{
  recipients: ComposeRecipient[];
}>> {
  return withMutex(async () => {
    try {
      const fields = buildFields(formState, {
        __EVENTTARGET: addBtnTarget,
        __EVENTARGUMENT: '',
        [autocompleteInputName]: autocompleteInputValue,
        ...(autocompleteHiddenInputName
          ? { [autocompleteHiddenInputName]: autocompleteHiddenInputValue || '' }
          : {}),
      });

      const doc = await postFormViaHiddenIframe(formState.action, fields);
      const { expired, formState: newState } = checkSessionAndParse(doc);
      if (expired) return { success: false, error: { kind: 'session_expired' } };
      if (!newState) return { success: false, error: { kind: 'parse_failure', message: 'No tokens in response' } };

      const { parseComposeFromDOM } = await import('./beskeder-thread-parser');
      const compose = parseComposeFromDOM(doc);
      const recipients = compose?.recipients ?? [];

      return { success: true, formState: newState, data: { recipients } };
    } catch (err) {
      return handleError(err);
    }
  });
}

export function removeRecipientViaIframe(
  formState: FormState,
  target: string,
  argument: string,
): Promise<SubmitResult<{
  recipients: ComposeRecipient[];
}>> {
  return withMutex(async () => {
    try {
      const fields = buildFields(formState, {
        __EVENTTARGET: target,
        __EVENTARGUMENT: argument,
      });

      const doc = await postFormViaHiddenIframe(formState.action, fields);
      const { expired, formState: newState } = checkSessionAndParse(doc);
      if (expired) return { success: false, error: { kind: 'session_expired' } };
      if (!newState) return { success: false, error: { kind: 'parse_failure', message: 'No tokens in response' } };

      const { parseComposeFromDOM } = await import('./beskeder-thread-parser');
      const compose = parseComposeFromDOM(doc);
      const recipients = compose?.recipients ?? [];

      return { success: true, formState: newState, data: { recipients } };
    } catch (err) {
      return handleError(err);
    }
  });
}

export function sendMessageViaIframe(
  formState: FormState,
  sendPostbackTarget: string,
  titleInputName: string,
  bodyTextareaName: string,
  title: string,
  body: string,
  skipSignature: boolean,
): Promise<SubmitResult<void>> {
  return withMutex(async () => {
    try {
      const sig = skipSignature ? '' : BETTERLECTIO_SIGNATURE;
      const fields = buildFields(formState, {
        __EVENTTARGET: sendPostbackTarget,
        __EVENTARGUMENT: '',
        [titleInputName]: title,
        [bodyTextareaName]: body + sig,
      });

      const doc = await postFormViaHiddenIframe(formState.action, fields);
      const { expired, formState: newState } = checkSessionAndParse(doc);
      if (expired) return { success: false, error: { kind: 'session_expired' } };
      if (!newState) return { success: false, error: { kind: 'parse_failure', message: 'No tokens in response' } };

      return { success: true, formState: newState, data: undefined };
    } catch (err) {
      return handleError(err);
    }
  });
}

// ── File Attachment (shared by compose and reply) ──────────────────────

export async function uploadFileToLectio(
  file: File,
  schoolId: string,
): Promise<string> {
  const uploadUrl = new URL(
    `/lectio/${schoolId}/dokumentupload.aspx`,
    window.location.origin,
  ).href;
  const formData = new FormData();
  formData.append('file', file);

  const resp = await fetch(uploadUrl, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!resp.ok) throw new Error('File upload failed');

  const result = await resp.text();
  let serializedId = '';
  try {
    serializedId = JSON.parse(result)?.serializedId || '';
  } catch {
    const m = result.match(/serializedId['":\s]+['"]([^'"]+)['"]/);
    serializedId = m?.[1] || '';
  }
  if (!serializedId) throw new Error('Could not parse upload response');

  return serializedId;
}

/**
 * Parse the AttachmentsGV table from a response Document to get the list
 * of currently attached files and their delete postback info.
 */
function parseAttachmentsFromDoc(doc: Document): AttachedFile[] {
  const files: AttachedFile[] = [];
  // Find all AttachmentsGV tables (there may be one per reply row)
  const tables = doc.querySelectorAll<HTMLTableElement>('table[id*="AttachmentsGV"]');
  for (const table of tables) {
    const rows = table.querySelectorAll('tr');
    for (const row of rows) {
      // Each row has: file name link + delete button
      const deleteLink = row.querySelector('a[href*="AttachmentsGV"]') as HTMLAnchorElement | null;
      if (!deleteLink) continue;

      const href = deleteLink.getAttribute('href') || '';
      // href is like: javascript:__doPostBack('s$m$...AttachmentsGV','DEL$0')
      const match = href.match(/__doPostBack\('([^']+)','([^']+)'\)/)
        || href.match(/__doPostBack\(&#39;([^&]+)&#39;,&#39;([^&]+)&#39;\)/);
      if (!match) continue;

      // File name: first <a> that's not the delete button, or first <td> text
      const nameLink = row.querySelector('a[href*="LectioFileHandler"]') as HTMLAnchorElement | null;
      const name = nameLink?.textContent?.trim()
        || row.querySelector('td')?.textContent?.trim()
        || 'Ukendt fil';

      files.push({
        name,
        deleteTarget: match[1],
        deleteArgument: match[2],
      });
    }
  }
  return files;
}

export function attachFileViaIframe(
  formState: FormState,
  serializedId: string,
  attachPostbackTarget: string,
  attachDocIdFieldName: string,
): Promise<SubmitResult<{ attachments: AttachedFile[] }>> {
  return withMutex(async () => {
    try {
      const fields = buildFields(formState, {
        __EVENTTARGET: attachPostbackTarget,
        __EVENTARGUMENT: 'documentId',
        [attachDocIdFieldName]: JSON.stringify({ serializedId }),
      });

      const doc = await postFormViaHiddenIframe(formState.action, fields);
      const { expired, formState: newState } = checkSessionAndParse(doc);
      if (expired) return { success: false, error: { kind: 'session_expired' } };
      if (!newState) return { success: false, error: { kind: 'parse_failure', message: 'No tokens in response' } };

      const attachments = parseAttachmentsFromDoc(doc);
      return { success: true, formState: newState, data: { attachments } };
    } catch (err) {
      return handleError(err);
    }
  });
}

export function removeAttachmentViaIframe(
  formState: FormState,
  deleteTarget: string,
  deleteArgument: string,
): Promise<SubmitResult<{ attachments: AttachedFile[] }>> {
  return withMutex(async () => {
    try {
      const fields = buildFields(formState, {
        __EVENTTARGET: deleteTarget,
        __EVENTARGUMENT: deleteArgument,
      });

      const doc = await postFormViaHiddenIframe(formState.action, fields);
      const { expired, formState: newState } = checkSessionAndParse(doc);
      if (expired) return { success: false, error: { kind: 'session_expired' } };
      if (!newState) return { success: false, error: { kind: 'parse_failure', message: 'No tokens in response' } };

      const attachments = parseAttachmentsFromDoc(doc);
      return { success: true, formState: newState, data: { attachments } };
    } catch (err) {
      return handleError(err);
    }
  });
}
