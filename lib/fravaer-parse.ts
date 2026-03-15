// ── Fravær Page Parser ─────────────────────────────────────────────────
// Parses both "Oversigt" and "Fraværsårsager" pages from Lectio DOM.
// Supports fetch-and-parse for combining data from both pages.

// ── Types ──────────────────────────────────────────────────────────────

export interface FravaerHoldEntry {
  hold: string;
  holdUrl: string;
  holdelementId: string | null;
  almOpgjortPct: string;
  almOpgjortModuler: string;
  almAarPct: string;
  almAarModuler: string;
  skrOpgjortPct: string;
  skrOpgjortTid: string;
  skrAarPct: string;
  skrAarTid: string;
}

export interface FravaerTotals {
  almOpgjortPct: string;
  almOpgjortModuler: string;
  almAarPct: string;
  almAarModuler: string;
  skrOpgjortPct: string;
  skrOpgjortTid: string;
  skrAarPct: string;
  skrAarTid: string;
}

export interface FravaerRecord {
  uge: string;
  date: string;
  /** ISO date string (yyyy-mm-dd) for filtering/sorting */
  dateISO: string;
  hold: string;
  teacher: string;
  room: string;
  module: string;
  activityUrl: string;
  activityBrikHtml: string;
  absid: string;
  fravaerPct: number;
  fravaerType: 'fravaer' | 'godskrevet';
  registreret: string;
  bemaerkning: string;
  aarsag: string;
  note: string;
  editUrl: string;
}

export interface FravaerWarning {
  hold: string;
  type: string;
  message: string;
}

export interface FravaerPeriod {
  start: string;
  end: string;
}

export interface FravaerPageData {
  studentName: string;
  period: FravaerPeriod;
  holds: FravaerHoldEntry[];
  totals: FravaerTotals | null;
  records: FravaerRecord[];
  missingReasons: FravaerRecord[];
  warnings: FravaerWarning[];
  chartImageUrl: string | null;
}

// ── Oversigt Parser ────────────────────────────────────────────────────

