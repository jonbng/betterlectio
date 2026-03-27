// ── Dokumenter page server-side actions ─────────────────────────────────
//
// All mutations use iframe-based navigation to stay in the browser's
// session context. The pattern:
//   1. Load the target Lectio page in a hidden iframe (GET)
//   2. Read the iframe's document to extract form tokens + field names
//   3. Modify the iframe's form fields
//   4. Submit the iframe's form (POST) from within the iframe
//
// This preserves ASP.NET's __EVENTVALIDATION, ViewState, and session
// cookies exactly as Lectio expects.

import { uploadFileToLectio } from './beskeder-submit';
import { postFormViaHiddenIframe, parseFormTokensFromDoc } from './iframe-post';

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Load a URL in a hidden iframe and wait for it to finish loading.
 * Returns the iframe's contentDocument for reading/manipulating.
 */
function loadInIframe(url: string, timeoutMs = 30_000): Promise<{ doc: Document; iframe: HTMLIFrameElement }> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.name = `bl-doc-action-${Date.now()}`;

    const timer = setTimeout(() => {
      iframe.remove();
      reject(new Error('Iframe load timeout'));
    }, timeoutMs);

    iframe.addEventListener('load', () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) throw new Error('No iframe document');
        // Skip the initial about:blank load
        if (doc.location?.href === 'about:blank') return;
        clearTimeout(timer);
        resolve({ doc, iframe });
      } catch (err) {
        clearTimeout(timer);
        iframe.remove();
        reject(err);
      }
    });

    document.body.appendChild(iframe);
    iframe.src = url;
  });
}

/**
 * Submit the form inside an iframe and wait for the response.
 * Modifies the form fields, then submits.
 */
function submitIframeForm(
  iframe: HTMLIFrameElement,
  fieldOverrides: Record<string, string>,
  timeoutMs = 30_000,
): Promise<Document> {
  return new Promise((resolve, reject) => {
    const doc = iframe.contentDocument;
    if (!doc) return reject(new Error('No iframe document'));

    const form = doc.getElementById('aspnetForm') as HTMLFormElement | null;
    if (!form) return reject(new Error('No form in iframe'));

    // Apply all field overrides — set existing inputs or create hidden ones
    for (const [name, value] of Object.entries(fieldOverrides)) {
      // Try exact name match first (hidden inputs, textareas, etc.)
      let el = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `input[name="${CSS.escape(name)}"], textarea[name="${CSS.escape(name)}"]`,
      );
      if (el) {
        el.value = value;
      } else {
        // Create a new hidden input
        const hidden = doc.createElement('input');
        hidden.type = 'hidden';
        hidden.name = name;
        hidden.value = value;
        form.appendChild(hidden);
      }
    }

    // Also sync JS .value to attribute for __EVENTTARGET/__EVENTARGUMENT
    // (these are the standard ASP.NET postback fields)
    const etEl = doc.getElementById('__EVENTTARGET') as HTMLInputElement | null;
    const eaEl = doc.getElementById('__EVENTARGUMENT') as HTMLInputElement | null;
    if (etEl && fieldOverrides['__EVENTTARGET'] != null) etEl.value = fieldOverrides['__EVENTTARGET'];
    if (eaEl && fieldOverrides['__EVENTARGUMENT'] != null) eaEl.value = fieldOverrides['__EVENTARGUMENT'];

    const timer = setTimeout(() => {
      iframe.remove();
      reject(new Error('Submit timeout'));
    }, timeoutMs);

    iframe.addEventListener('load', function onLoad() {
      iframe.removeEventListener('load', onLoad);
      try {
        const responseDoc = iframe.contentDocument;
        if (!responseDoc) throw new Error('No response document');
        clearTimeout(timer);
        resolve(responseDoc);
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });

    // Direct form submit — bypasses Lectio's __doPostBack override
    // and any window.confirm() dialogs
    form.submit();
  });
}

// ── Search ──────────────────────────────────────────────────────────────

