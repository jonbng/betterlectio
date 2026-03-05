/**
 * ASP.NET WebForms utilities for interacting with Lectio pages.
 *
 * Lectio uses ASP.NET WebForms which relies on hidden form fields like
 * __VIEWSTATE, __EVENTVALIDATION, etc. for server-side state management.
 * This module provides utilities to extract those fields from HTML pages
 * and build proper POST data for form submissions.
 *
 * Based on patterns from: https://github.com/oscarspalk/lectio_wrapper
 */

import type { ASPFormData, ASPFormField, ExtractedForm } from "../types.js";

/**
 * The hidden fields that ASP.NET WebForms uses for state management.
 * Order matters — __VIEWSTATE must come after __VIEWSTATEX so that
 * __VIEWSTATEX isn't clobbered by a partial match.
 */
const ASP_HIDDEN_FIELDS = [
  "__VIEWSTATEX",
  "__EVENTVALIDATION",
  "__EVENTARGUMENT",
  "__SCROLLPOSITION",
  "__VIEWSTATEY_KEY",
  "__VIEWSTATE",
  "__VIEWSTATEGENERATOR",
  "masterfootervalue",
] as const;

/**
 * Regex to extract a hidden input's value by its id attribute.
 * Handles both single-quoted and double-quoted attributes, and
 * the value attribute appearing before or after the id attribute.
 */