function parseOversigt(root: Document | Element): Partial<FravaerPageData> {
  const holds: FravaerHoldEntry[] = [];
  let totals: FravaerTotals | null = null;

  // Extract student name from title
  const titleEl = root.querySelector('#s_m_HeaderContent_MainTitle');
  const studentName = titleEl?.textContent?.trim()?.replace(/\s*-\s*Fravær.*$/i, '') || '';

  // Extract period
  const startInput = root.querySelector<HTMLInputElement>(
    '#s_m_Content_Content_PeriodePicker_start__date_tb'
  );
  const endInput = root.querySelector<HTMLInputElement>(
    '#s_m_Content_Content_PeriodePicker_end__date_tb'
  );
  const period: FravaerPeriod = {
    start: startInput?.value || '',
    end: endInput?.value || '',
  };

  // Parse main absence table
  const table = root.querySelector<HTMLTableElement>(
    '#s_m_Content_Content_SFTabStudentAbsenceDataTable'
  );
  if (table) {
    const rows = Array.from(table.querySelectorAll('tr'));

    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>('td'));
      if (cells.length < 9) continue;

      const holdCell = cells[0];
      const holdLink = holdCell.querySelector<HTMLAnchorElement>('a');
      const holdText = holdLink?.textContent?.trim() || holdCell.textContent?.trim() || '';

      // Skip "Ej hold" row
      if (holdText.toLowerCase().includes('ej hold')) continue;

      const isTotalRow = !!row.querySelector('b') && holdText.toLowerCase().includes('samlet');

      const cellTexts = cells.map(c => c.textContent?.trim() || '');

      if (isTotalRow) {
        totals = {
          almOpgjortPct: cellTexts[1],
          almOpgjortModuler: cellTexts[2],
          almAarPct: cellTexts[3],
          almAarModuler: cellTexts[4],
          skrOpgjortPct: cellTexts[5],
          skrOpgjortTid: cellTexts[6],
          skrAarPct: cellTexts[7],
          skrAarTid: cellTexts[8],
        };
      } else {
        const holdUrl = holdLink?.getAttribute('href') || '';
        const contextCard = holdLink?.getAttribute('data-lectioContextCard') ||
          holdLink?.getAttribute('data-lectiocontextcard') || '';
        const holdelementMatch = holdUrl.match(/holdelementid=(\d+)/i);
        const holdelementId = holdelementMatch?.[1] || contextCard.replace(/^HE/, '') || null;

        holds.push({
          hold: holdText,
          holdUrl,
          holdelementId,
          almOpgjortPct: cellTexts[1],
          almOpgjortModuler: cellTexts[2],
          almAarPct: cellTexts[3],
          almAarModuler: cellTexts[4],
          skrOpgjortPct: cellTexts[5],
          skrOpgjortTid: cellTexts[6],
          skrAarPct: cellTexts[7],
          skrAarTid: cellTexts[8],
        });
      }
    }
  }

  // Chart image
  const chartImg = root.querySelector<HTMLImageElement>(
    '#s_m_Content_Content_SFTabAbsenceimg'
  );
  const chartImageUrl = chartImg?.getAttribute('src') || null;

  // Warnings (Bemærkninger)
  const warnings: FravaerWarning[] = [];
  const warningTable = root.querySelector<HTMLTableElement>(
    '#s_m_Content_Content_SFTabWarningGV'
  );
  if (warningTable && !warningTable.querySelector('.noRecord')) {
    const warnRows = Array.from(warningTable.querySelectorAll('tr'));
    for (const row of warnRows) {
      const wCells = Array.from(row.querySelectorAll('td'));
      if (wCells.length >= 2) {
        warnings.push({
          hold: wCells[0].textContent?.trim() || '',
          type: wCells[1]?.textContent?.trim() || '',
          message: wCells[2]?.textContent?.trim() || '',
        });
      }
    }
  }

  return { studentName, period, holds, totals, chartImageUrl, warnings };
}

// ── Fraværsårsager Parser ──────────────────────────────────────────────

function parseFravaersaarsager(root: Document | Element): {
  records: FravaerRecord[];
  missingReasons: FravaerRecord[];
  totals?: Partial<FravaerTotals>;
} {
  const records: FravaerRecord[] = [];
  const missingReasons: FravaerRecord[] = [];

  // Parse "Samlet fravær" summary if on this page
  let totals: Partial<FravaerTotals> | undefined;
  const almSpan = root.querySelector('#s_m_Content_Content_FremmoedeFravaer');
  const skrSpan = root.querySelector('#s_m_Content_Content_SkriftligFravaer');
  if (almSpan || skrSpan) {
    totals = {
      almOpgjortPct: almSpan?.textContent?.trim() || '',
      skrOpgjortPct: skrSpan?.textContent?.trim() || '',
    };
  }

  // Parse missing reasons table
  const missingTable = root.querySelector<HTMLTableElement>(
    '#s_m_Content_Content_FatabMissingAarsagerGV'
  );
  if (missingTable && !missingTable.querySelector('.noRecord')) {
    parseRecordTable(missingTable, missingReasons);
  }

  // Parse main records table
  const recordsTable = root.querySelector<HTMLTableElement>(
    '#s_m_Content_Content_FatabAbsenceFravaerGV'
  );
  if (recordsTable) {
    parseRecordTable(recordsTable, records);
  }

  return { records, missingReasons, totals };
}

