import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'preact/compat';
import {
  Bug,
  Camera,
  CheckCircle2,
  ImagePlus,
  Lightbulb,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Send,
  X,
} from 'lucide-react';

import { ensureSupabaseSession } from '@/lib/supabase/session';
import {
  submitFeedback,
  type FeedbackCategory,
} from '@/lib/supabase/resources/feedback';
import {
  canCaptureScreen,
  captureScreenSnapshot,
} from '@/lib/screen-capture';
import { capture, getDistinctId } from '@/lib/posthog';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = {
  schoolId: string | number | null | undefined;
  studentId: string | null | undefined;
  browserInfo?: string;
  lectioVersion?: string;
};

const CATEGORIES: {
  id: FeedbackCategory;
  label: string;
  hint: string;
  icon: typeof Bug;
}[] = [
  {
    id: 'bug',
    label: 'Fejl',
    hint: 'Hvad gik galt, og hvad lavede du lige før?',
    icon: Bug,
  },
  {
    id: 'idea',
    label: 'Idé',
    hint: 'Hvad mangler eller kunne fungere bedre?',
    icon: Lightbulb,
  },
  {
    id: 'other',
    label: 'Andet',
    hint: 'Skriv din besked her',
    icon: MoreHorizontal,
  },
];

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

async function fileToBase64(file: File): Promise<{
  base64: string;
  mimeType: string;
  byteSize: number;
  width?: number;
  height?: number;
}> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength > 1_500_000) {
    throw new Error('Billedet er for stort (max ~1,5 MB)');
  }
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const base64 = btoa(binary);

  let width: number | undefined;
  let height: number | undefined;
  if (file.type.startsWith('image/')) {
    try {
      const bmp = await createImageBitmap(file);
      width = bmp.width;
      height = bmp.height;
      bmp.close();
    } catch {
      /* ignore */
    }
  }

  return {
    base64,
    mimeType: file.type || 'image/jpeg',
    byteSize: bytes.byteLength,
    width,
    height,
  };
}

