/**
 * Lightweight HTML sanitizer for Lectio-sourced content.
 * Strips dangerous elements (script, iframe, object, embed, form) and
 * event-handler attributes (onclick, onerror, etc.) to maintain
 * defense-in-depth against potential Lectio server compromise.
 */

const DANGEROUS_TAGS = new Set([
  'script', 'iframe', 'object', 'embed', 'form',
  'base', 'meta', 'link', 'style', 'noscript',
]);

const EVENT_ATTR_RE = /^on/i;

export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Remove dangerous elements
  for (const tag of DANGEROUS_TAGS) {
    const els = doc.body.querySelectorAll(tag);
    for (const el of els) el.remove();
  }

  // Strip event-handler attributes and javascript: hrefs
  const all = doc.body.querySelectorAll('*');
  for (const el of all) {
    const attrs = [...el.attributes];
    for (const attr of attrs) {
      if (EVENT_ATTR_RE.test(attr.name)) {
        el.removeAttribute(attr.name);
      }
    }
    if (el instanceof HTMLAnchorElement) {
      const href = el.getAttribute('href') || '';
      if (/^\s*javascript\s*:/i.test(href)) {
        el.removeAttribute('href');
      }
    }
  }

  return doc.body.innerHTML;
}
