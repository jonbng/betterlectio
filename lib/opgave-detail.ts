// ── Types ──────────────────────────────────────────────────────────────

export interface OpgaveDetail {
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
    isTeacher: boolean;
    comment: string;
    documentName: string;
    documentUrl: string;
  }[];
  hasSubmissionForm: boolean;
  formTokens: {
    action: string;
    viewStateX: string;
    viewState: string;
    viewStateEncrypted: string;
    eventValidation: string;
  };
}

// ── Cache ──────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'il-opgave-detail-';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_ENTRIES = 50;

interface CachedEntry {
  detail: OpgaveDetail;
  timestamp: number;
}

function getExerciseId(url: string): string | null {
  const match = url.match(/exerciseid=(\d+)/i);
  return match ? match[1] : null;
}

export function getCachedDetail(url: string): OpgaveDetail | null {
  const id = getExerciseId(url);
  if (!id) return null;

  try {
    const raw = localStorage.getItem(CACHE_PREFIX + id);
    if (!raw) return null;

    const cached: CachedEntry = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_PREFIX + id);
      return null;
    }
    return cached.detail;
  } catch {
    return null;
  }
}

function setCachedDetail(url: string, detail: OpgaveDetail): void {
  const id = getExerciseId(url);
  if (!id) return;

  try {
    // LRU eviction: if at max, remove oldest
    const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
    if (keys.length >= CACHE_MAX_ENTRIES) {
      let oldestKey = keys[0];
      let oldestTime = Infinity;
      for (const key of keys) {
        try {
          const entry: CachedEntry = JSON.parse(localStorage.getItem(key)!);
          if (entry.timestamp < oldestTime) {
            oldestTime = entry.timestamp;
            oldestKey = key;
          }
        } catch { /* skip corrupt entries */ }
      }
      localStorage.removeItem(oldestKey);
    }

    const entry: CachedEntry = { detail, timestamp: Date.now() };
    localStorage.setItem(CACHE_PREFIX + id, JSON.stringify(entry));
  } catch { /* ignore storage errors */ }
}

export function invalidateDetailCache(url: string): void {
  const id = getExerciseId(url);
  if (!id) return;
  try {
    localStorage.removeItem(CACHE_PREFIX + id);
  } catch { /* ignore */ }
}

// ── Parser ─────────────────────────────────────────────────────────────

function parseDetail(doc: Document, pageUrl: string): OpgaveDetail {
  const origin = window.location.origin;

  // Title
  const title = doc.querySelector('#m_Content_NameLbl')?.textContent?.trim() || '';

  // Info table - find by th content
  const findInfoValue = (thText: string): string => {
    const ths = doc.querySelectorAll('th');
    for (const th of ths) {
      if (th.textContent?.trim().startsWith(thText)) {
        const td = th.nextElementSibling;
        return td?.textContent?.trim() || '';
      }
    }
    return '';
  };

  const findInfoHtml = (thText: string): string | null => {
    const ths = doc.querySelectorAll('th');
    for (const th of ths) {
      if (th.textContent?.trim().startsWith(thText)) {
        const td = th.nextElementSibling;
        const html = td?.innerHTML?.trim();
        return html || null;
      }
    }
    return null;
  };

  const hold = findInfoValue('Hold:');
  const gradeScale = doc.querySelector('#m_Content_gradeScaleIdLbl')?.textContent?.trim() || '';
  const responsible = findInfoValue('Ansvarlig:');
  const studentTime = doc.querySelector('#m_Content_WeightLbl')?.textContent?.trim() || '';
  const deadline = findInfoValue('Afleveringsfrist:');
  const inUVBeskrivelse = findInfoValue('I undervisningsbeskrivelse:');

  // Opgavenote - get innerHTML for rich content
  const noteHtml = findInfoHtml('Opgavenote:');
  const note = noteHtml && noteHtml.length > 0 ? noteHtml : null;

  // Description files
  const descriptionFiles: OpgaveDetail['descriptionFiles'] = [];
  const filePanel = doc.querySelector('#m_Content_ExerciseFilePnl');
  if (filePanel) {
    const fileLinks = filePanel.querySelectorAll('a[href*="ExerciseFileGet.aspx"]');
    for (const link of fileLinks) {
      const href = link.getAttribute('href');
      if (href) {
        const name = link.textContent?.trim() || 'Download';
        descriptionFiles.push({
          name,
          url: new URL(href, origin).href,
        });
      }
    }
  }

  // Students table
  const students: OpgaveDetail['students'] = [];
  const studentTable = doc.querySelector('#m_Content_StudentGV');
  if (studentTable) {
    const rows = studentTable.querySelectorAll('tr');
    for (const row of rows) {
      if (row.querySelector('th')) continue; // skip header
      const cells = row.querySelectorAll('td');
      if (cells.length < 8) continue;

      // cells: [0]=photo, [1]=name, [2]=awaiting, [3]=status, [4]=completed checkbox, [5]=grade, [6]=gradeNote, [7]=studentNote
      const name = cells[1]?.textContent?.trim() || '';
      const awaiting = cells[2]?.textContent?.trim() || '';
      const statusText = cells[3]?.textContent?.trim() || '';
      const checkbox = cells[4]?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      const isCompleted = checkbox?.checked ?? false;
      const grade = cells[5]?.textContent?.trim() || '';
      const gradeNote = cells[6]?.textContent?.trim() || '';
      const studentNote = cells[7]?.textContent?.trim() || '';

      students.push({ name, awaiting, statusText, isCompleted, grade, gradeNote, studentNote });
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
        const cells = row.querySelectorAll('td');
        if (cells.length < 4) continue;

        const timestamp = cells[0]?.textContent?.trim() || '';
        const userSpan = cells[1]?.querySelector('[data-lectioContextCard]');
        const user = userSpan?.textContent?.trim() || cells[1]?.textContent?.trim() || '';
        const contextCard = userSpan?.getAttribute('data-lectioContextCard') || '';
        const isTeacher = contextCard.startsWith('T');
        const comment = cells[2]?.textContent?.trim() || '';

        const docLink = cells[3]?.querySelector('a[href*="ExerciseFileGet.aspx"]');
        const documentName = docLink?.textContent?.trim() || '';
        const docHref = docLink?.getAttribute('href') || '';
        const documentUrl = docHref ? new URL(docHref, origin).href : '';

        entries.push({ timestamp, user, isTeacher, comment, documentName, documentUrl });
      }
    }
  }

  // Submission form
  const hasSubmissionForm = !!doc.querySelector('#m_Content_ElectronicHandInPanel');

  // Form tokens
  const form = doc.querySelector('form#aspnetForm');
  const action = form?.getAttribute('action') || '';
  const viewStateX = (doc.querySelector('input[name="__VIEWSTATEX"]') as HTMLInputElement)?.value || '';
  const viewState = (doc.querySelector('input[name="__VIEWSTATE"]') as HTMLInputElement)?.value || '';
  const viewStateEncrypted = (doc.querySelector('input[name="__VIEWSTATEENCRYPTED"]') as HTMLInputElement)?.value || '';
  const eventValidation = (doc.querySelector('input[name="__EVENTVALIDATION"]') as HTMLInputElement)?.value || '';

  return {
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
    formTokens: {
      action: action ? new URL(action, new URL(pageUrl, origin)).href : '',
      viewStateX,
      viewState,
      viewStateEncrypted,
      eventValidation,
    },
  };
}

