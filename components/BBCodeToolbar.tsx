import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';
import { Bold, Italic, Underline, Link, List } from 'lucide-react';
import {
  toggleInlineFormat,
  insertLinkInEditor,
  insertHtmlAtCursor,
  isFormatActive,
} from '@/components/WysiwygEditor';
import { sanitizeUrl } from '@/lib/bbcode-convert';

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

function insertListTextarea(textarea: HTMLTextAreaElement) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selected = text.substring(start, end);

  let bbcode: string;
  if (selected) {
    const items = selected.split('\n').filter(Boolean).map((line) => `[*]${line}`).join('\n');
    bbcode = `[list]\n${items}\n[/list]`;
  } else {
    bbcode = '[list]\n[*]\n[/list]';
  }

  const newText = text.substring(0, start) + bbcode + text.substring(end);
  textarea.value = newText;
  // Place cursor after [*] if no selection
  if (!selected) {
    const cursorPos = start + '[list]\n[*]'.length;
    textarea.selectionStart = textarea.selectionEnd = cursorPos;
  } else {
    textarea.selectionStart = start;
    textarea.selectionEnd = start + bbcode.length;
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
    <div ref={popoverRef} className="il-link-popover" onKeyDown={handleKeyDown}>
      <div className="il-link-popover-field">
        <label className="il-link-popover-label">URL</label>
        <input
          ref={urlInputRef}
          type="text"
          className="il-link-popover-input"
          value={url}
          onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
          placeholder="https://..."
        />
      </div>
      <div className="il-link-popover-field">
        <label className="il-link-popover-label">Tekst (valgfri)</label>
        <input
          type="text"
          className="il-link-popover-input"
          value={text}
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          placeholder="Linktekst"
        />
      </div>
      <div className="il-link-popover-actions">
        <button type="button" className="il-link-popover-cancel" onClick={onCancel}>
          Annuller
        </button>
        <button type="button" className="il-link-popover-submit" onClick={handleSubmit}>
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
      for (const tag of ['B', 'I', 'U']) {
        if (isFormatActive(sel.anchorNode, tag, props.editorRef.current)) {
          newActive.add(tag);
        }
        // Also check aliases
        if (tag === 'B' && isFormatActive(sel.anchorNode, 'STRONG', props.editorRef.current)) {
          newActive.add(tag);
        }
        if (tag === 'I' && isFormatActive(sel.anchorNode, 'EM', props.editorRef.current)) {
          newActive.add(tag);
        }
      }
      if (isFormatActive(sel.anchorNode, 'A', props.editorRef.current)) {
        newActive.add('A');
      }
      setActiveFormats(newActive);
    };

    document.addEventListener('selectionchange', updateActive);
    return () => document.removeEventListener('selectionchange', updateActive);
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

  const handleList = useCallback(() => {
    if (isEditorMode) {
      if (!props.editorRef?.current) return;
      props.editorRef.current.focus();
      insertHtmlAtCursor('<ul><li>\u200B</li></ul>');
      props.onFormat?.();
    } else {
      const ta = props.textareaId
        ? (document.getElementById(props.textareaId) as HTMLTextAreaElement | null)
        : null;
      if (ta) insertListTextarea(ta);
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
    <div className="il-bbcode-toolbar" role="toolbar" aria-label="Tekstformatering">
      <button
        type="button"
        className={`il-bbcode-btn ${activeFormats.has('B') ? 'il-bbcode-btn-active' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleBold}
        title="Fed (Ctrl+B)"
        aria-pressed={activeFormats.has('B')}
      >
        <Bold size={15} />
      </button>
      <button
        type="button"
        className={`il-bbcode-btn ${activeFormats.has('I') ? 'il-bbcode-btn-active' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleItalic}
        title="Kursiv (Ctrl+I)"
        aria-pressed={activeFormats.has('I')}
      >
        <Italic size={15} />
      </button>
      <button
        type="button"
        className={`il-bbcode-btn ${activeFormats.has('U') ? 'il-bbcode-btn-active' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleUnderline}
        title="Understreget (Ctrl+U)"
        aria-pressed={activeFormats.has('U')}
      >
        <Underline size={15} />
      </button>
      <div className="il-bbcode-separator" />
      <div className="il-bbcode-link-wrapper">
        <button
          ref={linkBtnRef}
          type="button"
          className={`il-bbcode-btn ${activeFormats.has('A') ? 'il-bbcode-btn-active' : ''}`}
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
        className="il-bbcode-btn"
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleList}
        title="Liste"
      >
        <List size={15} />
      </button>
    </div>
  );
}