export function triggerDocumentSearch(query: string): void {
  if (!query.trim()) return;

  const form = document.getElementById('aspnetForm') as HTMLFormElement | null;
  if (!form) return;

  // Collect hidden fields
  const tokens: Record<string, string> = {};
  form.querySelectorAll<HTMLInputElement>('input[type="hidden"][name]').forEach((el) => {
    tokens[el.name] = el.value;
  });

  tokens['__EVENTTARGET'] = 's$m$Content$Content$SearchBtn';
  tokens['__EVENTARGUMENT'] = '';
  tokens['s$m$Content$Content$SearchTb$tb'] = query;
  // Omit checkbox → search all folders

  const action = form.getAttribute('action') || window.location.pathname;
  const actionUrl = new URL(action, window.location.href).href;

  const submitForm = document.createElement('form');
  submitForm.method = 'POST';
  submitForm.action = actionUrl;
  submitForm.style.display = 'none';

  for (const [name, value] of Object.entries(tokens)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    submitForm.appendChild(input);
  }

  document.body.appendChild(submitForm);
  submitForm.submit();
}

// ── File Upload ─────────────────────────────────────────────────────────

export async function uploadDocumentToFolder(
  file: File,
  folderId: string,
  schoolId: string,
  onStatus?: (status: 'uploading' | 'saving' | 'done' | 'error') => void,
): Promise<boolean> {
  try {
    // Step 1: Upload file blob
    onStatus?.('uploading');
    const serializedId = await uploadFileToLectio(file, schoolId);

    // Step 2: Load the new-document page in a hidden iframe
    onStatus?.('saving');
    const editPageUrl = new URL(
      `/lectio/${schoolId}/dokumentrediger.aspx`,
      window.location.origin,
    );
    editPageUrl.searchParams.set('folderid', folderId);

    const { doc, iframe } = await loadInIframe(editPageUrl.href);

    // Step 3: Set the document chooser field and submit
    const responseDoc = await submitIframeForm(iframe, {
      '__EVENTTARGET': 'm$Content$docChooser',
      '__EVENTARGUMENT': 'documentId',
      'm$Content$docChooser$selectedDocumentId': JSON.stringify({ serializedId }),
      'm$Content$EditDocComments$tb': '',
    });

    // Step 4: Now save — the iframe has the updated page after chooser postback
    // We need to submit again with the save target
    await submitIframeForm(iframe, {
      '__EVENTTARGET': 'm$Content$SaveButtonsRow$svbtn',
      '__EVENTARGUMENT': '',
    });

    iframe.remove();
    onStatus?.('done');
    return true;
  } catch (err) {
    console.error('[BetterLectio] Document upload failed:', err);
    onStatus?.('error');
    return false;
  }
}

// ── Folder Creation ─────────────────────────────────────────────────────

export async function createDocumentFolder(
  folderName: string,
  parentFolderId: string,
  schoolId: string,
  comment?: string,
): Promise<boolean> {
  try {
    const folderUrl = new URL(
      `/lectio/${schoolId}/DokumentFolderRediger.aspx`,
      window.location.origin,
    );
    folderUrl.searchParams.set('parentfolderid', parentFolderId);

    const { doc, iframe } = await loadInIframe(folderUrl.href);

    // Find the name text input field name
    const nameInput = doc.querySelector<HTMLInputElement>(
      'input[type="text"][name*="Content"]',
    );
    const nameFieldName = nameInput?.name ?? 'm$Content$FolderNameTB$tb';

    const fields: Record<string, string> = {
      [nameFieldName]: folderName,
      '__EVENTTARGET': 'm$Content$SaveButtonsRow$svbtn',
      '__EVENTARGUMENT': '',
    };

    // Set comment if a textarea exists
    const commentTextarea = doc.querySelector<HTMLTextAreaElement>(
      'textarea[name*="Content"]',
    );
    if (commentTextarea) {
      fields[commentTextarea.name] = comment ?? '';
    }

    await submitIframeForm(iframe, fields);
    iframe.remove();
    return true;
  } catch (err) {
    console.error('[BetterLectio] Folder creation failed:', err);
    return false;
  }
}

// ── Folder Detail (for edit modal) ──────────────────────────────────────

