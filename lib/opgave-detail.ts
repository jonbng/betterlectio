import { postFormViaHiddenIframe } from './iframe-post';
import { captureException } from './posthog';

// ── Types ──────────────────────────────────────────────────────────────

export interface GroupMember {
  name: string;
  contextCardId: string; // e.g. "S72721772775"
  removePostbackTarget: string | null; // __EVENTTARGET for removing this member
  removePostbackArgument: string | null; // __EVENTARGUMENT for removing this member (e.g. "DEL$1")
}

export interface AvailableGroupStudent {
  name: string;
  value: string; // the <option> value for the dropdown
}

export interface OpgaveDetail {
  sourceUrl: string;
  title: string;
  hold: string;
  gradeScale: string;
  responsible: string;
  studentTime: string;
  deadline: string;
  inUVBeskrivelse: string;
  note: string | null;
  descriptionFiles: { name: string; url: string }[];
  students: {
    name: string;
    contextCardId: string;
    awaiting: string;
    statusText: string;
    isCompleted: boolean;
    grade: string;
    gradeNote: string;
    studentNote: string;
  }[];
  entries: {
    timestamp: string;
    user: string;
    userContextCardId: string;
    isTeacher: boolean;
    isReturn: boolean;
    comment: string;
    documentName: string;
    documentUrl: string;
  }[];
  hasSubmissionForm: boolean;
  hasGroupForm: boolean;
  groupMembers: GroupMember[];
  availableGroupStudents: AvailableGroupStudent[];
  formTokens: {
    action: string;
    viewStateX: string;
    viewState: string;
    viewStateEncrypted: string;
    eventValidation: string;
    hiddenFields: Record<string, string>;
  };
}

export type SubmissionStatus = 'uploading' | 'sending' | 'verifying';

/** Lectio renders empty grade cells as one or two dash glyphs. */
export function isMeaningfulAssignmentGrade(value: string | null | undefined): boolean {
  const grade = (value || '').trim();
  return grade.length > 0 && !/^(?:-{1,2}|[–—])$/.test(grade);
}

