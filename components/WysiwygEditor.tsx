import { useRef, useEffect, useCallback } from 'preact/hooks';
import type { RefObject } from 'preact';
import { bbcodeToHtml, htmlToBBCode, sanitizeHtml, sanitizeUrl } from '@/lib/bbcode-convert';
import { BBCodeToolbar } from '@/components/BBCodeToolbar';

interface WysiwygEditorProps {
  initialBBCode?: string;
  onBBCodeChange: (bbcode: string) => void;
  placeholder?: string;
  className?: string;
  onSubmit?: () => void;
  /** Ref that receives a forceSyncAndGet function for external callers */
  syncRef?: RefObject<(() => string) | null>;
}

export function WysiwygEditor({
  initialBBCode,
  onBBCodeChange,
  placeholder = 'Skriv her...',
  className,
  onSubmit,
  syncRef,
}: WysiwygEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref to always-current syncBBCode to avoid stale closures in debounce
  const syncBBCodeRef = useRef<() => void>(() => {});

  const syncBBCode = useCallback(() => {
    if (!editorRef.current) return;
    const bbcode = htmlToBBCode(editorRef.current.innerHTML);
    onBBCodeChange(bbcode);
  }, [onBBCodeChange]);

  // Keep ref current
  syncBBCodeRef.current = syncBBCode;

  // Set initial content — [] deps is intentional: editor owns content after mount, use key prop to reset
  useEffect(() => {
    if (editorRef.current && initialBBCode) {
      editorRef.current.innerHTML = bbcodeToHtml(initialBBCode);
    }
  }, []);

  const handleInput = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => syncBBCodeRef.current(), 50);
  }, []);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    e.preventDefault();

    const html = e.clipboardData?.getData('text/html');
    const text = e.clipboardData?.getData('text/plain') || '';

    if (html) {
      const clean = sanitizeHtml(html);
      insertHtmlAtCursor(clean);
    } else {
      // Plain text: escape HTML and convert newlines to <br>
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      insertHtmlAtCursor(escaped);
    }

    // Sync after paste
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => syncBBCodeRef.current(), 50);
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;

    if (e.key === 'Escape') {
      e.preventDefault();
      editorRef.current?.blur();
      return;
    }

    if (mod && e.key === 'Enter') {
      e.preventDefault();
      onSubmit?.();
      return;
    }

    if (mod && !e.shiftKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          // Note: DOM manipulation via toggleInlineFormat breaks native undo stack
          toggleInlineFormat(editorRef.current!, 'B');
          syncBBCodeRef.current();
          break;
        case 'i':
          e.preventDefault();
          toggleInlineFormat(editorRef.current!, 'I');
          syncBBCodeRef.current();
          break;
        case 'u':
          e.preventDefault();
          toggleInlineFormat(editorRef.current!, 'U');
          syncBBCodeRef.current();
          break;
      }
    }
  }, [onSubmit]);

  /** Force-sync and return current BBCode (for external callers) */
  const forceSyncAndGet = useCallback((): string => {
    if (!editorRef.current) return '';
    return htmlToBBCode(editorRef.current.innerHTML);
  }, []);

  // Expose forceSyncAndGet via syncRef prop
  useEffect(() => {
    if (syncRef) {
      syncRef.current = forceSyncAndGet;
    }
    // Legacy DOM attachment for backward compatibility
    if (editorRef.current) {
      (editorRef.current as any)._forceSyncAndGet = forceSyncAndGet;
    }
  }, [forceSyncAndGet, syncRef]);

  return (
    <div className={`il-wysiwyg-editor ${className || ''}`}>
      <BBCodeToolbar editorRef={editorRef} onFormat={() => syncBBCodeRef.current()} />
      <div
        ref={editorRef}
        className="il-wysiwyg-content"
        contentEditable
        data-placeholder={placeholder}
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}

// ── DOM formatting helpers ───────────────────────────────────────────

