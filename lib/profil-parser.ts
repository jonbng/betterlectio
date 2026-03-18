// ── Types ──────────────────────────────────────────────────────────────

export interface ProfilData {
  firstName: string;
  lastName: string;
  fullName: string;
  classCode: string;
  pictureUrl: string;
  schoolName: string;
  address: string;
  postalCode: string;
  coName: string;
  placeName: string;
  phone: string;
  email: string;
  altContact: string;
}

export interface StudiekortData {
  name: string;
  school: string;
  birthday: string;
  photoUrl: string;
  qrUrl: string;
  timestamp: string;
}

export interface SessionEntry {
  lastLogin: string;
  created: string;
  expiry: string;
  device: string;
  isCurrent: boolean;
  deleteIndex: number;
}

// ── Profil parser (studentIndstillinger.aspx) ──────────────────────────

export function parseProfilFromDOM(doc: Document = document): ProfilData {
  // Picture URL from header
  const picEl = doc.getElementById('s_m_HeaderContent_picctrlthumbimage') as HTMLImageElement | null;
  const pictureUrl = picEl?.src || '';

  // Name + class from title: "Eleven Jonathan Arthur Hojer Bangert(k), 1x - Profil"
  const titleEl = doc.getElementById('s_m_HeaderContent_MainTitle');
  const titleSpan = titleEl?.querySelector('.ls-hidden-smallscreen');
  const titleText = titleSpan?.textContent?.trim() || '';
  // Extract: "Eleven {name}({status}), {class} - "
  const titleMatch = titleText.match(/^Eleven\s+(.+?)(?:\([^)]*\))?,\s*(\S+)\s*-\s*$/);
  const fullName = titleMatch?.[1]?.trim() || '';
  const classCode = titleMatch?.[2] || '';

  // School name from header
  const schoolNameEl = doc.querySelector('.ls-master-header-institution-name');
  const schoolName = schoolNameEl?.textContent?.trim() || '';

  // Parse the "Mine oplysninger" table
  const rows = doc.querySelectorAll('.ls-std-table-inputlist tr');
  let firstName = '';
  let lastName = '';
  let coName = '';
  let address = '';
  let placeName = '';
  let postalCode = '';

  for (const row of rows) {
    const th = row.querySelector('th');
    const td = row.querySelector('td');
    if (!th || !td) continue;
    const label = th.textContent?.trim().toLowerCase() || '';
    const value = td.textContent?.trim() || '';

    if (label.startsWith('fornavn')) firstName = value;
    else if (label.startsWith('efternavn')) lastName = value;
    else if (label.startsWith('c/o')) coName = value;
    else if (label.startsWith('gadenavn')) address = value;
    else if (label.startsWith('stednavn')) placeName = value;
    else if (label.startsWith('post nr')) postalCode = value;
  }

  // Editable fields - read from inputs
  const phoneInput = doc.getElementById('s_m_Content_Content_phoneno3txt_tb') as HTMLInputElement | null;
  const emailInput = doc.getElementById('s_m_Content_Content_emailtxt_tb') as HTMLInputElement | null;
  const altContactInput = doc.getElementById('s_m_Content_Content_alternativKontakt_tb') as HTMLInputElement | null;

  return {
    firstName,
    lastName,
    fullName: fullName || `${firstName} ${lastName}`.trim(),
    classCode,
    pictureUrl,
    schoolName,
    address,
    postalCode,
    coName,
    placeName,
    phone: phoneInput?.value || '',
    email: emailInput?.value || '',
    altContact: altContactInput?.value || '',
  };
}

// ── Studiekort parser (digitaltStudiekort.aspx) ────────────────────────

