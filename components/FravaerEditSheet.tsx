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
          setError('Kunne ikke hente redigeringsformular.');
        }
      })
      .catch(() => {
        setError('Der opstod en fejl.');
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
        toast.success('Fraværsårsag opdateret');
        onOpenChange(false);
        onSaved();
      } else {
        toast.error('Kunne ikke gemme ændringen');
      }
    } catch {
      toast.error('Der opstod en fejl ved gemning');
    } finally {
      setSubmitting(false);
    }
  }, [formData, selectedAarsag, note, onOpenChange, onSaved]);

  if (!open) return null;

  const holdHue = record?.hold ? getHoldHue(record.hold) : 200;
  const holdName = record?.hold ? getHoldDisplayName(record.hold) : '';

  const dialogContent = (
    <div className="il-fravaer-sheet-wrapper">
      {/* Backdrop */}
      <div
        className="il-fravaer-sheet-backdrop"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="il-fravaer-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Rediger fraværsårsag"
      >
        {/* Close button */}
        <button
          className="il-fravaer-sheet-close"
          onClick={() => onOpenChange(false)}
          aria-label="Luk"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="il-fravaer-sheet-header">
          <h2 className="il-fravaer-sheet-title">
            <Edit3 size={18} />
            Rediger fraværsårsag
          </h2>
          {record && (
            <div className="il-fravaer-sheet-record-info">
              <span className="il-fravaer-sheet-date">
                <Clock size={14} />
                {record.date || record.uge}
                {record.module && ` — ${record.module}`}
              </span>
              {holdName && (
                <span
                  className="il-fravaer-sheet-hold"
                  style={{ '--hold-hue': holdHue } as any}
                >
                  {holdName}
                </span>
              )}
              {record.teacher && (
                <span className="il-fravaer-sheet-teacher">{record.teacher}</span>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="il-fravaer-sheet-body">
          {loading && (
            <div className="il-fravaer-sheet-loading">
              <Loader2 size={24} className="il-fravaer-spinner" />
              <span>Henter formular...</span>
            </div>
          )}

          {error && (
            <div className="il-fravaer-sheet-error">
              <AlertTriangle size={24} />
              <p>{error}</p>
              <button
                className="il-fravaer-sheet-retry-btn"
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
                          setError('Kunne ikke hente redigeringsformular.');
                        }
                      })
                      .catch(() => setError('Der opstod en fejl.'))
                      .finally(() => setLoading(false));
                  }
                }}
              >
                Prøv igen
              </button>
            </div>
          )}

          {formData && !loading && !error && (
            <div className="il-fravaer-sheet-form">
              {/* Reason select */}
              <div className="il-fravaer-sheet-field">
                <label className="il-fravaer-sheet-label" htmlFor="fravaer-aarsag">
                  Årsag
                </label>
                <select
                  id="fravaer-aarsag"
                  className="il-fravaer-sheet-select"
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
              <div className="il-fravaer-sheet-field">
                <label className="il-fravaer-sheet-label" htmlFor="fravaer-note">
                  Note
                </label>
                <input
                  id="fravaer-note"
                  type="text"
                  className="il-fravaer-sheet-input"
                  value={note}
                  onInput={(e) => setNote((e.target as HTMLInputElement).value)}
                  placeholder="Valgfri note..."
                  disabled={submitting}
                />
              </div>

              {/* Current reason display (if set) */}
              {record?.aarsag && (
                <div className="il-fravaer-sheet-current">
                  <span className="il-fravaer-sheet-current-label">Nuværende årsag:</span>
                  <span className="il-fravaer-sheet-current-value">{record.aarsag}</span>
                  {record.note && (
                    <span className="il-fravaer-sheet-current-note">{record.note}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {formData && !error && (
          <div className="il-fravaer-sheet-footer">
            <button
              className="il-fravaer-sheet-cancel-btn"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Annuller
            </button>
            <button
              className="il-fravaer-sheet-save-btn"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 size={15} className="il-fravaer-spinner" />
              ) : (
                <Save size={15} />
              )}
              {submitting ? 'Gemmer...' : 'Gem'}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const portalTarget = document.getElementById('il-root') || document.body;
  return createPortal(dialogContent, portalTarget);
}
