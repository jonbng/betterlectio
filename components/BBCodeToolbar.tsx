import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';
import { Bold, Italic, Underline, Link, List, ListOrdered } from 'lucide-react';
import {
  toggleInlineFormat,
  insertLinkInEditor,
  insertUnorderedListAtCursor,
  insertOrderedListAtCursor,
  isFormatActive,
} from '@/components/WysiwygEditor';
import { sanitizeUrl } from '@/lib/bbcode-convert';
import { cn } from '@/lib/utils';

interface BBCodeToolbarPropsTextarea {
  textareaId: string;
  editorRef?: never;
  onFormat?: never;
}

interface BBCodeToolbarPropsEditor {
  textareaId?: never;
  editorRef: RefObject<HTMLDivElement | null>;
  onFormat?: () => void;
}

type BBCodeToolbarProps = BBCodeToolbarPropsTextarea | BBCodeToolbarPropsEditor;

// ── Textarea mode helpers (legacy) ────────────────────────────────────

function wrapSelection(textarea: HTMLTextAreaElement, before: string, after: string) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selected = text.substring(start, end);

  const newText = text.substring(0, start) + before + selected + after + text.substring(end);
  textarea.value = newText;

  if (selected.length === 0) {
    textarea.selectionStart = textarea.selectionEnd = start + before.length;
  } else {
    textarea.selectionStart = start + before.length;
    textarea.selectionEnd = start + before.length + selected.length;
  }

  textarea.focus();
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertLinkTextarea(
  textarea: HTMLTextAreaElement,
  url: string,
  text?: string,
  savedSelection?: { start: number; end: number },
) {
  const start = savedSelection?.start ?? textarea.selectionStart;
  const end = savedSelection?.end ?? textarea.selectionEnd;
  const value = textarea.value;
  const selected = value.substring(start, end);

  const safeUrl = sanitizeUrl(url);
  if (!safeUrl) return;

  const linkText = selected || text || safeUrl;
  const bbcode = `[url=${safeUrl}]${linkText}[/url]`;
  const newText = value.substring(0, start) + bbcode + value.substring(end);
  textarea.value = newText;
  textarea.selectionStart = textarea.selectionEnd = start + bbcode.length;

  textarea.focus();
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertListTextarea(textarea: HTMLTextAreaElement, ordered: boolean) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selected = text.substring(start, end);

  let listText: string;
  if (selected) {
    const items = selected
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    listText = items
      .map((line, index) => (ordered ? `${index + 1}. ${line}` : `• ${line}`))
      .join('\n');
  } else {
    listText = ordered ? '1. ' : '• ';
  }

  const newText = text.substring(0, start) + listText + text.substring(end);
  textarea.value = newText;

  // Place cursor at the first item text position for empty insertion
  if (!selected) {
    const cursorPos = start + listText.length;
    textarea.selectionStart = textarea.selectionEnd = cursorPos;
  } else {
    textarea.selectionStart = start;
    textarea.selectionEnd = start + listText.length;
  }

  textarea.focus();
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

// ── Link Popover ──────────────────────────────────────────────────────

interface LinkPopoverProps {
  onInsert: (url: string, text: string) => void;
  onCancel: () => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
}

function LinkPopover({ onInsert, onCancel, anchorRef }: LinkPopoverProps) {
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus URL input
  useEffect(() => {
    urlInputRef.current?.focus();
  }, []);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onCancel();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onCancel, anchorRef]);

  const handleSubmit = () => {
    if (url.trim()) {
      onInsert(url.trim(), text.trim());
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      ref={popoverRef}
      className="il-link-popover absolute left-0 top-[calc(100%+8px)] z-50 w-[260px] rounded-lg border border-border bg-popover p-3 shadow-xl"
      onKeyDown={handleKeyDown}
    >
      <div className="il-link-popover-field mb-2.5 flex flex-col gap-1.5">
        <label className="il-link-popover-label text-xs font-semibold uppercase tracking-wide text-muted-foreground">URL</label>
        <input
          ref={urlInputRef}
          type="text"
          className="il-link-popover-input h-8 rounded-md border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
          value={url}
          onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
          placeholder="https://..."
        />
      </div>
      <div className="il-link-popover-field mb-3 flex flex-col gap-1.5">
        <label className="il-link-popover-label text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tekst (valgfri)</label>
        <input
          type="text"
          className="il-link-popover-input h-8 rounded-md border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
          value={text}
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          placeholder="Linktekst"
        />
      </div>
      <div className="il-link-popover-actions flex justify-end gap-2">
        <button
          type="button"
          className="il-link-popover-cancel inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent"
          onClick={onCancel}
        >
          Annuller
        </button>
        <button
          type="button"
          className="il-link-popover-submit inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          onClick={handleSubmit}
        >
          Indsæt
        </button>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────

export function BBCodeToolbar(props: BBCodeToolbarProps) {
  const isEditorMode = !!props.editorRef;
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const linkBtnRef = useRef<HTMLButtonElement>(null);
  // Saved selection state for restoring after popover interaction
  const savedRangeRef = useRef<Range | null>(null);
  const savedTextareaSelRef = useRef<{ start: number; end: number } | null>(null);

  // Track active formats for contentEditable mode
  useEffect(() => {
    if (!isEditorMode) return;

    const updateActive = () => {
      const sel = window.getSelection();
      if (!sel || !props.editorRef?.current) return;
      // Only track if selection is inside our editor
      if (!props.editorRef.current.contains(sel.anchorNode)) return;

      const newActive = new Set<string>();
      for (const tag of ['B', 'I', 'U'] as const) {
        let isActive = isFormatActive(sel.anchorNode, tag, props.editorRef.current);
        // Also check aliases in DOM
        if (!isActive && tag === 'B') {
          isActive = isFormatActive(sel.anchorNode, 'STRONG', props.editorRef.current);
        }
        if (!isActive && tag === 'I') {
          isActive = isFormatActive(sel.anchorNode, 'EM', props.editorRef.current);
        }
        // When caret is collapsed, native command state reflects "future typing"
        // even if there is no wrapping element at the exact caret node.
        if (!isActive && sel.isCollapsed) {
          const command = tag === 'B' ? 'bold' : tag === 'I' ? 'italic' : 'underline';
          try {
            isActive = !!document.queryCommandState?.(command);
          } catch {
            // Ignore command-state errors in unsupported environments
          }
        }
        if (isActive) newActive.add(tag);
      }
      if (isFormatActive(sel.anchorNode, 'A', props.editorRef.current)) {
        newActive.add('A');
      }
      setActiveFormats(newActive);
    };

    document.addEventListener('selectionchange', updateActive);
    const editorEl = props.editorRef.current;
    editorEl?.addEventListener('keyup', updateActive);
    editorEl?.addEventListener('mouseup', updateActive);
    editorEl?.addEventListener('input', updateActive);
    editorEl?.addEventListener('focus', updateActive);

    return () => {
      document.removeEventListener('selectionchange', updateActive);
      editorEl?.removeEventListener('keyup', updateActive);
      editorEl?.removeEventListener('mouseup', updateActive);
      editorEl?.removeEventListener('input', updateActive);
      editorEl?.removeEventListener('focus', updateActive);
    };
  }, [isEditorMode, props.editorRef]);

  // ── Editor mode handlers ──

  const editorFormat = useCallback((tag: string) => {
    if (!props.editorRef?.current) return;
    props.editorRef.current.focus();
    toggleInlineFormat(props.editorRef.current, tag);
    props.onFormat?.();
  }, [props.editorRef, props.onFormat]);

  const openLinkPopover = useCallback(() => {
    // Save current selection before opening popover
    if (isEditorMode) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        savedRangeRef.current = sel.getRangeAt(0).cloneRange();
      }
    } else {
      const ta = props.textareaId
        ? (document.getElementById(props.textareaId) as HTMLTextAreaElement | null)
        : null;
      if (ta) {
        savedTextareaSelRef.current = { start: ta.selectionStart, end: ta.selectionEnd };
      }
    }
    setShowLinkPopover(true);
  }, [isEditorMode, props.textareaId]);

  const handleLinkInsert = useCallback((url: string, text: string) => {
    if (isEditorMode) {
      if (!props.editorRef?.current) return;
      insertLinkInEditor(props.editorRef.current, url, text, savedRangeRef.current || undefined);
      props.onFormat?.();
    } else {
      const ta = props.textareaId
        ? (document.getElementById(props.textareaId) as HTMLTextAreaElement | null)
        : null;
      if (ta) {
        insertLinkTextarea(ta, url, text, savedTextareaSelRef.current || undefined);
      }
    }
    savedRangeRef.current = null;
    savedTextareaSelRef.current = null;
    setShowLinkPopover(false);
  }, [isEditorMode, props.editorRef, props.onFormat, props.textareaId]);

  const handleLinkCancel = useCallback(() => {
    savedRangeRef.current = null;
    savedTextareaSelRef.current = null;
    setShowLinkPopover(false);
    // Restore focus
    if (isEditorMode) {
      props.editorRef?.current?.focus();
    }
  }, [isEditorMode, props.editorRef]);

  const handleUnorderedList = useCallback(() => {
    if (isEditorMode) {
      if (!props.editorRef?.current) return;
      props.editorRef.current.focus();
      insertUnorderedListAtCursor();
      props.onFormat?.();
    } else {
      const ta = props.textareaId
        ? (document.getElementById(props.textareaId) as HTMLTextAreaElement | null)
        : null;
      if (ta) insertListTextarea(ta, false);
    }
  }, [isEditorMode, props.editorRef, props.onFormat, props.textareaId]);

  const handleOrderedList = useCallback(() => {
    if (isEditorMode) {
      if (!props.editorRef?.current) return;
      props.editorRef.current.focus();
      insertOrderedListAtCursor();
      props.onFormat?.();
    } else {
      const ta = props.textareaId
        ? (document.getElementById(props.textareaId) as HTMLTextAreaElement | null)
        : null;
      if (ta) insertListTextarea(ta, true);
    }
  }, [isEditorMode, props.editorRef, props.onFormat, props.textareaId]);

  // ── Textarea mode handlers ──

  const getTextarea = () =>
    props.textareaId
      ? (document.getElementById(props.textareaId) as HTMLTextAreaElement | null)
      : null;

  const handleBold = isEditorMode
    ? () => editorFormat('B')
    : () => { const ta = getTextarea(); if (ta) wrapSelection(ta, '[b]', '[/b]'); };

  const handleItalic = isEditorMode
    ? () => editorFormat('I')
    : () => { const ta = getTextarea(); if (ta) wrapSelection(ta, '[i]', '[/i]'); };

  const handleUnderline = isEditorMode
    ? () => editorFormat('U')
    : () => { const ta = getTextarea(); if (ta) wrapSelection(ta, '[u]', '[/u]'); };

  return (
    <div
      className="il-bbcode-toolbar flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1"
      role="toolbar"
      aria-label="Tekstformatering"
    >
      <button
        type="button"
        className={cn(
          "il-bbcode-btn inline-flex size-8 items-center justify-center rounded-md border border-transparent bg-transparent text-foreground transition-colors hover:bg-accent",
          activeFormats.has('B') && "il-bbcode-btn-active border-border bg-accent text-accent-foreground",
        )}
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleBold}
        title="Fed (Ctrl+B)"
        aria-pressed={activeFormats.has('B')}
      >
        <Bold size={15} />
      </button>
      <button
        type="button"
        className={cn(
          "il-bbcode-btn inline-flex size-8 items-center justify-center rounded-md border border-transparent bg-transparent text-foreground transition-colors hover:bg-accent",
          activeFormats.has('I') && "il-bbcode-btn-active border-border bg-accent text-accent-foreground",
        )}
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleItalic}
        title="Kursiv (Ctrl+I)"
        aria-pressed={activeFormats.has('I')}
      >
        <Italic size={15} />
      </button>
      <button
        type="button"
        className={cn(
          "il-bbcode-btn inline-flex size-8 items-center justify-center rounded-md border border-transparent bg-transparent text-foreground transition-colors hover:bg-accent",
          activeFormats.has('U') && "il-bbcode-btn-active border-border bg-accent text-accent-foreground",
        )}
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleUnderline}
        title="Understreget (Ctrl+U)"
        aria-pressed={activeFormats.has('U')}
      >
        <Underline size={15} />
      </button>
      <div className="il-bbcode-separator mx-1 h-5 w-px bg-border" />
      <div className="il-bbcode-link-wrapper relative">
        <button
          ref={linkBtnRef}
          type="button"
          className={cn(
            "il-bbcode-btn inline-flex size-8 items-center justify-center rounded-md border border-transparent bg-transparent text-foreground transition-colors hover:bg-accent",
            activeFormats.has('A') && "il-bbcode-btn-active border-border bg-accent text-accent-foreground",
          )}
          onMouseDown={(e) => e.preventDefault()}
          onClick={openLinkPopover}
          title="Link (Ctrl+K)"
          aria-pressed={activeFormats.has('A')}
        >
          <Link size={15} />
        </button>
        {showLinkPopover && (
          <LinkPopover
            onInsert={handleLinkInsert}
            onCancel={handleLinkCancel}
            anchorRef={linkBtnRef}
          />
        )}
      </div>
      <button
        type="button"
        className="il-bbcode-btn inline-flex size-8 items-center justify-center rounded-md border border-transparent bg-transparent text-foreground transition-colors hover:bg-accent"
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleUnorderedList}
        title="Punktopstilling"
      >
        <List size={15} />
      </button>
      <button
        type="button"
        className="il-bbcode-btn inline-flex size-8 items-center justify-center rounded-md border border-transparent bg-transparent text-foreground transition-colors hover:bg-accent"
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleOrderedList}
        title="Nummereret liste"
      >
        <ListOrdered size={15} />
      </button>
    </div>
  );
}