function normalizedLabel(value: string | null | undefined): string {
  return (value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/:\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('da-DK');
}

/** Extract visible text while preserving Lectio's <br>-separated feedback lines. */
function elementText(element: Element | null): string {
  if (!element) return '';

  const read = (node: Node): string => {
    if (node.nodeType === 3) return node.textContent || '';
    if (node.nodeType !== 1) return '';
    const child = node as Element;
    if (child.tagName.toLowerCase() === 'br') return '\n';
    return Array.from(child.childNodes).map(read).join('');
  };

  return read(element)
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map(line => line.replace(/[\t\r ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cellsByInlineLabel(row: Element, labelSelector: string): Map<string, HTMLTableCellElement> {
  const result = new Map<string, HTMLTableCellElement>();
  for (const cell of row.querySelectorAll<HTMLTableCellElement>('td')) {
    const label = cell.querySelector(labelSelector);
    if (label) result.set(normalizedLabel(label.textContent), cell);
  }
  return result;
}

function valueWithoutLabel(cell: Element | null, labelSelector: string): string {
  if (!cell) return '';
  const clone = cell.cloneNode(true) as Element;
  clone.querySelectorAll(labelSelector).forEach(label => label.remove());
  return elementText(clone);
}

/** Repair the common UTF-8-as-Latin-1 sequences Lectio can emit in filenames. */
function repairLectioFilename(value: string): string {
  return value
    .replace(/Ã¦/g, 'æ')
    .replace(/Ã¸/g, 'ø')
    .replace(/Ã¥/g, 'å')
    .replace(/Ã†/g, 'Æ')
    .replace(/Ã˜/g, 'Ø')
    .replace(/Ã…/g, 'Å');
}

function getLectioContextCardId(element: Element | null): string {
  if (!element) return '';
  const attribute = Array.from(element.attributes)
    .find(item => item.name.toLowerCase() === 'data-lectiocontextcard');
  return attribute?.value || '';
}

function findLectioContextCardElement(root: Element): HTMLElement | null {
  return Array.from(root.querySelectorAll<HTMLElement>('*'))
    .find(element => !!getLectioContextCardId(element)) || null;
}

// ── Parser ─────────────────────────────────────────────────────────────

export function parseOpgaveDetail(doc: Document, pageUrl: string): OpgaveDetail {
  const origin = new URL(pageUrl).origin;

  // Title
  const title = doc.querySelector('#m_Content_NameLbl')?.textContent?.trim() || '';

  // Info table - find by th content
  const findInfoValue = (thText: string): string => {
    const ths = doc.querySelectorAll('th');
    for (const th of ths) {
      if (th.textContent?.trim().startsWith(thText)) {
        const td = th.nextElementSibling;
        if (!td) return '';
        const clone = td.cloneNode(true) as Element;
        clone.querySelectorAll('.OnlyMobile').forEach(label => label.remove());
        return (clone.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
    return '';
  };

  const findInfoHtml = (thText: string): string | null => {
    const ths = doc.querySelectorAll('th');
    for (const th of ths) {
      if (th.textContent?.trim().startsWith(thText)) {
        const td = th.nextElementSibling;
        if (!td) return null;
        const value = td.querySelector('.ls-elevaflevering-value') || td;
        const clone = value.cloneNode(true) as Element;
        clone.querySelectorAll('.OnlyMobile').forEach(label => label.remove());
        const html = clone.innerHTML.trim();
        return html || null;
      }
    }
    return null;
  };

  const hold = findInfoValue('Hold:');
  const gradeScale = doc.querySelector('#m_Content_gradeScaleIdLbl')?.textContent?.trim() || '';
  const responsible = findInfoValue('Ansvarlig:');
  const studentTime = (doc.querySelector('#m_Content_WeightLbl')?.textContent?.trim() || '')
    .replace(/\s*(?:elev)?timer?\s*$/i, '')
    .trim();
  const deadline = findInfoValue('Afleveringsfrist:');
  const inUVBeskrivelse = findInfoValue('I undervisningsbeskrivelse:');

  // Opgavenote - get innerHTML for rich content
  const noteHtml = findInfoHtml('Opgavenote:');
  const note = noteHtml && noteHtml.length > 0 ? noteHtml : null;

  // Description files — find via "Opgavebeskrivelse:" header row.
  // Note: #m_Content_ExerciseFilePnl is a <div> placed invalidly between <tr>
  // elements, so browser DOMParser foster-parents it outside the table (empty).
  const descriptionFiles: OpgaveDetail['descriptionFiles'] = [];
  const ths = doc.querySelectorAll('th');
  for (const th of ths) {
    if (th.textContent?.trim().startsWith('Opgavebeskrivelse')) {
      const td = th.nextElementSibling;
      if (td) {
        const fileLinks = td.querySelectorAll('a[href*="ExerciseFileGet.aspx"]');
        for (const link of fileLinks) {
          const href = link.getAttribute('href');
          if (href) {
            const name = repairLectioFilename(link.textContent?.trim() || 'Download');
            descriptionFiles.push({
              name,
              url: new URL(href, origin).href,
            });
          }
        }
      }
      break;
    }
  }

  // Students table
  const students: OpgaveDetail['students'] = [];
  const studentTable = doc.querySelector('#m_Content_StudentGV');
  if (studentTable) {
    const rows = studentTable.querySelectorAll('tr');
    for (const row of rows) {
      if (row.querySelector('th')) continue; // skip header
      const cells = row.querySelectorAll<HTMLTableCellElement>('td');
      if (cells.length === 0) continue;

      // Current Lectio emits semantic labels inside the student fields.
      // Prefer those live labels while retaining historical index fallbacks.
      const labeledCells = cellsByInlineLabel(row, '.ls-elevaflevering-field-label');
      const cellFor = (label: string, fallbackIndex: number): HTMLTableCellElement | null =>
        labeledCells.get(normalizedLabel(label)) || cells[fallbackIndex] || null;
      const nameSpan = findLectioContextCardElement(row);
      const name = nameSpan?.textContent?.trim()
        || valueWithoutLabel(cellFor('Elev', 1), '.ls-elevaflevering-field-label');
      const contextCardId = getLectioContextCardId(nameSpan);
      const awaiting = valueWithoutLabel(cellFor('Afventer', 2), '.ls-elevaflevering-field-label');
      const statusText = valueWithoutLabel(cellFor('Status - fravær', 3), '.ls-elevaflevering-field-label');
      const completedCell = cellFor('Afsluttet', 4);
      const checkbox = completedCell?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      const isCompleted = !!checkbox && (checkbox.checked || checkbox.hasAttribute('checked'));
      const grade = valueWithoutLabel(cellFor('Karakter', 5), '.ls-elevaflevering-field-label');
      const gradeNote = valueWithoutLabel(cellFor('Karakternote', 6), '.ls-elevaflevering-field-label');
      const studentNote = valueWithoutLabel(cellFor('Elevnote', 7), '.ls-elevaflevering-field-label');

      students.push({ name, contextCardId, awaiting, statusText, isCompleted, grade, gradeNote, studentNote });
    }
  }

  // Submission entries (Recipients table)
  const entries: OpgaveDetail['entries'] = [];
  const recipientTable = doc.querySelector('#m_Content_RecipientGV');
  if (recipientTable) {
    const noRecord = recipientTable.querySelector('.norecord, .noRecord');
    if (!noRecord) {
      const rows = recipientTable.querySelectorAll('tr');
      for (const row of rows) {
        if (row.querySelector('th')) continue; // skip header
        const cells = row.querySelectorAll<HTMLTableCellElement>('td');
        if (cells.length === 0) continue;

        // The first cell duplicates the whole row for mobile. Anchor desktop
        // values to header names instead of treating that duplicate as time.
        const headerCells = recipientTable.querySelectorAll<HTMLTableCellElement>('tr:first-child th');
        const headerIndexes = new Map<string, number>();
        headerCells.forEach((header, index) => headerIndexes.set(normalizedLabel(header.textContent), index));
        const desktopCell = (label: string): HTMLTableCellElement | null => {
          const index = headerIndexes.get(normalizedLabel(label));
          return index === undefined ? null : cells[index] || null;
        };
        const mobileValue = (label: string): Element | null => {
          const labelElement = Array.from(row.querySelectorAll('.ls-elevaflevering-entry-label'))
            .find(element => normalizedLabel(element.textContent) === normalizedLabel(label));
          return labelElement?.parentElement?.querySelector('.ls-elevaflevering-entry-value') || null;
        };

        const timestampCell = desktopCell('Tidspunkt');
        const userCell = desktopCell('Bruger');
        const commentCell = desktopCell('Indlæg');
        const documentCell = desktopCell('Dokument');
        const timestamp = elementText(timestampCell || mobileValue('Tidspunkt'));
        const userRoot = userCell || mobileValue('Bruger');
        const userSpan = userRoot ? findLectioContextCardElement(userRoot) : null;
        const userText = userSpan?.textContent?.trim() || '';
        const userTitle = userSpan?.getAttribute('title')?.trim() || '';
        // Teacher spans render as initials with full name in `title`; prefer the title.
        const user = (userTitle && userTitle.length > userText.length ? userTitle : userText)
          || elementText(userCell || mobileValue('Bruger'));
        const userContextCardId = getLectioContextCardId(userSpan);
        const isTeacher = userContextCardId.startsWith('T');
        const comment = elementText(commentCell || mobileValue('Indlæg'));

        const docLink = (documentCell || mobileValue('Dokument'))?.querySelector('a[href*="ExerciseFileGet.aspx"]');
        const documentName = repairLectioFilename(docLink?.textContent?.trim() || '');
        const docHref = docLink?.getAttribute('href') || '';
        const documentUrl = docHref ? new URL(docHref, origin).href : '';

        // A teacher can return text feedback without attaching a corrected
        // file. Those rows are feedback too and must be featured in the UI.
        const isReturn = isTeacher && (!!comment || !!documentName || row.classList.contains('separationCell'));

        entries.push({
          timestamp,
          user,
          userContextCardId,
          isTeacher,
          isReturn,
          comment,
          documentName,
          documentUrl,
        });
      }
    }
  }

  // Group submission
  const groupMembersTable = doc.querySelector('#m_Content_groupMembersGV');
  const groupMembers: GroupMember[] = [];
  if (groupMembersTable) {
    const rows = groupMembersTable.querySelectorAll('tr');
    for (const row of rows) {
      if (row.querySelector('th')) continue;
      const nameSpan = findLectioContextCardElement(row);
      if (!nameSpan) continue;
      const contextCardId = getLectioContextCardId(nameSpan);
      const name = nameSpan.textContent?.trim() || '';
      // Remove button is in the noprint td - look for a postback link
      // e.g. href="javascript:__doPostBack('m$Content$groupMembersGV','DEL$1')"
      const actionCell = row.querySelector('td.noprint');
      const removeLink = actionCell?.querySelector('a[href*="doPostBack"], a[onclick*="doPostBack"]');
      let removePostbackTarget: string | null = null;
      let removePostbackArgument: string | null = null;
      if (removeLink) {
        const attributes = [removeLink.getAttribute('onclick'), removeLink.getAttribute('href')];
        const raw = attributes.find((value) => value?.includes('__doPostBack')) || '';
        const pbMatch = raw.match(/__doPostBack\('([^']+)'\s*,\s*'([^']*)'\)/);
        if (pbMatch) {
          removePostbackTarget = pbMatch[1];
          removePostbackArgument = pbMatch[2];
        }
      }
      groupMembers.push({
        name,
        contextCardId,
        removePostbackTarget,
        removePostbackArgument,
      });
    }
  }

  const groupAddDropdown = doc.querySelector('#m_Content_groupStudentAddDD');
  const availableGroupStudents: AvailableGroupStudent[] = [];
  if (groupAddDropdown) {
    for (const option of groupAddDropdown.querySelectorAll('option')) {
      const opt = option as HTMLOptionElement;
      // Lectio includes an empty prompt option. Treating it as a student makes
      // the custom picker submit an invalid group postback.
      if (!opt.value.trim() || opt.disabled || opt.hasAttribute('disabled')) continue;
      availableGroupStudents.push({
        name: opt.textContent?.trim() || '',
        value: opt.value,
      });
    }
  }
  // Keep the group surface visible even when every available student has
  // already been added. In that state Lectio leaves the picker in the DOM but
  // naturally has no selectable options.
  const hasGroupForm = !!groupAddDropdown && !!doc.querySelector('#m_Content_showAddToGroupPanel');

  // Submission form
  const hasSubmissionForm = !!doc.querySelector('#m_Content_ElectronicHandInPanel');

  // Form tokens
  const form = doc.querySelector('form#aspnetForm');
  const action = form?.getAttribute('action') || '';
  const viewStateX = (doc.querySelector('input[name="__VIEWSTATEX"]') as HTMLInputElement)?.value || '';
  const viewState = (doc.querySelector('input[name="__VIEWSTATE"]') as HTMLInputElement)?.value || '';
  const viewStateEncrypted = (doc.querySelector('input[name="__VIEWSTATEENCRYPTED"]') as HTMLInputElement)?.value || '';
  const eventValidation = (doc.querySelector('input[name="__EVENTVALIDATION"]') as HTMLInputElement)?.value || '';
  const hiddenFields: Record<string, string> = {};
  form?.querySelectorAll('input[type="hidden"][name]').forEach((inputEl) => {
    const input = inputEl as HTMLInputElement;
    hiddenFields[input.name] = input.value ?? '';
  });

  return {
    sourceUrl: pageUrl,
    title,
    hold,
    gradeScale,
    responsible,
    studentTime,
    deadline,
    inUVBeskrivelse,
    note,
    descriptionFiles,
    students,
    entries,
    hasSubmissionForm,
    hasGroupForm,
    groupMembers,
    availableGroupStudents,
    formTokens: {
      action: action ? new URL(action, new URL(pageUrl, origin)).href : '',
      viewStateX,
      viewState,
      viewStateEncrypted,
      eventValidation,
      hiddenFields,
    },
  };
}

// ── Fetch ──────────────────────────────────────────────────────────────

export async function fetchOpgaveDetail(url: string): Promise<OpgaveDetail> {
  try {
    const absoluteUrl = new URL(url, window.location.origin).href;
    const response = await fetch(absoluteUrl, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Check for session expiry - if there's no title element, page is likely a login redirect
    if (!doc.querySelector('#m_Content_NameLbl')) {
      throw new Error('SESSION_EXPIRED');
    }

    return parseOpgaveDetail(doc, absoluteUrl);
  } catch (err) {
    if (err instanceof Error && err.message === 'SESSION_EXPIRED') throw err;
    captureException(err, undefined, { source: 'opgave-detail', url });
    throw err;
  }
}

// ── Submission ─────────────────────────────────────────────────────────

export async function submitComment(
  detail: OpgaveDetail,
  comment: string,
  onStatus?: (status: SubmissionStatus) => void,
): Promise<boolean> {
  if (!detail.formTokens.action) {
    throw new Error('Missing form action');
  }

  const fields = { ...detail.formTokens.hiddenFields };
  fields.__EVENTTARGET = 'm$Content$AddEntryBtn';
  fields.__EVENTARGUMENT = '';
  fields.__VIEWSTATEX = detail.formTokens.viewStateX;
  fields.__VIEWSTATE = detail.formTokens.viewState;
  fields.__VIEWSTATEENCRYPTED = detail.formTokens.viewStateEncrypted;
  fields.__EVENTVALIDATION = detail.formTokens.eventValidation;
  fields['m$Content$CommentsTB$tb'] = comment;

  onStatus?.('sending');
  const doc = await postFormViaHiddenIframe(detail.formTokens.action, fields);

  // Login page or invalid response means the submission did not complete.
  if (!doc.querySelector('#m_Content_NameLbl')) return false;

  onStatus?.('verifying');
  const parsed = parseOpgaveDetail(doc, detail.sourceUrl);
  const trimmedComment = comment.trim();

  return (
    parsed.entries.length > detail.entries.length
    || parsed.entries.some(entry => entry.comment.trim() === trimmedComment)
  );
}

// ── Group management ────────────────────────────────────────────────────

export async function addGroupMember(
  detail: OpgaveDetail,
  studentValue: string,
): Promise<OpgaveDetail | null> {
  if (!detail.formTokens.action) throw new Error('Missing form action');

  const fields = { ...detail.formTokens.hiddenFields };
  fields.__EVENTTARGET = 'm$Content$groupStudentAddBtn';
  fields.__EVENTARGUMENT = '';
  fields.__VIEWSTATEX = detail.formTokens.viewStateX;
  fields.__VIEWSTATE = detail.formTokens.viewState;
  fields.__VIEWSTATEENCRYPTED = detail.formTokens.viewStateEncrypted;
  fields.__EVENTVALIDATION = detail.formTokens.eventValidation;
  fields['m$Content$groupStudentAddDD'] = studentValue;

  const doc = await postFormViaHiddenIframe(detail.formTokens.action, fields);
  if (!doc.querySelector('#m_Content_NameLbl')) return null;

  const parsed = parseOpgaveDetail(doc, detail.sourceUrl);
  const studentWasRemoved = parsed.availableGroupStudents.length < detail.availableGroupStudents.length;
  const memberWasAdded = parsed.groupMembers.length > detail.groupMembers.length;
  return studentWasRemoved || memberWasAdded ? parsed : null;
}

export async function removeGroupMember(
  detail: OpgaveDetail,
  postbackTarget: string,
  postbackArgument: string,
): Promise<OpgaveDetail | null> {
  if (!detail.formTokens.action) throw new Error('Missing form action');

  const fields = { ...detail.formTokens.hiddenFields };
  fields.__EVENTTARGET = postbackTarget;
  fields.__EVENTARGUMENT = postbackArgument;
  fields.__VIEWSTATEX = detail.formTokens.viewStateX;
  fields.__VIEWSTATE = detail.formTokens.viewState;
  fields.__VIEWSTATEENCRYPTED = detail.formTokens.viewStateEncrypted;
  fields.__EVENTVALIDATION = detail.formTokens.eventValidation;

  const doc = await postFormViaHiddenIframe(detail.formTokens.action, fields);
  if (!doc.querySelector('#m_Content_NameLbl')) return null;

  const parsed = parseOpgaveDetail(doc, detail.sourceUrl);
  return parsed.groupMembers.length < detail.groupMembers.length ? parsed : null;
}

export async function uploadFileAndSubmit(
  detail: OpgaveDetail,
  file: File,
  comment: string,
  schoolId: string,
  onStatus?: (status: SubmissionStatus) => void,
): Promise<boolean> {
  if (!detail.formTokens.action) {
    throw new Error('Missing form action');
  }

  // Step 1: Upload file to Lectio's document upload endpoint
  const uploadUrl = new URL(`/lectio/${schoolId}/dokumentupload.aspx`, window.location.origin).href;
  const uploadForm = new FormData();
  uploadForm.append('file', file);

  onStatus?.('uploading');
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    credentials: 'include',
    body: uploadForm,
  });

  if (!uploadResponse.ok) {
    throw new Error('File upload failed');
  }

  const uploadResult = await uploadResponse.text();

  let serializedId = '';
  try {
    serializedId = JSON.parse(uploadResult)?.serializedId || '';
  } catch {
    const idMatch = uploadResult.match(/serializedId['":\s]+['"]([^'"]+)['"]/);
    serializedId = idMatch?.[1] || '';
  }
  if (!serializedId) throw new Error('Could not parse upload response');

  // Step 2: Submit the form with the uploaded document
  const fields = { ...detail.formTokens.hiddenFields };
  fields.__EVENTTARGET = 'm$Content$choosedocument';
  fields.__EVENTARGUMENT = 'documentId';
  fields.__VIEWSTATEX = detail.formTokens.viewStateX;
  fields.__VIEWSTATE = detail.formTokens.viewState;
  fields.__VIEWSTATEENCRYPTED = detail.formTokens.viewStateEncrypted;
  fields.__EVENTVALIDATION = detail.formTokens.eventValidation;
  fields['m$Content$CommentsTB$tb'] = comment;
  fields['m$Content$choosedocument$selectedDocumentId'] = JSON.stringify({ serializedId });

  onStatus?.('sending');
  const doc = await postFormViaHiddenIframe(detail.formTokens.action, fields);
  if (!doc.querySelector('#m_Content_NameLbl')) return false;

  onStatus?.('verifying');
  const parsed = parseOpgaveDetail(doc, detail.sourceUrl);
  return (
    parsed.entries.length > detail.entries.length
    || parsed.entries.some(entry => !!entry.documentName)
  );
}