function parseRecordTable(table: HTMLTableElement, out: FravaerRecord[]) {
  const isMissingReasonsTable = table.id.includes('FatabMissingAarsagerGV');
  const rows = Array.from(table.querySelectorAll('tr'));

  for (const row of rows) {
    // Skip header rows
    if (row.querySelector('th')) continue;

    const desktopCells = Array.from(
      row.querySelectorAll<HTMLTableCellElement>('td')
    ).filter(td => !td.classList.contains('OnlyMobile'));

    if (desktopCells.length < 7) continue;

    const uge = desktopCells[0]?.textContent?.trim() || '';

    // Activity cell — contains the schedule brick
    const activityCell = desktopCells[1];
    const activityLink = activityCell?.querySelector<HTMLAnchorElement>('a.s2skemabrik');
    const activityUrl = activityLink?.getAttribute('href') || '';
    const activityBrikHtml = activityLink?.outerHTML || '';

    // Extract date and details from brik content
    const brikContent = activityLink?.querySelector('.s2skemabrikcontent.OnlyDesktop');
    const brikText = brikContent?.textContent?.replace(/\s+/g, ' ').trim() || '';

    // Parse "on 17/9 3. modul - 1g3 da • GS • Lokale"
    const dateMatch = brikText.match(/^(\w+\s+\d+\/\d+)\s*/);
    const date = dateMatch?.[1] || '';

    // Extract full date from tooltip (e.g. "17/9-2025 12:25 til 14:05")
    const tooltip = activityLink?.getAttribute('data-tooltip') || '';
    const fullDateMatch = tooltip.match(/^(\d{1,2})\/(\d{1,2})-(\d{4})/);
    let dateISO = '';
    if (fullDateMatch) {
      const [, dd, mm, yyyy] = fullDateMatch;
      dateISO = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }

    // Extract hold from context card span
    const holdSpan = activityLink?.querySelector<HTMLElement>(
      'span[data-lectioContextCard^="HE"], span[data-lectiocontextcard^="HE"]'
    );
    const hold = holdSpan?.textContent?.trim() || '';

    // Extract teacher
    const teacherSpan = activityLink?.querySelector<HTMLElement>(
      'span[data-lectioContextCard^="T"], span[data-lectiocontextcard^="T"]'
    );
    const teacher = teacherSpan?.textContent?.trim() || '';

    // Module from brik text
    const moduleMatch = brikText.match(/(\d+)\.\s*modul/i);
    const module = moduleMatch ? `${moduleMatch[1]}. modul` : '';

    // Room — last part after last bullet
    const parts = brikText.split('\u2022').map(s => s.trim());
    const room = parts.length >= 3 ? parts[parts.length - 1] : '';

    // Absid from data-brikid
    const brikId = activityLink?.getAttribute('data-brikid') || '';
    const absid = brikId.replace(/^ABS/, '');

    // Fravær percentage
    const fravaerText = desktopCells[2]?.textContent?.trim() || '0%';
    const fravaerPct = parseFloat(fravaerText.replace('%', '').replace(',', '.')) || 0;

    // Type: Fravær or Godskrevet
    const typeCell = desktopCells[3];
    const hasGodskrevet = !!typeCell?.querySelector('img[src*="ok.gif"]');
    const fravaerType: 'fravaer' | 'godskrevet' = hasGodskrevet ? 'godskrevet' : 'fravaer';

    // Registreret (registration date + teacher)
    const registreret = desktopCells[4]?.textContent?.trim() || '';

    // Bemærkning
    const bemaerkning = desktopCells[5]?.textContent?.trim() || '';

    let aarsag = '';
    let note = '';
    const aarsagCell = !isMissingReasonsTable ? desktopCells[6] : null;
    if (aarsagCell) {
      const aarsagParts = aarsagCell.innerHTML.split(/<br\s*\/?>/i);
      aarsag = aarsagParts[0]?.replace(/<[^>]*>/g, '').trim() || '';
      note = aarsagParts.slice(1).join(' ').replace(/<[^>]*>/g, '').trim() || '';
    }

    // Edit URL — last cell
    const editCell = desktopCells[desktopCells.length - 1];
    const editLink = editCell?.querySelector<HTMLAnchorElement>('a[href*="fravaer_aarsag"]');
    const editUrl = editLink?.getAttribute('href') || '';

    out.push({
      uge,
      date,
      dateISO,
      hold,
      teacher,
      room,
      module,
      activityUrl,
      activityBrikHtml,
      absid,
      fravaerPct,
      fravaerType,
      registreret,
      bemaerkning,
      aarsag,
      note,
      editUrl,
    });
  }
}

