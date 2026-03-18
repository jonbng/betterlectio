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
  Users,
  GraduationCap,
  Clock,
  FileText,
  Plus,
  ChevronDown,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchOpgaveDetail,
  getCachedDetail,
  invalidateDetailCache,
  submitComment,
  addGroupMember,
  removeGroupMember,
  type SubmissionStatus,
  uploadFileAndSubmit,
} from '@/lib/opgave-detail';
import type { OpgaveDetail, AvailableGroupStudent } from '@/lib/opgave-detail';
import { fetchPictureUrl, getCachedPictureUrl } from '@/lib/findskema-storage';
import { getHoldHue, getHoldDisplayName } from '@/lib/hold-mapping';
import { getExerciseIdFromUrl, loadIgnoredMissingIds } from '@/lib/opgaver-ignored';
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

function parseAbsencePercent(absence: string): number | null {
  const normalized = absence.replace(/\s|\u00a0/g, '').replace(',', '.');
  if (!normalized) return null;

  const match = normalized.match(/(\d+(?:\.\d+)?)%?/);
  if (!match) return null;

  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasAssignmentFravaer(entry: Pick<OpgaveEntry, 'status' | 'absence' | 'statusText'>): boolean {
  if (entry.status !== 'mangler') return false;

  const absencePercent = parseAbsencePercent(entry.absence);
  if (absencePercent !== null && absencePercent > 0) return true;

  return /frav[æa]r/i.test(entry.statusText);
}

function getAssignmentFravaerLabel(entry: Pick<OpgaveEntry, 'absence'>): string {
  const absencePercent = parseAbsencePercent(entry.absence);
  if (absencePercent === null) return 'Fravær registreret';
  return `Fravær ${String(absencePercent).replace('.', ',')} %`;
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
  const [ignoredMissing, setIgnoredMissing] = useState(false);
  const [groupAdding, setGroupAdding] = useState(false);
  const [groupRemoving, setGroupRemoving] = useState<string | null>(null); // contextCardId being removed
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

      // Check if this missing assignment is currently ignored
      if (entry.status === 'mangler') {
        const eid = getExerciseIdFromUrl(entry.url);
        if (eid) {
          setIgnoredMissing(loadIgnoredMissingIds(schoolId).has(eid));
        }
      } else {
        setIgnoredMissing(false);
      }
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

  const handleAddGroupMember = async (studentValue: string) => {
    if (!detail) return;
    setGroupAdding(true);
    try {
      const updated = await addGroupMember(detail, studentValue);
      if (updated) {
        setDetail(updated);
        toast.success('Gruppemedlem tilføjet');
      } else {
        toast.error('Kunne ikke tilføje gruppemedlem');
      }
    } catch {
      toast.error('Der opstod en fejl');
    } finally {
      setGroupAdding(false);
    }
  };

  const handleRemoveGroupMember = async (postbackTarget: string, postbackArgument: string, contextCardId: string) => {
    if (!detail) return;
    setGroupRemoving(contextCardId);
    try {
      const updated = await removeGroupMember(detail, postbackTarget, postbackArgument);
      if (updated) {
        setDetail(updated);
        toast.success('Gruppemedlem fjernet');
      } else {
        toast.error('Kunne ikke fjerne gruppemedlem');
      }
    } catch {
      toast.error('Der opstod en fejl');
    } finally {
      setGroupRemoving(null);
    }
  };

  const toggleIgnoreMissing = () => {
    if (!entry) return;
    const eid = getExerciseIdFromUrl(entry.url);
    if (!eid) return;

    const ids = loadIgnoredMissingIds(schoolId);
    if (ids.has(eid)) ids.delete(eid);
    else ids.add(eid);

    try {
      localStorage.setItem(`bl-opgaver-ignored-missing-${schoolId}`, JSON.stringify([...ids]));
    } catch { /* ignore */ }

    setIgnoredMissing(ids.has(eid));
  };

  if (!open) return null;

  const holdHue = entry ? getHoldHue(entry.hold) : 200;
  const hasFravaer = entry ? hasAssignmentFravaer(entry) : false;
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
          type="button"
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
                  className="inline-flex items-center rounded-md border border-border px-2 py-1 text-sm font-medium text-foreground"
                  style={{ '--hold-hue': holdHue } as any}
                >
                  {getHoldDisplayName(entry.hold)}
                </span>
                <span className="inline-flex items-center gap-1.5 text-base text-muted-foreground">
                  <Clock size={15} />
                  {entry.deadlineText}
                </span>
                {hasFravaer && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-[oklch(0.72_0.14_25/0.5)] bg-[oklch(0.95_0.03_25)] px-2.5 py-1 text-sm font-semibold text-[oklch(0.42_0.16_25)] dark:border-[oklch(0.58_0.18_25/0.35)] dark:bg-[oklch(0.28_0.03_25/0.75)] dark:text-[oklch(0.79_0.12_25)]">
                    <AlertTriangle size={14} />
                    {getAssignmentFravaerLabel(entry)}
                  </span>
                )}
                {entry.status === 'mangler' && getExerciseIdFromUrl(entry.url) && (
                  <button
                    type="button"
                    className="inline-flex items-center rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent cursor-pointer dark:border-[oklch(0.38_0.004_285)] dark:bg-[oklch(0.2_0.003_285)] dark:text-[oklch(0.66_0.006_285)] dark:hover:border-[oklch(0.5_0.006_285)] dark:hover:bg-[oklch(0.24_0.003_285)] dark:hover:text-[oklch(0.86_0.003_90)]"
                    onClick={toggleIgnoreMissing}
                  >
                    {ignoredMissing ? 'Vis igen som manglende' : 'Ignorer manglende'}
                  </button>
                )}
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
                  type="button"
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
                  className="rounded-xl border border-border bg-card p-4 text-base text-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2"
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
                      className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-base font-medium text-foreground no-underline transition-colors hover:bg-accent/40"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileDown size={16} />
                      {file.name}
                    </a>
                  ))}
                </div>
              )}

              {/* Group members */}
              {(detail.groupMembers.length > 0 || detail.hasGroupForm) && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                      <Users size={16} />
                      Gruppeaflevering
                      <span className="ml-1 inline-flex min-w-6 items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                        {detail.groupMembers.length}
                      </span>
                    </h3>

                    {/* Current members */}
                    <div className="space-y-2">
                      {detail.groupMembers.map((member) => (
                        <GroupMemberRow
                          key={member.contextCardId}
                          member={member}
                          schoolId={schoolId}
                          removing={groupRemoving === member.contextCardId}
                          onRemove={member.removePostbackTarget
                            ? () => handleRemoveGroupMember(member.removePostbackTarget!, member.removePostbackArgument!, member.contextCardId)
                            : undefined
                          }
                        />
                      ))}
                    </div>

                    {/* Add member */}
                    {detail.hasGroupForm && (
                      <GroupStudentPicker
                        students={detail.availableGroupStudents}
                        schoolId={schoolId}
                        adding={groupAdding}
                        onAdd={handleAddGroupMember}
                      />
                    )}
                  </div>
                </>
              )}

              <Separator />

              {/* Student status */}
              {detail.students.length > 0 && (
                <div className="space-y-3">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                    <User size={16} />
                    Status
                  </h3>
                  {detail.students.map((student, i) => (
                    <div key={i} className="rounded-xl border border-border bg-card px-4 py-3">
                      <div className="text-base font-semibold text-foreground">{student.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        {student.awaiting && (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-2 py-0.5 text-sm font-medium",
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
                            className="inline-flex items-center rounded-md border border-border bg-background px-2 py-1 text-sm font-semibold text-foreground"
                            style={{ '--grade-hue': getGradeHue(student.grade) } as any}
                          >
                            {student.grade}
                          </span>
                          {student.gradeNote && (
                            <span className="text-sm text-muted-foreground">{student.gradeNote}</span>
                          )}
                        </div>
                      )}
                      {student.studentNote && (
                        <div className="mt-2 text-base text-foreground">{student.studentNote}</div>
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
                    <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                      <FileText size={16} />
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
                            <span className="inline-flex items-center gap-2 text-base font-semibold text-foreground">
                              {historyEntry.isTeacher ? <GraduationCap size={14} /> : <User size={14} />}
                              {historyEntry.user}
                            </span>
                            <span className="text-sm text-muted-foreground">{historyEntry.timestamp}</span>
                          </div>
                          {historyEntry.comment && (
                            <p className="mt-2 whitespace-pre-wrap text-base text-foreground">{historyEntry.comment}</p>
                          )}
                          {historyEntry.documentName && (
                            <a
                              href={historyEntry.documentUrl}
                              className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-base font-medium text-foreground no-underline transition-colors hover:bg-accent/40"
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
                  className="min-h-12 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Skriv en kommentar..."
                  value={comment}
                  onInput={(e) => setComment((e.target as HTMLTextAreaElement).value)}
                  rows={2}
                  disabled={submitting}
                />

                {/* File drop zone */}
                <button
                  type="button"
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
                  disabled={submitting}
                >
                  {selectedFile ? (
                    <div className="flex items-center gap-2">
                      <FileText size={16} />
                      <span className="min-w-0 flex-1 truncate text-base font-medium text-foreground">
                        {selectedFile.name}
                      </span>
                      <span className="shrink-0 text-sm text-muted-foreground">
                        {formatFileSize(selectedFile.size)}
                      </span>
                      <button
                        type="button"
                        className="ml-1 inline-flex size-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-base text-muted-foreground">
                      <Upload size={16} />
                      <span>Vælg fil eller træk hertil</span>
                    </div>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={submitting}
                />

                {/* Send button */}
                <button
                  type="button"
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
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
                className="flex items-center justify-center gap-2 border-t border-border px-7 py-3 text-base font-medium text-muted-foreground no-underline transition-colors hover:bg-accent hover:text-foreground"
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
      <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-base font-medium text-foreground">
        {value}
      </div>
    </div>
  );
}

// ── Group member with picture ──────────────────────────────────────────

function GroupMemberAvatar({ contextCardId, name, schoolId, size = 32 }: {
  contextCardId: string;
  name: string;
  schoolId: string;
  size?: number;
}) {
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!contextCardId) return;
    const cached = getCachedPictureUrl(contextCardId);
    if (cached !== undefined) {
      setPictureUrl(cached);
      return;
    }
    fetchPictureUrl(contextCardId, schoolId).then(setPictureUrl);
  }, [contextCardId, schoolId]);

  const initials = name
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  return (
    <div
      className="shrink-0 overflow-hidden rounded-full bg-muted"
      style={{ width: size, height: size }}
    >
      {pictureUrl ? (
        <img
          src={pictureUrl}
          alt=""
          className="size-full object-cover object-top"
          loading="lazy"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-xs font-medium text-muted-foreground">
          {initials}
        </div>
      )}
    </div>
  );
}

function GroupMemberRow({ member, schoolId, removing, onRemove }: {
  member: import('@/lib/opgave-detail').GroupMember;
  schoolId: string;
  removing: boolean;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
      <GroupMemberAvatar
        contextCardId={member.contextCardId}
        name={member.name}
        schoolId={schoolId}
      />
      <span className="min-w-0 flex-1 truncate text-base font-medium text-foreground">
        {member.name}
      </span>
      {onRemove && (
        <button
          type="button"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          onClick={onRemove}
          disabled={removing}
          aria-label={`Fjern ${member.name}`}
        >
          {removing ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
        </button>
      )}
    </div>
  );
}

// ── Group student picker with pictures ────────────────────────────────

function GroupStudentPicker({ students, schoolId, adding, onAdd }: {
  students: AvailableGroupStudent[];
  schoolId: string;
  adding: boolean;
  onAdd: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = search
    ? students.filter((s) =>
        s.name.toLowerCase().includes(search.toLowerCase()),
      )
    : students;

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [search]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [isOpen]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const items = listRef.current.children;
    if (items[highlightIndex]) {
      (items[highlightIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex, isOpen]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[highlightIndex]) {
          onAdd(filtered[highlightIndex].value);
          setIsOpen(false);
          setSearch('');
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {isOpen ? (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border border-dashed border-border bg-card px-4 py-2.5 transition-colors",
            adding ? "cursor-not-allowed opacity-70" : "hover:bg-accent/20",
            "border-ring ring-2 ring-ring/20",
          )}
        >
          {adding ? (
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          ) : (
            <Plus size={16} className="text-muted-foreground" />
          )}
          <input
            ref={inputRef}
            className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Søg efter elev..."
            value={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            onKeyDown={handleKeyDown}
          />
          {!adding && (
            <ChevronDown size={16} className="ml-auto rotate-180 text-muted-foreground transition-transform" />
          )}
        </div>
      ) : (
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-xl border border-dashed border-border bg-card px-4 py-2.5 text-left transition-colors",
            adding ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-accent/20",
          )}
          onClick={() => {
            if (!adding) {
              setIsOpen(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }
          }}
          disabled={adding}
        >
          {adding ? (
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          ) : (
            <Plus size={16} className="text-muted-foreground" />
          )}
          <span className="text-base text-muted-foreground">
            {adding ? 'Tilføjer...' : 'Tilføj gruppemedlem'}
          </span>
          {!adding && <ChevronDown size={16} className="ml-auto text-muted-foreground transition-transform" />}
        </button>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg">
          <div ref={listRef}>
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">Ingen elever fundet</div>
            ) : (
              filtered.map((student, i) => (
                <GroupStudentOption
                  key={student.value}
                  student={student}
                  schoolId={schoolId}
                  highlighted={i === highlightIndex}
                  onSelect={() => {
                    onAdd(student.value);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  onHover={() => setHighlightIndex(i)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GroupStudentOption({ student, schoolId, highlighted, onSelect, onHover }: {
  student: AvailableGroupStudent;
  schoolId: string;
  highlighted: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  // Extract student context card ID from the dropdown value
  // The value is the student's numeric ID. Context card IDs for students are S + numeric ID.
  const contextCardId = `S${student.value}`;

  return (
    <button
      type="button"
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors",
        highlighted ? "bg-accent" : "hover:bg-accent/50",
      )}
      onClick={onSelect}
      onMouseEnter={onHover}
    >
      <GroupMemberAvatar
        contextCardId={contextCardId}
        name={student.name}
        schoolId={schoolId}
        size={28}
      />
      <span className="min-w-0 flex-1 truncate text-base text-foreground">
        {student.name}
      </span>
    </button>
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