export function parseStudiekortFromDoc(doc: Document): StudiekortData {
  const nameEl = doc.getElementById('s_m_Content_Content_StudentName');
  const schoolEl = doc.getElementById('s_m_Content_Content_SchoolName');
  const birthdayEl = doc.getElementById('s_m_Content_Content_StudentBirthday');
  const photoEl = doc.getElementById('s_m_Content_Content_StudPic') as HTMLImageElement | null;

  // QR URL is in a script: LectioQRCode.Initialize('...', 'URL', ...)
  let qrUrl = '';
  const scripts = doc.querySelectorAll('script');
  for (const script of scripts) {
    const text = script.textContent || '';
    const qrMatch = text.match(/LectioQRCode\.Initialize\([^,]+,\s*'([^']+)'/);
    if (qrMatch) {
      qrUrl = qrMatch[1];
      break;
    }
  }

  // Timestamp: "© Lectio d. 18/3-2026 09:27"
  const timestampEl = doc.getElementById('s_m_Content_Content_LectioCR');
  const timestamp = timestampEl?.textContent?.trim() || '';

  return {
    name: nameEl?.textContent?.trim() || '',
    school: schoolEl?.textContent?.trim() || '',
    birthday: birthdayEl?.textContent?.trim() || '',
    photoUrl: photoEl?.src || '',
    qrUrl,
    timestamp,
  };
}

export async function fetchStudiekortData(schoolId: string): Promise<StudiekortData> {
  const url = `${window.location.origin}/lectio/${schoolId}/digitaltStudiekort.aspx`;
  const resp = await fetch(url, { credentials: 'include' });
  const html = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return parseStudiekortFromDoc(doc);
}

// ── Sessions parser (AdgangIndstillinger.aspx) ─────────────────────────

export function parseSessionsFromDoc(doc: Document): SessionEntry[] {
  const table = doc.getElementById('s_m_Content_Content_ForblivLoggetIndGV');
  if (!table) return [];

  const sessions: SessionEntry[] = [];
  const rows = table.querySelectorAll('tr');

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].querySelectorAll('td');
    if (cells.length < 4) continue;

    const lastLogin = cells[0]?.textContent?.trim() || '';
    const created = cells[1]?.textContent?.trim() || '';
    const expiry = cells[2]?.textContent?.trim() || '';
    const device = cells[3]?.textContent?.trim() || '';
    const isCurrent = device.toLowerCase().startsWith('denne enhed');

    // Parse delete index from the delete link: __doPostBack('...','DEL$N')
    const deleteLink = cells[4]?.querySelector('a');
    const deleteHref = deleteLink?.getAttribute('href') || '';
    const delMatch = deleteHref.match(/DEL\$(\d+)/);
    const deleteIndex = delMatch ? parseInt(delMatch[1], 10) : i - 1;

    sessions.push({ lastLogin, created, expiry, device, isCurrent, deleteIndex });
  }

  return sessions;
}

export async function fetchSessionsData(schoolId: string): Promise<SessionEntry[]> {
  const url = `${window.location.origin}/lectio/${schoolId}/indstillinger/AdgangIndstillinger.aspx`;
  const resp = await fetch(url, { credentials: 'include' });
  const html = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return parseSessionsFromDoc(doc);
}

/** Delete a session by fetching fresh form state from AdgangIndstillinger, then POSTing the delete action. */
export async function deleteSession(schoolId: string, deleteIndex: number): Promise<SessionEntry[]> {
  const pageUrl = `${window.location.origin}/lectio/${schoolId}/indstillinger/AdgangIndstillinger.aspx`;

  // 1. GET fresh page to extract ASP.NET form fields
  const getResp = await fetch(pageUrl, { credentials: 'include' });
  const html = await getResp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const form = doc.getElementById('aspnetForm') as HTMLFormElement | null;
  if (!form) throw new Error('Could not find aspnetForm');

  // 2. Build POST body from all hidden fields
  const formData = new URLSearchParams();
  const inputs = form.querySelectorAll('input[type="hidden"]');
  for (const input of inputs) {
    const name = (input as HTMLInputElement).name;
    const value = (input as HTMLInputElement).value;
    if (name) formData.set(name, value);
  }

  // Set the postback target
  formData.set('__EVENTTARGET', 's$m$Content$Content$ForblivLoggetIndGV');
  formData.set('__EVENTARGUMENT', `DEL$${deleteIndex}`);

  // 3. POST the delete
  const postResp = await fetch(pageUrl, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });

  // 4. Parse updated sessions from the response
  const postHtml = await postResp.text();
  const postDoc = parser.parseFromString(postHtml, 'text/html');
  return parseSessionsFromDoc(postDoc);
}