// ── Fetch and Parse ────────────────────────────────────────────────────

/**
 * Fetch the other fravær tab's page and parse its data.
 */
async function fetchOtherPage(currentPath: string): Promise<Document | null> {
  const isFravaersaarsager = currentPath.toLowerCase().includes('fravaersaarsager');
  const otherPath = isFravaersaarsager
    ? currentPath.replace(/fravaerelev_fravaersaarsager/i, 'fravaerelev')
    : currentPath.replace(/fravaerelev\.aspx/i, 'fravaerelev_fravaersaarsager.aspx');

  try {
    const url = new URL(otherPath, window.location.origin).href;
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) return null;

    const html = await response.text();
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  } catch (err) {
    console.error('[BetterLectio] Failed to fetch other fravær page:', err);
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Parse fravær data from the current page DOM only.
 */
export function parseFravaerFromDOM(): Partial<FravaerPageData> {
  const isOversigt = /\/subnav\/fravaerelev\.aspx/i.test(window.location.pathname);
  const isFravaersaarsager = /\/subnav\/fravaerelev_fravaersaarsager\.aspx/i.test(
    window.location.pathname
  );

  if (isOversigt) {
    return parseOversigt(document);
  } else if (isFravaersaarsager) {
    const { records, missingReasons, totals } = parseFravaersaarsager(document);
    const titleEl = document.querySelector('#s_m_HeaderContent_MainTitle');
    return {
      studentName: titleEl?.textContent?.trim()?.replace(/\s*-\s*Fravær.*$/i, '') || '',
      records,
      missingReasons,
      totals: totals as FravaerTotals | null,
    };
  }

  return {};
}

/**
 * Fetch and parse both fravær pages, combining all data.
 */
export async function fetchCombinedFravaerData(): Promise<FravaerPageData> {
  const isOversigt = /\/subnav\/fravaerelev\.aspx/i.test(window.location.pathname);

  let oversigtData: Partial<FravaerPageData>;
  let recordsData: { records: FravaerRecord[]; missingReasons: FravaerRecord[] };

  if (isOversigt) {
    oversigtData = parseOversigt(document);
    const otherDoc = await fetchOtherPage(window.location.pathname);
    if (otherDoc) {
      const parsed = parseFravaersaarsager(otherDoc);
      recordsData = { records: parsed.records, missingReasons: parsed.missingReasons };
    } else {
      recordsData = { records: [], missingReasons: [] };
    }
  } else {
    const parsed = parseFravaersaarsager(document);
    recordsData = { records: parsed.records, missingReasons: parsed.missingReasons };
    const otherDoc = await fetchOtherPage(window.location.pathname);
    if (otherDoc) {
      oversigtData = parseOversigt(otherDoc);
    } else {
      const titleEl = document.querySelector('#s_m_HeaderContent_MainTitle');
      oversigtData = {
        studentName: titleEl?.textContent?.trim()?.replace(/\s*-\s*Fravær.*$/i, '') || '',
        holds: [],
        totals: parsed.totals as FravaerTotals | null,
        warnings: [],
      };
    }
  }

  return {
    studentName: oversigtData.studentName || '',
    period: oversigtData.period || { start: '', end: '' },
    holds: oversigtData.holds || [],
    totals: oversigtData.totals || null,
    records: recordsData.records,
    missingReasons: recordsData.missingReasons,
    warnings: oversigtData.warnings || [],
    chartImageUrl: oversigtData.chartImageUrl || null,
  };
}

// ── Period Form Submission ─────────────────────────────────────────────

// Cache form fields from POST responses so subsequent period changes use fresh ViewState
let cachedOversigtFields: Record<string, string> | null = null;

function extractFormFields(root: Document | Element): Record<string, string> | null {
  const form = root.querySelector<HTMLFormElement>('#aspnetForm');
  if (!form) return null;

  const fields: Record<string, string> = {};
  const elements = form.elements;

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i] as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const name = el.getAttribute('name');
    if (!name) continue;

    if (el instanceof HTMLInputElement) {
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked) fields[name] = el.value || 'on';
      } else if (el.type !== 'submit' && el.type !== 'button' && el.type !== 'image') {
        fields[name] = el.value;
      }
    } else if (el instanceof HTMLSelectElement) {
      fields[name] = el.value;
    } else if (el instanceof HTMLTextAreaElement) {
      fields[name] = el.value;
    }
  }

  return fields;
}