export function insertHtmlAtCursor(html: string): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const range = sel.getRangeAt(0);
  range.deleteContents();

  const temp = document.createElement('div');
  temp.innerHTML = html;
  const frag = document.createDocumentFragment();
  let lastNode: Node | null = null;
  while (temp.firstChild) {
    lastNode = frag.appendChild(temp.firstChild);
  }
  range.insertNode(frag);

  // Move cursor to end of inserted content
  if (lastNode) {
    const newRange = document.createRange();
    newRange.setStartAfter(lastNode);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }
}

/**
 * Toggle an inline format (B/I/U) on the current selection.
 * If the selection is already wrapped in the tag, unwrap it.
 * Otherwise, wrap it in the tag.
 *
 * Note: This uses direct DOM manipulation which breaks the native undo/redo stack.
 */
export function toggleInlineFormat(editor: HTMLElement, tagName: string): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const range = sel.getRangeAt(0);

  // Check if we're inside this format already
  const existingEl = findAncestorTag(sel.anchorNode, tagName, editor);

  if (existingEl) {
    // Unwrap: move children out of the element
    unwrapElement(existingEl);
  } else if (range.collapsed) {
    // No selection: create empty element and place cursor inside
    const el = document.createElement(tagName.toLowerCase());
    el.appendChild(document.createTextNode('\u200B')); // zero-width space
    range.insertNode(el);
    // Place cursor inside
    const newRange = document.createRange();
    newRange.setStart(el.firstChild!, 1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  } else {
    // Wrap selection in the tag
    const el = document.createElement(tagName.toLowerCase());
    try {
      range.surroundContents(el);
    } catch {
      // If surroundContents fails (partial selection across elements),
      // extract and wrap
      const contents = range.extractContents();
      el.appendChild(contents);
      range.insertNode(el);
    }
    // Select the wrapped content
    const newRange = document.createRange();
    newRange.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }
}

/**
 * Insert a link element into the contentEditable editor.
 * Called from BBCodeToolbar's link popover with pre-validated params.
 */
export function insertLinkInEditor(
  editor: HTMLElement,
  url: string,
  text?: string,
  savedRange?: Range,
): void {
  const sel = window.getSelection();
  if (!sel) return;

  // Restore saved selection if provided
  if (savedRange) {
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }

  if (sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  const selectedText = range.toString();

  const safeUrl = sanitizeUrl(url);
  if (!safeUrl) return;

  // Check if already inside a link
  const existingLink = findAncestorTag(sel.anchorNode, 'A', editor);
  if (existingLink) {
    if (url === '') {
      unwrapElement(existingLink);
    } else {
      (existingLink as HTMLAnchorElement).href = safeUrl;
      (existingLink as HTMLAnchorElement).rel = 'noopener noreferrer';
      (existingLink as HTMLAnchorElement).target = '_blank';
    }
    return;
  }

  const a = document.createElement('a');
  a.href = safeUrl;
  a.rel = 'noopener noreferrer';
  a.target = '_blank';

  if (selectedText) {
    try {
      range.surroundContents(a);
    } catch {
      const contents = range.extractContents();
      a.appendChild(contents);
      range.insertNode(a);
    }
  } else {
    a.textContent = text || safeUrl;
    range.insertNode(a);

    const newRange = document.createRange();
    newRange.setStartAfter(a);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }
}

/**
 * Check if a format tag is active at the current selection.
 */
export function isFormatActive(
  node: Node | null,
  tagName: string,
  editor: HTMLElement,
): boolean {
  return !!findAncestorTag(node, tagName, editor);
}

function findAncestorTag(
  node: Node | null,
  tagName: string,
  boundary: HTMLElement,
): HTMLElement | null {
  let current = node;
  while (current && current !== boundary) {
    if (
      current.nodeType === Node.ELEMENT_NODE &&
      (current as HTMLElement).tagName.toUpperCase() === tagName.toUpperCase()
    ) {
      return current as HTMLElement;
    }
    current = current.parentNode;
  }
  return null;
}

function unwrapElement(el: HTMLElement): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  parent.removeChild(el);
}
