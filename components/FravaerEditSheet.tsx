import { useState, useEffect, useCallback } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import {
  X,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Save,
  Clock,
  Edit3,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';
import {
  type FravaerRecord,
  type FravaerEditFormData,
  fetchEditFormData,
  submitEditReason,
} from '@/lib/fravaer-parse';
import { getHoldHue, getHoldDisplayName } from '@/lib/hold-mapping';

// ── Types ──────────────────────────────────────────────────────────────

interface FravaerEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: FravaerRecord | null;
  onSaved: () => void;
}

// ── Component ──────────────────────────────────────────────────────────

export function FravaerEditSheet({ open, onOpenChange, record, onSaved }: FravaerEditSheetProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<FravaerEditFormData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAarsag, setSelectedAarsag] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Load form data when opened
  useEffect(() => {
    if (!open || !record?.editUrl) return;

    setFormData(null);
    setError(null);
    setLoading(true);

    fetchEditFormData(record.editUrl)
      .then(data => {
        if (data) {
          setFormData(data);
          setSelectedAarsag(data.currentAarsag);
          setNote(data.currentNote);
        } else {
          setError(t('fravaerEditSheet.fetchError'));
        }
      })
      .catch(() => {
        setError(t('fravaerEditSheet.genericError'));
      })
      .finally(() => setLoading(false));
  }, [open, record?.editUrl]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onOpenChange]);

  const handleSubmit = useCallback(async () => {
    if (!formData) return;

    setSubmitting(true);
    try {
      const success = await submitEditReason(formData, selectedAarsag, note);
      if (success) {
        toast.success(t('fravaerEditSheet.success'));
        onOpenChange(false);
        onSaved();
      } else {
        toast.error(t('fravaerEditSheet.saveError'));
      }
    } catch {
      toast.error(t('fravaerEditSheet.submitError'));
    } finally {
      setSubmitting(false);
    }
  }, [formData, selectedAarsag, note, onOpenChange, onSaved]);

  if (!open) return null;

  const holdHue = record?.hold ? getHoldHue(record.hold) : 200;
  const holdName = record?.hold ? getHoldDisplayName(record.hold) : '';

  const dialogContent = (
    <div className="fixed inset-0 z-220">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[oklch(0_0_0/0.45)] backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="absolute left-1/2 top-1/2 w-[min(96vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={t('fravaerEditSheet.title')}
      >
        {/* Close button */}
        <button
          className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-[color,background-color] duration-150 hover:bg-accent hover:text-foreground"
          onClick={() => onOpenChange(false)}
          aria-label={t('fravaerEditSheet.ariaClose')}
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="border-b border-border px-5 py-4">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-foreground">
            <Edit3 size={18} />
            {t('fravaerEditSheet.title')}
          </h2>
          {record && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock size={14} />
                {record.date || record.uge}
                {record.module && ` — ${record.module}`}
              </span>
              {holdName && (
                <span
                  className="hold-pill-dynamic rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ '--hold-hue': holdHue } as any}
                >
                  {holdName}
                </span>
              )}
              {record.teacher && (
                <span>{record.teacher}</span>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="space-y-3 px-5 py-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={20} className="animate-spin" />
              <span>{t('fravaerEditSheet.loadingForm')}</span>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle size={24} />
              <p className="mt-2">{error}</p>
              <button
                className="mt-3 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-[color,background-color] duration-150 hover:bg-accent"
                onClick={() => {
                  if (record?.editUrl) {
                    setError(null);
                    setLoading(true);
                    fetchEditFormData(record.editUrl)
                      .then(data => {
                        if (data) {
                          setFormData(data);
                          setSelectedAarsag(data.currentAarsag);
                          setNote(data.currentNote);
                        } else {
                          setError(t('fravaerEditSheet.fetchError'));
                        }
                      })
                      .catch(() => setError(t('fravaerEditSheet.genericError')))
                      .finally(() => setLoading(false));
                  }
                }}
              >
                {t('fravaerEditSheet.retry')}
              </button>
            </div>
          )}

          {formData && !loading && !error && (
            <div className="space-y-3">
              {/* Reason select */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="fravaer-aarsag">
                  {t('fravaerEditSheet.labelReason')}
                </label>
                <select
                  id="fravaer-aarsag"
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
                  value={selectedAarsag}
                  onChange={(e) => setSelectedAarsag((e.target as HTMLSelectElement).value)}
                  disabled={submitting}
                >
                  {formData.availableAarsager.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Note input */}
              <div className="mt-3 space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="fravaer-note">
                  {t('fravaerEditSheet.labelNote')}
                </label>
                <input
                  id="fravaer-note"
                  type="text"
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
                  value={note}
                  onInput={(e) => setNote((e.target as HTMLInputElement).value)}
                  placeholder={t('fravaerEditSheet.notePlaceholder')}
                  disabled={submitting}
                />
              </div>

              {/* Current reason display (if set) */}
              {record?.aarsag && (
                <div className="mt-3 rounded-md border border-border bg-muted/30 p-3 text-sm">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('fravaerEditSheet.currentReason')}</span>
                  <span className="mt-1 block font-medium text-foreground">{record.aarsag}</span>
                  {record.note && (
                    <span className="mt-1 block text-xs text-muted-foreground">{record.note}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {formData && !error && (
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <button
              className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground transition-[color,background-color] duration-150 hover:bg-accent"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t('fravaerEditSheet.cancel')}
            </button>
            <button
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Save size={15} />
              )}
              {submitting ? t('fravaerEditSheet.saving') : t('fravaerEditSheet.save')}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const portalTarget = document.getElementById('il-root') || document.body;
  return createPortal(dialogContent, portalTarget);
}
