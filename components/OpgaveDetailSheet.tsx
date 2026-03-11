import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileDown,
  Upload,
  X,
  Send,
  AlertTriangle,
  Loader2,
  ExternalLink,
  User,
  GraduationCap,
  Clock,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchOpgaveDetail,
  getCachedDetail,
  invalidateDetailCache,
  submitComment,
  type SubmissionStatus,
  uploadFileAndSubmit,
} from '@/lib/opgave-detail';
import type { OpgaveDetail } from '@/lib/opgave-detail';
import { getHoldHue, getHoldDisplayName } from '@/lib/hold-mapping';
import { sanitizeHtml } from '@/lib/sanitize-html';

// ── Types ──────────────────────────────────────────────────────────────

export interface OpgaveEntry {
  title: string;
  url: string;
  hold: string;
  deadline: Date;
  deadlineText: string;
  studentTime: string;
  status: 'venter' | 'mangler' | 'afleveret';
  statusText: string;
  absence: string;
  awaiting: string;
  note: string;
  grade: string;
  gradeExtra: string;
}

interface OpgaveDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: OpgaveEntry | null;
  schoolId: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

function getGradeHue(grade: string): number {
  const g = grade.trim();
  switch (g) {
    case '12': return 85;
    case '10': return 145;
    case '7': return 210;
    case '4': return 50;
    case '02': return 40;
    case '00': return 25;
    case '-3': return 0;
    default: return 145;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// ── Component ──────────────────────────────────────────────────────────

export function OpgaveDetailSheet({ open, onOpenChange, entry, schoolId }: OpgaveDetailSheetProps) {
  const [detail, setDetail] = useState<OpgaveDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<SubmissionStatus | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDetail = useCallback(async (url: string, useCache = true) => {
    setError(null);

    if (useCache) {
      const cached = getCachedDetail(url);
      if (cached) {
        setDetail(cached);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const fetched = await fetchOpgaveDetail(url);
      setDetail(fetched);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ukendt fejl';
      if (message === 'SESSION_EXPIRED') {
        setError('Din session er udløbet. Log ind igen.');
      } else {
        setError('Kunne ikke hente opgavedetaljer.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && entry?.url) {
      setDetail(null);
      setComment('');
      setSelectedFile(null);
      setSubmitStatus(null);
      loadDetail(entry.url);
    }
  }, [open, entry?.url, loadDetail]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  const handleSubmit = async () => {
    if (!detail || !entry || (!comment.trim() && !selectedFile)) return;
    setSubmitting(true);
    setSubmitStatus(selectedFile ? 'uploading' : 'sending');

    try {
      let success: boolean;
      if (selectedFile) {
        success = await uploadFileAndSubmit(
          detail,
          selectedFile,
          comment.trim(),
          schoolId,
          setSubmitStatus,
        );
      } else {
        success = await submitComment(detail, comment.trim(), setSubmitStatus);
      }

      if (success) {
        toast.success('Indlæg sendt');
        setComment('');
        setSelectedFile(null);
        invalidateDetailCache(entry.url);
        loadDetail(entry.url, false);
      } else {
        toast.error('Kunne ikke sende indlæg');
      }
    } catch {
      toast.error('Der opstod en fejl ved afsendelse');
    } finally {
      setSubmitting(false);
      setSubmitStatus(null);
    }
  };

  const handleFileDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error('Filen er for stor (max 50 MB)');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleFileSelect = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error('Filen er for stor (max 50 MB)');
        return;
      }
      setSelectedFile(file);
    }
    input.value = '';
  };

  if (!open) return null;

  const holdHue = entry ? getHoldHue(entry.hold) : 200;
  const submitLabel =
    submitStatus === 'uploading'
      ? 'Uploader fil...'
      : submitStatus === 'sending'
        ? 'Sender til Lectio...'
        : submitStatus === 'verifying'
          ? 'Kontrollerer...'
          : 'Sender...';

  const sheetContent = (
    <div className="il-opgave-sheet-wrapper">
      {/* Backdrop */}
      <div
        className="il-opgave-sheet-backdrop"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="il-opgave-sheet-panel" role="dialog" aria-label={entry?.title || 'Opgavedetaljer'}>
        {/* Close button */}
        <button
          className="il-opgave-sheet-close"
          onClick={() => onOpenChange(false)}
          aria-label="Luk"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="il-opgave-sheet-header">
          <div className="il-opgave-sheet-header-top">
            <h2 className="il-opgave-sheet-title">
              {entry?.title || 'Opgave'}
            </h2>
            {entry && (
              <div className="il-opgave-sheet-header-meta">
                <span
                  className="il-opgaver-hold-pill"
                  style={{ '--hold-hue': holdHue } as any}
                >
                  {getHoldDisplayName(entry.hold)}
                </span>
                <span className="il-opgave-sheet-deadline">
                  <Clock size={14} />
                  {entry.deadlineText}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="il-opgave-sheet-body">
          {loading && <LoadingSkeleton />}

          {error && (
            <div className="il-opgave-sheet-error">
              <AlertTriangle size={28} />
              <p>{error}</p>
              <div className="il-opgave-sheet-error-actions">
                <button
                  className="il-opgave-sheet-btn il-opgave-sheet-btn-outline"
                  onClick={() => entry && loadDetail(entry.url, false)}
                >
                  Prøv igen
                </button>
                {entry && (
                  <a
                    href={entry.url}
                    className="il-opgave-sheet-btn il-opgave-sheet-btn-ghost"
                  >
                    <ExternalLink size={15} />
                    Åbn i Lectio
                  </a>
                )}
              </div>
            </div>
          )}

          {detail && !loading && !error && (
            <>
              {/* Info grid */}
              <div className="il-opgave-sheet-info-grid">
                <InfoRow label="Ansvarlig" value={detail.responsible} />
                <InfoRow label="Elevtid" value={detail.studentTime} />
                <InfoRow label="Karakterskala" value={detail.gradeScale} />
                <InfoRow label="Frist" value={detail.deadline} />
                {detail.inUVBeskrivelse && (
                  <InfoRow label="UV-beskrivelse" value={detail.inUVBeskrivelse} />
                )}
              </div>

              {/* Assignment note */}
              {detail.note && (
                <div className="il-opgave-sheet-note">
                  <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(detail.note) }} />
                </div>
              )}

              {/* Description files */}
              {detail.descriptionFiles.length > 0 && (
                <div className="il-opgave-sheet-files">
                  {detail.descriptionFiles.map((file, i) => (
                    <a
                      key={i}
                      href={file.url}
                      className="il-opgave-sheet-file-link"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileDown size={16} />
                      {file.name}
                    </a>
                  ))}
                </div>
              )}

              <Separator />

              {/* Student status */}
              {detail.students.length > 0 && (
                <div className="il-opgave-sheet-student-section">
                  <h3 className="il-opgave-sheet-section-label">
                    <User size={15} />
                    Status
                  </h3>
                  {detail.students.map((student, i) => (
                    <div key={i} className="il-opgave-sheet-student">
                      <div className="il-opgave-sheet-student-name">{student.name}</div>
                      <div className="il-opgave-sheet-student-meta">
                        {student.awaiting && (
                          <span className={`il-opgave-sheet-awaiting-badge${student.awaiting === 'Elev' ? ' is-student' : ' is-teacher'}`}>
                            Afventer {student.awaiting.toLowerCase()}
                          </span>
                        )}
                        {student.statusText && (
                          <span className="il-opgave-sheet-status-text">{student.statusText}</span>
                        )}
                      </div>
                      {student.grade && (
                        <div className="il-opgave-sheet-student-grade">
                          <span
                            className="il-opgaver-grade"
                            style={{ '--grade-hue': getGradeHue(student.grade) } as any}
                          >
                            {student.grade}
                          </span>
                          {student.gradeNote && (
                            <span className="il-opgave-sheet-grade-note">{student.gradeNote}</span>
                          )}
                        </div>
                      )}
                      {student.studentNote && (
                        <div className="il-opgave-sheet-student-note">{student.studentNote}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Submission history */}
              {detail.entries.length > 0 && (
                <>
                  <Separator />
                  <div className="il-opgave-sheet-entries-section">
                    <h3 className="il-opgave-sheet-section-label">
                      <FileText size={15} />
                      Indlæg
                      <span className="il-opgave-sheet-entry-count">{detail.entries.length}</span>
                    </h3>
                    <div className="il-opgave-sheet-entries">
                      {detail.entries.map((historyEntry, i) => (
                        <div
                          key={i}
                          className={`il-opgave-sheet-entry${historyEntry.isTeacher ? ' is-teacher' : ''}`}
                        >
                          <div className="il-opgave-sheet-entry-header">
                            <span className="il-opgave-sheet-entry-user">
                              {historyEntry.isTeacher ? <GraduationCap size={14} /> : <User size={14} />}
                              {historyEntry.user}
                            </span>
                            <span className="il-opgave-sheet-entry-time">{historyEntry.timestamp}</span>
                          </div>
                          {historyEntry.comment && (
                            <p className="il-opgave-sheet-entry-comment">{historyEntry.comment}</p>
                          )}
                          {historyEntry.documentName && (
                            <a
                              href={historyEntry.documentUrl}
                              className="il-opgave-sheet-entry-doc"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <FileDown size={15} />
                              {historyEntry.documentName}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {detail && !error && (
          <div className="il-opgave-sheet-footer">
            <Separator />

            {/* Submission form */}
            {detail.hasSubmissionForm && (
              <div className="il-opgave-sheet-form">
                <textarea
                  className="il-opgave-sheet-textarea"
                  placeholder="Skriv en kommentar..."
                  value={comment}
                  onInput={(e) => setComment((e.target as HTMLTextAreaElement).value)}
                  rows={2}
                  disabled={submitting}
                />

                {/* File drop zone */}
                <div
                  className={`il-opgave-sheet-dropzone${dragOver ? ' is-dragover' : ''}${selectedFile ? ' has-file' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => !selectedFile && fileInputRef.current?.click()}
                >
                  {selectedFile ? (
                    <div className="il-opgave-sheet-selected-file">
                      <FileText size={16} />
                      <span className="il-opgave-sheet-file-name">{selectedFile.name}</span>
                      <span className="il-opgave-sheet-file-size">{formatFileSize(selectedFile.size)}</span>
                      <button
                        className="il-opgave-sheet-file-remove"
                        onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    <div className="il-opgave-sheet-dropzone-hint">
                      <Upload size={16} />
                      <span>Vælg fil eller træk hertil</span>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="il-opgave-sheet-file-input"
                    onChange={handleFileSelect}
                    disabled={submitting}
                  />
                </div>

                {/* Send button */}
                <button
                  className="il-opgave-sheet-send-btn"
                  disabled={submitting || (!comment.trim() && !selectedFile)}
                  onClick={handleSubmit}
                >
                  {submitting ? (
                    <Loader2 size={16} className="il-opgave-sheet-spinner" />
                  ) : (
                    <Send size={16} />
                  )}
                  {submitting ? submitLabel : 'Send'}
                </button>
              </div>
            )}

            {/* Open in Lectio link (always shown) */}
            {entry && (
              <a
                href={entry.url}
                className="il-opgave-sheet-lectio-link"
              >
                <ExternalLink size={15} />
                Åbn i Lectio
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // Portal into #il-root so styles apply (same pattern as SettingsModal)
  const portalTarget = document.getElementById('il-root') || document.body;
  return createPortal(sheetContent, portalTarget);
}

// ── Sub-components ─────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="il-opgave-sheet-info-row">
      <span className="il-opgave-sheet-info-label">{label}</span>
      <span className="il-opgave-sheet-info-value">{value}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="il-opgave-sheet-skeleton">
      <div className="il-opgave-sheet-info-grid">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="il-opgave-sheet-info-row">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <Skeleton className="h-16 w-full rounded-lg" />
      <Separator />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-12 w-full rounded-lg" />
      <Separator />
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-20 w-full rounded-lg" />
    </div>
  );
}