/**
 * Submit period change and return combined data for the new range.
 */
export async function submitPeriodChange(
  start: string,
  end: string
): Promise<FravaerPageData | null> {
  const oversigtPath = window.location.pathname
    .replace(/fravaerelev_fravaersaarsager/i, 'fravaerelev');
  const oversigtUrl = new URL(oversigtPath, window.location.origin).href;

  // Get form fields for the oversigt page specifically
  let formData: Record<string, string> | null = null;
  if (cachedOversigtFields) {
    formData = { ...cachedOversigtFields };
  } else {
    // If we're on the oversigt page, extract directly from DOM
    const isOversigt = /\/subnav\/fravaerelev\.aspx/i.test(window.location.pathname);
    if (isOversigt) {
      formData = extractFormFields(document);
    } else {
      // We're on fraværsårsager — need to GET oversigt to obtain its form fields
      try {
        const resp = await fetch(oversigtUrl, { credentials: 'include' });
        if (resp.ok) {
          const html = await resp.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          formData = extractFormFields(doc);
        }
      } catch { /* fall through */ }
    }
  }
  if (!formData) return null;

  // Update period inputs
  formData['s$m$Content$Content$PeriodePicker$start$_date$tb'] = start;
  formData['s$m$Content$Content$PeriodePicker$end$_date$tb'] = end;
  formData['__EVENTTARGET'] = 's$m$Content$Content$VisPeriodeBtn';
  formData['__EVENTARGUMENT'] = '';

  try {
    const response = await fetch(oversigtUrl, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(formData).toString(),
    });

    if (!response.ok) return null;
    const html = await response.text();
    const parser = new DOMParser();
    const oversigtDoc = parser.parseFromString(html, 'text/html');
    const oversigtData = parseOversigt(oversigtDoc);

    // Cache fresh form fields from POST response for subsequent period changes
    cachedOversigtFields = extractFormFields(oversigtDoc);

    // Fetch fraværsårsager — this page has no period picker, so always returns all records.
    // Client-side filtering by period is done in the component.
    const aarsagerPath = oversigtPath.replace(/fravaerelev\.aspx/i, 'fravaerelev_fravaersaarsager.aspx');
    const aarsagerUrl = new URL(aarsagerPath, window.location.origin).href;

    let records: FravaerRecord[] = [];
    let missingReasons: FravaerRecord[] = [];

    try {
      const aarsagerResp = await fetch(aarsagerUrl, { credentials: 'include' });
      if (aarsagerResp.ok) {
        const aarsagerHtml = await aarsagerResp.text();
        const aarsagerDoc = parser.parseFromString(aarsagerHtml, 'text/html');
        const parsed = parseFravaersaarsager(aarsagerDoc);
        records = parsed.records;
        missingReasons = parsed.missingReasons;
      }
    } catch {
      // Continue without records
    }

    return {
      studentName: oversigtData.studentName || '',
      period: { start, end },
      holds: oversigtData.holds || [],
      totals: oversigtData.totals || null,
      records,
      missingReasons,
      warnings: oversigtData.warnings || [],
      chartImageUrl: oversigtData.chartImageUrl || null,
    };
  } catch (err) {
    console.error('[BetterLectio] Failed to submit period change:', err);
    return null;
  }
}

// ── Edit Reason ────────────────────────────────────────────────────────