export interface FolderDetail {
  name: string;
  comment: string;
  isPublic: boolean;
  folderId: string;
  nameFieldName: string;
  commentFieldName: string;
  publicFieldName: string;
  deleteTarget: string;
  _iframe: HTMLIFrameElement;
}

export async function fetchFolderDetail(
  folderId: string,
  schoolId: string,
): Promise<FolderDetail | null> {
  try {
    const url = new URL(
      `/lectio/${schoolId}/DokumentFolderRediger.aspx`,
      window.location.origin,
    );
    url.searchParams.set('folderid', folderId);

    const { doc, iframe } = await loadInIframe(url.href);

    const nameInput = doc.querySelector<HTMLInputElement>(
      '#m_Content_EditFolderName_tb',
    );
    const name = nameInput?.value ?? '';
    const nameFieldName = nameInput?.name ?? 'm$Content$EditFolderName$tb';

    const commentEl = doc.querySelector<HTMLTextAreaElement>(
      '#m_Content_EditFolderComments',
    );
    const comment = commentEl?.value ?? commentEl?.textContent?.trim() ?? '';
    const commentFieldName = commentEl?.name ?? 'm$Content$EditFolderComments';

    const publicCheckbox = doc.querySelector<HTMLInputElement>(
      '#m_Content_EditFolderIsPublic',
    );
    const isPublic = publicCheckbox?.checked ?? false;
    const publicFieldName = publicCheckbox?.name ?? 'm$Content$EditFolderIsPublic';

    // Find delete button target
    const deleteBtn = doc.querySelector<HTMLAnchorElement>(
      '#m_Content_EditFolderDeleteButton',
    );
    let deleteTarget = 'm$Content$EditFolderDeleteButton';
    if (deleteBtn) {
      const onclick = deleteBtn.getAttribute('onclick') ?? '';
      const match = onclick.match(/__doPostBack\('([^']+)'/);
      if (match) deleteTarget = match[1];
    }

    return {
      name,
      comment,
      isPublic,
      folderId,
      nameFieldName,
      commentFieldName,
      publicFieldName,
      deleteTarget,
      _iframe: iframe,
    };
  } catch (err) {
    console.error('[BetterLectio] Failed to fetch folder detail:', err);
    return null;
  }
}

export async function saveFolderEdits(
  detail: FolderDetail,
  newName: string,
  newComment: string,
  newIsPublic: boolean,
): Promise<boolean> {
  try {
    // Set the checkbox directly in the iframe DOM (can't do via submitIframeForm value)
    const doc = detail._iframe.contentDocument;
    if (doc) {
      const cb = doc.querySelector<HTMLInputElement>(`[name="${CSS.escape(detail.publicFieldName)}"]`);
      if (cb) cb.checked = newIsPublic;
    }

    const fields: Record<string, string> = {
      [detail.nameFieldName]: newName,
      [detail.commentFieldName]: newComment,
      '__EVENTTARGET': 'm$Content$SaveButtonsRow$svbtn',
      '__EVENTARGUMENT': '',
    };

    await submitIframeForm(detail._iframe, fields);
    detail._iframe.remove();
    return true;
  } catch (err) {
    console.error('[BetterLectio] Failed to save folder edits:', err);
    return false;
  }
}

export async function deleteFolder(detail: FolderDetail): Promise<boolean> {
  try {
    await submitIframeForm(detail._iframe, {
      '__EVENTTARGET': detail.deleteTarget,
      '__EVENTARGUMENT': '',
    });
    detail._iframe.remove();
    return true;
  } catch (err) {
    console.error('[BetterLectio] Failed to delete folder:', err);
    return false;
  }
}

// ── Document Detail (for edit modal) ────────────────────────────────────

export interface DocAffiliation {
  name: string;
  canEdit: boolean;
  folder: string;
  /** Row index for DEL$ postback, e.g. 0, 1, 2 */
  rowIndex: number;
}

export interface DocumentDetail {
  id: string;
  name: string;
  size: string;
  createdBy: string;
  changedBy: string;
  comment: string;
  isPublic: boolean;
  editUrl: string;
  commentFieldName: string;
  publicFieldName: string;
  affiliations: DocAffiliation[];
  /** The hidden iframe holding the live edit page — kept alive for saving */
  _iframe: HTMLIFrameElement;
}

