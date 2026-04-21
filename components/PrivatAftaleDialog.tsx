import { useState, useCallback, useEffect, useRef } from "preact/hooks";
import { createPortal } from "preact/compat";
import {
  Calendar,
  Clock,
  Loader2,
  Type,
  MessageSquare,
  Lock,
  Trash2,
  X,
} from "lucide-react";
import {
  fetchPrivatAftaleForm,
  submitPrivatAftale,
  deletePrivatAftale,
  type PrivatAftaleForm,
} from "@/lib/privat-aftale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n";

// ── Helpers ─────────────────────────────────────────────────────────────

/** Format today as dd/mm-yyyy (Danish Lectio format) */
function todayDanish(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}-${d.getFullYear()}`;
}

/** Round current time to next 15min slot, return as HH:MM */
function nextQuarterHour(): string {
  const d = new Date();
  const mins = Math.ceil(d.getMinutes() / 15) * 15;
  d.setMinutes(mins, 0, 0);
  if (mins >= 60) d.setHours(d.getHours() + 1, 0, 0, 0);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Add 1 hour to HH:MM string */
function addOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const nh = (h + 1) % 24;
  return `${String(nh).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ── Component ───────────────────────────────────────────────────────────

interface PrivatAftaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The href from the native "Privat aftale" link */
  formUrl: string;
}

