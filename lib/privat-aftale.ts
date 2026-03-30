// ── Private appointment (Privat aftale) fetch + submit ──────────────────
//
// Fetches the privat_aftale.aspx form page, extracts ASP.NET tokens, and
// submits create/edit/delete via hidden iframe POST — no page reload.

import {
  postFormViaHiddenIframe,
  parseFormTokensFromDoc,
  isSessionExpired,
} from './iframe-post';
import { captureException } from './posthog';

// ── Types ───────────────────────────────────────────────────────────────

export interface PrivatAftaleForm {
  /** ASP.NET tokens + action URL extracted from the form page */
  tokens: Record<string, string>;
  action: string;
  /** Pre-filled values (when editing an existing appointment) */
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  comment: string;
  /** true when the form has a delete button (editing existing) */
  canDelete: boolean;
}

// ── Fetch + parse the form page ─────────────────────────────────────────

/**
 * Fetch `privat_aftale.aspx` and extract the form fields + ASP.NET tokens.
 * The `url` should be the full href from the "Privat aftale" link.
 */
export async function fetchPrivatAftaleForm(url: string): Promise<PrivatAftaleForm> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to fetch privat_aftale form: ${res.status}`);

  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');

  if (isSessionExpired(doc)) {
    throw new Error('Session expired');
  }

  // Check for error page
  const mainTitle = doc.querySelector('#MainTitle')?.textContent?.trim();
  if (mainTitle === 'Fejl') {
    throw new Error('Lectio returned an error page');
  }

  const { tokens, action } = parseFormTokensFromDoc(doc);

  // Extract current field values
  const title = (doc.getElementById('m_Content_titelTextBox_tb') as HTMLInputElement)?.value ?? '';
  const startDate = (doc.getElementById('m_Content_startdateCtrl__date_tb') as HTMLInputElement)?.value ?? '';
  const startTime = (doc.getElementById('m_Content_startdateCtrl_startdateCtrl_time_tb') as HTMLInputElement)?.value ?? '';
  const endDate = (doc.getElementById('m_Content_enddateCtrl__date_tb') as HTMLInputElement)?.value ?? '';
  const endTime = (doc.getElementById('m_Content_enddateCtrl_enddateCtrl_time_tb') as HTMLInputElement)?.value ?? '';
  const comment = (doc.getElementById('m_Content_commentTextBox_tb') as HTMLTextAreaElement)?.value ?? '';

  // Check if delete button exists (editing an existing appointment)
  const deleteBtn = doc.getElementById('m_Content_savebuttonsCtrl_db');
  const canDelete = !!deleteBtn;

  return { tokens, action, title, startDate, startTime, endDate, endTime, comment, canDelete };
}

// ── Submit the form ─────────────────────────────────────────────────────

interface SubmitPrivatAftaleParams {
  form: PrivatAftaleForm;
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  comment: string;
}

/**
 * Submit (create or save) a private appointment via hidden iframe POST.
 * Returns the response Document for error checking.
 */
export async function submitPrivatAftale(params: SubmitPrivatAftaleParams): Promise<void> {
  const { form, title, startDate, startTime, endDate, endTime, comment } = params;

  const fields: Record<string, string> = {
    ...form.tokens,
    // Form field names from the Lectio form
    'm$Content$titelTextBox$tb': title,
    'm$Content$startdateCtrl$_date$tb': startDate,
    'm$Content$startdateCtrl$startdateCtrl_time$tb': startTime,
    'm$Content$enddateCtrl$_date$tb': endDate,
    'm$Content$enddateCtrl$enddateCtrl_time$tb': endTime,
    'm$Content$commentTextBox$tb': comment,
    // Trigger the save button postback
    '__EVENTTARGET': 'm$Content$savebuttonsCtrl$svbtn',
    '__EVENTARGUMENT': '',
  };

  try {
    const responseDoc = await postFormViaHiddenIframe(form.action, fields);

    if (isSessionExpired(responseDoc)) {
      throw new Error('Session expired');
    }

    // Check if the response contains validation errors
    const alerts = responseDoc.querySelectorAll('.alert.validator:not([style*="display:none"])');
    const visibleAlerts = Array.from(alerts).filter((el) => {
      const style = (el as HTMLElement).style;
      return style.display !== 'none' && el.textContent?.trim();
    });

    if (visibleAlerts.length > 0) {
      const messages = visibleAlerts.map((el) => el.textContent?.trim()).filter(Boolean);
      throw new Error(`Validation error: ${messages.join(', ')}`);
    }
  } catch (err) {
    captureException(err, undefined, { source: 'privat-aftale-submit' });
    throw err;
  }
}

/**
 * Delete an existing private appointment via hidden iframe POST.
 */
export async function deletePrivatAftale(form: PrivatAftaleForm): Promise<void> {
  if (!form.canDelete) throw new Error('Cannot delete — no delete button available');

  const fields: Record<string, string> = {
    ...form.tokens,
    '__EVENTTARGET': 'm$Content$savebuttonsCtrl$db',
    '__EVENTARGUMENT': 'Delete',
  };

  try {
    const responseDoc = await postFormViaHiddenIframe(form.action, fields);
    if (isSessionExpired(responseDoc)) {
      throw new Error('Session expired');
    }
  } catch (err) {
    captureException(err, undefined, { source: 'privat-aftale-delete' });
    throw err;
  }
}