function extractHiddenFieldValue(
  html: string,
  fieldId: string
): string | null {
  // Try id before value: <input id="__VIEWSTATE" value="..." />
  const pattern1 = new RegExp(
    `<input[^>]*\\bid=["']${escapeRegex(fieldId)}["'][^>]*\\bvalue=["']([^"']*)["']`,
    "i"
  );
  const match1 = pattern1.exec(html);
  if (match1) return match1[1];

  // Try value before id: <input value="..." id="__VIEWSTATE" />
  const pattern2 = new RegExp(
    `<input[^>]*\\bvalue=["']([^"']*)["'][^>]*\\bid=["']${escapeRegex(fieldId)}["']`,
    "i"
  );
  const match2 = pattern2.exec(html);
  if (match2) return match2[1];

  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract ASP.NET hidden form fields from an HTML page.
 * This is the equivalent of `extractASPData()` from the Dart reference.
 *
 * @param html - Raw HTML string of the page
 * @param target - The __EVENTTARGET value (the control that triggers the postback)
 * @returns Map of ASP.NET field names to their values
 */
export function extractASPData(
  html: string,
  target: string = ""
): ASPFormData {
  const data: ASPFormData = {
    __EVENTTARGET: target,
  };

  for (const fieldName of ASP_HIDDEN_FIELDS) {
    const value = extractHiddenFieldValue(html, fieldName);
    data[fieldName] = value ?? "";
  }

  return data;
}

/**
 * Execute a regex globally and collect all matches.
 * This avoids the `while ((match = re.exec()) !== null)` pattern
 * which triggers lint warnings for assignment in expressions.
 */
function execAll(regex: RegExp, str: string): RegExpExecArray[] {
  const results: RegExpExecArray[] = [];
  let m = regex.exec(str);
  while (m !== null) {
    results.push(m);
    m = regex.exec(str);
  }
  return results;
}

/**
 * Extract ALL form fields from the page (not just ASP.NET hidden ones).
 * Useful for understanding what a page expects and for debugging.
 *
 * Extracts:
 * - <input> elements (text, hidden, checkbox, radio, submit, etc.)
 * - <select> elements with their selected option
 * - <textarea> elements
 */
export function extractAllFormFields(html: string): ASPFormField[] {
  const fields: ASPFormField[] = [];

  // Extract <input> elements
  for (const match of execAll(/<input\b([^>]*)\/?\s*>/gi, html)) {
    const attrs = match[1];
    const name = getAttr(attrs, "name");
    const id = getAttr(attrs, "id");
    const type = getAttr(attrs, "type") ?? "text";
    const value = getAttr(attrs, "value") ?? "";

    if (!name && !id) continue;

    fields.push({
      name: name ?? id ?? "",
      id: id ?? name ?? "",
      type: type.toLowerCase(),
      value,
    });
  }

  // Extract <select> elements with selected option
  for (const match of execAll(
    /<select\b([^>]*)>([\s\S]*?)<\/select>/gi,
    html
  )) {
    const attrs = match[1];
    const inner = match[2];
    const name = getAttr(attrs, "name");
    const id = getAttr(attrs, "id");

    if (!name && !id) continue;

    // Find selected option
    const selectedMatch =
      /<option[^>]*\bselected\b[^>]*\bvalue=["']([^"']*)["']/i.exec(inner) ??
      /<option[^>]*\bvalue=["']([^"']*)["'][^>]*\bselected\b/i.exec(inner);
    const value = selectedMatch?.[1] ?? "";

    fields.push({
      name: name ?? id ?? "",
      id: id ?? name ?? "",
      type: "select",
      value,
    });
  }

  // Extract <textarea> elements
  for (const match of execAll(
    /<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi,
    html
  )) {
    const attrs = match[1];
    const inner = match[2];
    const name = getAttr(attrs, "name");
    const id = getAttr(attrs, "id");

    if (!name && !id) continue;

    fields.push({
      name: name ?? id ?? "",
      id: id ?? name ?? "",
      type: "textarea",
      value: decodeHtmlEntities(inner.trim()),
    });
  }

  return fields;
}

/**
 * Build URL-encoded POST body from ASP.NET data + custom form fields.
 *
 * This merges the ASP.NET hidden fields (viewstate, etc.) with any
 * additional fields you want to submit. This is the typical ASP.NET
 * WebForms pattern: GET page -> extract hidden fields -> POST back
 * with hidden fields + your custom data.
 */
export function buildPostBody(
  aspData: ASPFormData,
  extraFields?: Record<string, string>
): string {
  const params = new URLSearchParams();

  // Add ASP.NET fields
  for (const [key, value] of Object.entries(aspData)) {
    params.append(key, value);
  }

  // Add extra fields
  if (extraFields) {
    for (const [key, value] of Object.entries(extraFields)) {
      params.append(key, value);
    }
  }

  return params.toString();
}

/**
 * Full form extraction: returns the ASP.NET hidden fields, all other form
 * fields, and the raw form action URL if present.
 */
export function extractForm(html: string): ExtractedForm {
  const aspFields = extractASPData(html);
  const allFields = extractAllFormFields(html);
  const formAction = extractFormAction(html);

  // Separate ASP.NET fields from user-facing fields
  const aspFieldNames = new Set<string>([
    "__EVENTTARGET",
    ...ASP_HIDDEN_FIELDS,
  ]);
  const otherFields = allFields.filter(
    (f) => !aspFieldNames.has(f.name) && !aspFieldNames.has(f.id)
  );

  return {
    aspFields,
    formFields: otherFields,
    formAction,
  };
}

/**
 * Extract the form action attribute from the first <form> element.
 */
function extractFormAction(html: string): string | null {
  const match = /<form[^>]*\baction=["']([^"']*)["']/i.exec(html);
  return match ? decodeHtmlEntities(match[1]) : null;
}

/**
 * Find all ASP.NET postback targets in the page.
 * These are typically __doPostBack('target', 'arg') calls.
 */
export function extractPostbackTargets(html: string): Array<{
  target: string;
  argument: string;
  context: string;
}> {
  const targets: Array<{
    target: string;
    argument: string;
    context: string;
  }> = [];

  // Match __doPostBack('target', 'arg')
  const postbackRegex =
    /__doPostBack\(\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/g;
  for (const match of execAll(postbackRegex, html)) {
    const target = match[1];
    const argument = match[2];

    // Get some surrounding context (the link text or nearby text)
    const startIdx = Math.max(0, match.index - 200);
    const endIdx = Math.min(html.length, match.index + match[0].length + 100);
    const surrounding = html.slice(startIdx, endIdx);

    // Try to extract a meaningful label from nearby text
    const linkTextMatch =
      />([^<]{1,80})<\/a>/i.exec(surrounding) ??
      /title=["']([^"']{1,80})["']/i.exec(surrounding);
    const context = linkTextMatch?.[1]?.trim() ?? "";

    targets.push({ target, argument, context });
  }

  // Deduplicate by target+argument
  const seen = new Set<string>();
  return targets.filter((t) => {
    const key = `${t.target}::${t.argument}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Extract a specific element's value by its ASP.NET-style ID
 * (Lectio uses underscores in IDs like s_m_Content_Content_xxx).
 */
export function extractFieldById(html: string, id: string): string | null {
  // Input
  const inputMatch = new RegExp(
    `<input[^>]*\\bid=["']${escapeRegex(id)}["'][^>]*\\bvalue=["']([^"']*)["']`,
    "i"
  ).exec(html);
  if (inputMatch) return inputMatch[1];

  // Reverse order (value before id)
  const inputMatch2 = new RegExp(
    `<input[^>]*\\bvalue=["']([^"']*)["'][^>]*\\bid=["']${escapeRegex(id)}["']`,
    "i"
  ).exec(html);
  if (inputMatch2) return inputMatch2[1];

  // Select — find selected option
  const selectMatch = new RegExp(
    `<select[^>]*\\bid=["']${escapeRegex(id)}["'][^>]*>([\\s\\S]*?)</select>`,
    "i"
  ).exec(html);
  if (selectMatch) {
    const inner = selectMatch[1];
    const optMatch =
      /<option[^>]*\bselected\b[^>]*\bvalue=["']([^"']*)["']/i.exec(inner) ??
      /<option[^>]*\bvalue=["']([^"']*)["'][^>]*\bselected\b/i.exec(inner);
    return optMatch?.[1] ?? null;
  }

  // Textarea
  const textareaMatch = new RegExp(
    `<textarea[^>]*\\bid=["']${escapeRegex(id)}["'][^>]*>([\\s\\S]*?)</textarea>`,
    "i"
  ).exec(html);
  if (textareaMatch) return decodeHtmlEntities(textareaMatch[1].trim());

  // Span (for label text)
  const spanMatch = new RegExp(
    `<span[^>]*\\bid=["']${escapeRegex(id)}["'][^>]*>([\\s\\S]*?)</span>`,
    "i"
  ).exec(html);
  if (spanMatch) return decodeHtmlEntities(spanMatch[1].trim());

  return null;
}

// Helper to extract an HTML attribute value
function getAttr(attrs: string, name: string): string | null {
  const match = new RegExp(
    `\\b${name}=["']([^"']*)["']`,
    "i"
  ).exec(attrs);
  return match ? match[1] : null;
}

// Basic HTML entity decoding
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, num: string) =>
      String.fromCharCode(parseInt(num, 10))
    );
}