export async function fetchDocumentDetail(
  editUrl: string,
): Promise<DocumentDetail | null> {
  try {
    const { doc, iframe } = await loadInIframe(editUrl);

    const nameEl = doc.querySelector('#m_Content_GetDocumentlink');
    const name = nameEl?.textContent?.trim() ?? '';

    let size = '';
    let createdBy = '';
    let changedBy = '';
    for (const row of doc.querySelectorAll('.ls-std-table-inputlist tr')) {
      const th = row.querySelector('th')?.textContent?.trim() ?? '';
      const td = row.querySelector('td')?.textContent?.trim() ?? '';
      if (th.includes('Størrelse')) size = td;
      if (th.includes('Oprettet')) createdBy = td;
      if (th.includes('Ændret')) changedBy = td;
    }

    const commentField = doc.querySelector<HTMLTextAreaElement>(
      'textarea[name*="EditDocComments"]',
    );
    const comment = commentField?.value ?? commentField?.textContent?.trim() ?? '';
    const commentFieldName = commentField?.name ?? 'm$Content$EditDocComments$tb';

    const publicCheckbox = doc.querySelector<HTMLInputElement>(
      'input[name*="EditDocIsPublic"]',
    );
    const isPublic = publicCheckbox?.checked ?? false;
    const publicFieldName = publicCheckbox?.name ?? 'm$Content$EditDocIsPublic';

    // Parse affiliations from AffiliationsGV table
    const affiliations: DocAffiliation[] = [];
    const affRows = doc.querySelectorAll('#m_Content_AffiliationsGV tr');
    for (let i = 1; i < affRows.length; i++) { // skip header row
      const row = affRows[i];
      const cells = row.querySelectorAll('td');
      if (cells.length < 3) continue;

      const affName = cells[0]?.textContent?.trim() ?? '';
      const canEditCheckbox = cells[1]?.querySelector<HTMLInputElement>('input[type="checkbox"]');
      const canEdit = canEditCheckbox?.checked ?? false;
      const folderLabel = cells[2]?.querySelector('span[id*="FolderBox_ctl02"]')?.textContent?.trim() ?? '\\';

      affiliations.push({
        name: affName,
        canEdit,
        folder: folderLabel,
        rowIndex: i - 1,
      });
    }

    const idMatch = editUrl.match(/dokumentid=(\d+)/i);

    return {
      id: idMatch?.[1] ?? '',
      name,
      size,
      createdBy,
      changedBy,
      comment,
      isPublic,
      editUrl,
      commentFieldName,
      publicFieldName,
      affiliations,
      _iframe: iframe,
    };
  } catch (err) {
    console.error('[BetterLectio] Failed to fetch document detail:', err);
    return null;
  }
}

// ── Remove Affiliation ──────────────────────────────────────────────────

/**
 * Remove an affiliation row from the document. After removal, the iframe
 * reloads with the updated page — call fetchDocumentDetail again to
 * get fresh affiliations.
 */
export async function removeAffiliation(
  detail: DocumentDetail,
  rowIndex: number,
): Promise<boolean> {
  try {
    await submitIframeForm(detail._iframe, {
      '__EVENTTARGET': 'm$Content$AffiliationsGV',
      '__EVENTARGUMENT': `DEL$${rowIndex}`,
    });
    return true;
  } catch (err) {
    console.error('[BetterLectio] Failed to remove affiliation:', err);
    return false;
  }
}

// ── Add Affiliation ─────────────────────────────────────────────────────

/**
 * Add an affiliation by setting the search input value and triggering
 * the "Tilføj" button postback inside the iframe.
 */
export async function addAffiliation(
  detail: DocumentDetail,
  entityId: string,
): Promise<boolean> {
  try {
    await submitIframeForm(detail._iframe, {
      'm$Content$EditDocRelatedAddDD$inpid': entityId,
      '__EVENTTARGET': 'm$Content$EditDocRelatedAddButton',
      '__EVENTARGUMENT': '',
    });
    return true;
  } catch (err) {
    console.error('[BetterLectio] Failed to add affiliation:', err);
    return false;
  }
}