export function FeedbackWidget({
  schoolId,
  studentId,
  browserInfo,
  lectioVersion,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const screenCaptureAvailable = useMemo(() => canCaptureScreen(), []);

  const schoolIdNum = useMemo(() => {
    if (typeof schoolId === 'number') return schoolId;
    if (typeof schoolId === 'string' && schoolId) {
      const n = parseInt(schoolId, 10);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }, [schoolId]);

  const busy = sending || capturing;
  const canSubmit =
    Boolean(studentId && schoolIdNum && message.trim()) && !busy;

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Reset form shortly after close so exit animation stays clean
  useEffect(() => {
    if (open) return;
    const t = window.setTimeout(() => {
      setDone(false);
      setError(null);
      setSending(false);
      setCapturing(false);
      setCategory('bug');
      setMessage('');
      setFile(null);
    }, 220);
    return () => window.clearTimeout(t);
  }, [open]);

  // Escape + click outside to close. No body scroll lock — corner popover.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };

    const onPointerDown = (e: MouseEvent | PointerEvent) => {
      if (busy) return;
      const root = rootRef.current;
      if (!root) return;
      if (e.target instanceof Node && !root.contains(e.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    const t = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true);
    }, 0);

    requestAnimationFrame(() => {
      if (!done) textareaRef.current?.focus();
    });

    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open, busy, done]);

  const hint = CATEGORIES.find((c) => c.id === category)?.hint ?? '';

  const acceptFile = (f: File | null | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setError('Kun billeder (JPEG, PNG, WebP)');
      return;
    }
    setError(null);
    setFile(f);
  };

  const onCaptureScreen = async () => {
    if (!screenCaptureAvailable || busy) return;
    setCapturing(true);
    setError(null);

    const root = rootRef.current;
    // Hide the whole widget so it (and the "sharing" chrome) don't dominate
    // the frame. Visibility keeps layout; opacity would still composite.
    const prevVisibility = root?.style.visibility ?? '';

    try {
      const result = await captureScreenSnapshot({
        beforeCapture: () => {
          if (root) root.style.visibility = 'hidden';
        },
      });

      if (root) root.style.visibility = prevVisibility;

      if (!result) {
        // User cancelled the picker — silent
        return;
      }

      setFile(result.file);
      setError(null);
    } catch (e) {
      if (root) root.style.visibility = prevVisibility;
      setError(
        e instanceof Error ? e.message : 'Kunne ikke tage skærmbillede',
      );
    } finally {
      if (root) root.style.visibility = prevVisibility;
      setCapturing(false);
    }
  };

  const onSubmit = async () => {
    if (!canSubmit || !studentId || schoolIdNum == null) return;
    setSending(true);
    setError(null);
    try {
      await ensureSupabaseSession(String(schoolIdNum), 'unknown', studentId);

      let screenshot: Awaited<ReturnType<typeof fileToBase64>> | null = null;
      if (file) {
        screenshot = await fileToBase64(file);
      }

      const result = await submitFeedback({
        studentId,
        schoolId: schoolIdNum,
        category,
        message,
        browserInfo,
        lectioVersion,
        screenshot,
      });

      if (!result.ok) {
        setError(result.error || 'Kunne ikke sende');
        return;
      }

      capture('feedback_submitted', getDistinctId(studentId), {
        feedback_id: result.feedbackId,
        category,
        platform: 'extension',
        has_screenshot: Boolean(screenshot) && !result.attachmentError,
        attachment_error: result.attachmentError ?? null,
      });

      // Text landed; keep a soft warning if the image failed (text still saved).
      if (result.attachmentError) {
        setError(
          'Beskeden er gemt, men skærmbilledet kunne ikke uploades.',
        );
      } else {
        setError(null);
      }
      setDone(true);
      setMessage('');
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikke sende');
    } finally {
      setSending(false);
    }
  };

  const widget = (
    <div
      ref={rootRef}
      className="pointer-events-none fixed bottom-5 right-5 z-[2147483000] flex flex-col items-end gap-3"
      onKeyDown={(e: any) => {
        if (
          open &&
          !done &&
          (e.ctrlKey || e.metaKey) &&
          e.key === 'Enter' &&
          canSubmit
        ) {
          e.preventDefault();
          onSubmit();
        }
      }}
    >
      {/* Expandable panel — grows from bottom-right toward the FAB */}
      <div
        id="bl-feedback-panel"
        role="dialog"
        aria-modal="false"
        aria-labelledby="bl-feedback-title"
        aria-hidden={!open}
        className={cn(
          'w-[min(calc(100vw-2.5rem),360px)] origin-bottom-right overflow-hidden rounded-2xl border border-border bg-background',
          'shadow-[0_12px_40px_oklch(0_0_0/0.14),0_2px_8px_oklch(0_0_0/0.06)]',
          'dark:shadow-[0_12px_40px_oklch(0_0_0/0.45),0_2px_8px_oklch(0_0_0/0.2)]',
          'transition-[opacity,transform] duration-220',
          open
            ? 'pointer-events-auto opacity-100 scale-100 translate-y-0'
            : 'pointer-events-none opacity-0 scale-95 translate-y-2',
        )}
        style={{ transitionTimingFunction: EASE }}
      >
        {done ? (
          <div className="flex flex-col items-center gap-2.5 px-5 py-8 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="size-5 text-primary" />
            </div>
            <div className="space-y-0.5">
              <h2
                id="bl-feedback-title"
                className="text-sm font-semibold text-foreground m-0"
              >
                {t('feedbackWidget.doneTitle')}
              </h2>
              <p className="text-xs text-muted-foreground m-0">
                {t('feedbackWidget.doneBody')}
              </p>
              {error ? (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 m-0 max-w-[280px]">
                  {error}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-1 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {t('feedbackWidget.close')}
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-2 border-b border-border/60 px-4 py-3">
              <div className="min-w-0">
                <h2
                  id="bl-feedback-title"
                  className="text-sm font-semibold text-foreground m-0"
                >
                  {t('feedbackWidget.title')}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground m-0">
                  {t('feedbackWidget.subtitle')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!busy) setOpen(false);
                }}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-[color,background-color] duration-150 hover:bg-muted hover:text-foreground"
                aria-label={t('feedbackWidget.closeAria')}
              >
                <X className="size-3.5" />
              </button>
            </div>

            <div className="space-y-3 px-4 py-3">
              {/* Category pills */}
              <div
                className="grid grid-cols-3 gap-1 rounded-lg bg-muted/70 p-0.5"
                role="tablist"
                aria-label="Kategori"
              >
                {CATEGORIES.map((c) => {
                  const Icon = c.icon;
                  const active = category === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setCategory(c.id)}
                      className={cn(
                        'flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-[11px] font-medium transition-[color,background-color,box-shadow] duration-150',
                        active
                          ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Icon className="size-3 shrink-0" />
                      {c.label}
                    </button>
                  );
                })}
              </div>

              {/* Message */}
              <textarea
                ref={textareaRef}
                id="bl-feedback-message"
                value={message}
                onInput={(e) =>
                  setMessage((e.currentTarget as HTMLTextAreaElement).value)
                }
                placeholder={hint}
                rows={4}
                maxLength={4000}
                disabled={busy}
                className={cn(
                  'flex w-full resize-none rounded-xl border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none',
                  'placeholder:text-muted-foreground/65',
                  'transition-[border-color,box-shadow] duration-150',
                  'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20',
                  'disabled:opacity-60',
                )}
              />

              {/* Screenshot row */}
              <div className="flex items-center gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const input = e.currentTarget as HTMLInputElement;
                    acceptFile(input.files?.[0] ?? null);
                    input.value = '';
                  }}
                />

                {previewUrl ? (
                  <div className="relative size-10 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/40">
                    <img
                      src={previewUrl}
                      alt=""
                      className="size-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      disabled={busy}
                      className="absolute inset-0 flex items-center justify-center bg-[oklch(0_0_0/0.45)] text-white opacity-0 transition-opacity hover:opacity-100"
                      aria-label="Fjern skærmbillede"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : null}

                {screenCaptureAvailable ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onCaptureScreen}
                    title="Tag skærmbillede af denne fane"
                    className={cn(
                      'inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium',
                      'text-foreground transition-[color,background-color,border-color] duration-150',
                      'hover:border-primary/40 hover:bg-muted/50',
                      'disabled:opacity-50',
                      capturing && 'border-primary/40 bg-primary/5 text-primary',
                    )}
                  >
                    {capturing ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Camera className="size-3.5" />
                    )}
                    {capturing ? 'Tager…' : previewUrl ? 'Tag nyt' : 'Tag skærm'}
                  </button>
                ) : null}

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload billede fra fil"
                  className={cn(
                    'inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground',
                    'transition-[color,background-color,border-color] duration-150',
                    'hover:border-primary/40 hover:bg-muted/50 hover:text-foreground',
                    'disabled:opacity-50',
                  )}
                >
                  <ImagePlus className="size-3.5" />
                  <span className="sr-only">Upload billede</span>
                </button>

                <div className="min-w-0 flex-1">
                  {file ? (
                    <p className="truncate text-[11px] text-muted-foreground m-0">
                      <Paperclip className="mr-0.5 inline size-3 align-[-1px]" />
                      {file.name.startsWith('screenshot-')
                        ? 'Skærmbillede'
                        : file.name}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/70 m-0">
                      {screenCaptureAvailable
                        ? 'Valgfrit'
                        : 'Skærmbillede valgfrit'}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={onSubmit}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-medium transition-[opacity,transform] duration-150',
                    'bg-primary text-primary-foreground',
                    'hover:opacity-90 active:scale-[0.98]',
                    'disabled:cursor-not-allowed disabled:opacity-45',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  )}
                >
                  {sending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Sender
                    </>
                  ) : (
                    <>
                      <Send className="size-3.5" />
                      Send
                    </>
                  )}
                </button>
              </div>

              {error ? (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive m-0">
                  {error}
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* FAB — toggles the panel */}
      <button
        type="button"
        onClick={() => {
          if (!busy) setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-controls="bl-feedback-panel"
        aria-label={open ? t('feedbackWidget.closeAria') : t('feedbackWidget.openAria')}
        title={t('feedbackWidget.tooltip')}
        className={cn(
          'pointer-events-auto flex h-12 items-center gap-2 rounded-full bg-primary text-primary-foreground shadow-lg',
          'pl-3.5 pr-4 ring-1 ring-foreground/10',
          'transition-[transform,box-shadow,background-color] duration-200',
          'hover:scale-[1.03] hover:shadow-xl active:scale-[0.97]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          open && 'bg-primary/90',
          busy && 'pointer-events-none opacity-80',
        )}
        style={{ transitionTimingFunction: EASE }}
      >
        {open ? (
          <X className="size-5 shrink-0" />
        ) : (
          <MessageCircle className="size-5 shrink-0" />
        )}
        <span className="whitespace-nowrap text-sm font-medium tracking-tight">
          {open ? t('feedbackWidget.fabClose') : t('feedbackWidget.fab')}
        </span>
      </button>
    </div>
  );

  // Portal into #il-root so Tailwind/token styles apply
  const portalTarget = document.getElementById('il-root') || document.body;
  return createPortal(widget, portalTarget);
}