export interface FravaerEditFormData {
  absid: string;
  editUrl: string;
  submitUrl: string;
  currentAarsag: string;
  currentNote: string;
  availableAarsager: Array<{ value: string; label: string }>;
  reasonFieldName: string;
  noteFieldName: string;
  saveTarget: string;
  formFields: Record<string, string>;
}

/**
 * Fetch the edit page for an absence record and extract form data.
 */
export async function fetchEditFormData(editUrl: string): Promise<FravaerEditFormData | null> {
  try {
    const resolvedEditUrl = new URL(editUrl, window.location.origin).href;
    const response = await fetch(resolvedEditUrl, { credentials: 'include' });
    if (!response.ok) return null;

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const form = doc.querySelector<HTMLFormElement>('#aspnetForm');
    const submitUrl = new URL(
      form?.getAttribute('action') || resolvedEditUrl,
      response.url || resolvedEditUrl,
    ).href;

    // Extract reason dropdown
    const reasonSelect = doc.querySelector<HTMLSelectElement>(
      '#s_m_Content_Content_StudentReasonDD_dd, ' +
      'select[name$="$StudentReasonDD$dd"], ' +
      '#s_m_Content_Content_AarsachDD, ' +
      'select[name$="$AarsachDD"]'
    );
    const currentAarsag = reasonSelect?.value || '';
    const availableAarsager = Array.from(reasonSelect?.options || []).map(opt => ({
      value: opt.value,
      label: opt.textContent?.trim() || '',
    }));
    const reasonFieldName =
      reasonSelect?.getAttribute('name') ||
      's$m$Content$Content$StudentReasonDD$dd';

    // Extract current note
    const noteInput = doc.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      '#s_m_Content_Content_cancelStudentNote_tb, ' +
      '[name$="$cancelStudentNote$tb"], ' +
      '#s_m_Content_Content_AarsachNoteTB_tb, ' +
      '[name$="$AarsachNoteTB$tb"]'
    );
    const currentNote = noteInput?.value || '';
    const noteFieldName =
      noteInput?.getAttribute('name') ||
      's$m$Content$Content$cancelStudentNote$tb';

    const saveButton = doc.querySelector<HTMLElement>(
      '#s_m_Content_Content_savecancelapplyBtn_svbtn, ' +
      'a[id$="savecancelapplyBtn_svbtn"], ' +
      '#s_m_Content_Content_SaveBtn, ' +
      'a[id$="SaveBtn"]'
    );
    const saveOnClick = saveButton?.getAttribute('onclick') || '';
    const saveTarget =
      saveOnClick.match(/WebForm_PostBackOptions\(\s*new WebForm_PostBackOptions\("([^"]+)"/)?.[1] ||
      saveOnClick.match(/__doPostBack\("([^"]+)"/)?.[1] ||
      's$m$Content$Content$savecancelapplyBtn$svbtn';

    // Extract absid from URL
    const absidMatch = resolvedEditUrl.match(/id=(\d+)/);
    const absid = absidMatch?.[1] || '';

    // Extract all form fields
    const formFields = extractFormFields(doc) || {};

    return {
      absid,
      editUrl: resolvedEditUrl,
      submitUrl,
      currentAarsag,
      currentNote,
      availableAarsager,
      reasonFieldName,
      noteFieldName,
      saveTarget,
      formFields,
    };
  } catch (err) {
    console.error('[BetterLectio] Failed to fetch edit form:', err);
    return null;
  }
}

/**
 * Submit an edited absence reason.
 */
export async function submitEditReason(
  formData: FravaerEditFormData,
  newAarsag: string,
  newNote: string
): Promise<boolean> {
  try {
    const fields = { ...formData.formFields };
    fields[formData.reasonFieldName] = newAarsag;
    fields[formData.noteFieldName] = newNote;
    fields['__EVENTTARGET'] = formData.saveTarget;
    fields['__EVENTARGUMENT'] = '';

    const response = await fetch(formData.submitUrl, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    });

    return response.ok;
  } catch (err) {
    console.error('[BetterLectio] Failed to submit edit reason:', err);
    return false;
  }
}
