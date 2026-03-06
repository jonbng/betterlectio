// BBCode ↔ HTML conversion utilities for WYSIWYG editor

/**
 * Sanitize a URL: allowlist https?, //, mailto: protocols.
 * Anything else gets https:// prepended. Strips javascript: etc.
 */
export function sanitizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Allow safe protocols (case-insensitive)
  if (/^(https?:\/\/|\/\/|mailto:)/i.test(trimmed)) return trimmed;
  // Block dangerous protocols
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return `https://${trimmed.replace(/^[a-z][a-z0-9+.-]*:\s*/i, '')}`;
  // Bare domain or path — prepend https://
  return `https://${trimmed}`;
}

/**
 * Convert BBCode to safe HTML for contentEditable display.
 * Escapes raw HTML first (XSS prevention), then replaces BBCode tags.
 */
export function bbcodeToHtml(bbcode: string): string {
  if (!bbcode) return '';

  // Escape HTML entities first
  let html = bbcode
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Replace BBCode tags with multi-pass for nested tags (max 10 iterations)
  for (let pass = 0; pass < 10; pass++) {
    const prev = html;
    html = html.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<b>$1</b>');
    html = html.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '<i>$1</i>');
    html = html.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<u>$1</u>');
    if (html === prev) break;
  }

  // [url=HREF]TEXT[/url] — sanitize href
  html = html.replace(
    /\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi,
    (_m, href: string, text: string) => {
      const safe = sanitizeUrl(decodeHtmlEntities(href));
      return `<a href="${escapeAttr(safe)}" rel="noopener noreferrer" target="_blank">${text}</a>`;
    },
  );
  // [url]HREF[/url] (bare URL form) — sanitize href
  html = html.replace(
    /\[url\]([\s\S]*?)\[\/url\]/gi,
    (_m, href: string) => {
      const safe = sanitizeUrl(decodeHtmlEntities(href));
      return `<a href="${escapeAttr(safe)}" rel="noopener noreferrer" target="_blank">${escapeHtml(safe)}</a>`;
    },
  );

  // [list] / [list=1] with [*] items
  html = html.replace(
    /\[list(?:=(\d+))?\]([\s\S]*?)\[\/list\]/gi,
    (_m, ordered: string | undefined, inner: string) => {
      const tag = ordered ? 'ol' : 'ul';
      const items = inner
        .split(/\[\*\]/gi)
        .filter((s) => s.trim())
        .map((s) => `<li>${s.trim()}</li>`)
        .join('');
      return `<${tag}>${items}</${tag}>`;
    },
  );

  // Newlines to <br>
  html = html.replace(/\n/g, '<br>');

  return html;
}

/** Decode common HTML entities back to characters (for URL processing) */
function decodeHtmlEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

/**
 * Convert contentEditable HTML back to BBCode.
 * Walks the DOM tree to produce clean BBCode output.
 */
export function htmlToBBCode(html: string): string {
  if (!html) return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';

  return walkNode(root).replace(/\n{3,}/g, '\n\n').trim();
}

function walkNode(node: Node): string {
  let result = '';

  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];

    if (child.nodeType === Node.TEXT_NODE) {
      // Strip zero-width spaces from output
      result += (child.textContent || '').replace(/\u200B/g, '');
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const el = child as HTMLElement;
    const tag = el.tagName.toUpperCase();
    const inner = walkNode(el);

    switch (tag) {
      case 'B':
      case 'STRONG':
        result += `[b]${inner}[/b]`;
        break;
      case 'I':
      case 'EM':
        result += `[i]${inner}[/i]`;
        break;
      case 'U':
        result += `[u]${inner}[/u]`;
        break;
      case 'A': {
        const href = el.getAttribute('href') || '';
        if (href && inner === href) {
          result += `[url]${inner}[/url]`;
        } else if (href) {
          result += `[url=${href}]${inner}[/url]`;
        } else {
          result += inner;
        }
        break;
      }
      case 'UL':
        result += `[list]${inner}[/list]`;
        break;
      case 'OL':
        result += `[list=1]${inner}[/list]`;
        break;
      case 'LI':
        result += `[*]${inner}\n`;
        break;
      case 'BR':
        result += '\n';
        break;
      case 'DIV':
      case 'P':
        // Block elements: add newline before content (unless first child)
        if (i > 0) result += '\n';
        result += inner;
        break;
      default:
        result += inner;
        break;
    }
  }

  return result;
}

/**
 * Sanitize pasted HTML, keeping only safe formatting elements.
 * Strips everything except B/STRONG/I/EM/U/A/BR/UL/OL/LI, removes attributes except href on <a>.
 */
export function sanitizeHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';

  return sanitizeNode(root, true);
}

const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'A', 'BR', 'DIV', 'P', 'SPAN', 'UL', 'OL', 'LI',
]);

// Normalize tag names: STRONG→B, EM→I
const TAG_MAP: Record<string, string> = {
  STRONG: 'B',
  EM: 'I',
};

function sanitizeNode(node: Node, isFirst = false): string {
  let result = '';
  let hasEmitted = false;

  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = escapeHtml(child.textContent || '');
      if (text) hasEmitted = true;
      result += text;
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const el = child as HTMLElement;
    const tag = el.tagName.toUpperCase();
    const inner = sanitizeNode(el);

    if (tag === 'BR') {
      result += '<br>';
      hasEmitted = true;
      continue;
    }

    if (tag === 'DIV' || tag === 'P') {
      // Skip leading <br> for first block element when no content emitted yet
      if (isFirst && !hasEmitted) {
        result += inner;
      } else {
        result += `<br>${inner}`;
      }
      hasEmitted = true;
      continue;
    }

    if (!ALLOWED_TAGS.has(tag)) {
      // Unwrap: keep inner content but drop the tag
      if (inner) hasEmitted = true;
      result += inner;
      continue;
    }

    const outTag = (TAG_MAP[tag] || tag).toLowerCase();

    if (outTag === 'a') {
      const href = el.getAttribute('href');
      if (href) {
        const safe = sanitizeUrl(href);
        result += `<a href="${escapeAttr(safe)}" rel="noopener noreferrer" target="_blank">${inner}</a>`;
      } else {
        result += inner;
      }
    } else if (outTag === 'span') {
      // Spans carry no formatting — unwrap
      result += inner;
    } else if (outTag === 'ul' || outTag === 'ol' || outTag === 'li') {
      result += `<${outTag}>${inner}</${outTag}>`;
    } else {
      result += `<${outTag}>${inner}</${outTag}>`;
    }
    if (inner) hasEmitted = true;
  }

  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
