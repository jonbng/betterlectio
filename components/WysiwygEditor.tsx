import { useRef, useEffect, useCallback, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import { bbcodeToHtml, htmlToBBCode, sanitizeHtml, sanitizeUrl } from '@/lib/bbcode-convert';
import { BBCodeToolbar } from '@/components/BBCodeToolbar';
import { cn } from '@/lib/utils';

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
  const [isEmpty, setIsEmpty] = useState(true);
  // Ref to always-current syncBBCode to avoid stale closures in debounce
  const syncBBCodeRef = useRef<() => void>(() => {});

  const syncBBCode = useCallback(() => {
    if (!editorRef.current) return;
    const bbcode = htmlToBBCode(editorRef.current.innerHTML);
    onBBCodeChange(bbcode);
  }, [onBBCodeChange]);

  // Keep ref current
  syncBBCodeRef.current = syncBBCode;

  const insertManualParagraph = useCallback(() => {
    if (document.queryCommandSupported?.('insertParagraph')) {
      const inserted = document.execCommand('insertParagraph');
      if (!inserted) {
        insertHtmlAtCursor('<br>');
      }
    } else {
      insertHtmlAtCursor('<br>');
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => syncBBCodeRef.current(), 50);
  }, []);

  // Set initial content — [] deps is intentional: editor owns content after mount, use key prop to reset
  useEffect(() => {
    if (editorRef.current && initialBBCode) {
      editorRef.current.innerHTML = bbcodeToHtml(initialBBCode);
    }
    // Sync empty state on mount (with or without initial content)
    queueMicrotask(() => {
      const html = editorRef.current?.innerHTML ?? '';
      setIsEmpty(isEditorHtmlEmpty(html));
    });
  }, []);

  const handleInput = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => syncBBCodeRef.current(), 50);
    const html = editorRef.current?.innerHTML ?? '';
    setIsEmpty(isEditorHtmlEmpty(html));
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
    queueMicrotask(() => {
      const html2 = editorRef.current?.innerHTML ?? '';
      setIsEmpty(isEditorHtmlEmpty(html2));
    });
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;

    if (e.key === 'Escape') {
      e.preventDefault();
      editorRef.current?.blur();
      return;
    }

    if (e.key === 'Enter' && !mod) {
      // Fallback if the capture-phase handler did not intercept first.
      e.preventDefault();
      e.stopPropagation();
      (e as any).stopImmediatePropagation?.();
      insertManualParagraph();
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
  }, [onSubmit, insertManualParagraph]);

  // Intercept Enter in capture phase so host page key handlers cannot steal it.
  useEffect(() => {
    const onWindowKeyDownCapture = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (e.key !== 'Enter' || mod) return;
      if (!editorRef.current) return;
      const target = e.target as Node | null;
      if (!target || !editorRef.current.contains(target)) return;

      e.preventDefault();
      e.stopPropagation();
      (e as any).stopImmediatePropagation?.();
      insertManualParagraph();
    };

    window.addEventListener('keydown', onWindowKeyDownCapture, true);
    return () => window.removeEventListener('keydown', onWindowKeyDownCapture, true);
  }, [insertManualParagraph]);

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
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border bg-background focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20",
        className,
      )}
    >
      <BBCodeToolbar editorRef={editorRef} onFormat={() => syncBBCodeRef.current()} />
      <div className="relative">
        {isEmpty && (
          <div className="pointer-events-none absolute left-3 top-2.5 text-base text-muted-foreground/70">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          className={cn(
            "min-h-24 max-h-72 overflow-y-auto px-3 py-2.5 text-base leading-relaxed text-foreground outline-none",
            "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
            "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-6",
            "[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-6",
            "[&_li]:my-0.5",
          )}
          contentEditable
          onInput={handleInput}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
}

// ── DOM formatting helpers ───────────────────────────────────────────

function isEditorHtmlEmpty(html: string): boolean {
  const cleaned = html
    .replace(/&nbsp;/g, ' ')
    .replace(/\u200B/g, '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<div><\/div>/gi, '')
    .replace(/<p><\/p>/gi, '')
    .replace(/<p>\s*<\/p>/gi, '')
    .trim();
  return cleaned.length === 0;
}

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
 * Insert an unordered list and place caret inside the first list item.
 */
export function insertUnorderedListAtCursor(): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const range = sel.getRangeAt(0);
  range.deleteContents();

  const ul = document.createElement('ul');
  const li = document.createElement('li');
  const text = document.createTextNode('\u200B');
  li.appendChild(text);
  ul.appendChild(li);

  range.insertNode(ul);

  // Keep caret inside the first bullet item so typing starts there.
  const newRange = document.createRange();
  newRange.setStart(text, 1);
  newRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(newRange);
}

/**
 * Insert an ordered list and place caret inside the first list item.
 */
export function insertOrderedListAtCursor(): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const range = sel.getRangeAt(0);
  range.deleteContents();

  const ol = document.createElement('ol');
  const li = document.createElement('li');
  const text = document.createTextNode('\u200B');
  li.appendChild(text);
  ol.appendChild(li);

  range.insertNode(ol);

  // Keep caret inside the first numbered item so typing starts there.
  const newRange = document.createRange();
  newRange.setStart(text, 1);
  newRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(newRange);
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

  // Prefer native editing commands for proper "typing state" behavior:
  // toggling bold/italic/underline at a collapsed caret should only affect
  // text typed from that point forward, not previously typed text.
  const command =
    tagName.toUpperCase() === 'B' ? 'bold' :
    tagName.toUpperCase() === 'I' ? 'italic' :
    tagName.toUpperCase() === 'U' ? 'underline' :
    '';

  if (command && document.queryCommandSupported?.(command)) {
    editor.focus();
    document.execCommand(command, false);
    return;
  }

  // Fallback path for environments where execCommand is unavailable.
  const range = sel.getRangeAt(0);
  const existingEl = findAncestorTag(sel.anchorNode, tagName, editor);
  if (existingEl) {
    unwrapElement(existingEl);
    return;
  }
  if (range.collapsed) {
    const el = document.createElement(tagName.toLowerCase());
    el.appendChild(document.createTextNode('\u200B'));
    range.insertNode(el);
    const newRange = document.createRange();
    newRange.setStart(el.firstChild!, 1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    return;
  }
  const el = document.createElement(tagName.toLowerCase());
  try {
    range.surroundContents(el);
  } catch {
    const contents = range.extractContents();
    el.appendChild(contents);
    range.insertNode(el);
  }
  const newRange = document.createRange();
  newRange.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(newRange);
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
