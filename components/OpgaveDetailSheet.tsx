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
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────

import type { OpgaveEntry } from '@/components/OpgaverPage';

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
    <div className="fixed inset-0 z-100 pointer-events-auto">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[oklch(0_0_0/0.45)] backdrop-blur-sm animate-in fade-in-0 duration-200"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="absolute right-0 top-0 bottom-0 w-[92%] max-w-xl overflow-hidden border-l border-border bg-background shadow-[-12px_0_48px_oklch(0_0_0/0.12)] animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-label={entry?.title || 'Opgavedetaljer'}
      >
        {/* Close button */}
        <button
          className="absolute right-5 top-5 z-10 inline-flex size-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
          onClick={() => onOpenChange(false)}
          aria-label="Luk"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="shrink-0 border-b border-border px-7 pb-5 pt-7">
          <div className="flex flex-col gap-3">
            <h2 className="pr-12 text-2xl font-bold tracking-[-0.02em] text-foreground leading-snug">
              {entry?.title || 'Opgave'}
            </h2>
            {entry && (
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground"
                  style={{ '--hold-hue': holdHue } as any}
                >
                  {getHoldDisplayName(entry.hold)}
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock size={14} />
                  {entry.deadlineText}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-7 py-6">
          {loading && <LoadingSkeleton />}

          {error && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card px-6 py-10 text-center">
              <AlertTriangle size={28} className="text-muted-foreground" />
              <p className="text-sm text-foreground">{error}</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent cursor-pointer"
                  onClick={() => entry && loadDetail(entry.url, false)}
                >
                  Prøv igen
                </button>
                {entry && (
                  <a
                    href={entry.url}
                    className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground no-underline"
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
              <div className="grid gap-3 sm:grid-cols-2">
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
                <div
                  className="rounded-xl border border-border bg-card p-4 text-sm text-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(detail.note) }}
                />
              )}

              {/* Description files */}
              {detail.descriptionFiles.length > 0 && (
                <div className="flex flex-col gap-2">
                  {detail.descriptionFiles.map((file, i) => (
                    <a
                      key={i}
                      href={file.url}
                      className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground no-underline transition-colors hover:bg-accent/40"
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
                <div className="space-y-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <User size={15} />
                    Status
                  </h3>
                  {detail.students.map((student, i) => (
                    <div key={i} className="rounded-xl border border-border bg-card px-4 py-3">
                      <div className="text-sm font-semibold text-foreground">{student.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {student.awaiting && (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                              student.awaiting === 'Elev'
                                ? "border-border bg-muted text-foreground"
                                : "border-border bg-accent text-accent-foreground",
                            )}
                          >
                            Afventer {student.awaiting.toLowerCase()}
                          </span>
                        )}
                        {student.statusText && (
                          <span>{student.statusText}</span>
                        )}
                      </div>
                      {student.grade && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span
                            className="inline-flex items-center rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold text-foreground"
                            style={{ '--grade-hue': getGradeHue(student.grade) } as any}
                          >
                            {student.grade}
                          </span>
                          {student.gradeNote && (
                            <span className="text-xs text-muted-foreground">{student.gradeNote}</span>
                          )}
                        </div>
                      )}
                      {student.studentNote && (
                        <div className="mt-2 text-sm text-foreground">{student.studentNote}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Submission history */}
              {detail.entries.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <FileText size={15} />
                      Indlæg
                      <span className="ml-1 inline-flex min-w-6 items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                        {detail.entries.length}
                      </span>
                    </h3>
                    <div className="space-y-3">
                      {detail.entries.map((historyEntry, i) => (
                        <div
                          key={i}
                          className={cn(
                            "rounded-xl border border-border bg-card px-4 py-3",
                            historyEntry.isTeacher && "border-border/70 bg-muted/30",
                          )}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                              {historyEntry.isTeacher ? <GraduationCap size={14} /> : <User size={14} />}
                              {historyEntry.user}
                            </span>
                            <span className="text-xs text-muted-foreground">{historyEntry.timestamp}</span>
                          </div>
                          {historyEntry.comment && (
                            <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{historyEntry.comment}</p>
                          )}
                          {historyEntry.documentName && (
                            <a
                              href={historyEntry.documentUrl}
                              className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground no-underline transition-colors hover:bg-accent/40"
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
          <div className="shrink-0 border-t border-border bg-background">
            <Separator />

            {/* Submission form */}
            {detail.hasSubmissionForm && (
              <div className="space-y-3 px-7 py-5">
                <textarea
                  className="min-h-12 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Skriv en kommentar..."
                  value={comment}
                  onInput={(e) => setComment((e.target as HTMLTextAreaElement).value)}
                  rows={2}
                  disabled={submitting}
                />

                {/* File drop zone */}
                <div
                  className={cn(
                    "group relative cursor-pointer rounded-xl border border-dashed border-border bg-card px-4 py-3 transition-colors hover:bg-accent/20",
                    dragOver && "border-ring bg-accent/30",
                    selectedFile && "border-border bg-background",
                    submitting && "cursor-not-allowed opacity-70",
                  )}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => !selectedFile && fileInputRef.current?.click()}
                >
                  {selectedFile ? (
                    <div className="flex items-center gap-2">
                      <FileText size={16} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {selectedFile.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatFileSize(selectedFile.size)}
                      </span>
                      <button
                        className="ml-1 inline-flex size-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Upload size={16} />
                      <span>Vælg fil eller træk hertil</span>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileSelect}
                    disabled={submitting}
                  />
                </div>

                {/* Send button */}
                <button
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                  disabled={submitting || (!comment.trim() && !selectedFile)}
                  onClick={handleSubmit}
                >
                  {submitting ? (
                    <Loader2 size={16} className="animate-spin" />
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
                className="flex items-center justify-center gap-2 border-t border-border px-7 py-3 text-sm font-medium text-muted-foreground no-underline transition-colors hover:bg-accent hover:text-foreground"
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
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-foreground">
        {value}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-xl border border-border bg-card px-4 py-3">
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