export function PrivatAftaleDialog({
  open,
  onOpenChange,
  formUrl,
}: PrivatAftaleDialogProps) {
  const { t } = useTranslation();
  // Form state
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [comment, setComment] = useState("");

  // Loading states
  const [formData, setFormData] = useState<PrivatAftaleForm | null>(null);
  const [fetching, setFetching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);

  // Fetch the form page when dialog opens
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setFetching(true);
    setFetchError(null);
    setFormData(null);

    fetchPrivatAftaleForm(formUrl)
      .then((form) => {
        if (cancelled) return;
        setFormData(form);

        // Pre-fill: use form values if editing, otherwise smart defaults
        if (form.title) {
          setTitle(form.title);
          setStartDate(form.startDate);
          setStartTime(form.startTime);
          setEndDate(form.endDate);
          setEndTime(form.endTime);
          setComment(form.comment);
        } else {
          const defaultStart = nextQuarterHour();
          setTitle("");
          setStartDate(form.startDate || todayDanish());
          setStartTime(form.startTime || defaultStart);
          setEndDate(form.endDate || todayDanish());
          setEndTime(form.endTime || addOneHour(defaultStart));
          setComment("");
        }

        // Focus title after render
        requestAnimationFrame(() => titleRef.current?.focus());
      })
      .catch((err) => {
        if (cancelled) return;
        setFetchError(
          err?.message === "Session expired"
            ? t('privatAftale.errors.sessionExpired')
            : t('privatAftale.errors.fetchFailed'),
        );
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, formUrl]);

  // Escape to close + lock body scroll
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  // Reset when closing
  useEffect(() => {
    if (!open) {
      setTitle("");
      setStartDate("");
      setStartTime("");
      setEndDate("");
      setEndTime("");
      setComment("");
      setFormData(null);
      setFetchError(null);
    }
  }, [open]);

  const isValid = title.trim().length > 0 && startDate && startTime && endDate && endTime;

  const handleSubmit = useCallback(async () => {
    if (!formData || !isValid || submitting) return;

    setSubmitting(true);
    try {
      await submitPrivatAftale({
        form: formData,
        title: title.trim(),
        startDate,
        startTime,
        endDate,
        endTime,
        comment: comment.trim(),
      });
      toast.success(isEditing ? t('privatAftale.success.updated') : t('privatAftale.success.created'));
      onOpenChange(false);
      // Reload to show changes on the schedule
      window.location.reload();
    } catch (err: any) {
      const msg =
        err?.message === "Session expired"
          ? t('privatAftale.errors.sessionExpired')
          : t('privatAftale.errors.saveFailed');
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }, [formData, title, startDate, startTime, endDate, endTime, comment, isValid, submitting, onOpenChange]);

  const handleDelete = useCallback(async () => {
    if (!formData || !formData.canDelete || deleting) return;

    if (!window.confirm(t('privatAftale.confirmDelete'))) return;

    setDeleting(true);
    try {
      await deletePrivatAftale(formData);
      toast.success(t('privatAftale.success.deleted'));
      onOpenChange(false);
      window.location.reload();
    } catch (err: any) {
      const msg =
        err?.message === "Session expired"
          ? t('privatAftale.errors.sessionExpired')
          : t('privatAftale.errors.deleteFailed');
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  }, [formData, deleting, onOpenChange]);

  const isEditing = !!formData?.canDelete;

  if (!open) return null;

  const inputClass =
    "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground tabular-nums placeholder:text-muted-foreground/60 outline-none transition-[border-color,box-shadow] duration-150 focus:border-primary focus:ring-2 focus:ring-primary/20";

  const dialog = (
    <div
      className="fixed inset-0 z-200 flex items-center justify-center pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label={t('privatAftale.ariaLabel')}
      onKeyDown={(e: any) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && isValid && !submitting) {
          e.preventDefault();
          handleSubmit();
        }
      }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[oklch(0_0_0/0.42)] backdrop-blur-[6px] animate-[pa-fade-in_0.2s_ease]"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Dialog panel */}
      <div
        className="relative w-[440px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-background shadow-[0_16px_64px_oklch(0_0_0/0.18)] overflow-hidden animate-[pa-scale-in_0.2s_cubic-bezier(0.16,1,0.3,1)] dark:shadow-[0_16px_64px_oklch(0_0_0/0.5)]"
        onClick={(e: any) => e.stopPropagation()}
      >
        {/* Accent bar */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-primary" />

        {/* Close button */}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 z-10 inline-flex items-center justify-center size-7 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-[color,background-color] duration-150"
          aria-label={t('privatAftale.closeLabel')}
        >
          <X className="size-4" />
        </button>

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center size-9 rounded-lg bg-primary/10">
              <Calendar className="size-[18px] text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground leading-tight m-0">
                {isEditing ? t('privatAftale.editTitle') : t('privatAftale.createTitle')}
              </h2>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5 m-0">
                <Lock className="size-3" />
                {t('privatAftale.onlyVisibleToYou')}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {fetching ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader2 className="size-5 text-muted-foreground animate-spin" />
              <span className="text-sm text-muted-foreground">{t('privatAftale.loadingForm')}</span>
            </div>
          ) : fetchError ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <p className="text-sm text-destructive m-0">{fetchError}</p>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="text-sm text-muted-foreground hover:text-foreground underline transition-colors duration-150"
              >
                {t('privatAftale.closeLabel')}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Title */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="pa-title"
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider"
                >
                  <Type className="size-3" />
                  {t('privatAftale.titleLabel')}
                </label>
                <input
                  ref={titleRef}
                  id="pa-title"
                  type="text"
                  maxLength={20}
                  value={title}
                  onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
                  placeholder={t('privatAftale.titlePlaceholder')}
                  className={inputClass}
                />
                <span className="text-xs text-muted-foreground/60 tabular-nums text-right">
                  {title.length}/20
                </span>
              </div>

              {/* Date & Time — Start */}
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <Clock className="size-3" />
                  {t('privatAftale.startLabel')}
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={startDate}
                      onInput={(e) => setStartDate((e.target as HTMLInputElement).value)}
                      placeholder="dd/mm-åååå"
                      maxLength={10}
                      className={cn(inputClass, "pr-9")}
                    />
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/40 pointer-events-none" />
                  </div>
                  <div className="relative w-[90px]">
                    <input
                      type="text"
                      value={startTime}
                      onInput={(e) => setStartTime((e.target as HTMLInputElement).value)}
                      placeholder="HH:MM"
                      maxLength={5}
                      className={cn(inputClass, "pr-8 text-center")}
                    />
                    <Clock className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/40 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Date & Time — End */}
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <Clock className="size-3" />
                  {t('privatAftale.endLabel')}
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={endDate}
                      onInput={(e) => setEndDate((e.target as HTMLInputElement).value)}
                      placeholder="dd/mm-åååå"
                      maxLength={10}
                      className={cn(inputClass, "pr-9")}
                    />
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/40 pointer-events-none" />
                  </div>
                  <div className="relative w-[90px]">
                    <input
                      type="text"
                      value={endTime}
                      onInput={(e) => setEndTime((e.target as HTMLInputElement).value)}
                      placeholder="HH:MM"
                      maxLength={5}
                      className={cn(inputClass, "pr-8 text-center")}
                    />
                    <Clock className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/40 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Comment */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="pa-comment"
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider"
                >
                  <MessageSquare className="size-3" />
                  {t('privatAftale.commentLabel')}
                  <span className="font-normal normal-case tracking-normal text-muted-foreground/50">{t('privatAftale.optional')}</span>
                </label>
                <textarea
                  id="pa-comment"
                  value={comment}
                  onInput={(e) => setComment((e.target as HTMLTextAreaElement).value)}
                  placeholder={t('privatAftale.commentPlaceholder')}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground resize-none placeholder:text-muted-foreground/60 outline-none transition-[border-color,box-shadow] duration-150 focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!fetching && !fetchError && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border/50 bg-muted/30">
            <div className="flex items-center gap-2">
              {isEditing && (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDelete}
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-[color,background-color] duration-150 active:scale-[0.97] disabled:opacity-60"
                >
                  {deleting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  {deleting ? t('privatAftale.deleting') : t('privatAftale.delete')}
                </button>
              )}
              {!isEditing && (
                <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground/50">
                  <kbd className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded bg-muted border border-border/50 text-[10px] font-mono">
                    Ctrl
                  </kbd>
                  <span>+</span>
                  <kbd className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded bg-muted border border-border/50 text-[10px] font-mono">
                    ↵
                  </kbd>
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex items-center justify-center h-9 px-4 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-[color,background-color] duration-150 active:scale-[0.97]"
              >
                {t('privatAftale.cancel')}
              </button>
              <button
                type="button"
                disabled={!isValid || submitting}
                onClick={handleSubmit}
                className={cn(
                  "inline-flex items-center justify-center gap-2 h-9 px-5 rounded-lg text-sm font-medium transition-[color,background-color,opacity,transform] duration-150 active:scale-[0.97]",
                  isValid && !submitting
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                    : "bg-muted text-muted-foreground cursor-not-allowed opacity-60",
                )}
              >
                {submitting && <Loader2 className="size-3.5 animate-spin" />}
                {submitting ? t('privatAftale.saving') : isEditing ? t('privatAftale.save') : t('privatAftale.create')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Portal into #il-root so Tailwind styles apply (same pattern as ActivityClassModal)
  const portalTarget = document.getElementById("il-root") || document.body;
  return createPortal(dialog, portalTarget);
}