// ── Save Document Edits ─────────────────────────────────────────────────

export async function saveDocumentEdits(
  detail: DocumentDetail,
  newComment: string,
  newIsPublic: boolean,
): Promise<boolean> {
  try {
    const doc = detail._iframe.contentDocument;
    if (!doc) throw new Error('Iframe lost');

    // Set comment
    const commentEl = doc.querySelector<HTMLTextAreaElement>(
      `[name="${CSS.escape(detail.commentFieldName)}"]`,
    );
    if (commentEl) commentEl.value = newComment;

    // Set public checkbox
    const publicEl = doc.querySelector<HTMLInputElement>(
      `[name="${CSS.escape(detail.publicFieldName)}"]`,
    );
    if (publicEl) publicEl.checked = newIsPublic;

    // Submit save
    await submitIframeForm(detail._iframe, {
      '__EVENTTARGET': 'm$Content$SaveButtonsRow$svbtn',
      '__EVENTARGUMENT': '',
      [detail.commentFieldName]: newComment,
    });

    detail._iframe.remove();
    return true;
  } catch (err) {
    console.error('[BetterLectio] Failed to save document edits:', err);
    return false;
  }
}

// ── Delete Document ─────────────────────────────────────────────────────

/**
 * Delete a document via the Slet button on dokumentrediger.aspx.
 * Only works for documents you own (the button won't exist otherwise).
 *
 * The Slet button uses: __doPostBack('m$Content$SaveButtonsRow$db','Delete')
 */
export async function deleteDocument(editUrl: string): Promise<boolean> {
  try {
    const { doc, iframe } = await loadInIframe(editUrl);

    // Find the delete (Slet) button — its ID is m_Content_SaveButtonsRow_db
    const deleteBtn = doc.querySelector<HTMLAnchorElement>(
      '#m_Content_SaveButtonsRow_db',
    );

    // Extract the exact postback target and argument from onclick
    let target = 'm$Content$SaveButtonsRow$db';
    let arg = 'Delete';
    if (deleteBtn) {
      const onclick = deleteBtn.getAttribute('onclick') ?? '';
      const match = onclick.match(/__doPostBack\('([^']+)','([^']*)'\)/);
      if (match) {
        target = match[1];
        arg = match[2];
      }
    }

    await submitIframeForm(iframe, {
      '__EVENTTARGET': target,
      '__EVENTARGUMENT': arg,
    });

    iframe.remove();
    return true;
  } catch (err) {
    console.error('[BetterLectio] Failed to delete document:', err);
    return false;
  }
}

// ── Delete Folder ───────────────────────────────────────────────────────

export async function deleteDocumentFolder(
  folderId: string,
  schoolId: string,
): Promise<boolean> {
  try {
    const folderUrl = new URL(
      `/lectio/${schoolId}/DokumentFolderRediger.aspx`,
      window.location.origin,
    );
    folderUrl.searchParams.set('folderid', folderId);

    const { doc, iframe } = await loadInIframe(folderUrl.href);

    // Find delete button
    const deleteBtn = doc.querySelector<HTMLAnchorElement>(
      'a[id*="dbtn"]',
    );
    if (deleteBtn) {
      const onclick = deleteBtn.getAttribute('onclick') ?? '';
      const match = onclick.match(/PostBackOptions\("([^"]+)"/) ??
        onclick.match(/__doPostBack\('([^']+)'/);
      if (match) {
        await submitIframeForm(iframe, {
          '__EVENTTARGET': match[1],
          '__EVENTARGUMENT': '',
        });
        iframe.remove();
        return true;
      }
    }

    // Fallback
    await submitIframeForm(iframe, {
      '__EVENTTARGET': 'm$Content$SaveButtonsRow$dbtn',
      '__EVENTARGUMENT': '',
    });
    iframe.remove();
    return true;
  } catch (err) {
    console.error('[BetterLectio] Failed to delete folder:', err);
    return false;
  }
}