// ── Fetch ──────────────────────────────────────────────────────────────

export async function fetchOpgaveDetail(url: string): Promise<OpgaveDetail> {
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

  const detail = parseDetail(doc, absoluteUrl);
  setCachedDetail(url, detail);
  return detail;
}

// ── Submission ─────────────────────────────────────────────────────────

export async function submitComment(detail: OpgaveDetail, comment: string): Promise<boolean> {
  const formData = new URLSearchParams();
  formData.set('__EVENTTARGET', 'm$Content$AddEntryBtn');
  formData.set('__EVENTARGUMENT', '');
  formData.set('__VIEWSTATEX', detail.formTokens.viewStateX);
  formData.set('__VIEWSTATE', detail.formTokens.viewState);
  formData.set('__VIEWSTATEENCRYPTED', detail.formTokens.viewStateEncrypted);
  formData.set('__EVENTVALIDATION', detail.formTokens.eventValidation);
  formData.set('m$Content$CommentsTB$tb', comment);

  const response = await fetch(detail.formTokens.action, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });

  return response.ok;
}

export async function uploadFileAndSubmit(
  detail: OpgaveDetail,
  file: File,
  comment: string,
  schoolId: string,
): Promise<boolean> {
  // Step 1: Upload file to Lectio's document upload endpoint
  const uploadUrl = new URL(`/lectio/${schoolId}/dokumentupload.aspx`, window.location.origin).href;
  const uploadForm = new FormData();
  uploadForm.append('file', file);

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    credentials: 'include',
    body: uploadForm,
  });

  if (!uploadResponse.ok) {
    throw new Error('File upload failed');
  }

  const uploadResult = await uploadResponse.text();

  // Parse the serializedId from the upload response
  // Lectio returns HTML with the document info - extract the serialized ID
  const idMatch = uploadResult.match(/serializedId['":\s]+['"]([^'"]+)['"]/);
  if (!idMatch) {
    throw new Error('Could not parse upload response');
  }
  const serializedId = idMatch[1];

  // Step 2: Submit the form with the uploaded document
  const formData = new URLSearchParams();
  formData.set('__EVENTTARGET', 'm$Content$choosedocument');
  formData.set('__EVENTARGUMENT', 'documentId');
  formData.set('__VIEWSTATEX', detail.formTokens.viewStateX);
  formData.set('__VIEWSTATE', detail.formTokens.viewState);
  formData.set('__VIEWSTATEENCRYPTED', detail.formTokens.viewStateEncrypted);
  formData.set('__EVENTVALIDATION', detail.formTokens.eventValidation);
  formData.set('m$Content$CommentsTB$tb', comment);
  formData.set('m$Content$choosedocument$selectedDocumentId', JSON.stringify({ serializedId }));

  const response = await fetch(detail.formTokens.action, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });

  return response.ok;
}
