import { useState, useEffect, useRef, useCallback, useMemo } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { captureException } from '@/lib/posthog';
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
  Hourglass,
  FileText,
  Plus,
  ChevronDown,
  MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchOpgaveDetail,
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
import { getDisplayNameFromLookupId, getPictureUrlFromLookupId, useSchoolStudents, type StudentsMap } from '@/lib/supabase/student-lookup';
import { useTranslation, type TFunction } from '@/lib/i18n';

// ── Types ──────────────────────────────────────────────────────────────

import type { OpgaveEntry } from '@/components/OpgaverPage';

interface OpgaveDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: OpgaveEntry | null;
  schoolId: string;
}

type DerivedStatus = 'mangler' | 'venter' | 'afleveret' | 'bedoemt';

// ── Helpers ────────────────────────────────────────────────────────────

function getGradeHue(grade: string): number {
  const g = grade.trim();
  switch (g) {
    case '12': return 145;
    case '10': return 130;
    case '7': return 85;
    case '4': return 55;
    case '02': return 40;
    case '00': return 25;
    case '-3': return 10;
    default: return 145;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseAbsencePercent(absence: string): number | null {
  const normalized = absence.replace(/\s| /g, '').replace(',', '.');
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

function getAssignmentFravaerLabel(entry: Pick<OpgaveEntry, 'absence'>, fallback: string): string {
  const absencePercent = parseAbsencePercent(entry.absence);
  if (absencePercent === null) return fallback;
  return `${fallback} ${String(absencePercent).replace('.', ',')} %`;
}

function deriveStatus(entry: OpgaveEntry): DerivedStatus {
  if (entry.status === 'mangler') return 'mangler';
  if (entry.status === 'venter') return 'venter';
  if (entry.grade && entry.grade.trim()) return 'bedoemt';
  return 'afleveret';
}

function formatRelativeDeadline(deadline: Date, now: Date, isMissing: boolean, t: TFunction): string | null {
  if (!deadline || Number.isNaN(deadline.getTime())) return null;
  const diffMs = deadline.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);
  const minutes = Math.floor(absMs / 60_000);
  const hours = Math.floor(absMs / 3_600_000);
  const days = Math.floor(absMs / 86_400_000);

  const sameDay =
    deadline.getFullYear() === now.getFullYear() &&
    deadline.getMonth() === now.getMonth() &&
    deadline.getDate() === now.getDate();

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    deadline.getFullYear() === tomorrow.getFullYear() &&
    deadline.getMonth() === tomorrow.getMonth() &&
    deadline.getDate() === tomorrow.getDate();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    deadline.getFullYear() === yesterday.getFullYear() &&
    deadline.getMonth() === yesterday.getMonth() &&
    deadline.getDate() === yesterday.getDate();

  if (sameDay) return t('opgaveDetail.deadline.today');
  if (diffMs >= 0 && isTomorrow) return t('opgaveDetail.deadline.tomorrow');
  if (diffMs < 0 && isYesterday) return t('opgaveDetail.deadline.yesterday');

  let unit: string;
  if (days >= 1) {
    unit = days === 1
      ? t('opgaveDetail.deadline.units.dayOne')
      : t('opgaveDetail.deadline.units.day', { n: String(days) });
  } else if (hours >= 1) {
    unit = t('opgaveDetail.deadline.units.hour', { n: String(hours) });
  } else {
    unit = t('opgaveDetail.deadline.units.minute', { n: String(Math.max(minutes, 1)) });
  }
  if (diffMs >= 0) return t('opgaveDetail.deadline.dueIn', { value: unit });
  return isMissing
    ? t('opgaveDetail.deadline.overdueBy', { value: unit })
    : t('opgaveDetail.deadline.wasDueAgo', { value: unit });
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// ── Component ──────────────────────────────────────────────────────────

export function OpgaveDetailSheet({ open, onOpenChange, entry, schoolId }: OpgaveDetailSheetProps) {
  const { t } = useTranslation();
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
  const [groupRemoving, setGroupRemoving] = useState<string | null>(null);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [submitFormOpen, setSubmitFormOpen] = useState(false);
  const { studentsMap } = useSchoolStudents(schoolId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDetail = useCallback(async (url: string) => {
    setError(null);
    setLoading(true);
    try {
      const fetched = await fetchOpgaveDetail(url);
      setDetail(fetched);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ukendt fejl';
      if (message === 'SESSION_EXPIRED') {
        setError(t('opgaveDetail.errors.sessionExpired'));
      } else {
        setError(t('opgaveDetail.errors.fetchFailed'));
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
      setShowAllEntries(false);
      setSubmitFormOpen(false);
      loadDetail(entry.url);

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
        success = await uploadFileAndSubmit(detail, selectedFile, comment.trim(), schoolId, setSubmitStatus);
      } else {
        success = await submitComment(detail, comment.trim(), setSubmitStatus);
      }

      if (success) {
        toast.success(t('opgaveDetail.success.entrySent'));
        setComment('');
        setSelectedFile(null);
        setSubmitFormOpen(false);
        loadDetail(entry.url);
        window.dispatchEvent(
          new CustomEvent('betterlectio:opgaveSubmitted', {
            detail: { url: entry.url, exerciseId: getExerciseIdFromUrl(entry.url) },
          }),
        );
      } else {
        toast.error(t('opgaveDetail.errors.sendFailed'));
      }
    } catch (err) {
      captureException(err, undefined, { source: 'opgave-submit' });
      toast.error(t('opgaveDetail.errors.sendError'));
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
        toast.error(t('opgaveDetail.errors.fileTooLarge'));
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
        toast.error(t('opgaveDetail.errors.fileTooLarge'));
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
        toast.success(t('opgaveDetail.success.groupMemberAdded'));
      } else {
        toast.error(t('opgaveDetail.errors.groupAddFailed'));
      }
    } catch {
      toast.error(t('opgaveDetail.errors.groupError'));
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
        toast.success(t('opgaveDetail.success.groupMemberRemoved'));
      } else {
        toast.error(t('opgaveDetail.errors.groupRemoveFailed'));
      }
    } catch {
      toast.error(t('opgaveDetail.errors.groupError'));
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

  // ── Derived values ──────────────────────────────────────────────────
  const derivedStatus: DerivedStatus | null = entry ? deriveStatus(entry) : null;
  const holdHue = entry ? getHoldHue(entry.hold) : 200;
  const hasFravaer = entry ? hasAssignmentFravaer(entry) : false;
  const fravaerLabel = entry ? getAssignmentFravaerLabel(entry, t('opgaveDetail.absenceRegistered')) : '';

  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [open]);

  const relativeDeadline = useMemo(() => {
    if (!entry?.deadline) return null;
    return formatRelativeDeadline(entry.deadline, new Date(nowTick), entry.status === 'mangler', t);
  }, [entry?.deadline, entry?.status, nowTick, t]);

  const awaitingLabel = useMemo(() => {
    const raw = (detail?.students[0]?.awaiting || entry?.awaiting || '').trim();
    if (!raw) return '';
    if (/l[aæ]rer/i.test(raw)) return t('opgaveDetail.awaiting.laerer');
    if (/elev/i.test(raw)) return t('opgaveDetail.awaiting.elev');
    return raw;
  }, [detail?.students, entry?.awaiting, t]);

  const latestReturn = useMemo(() => {
    if (!detail) return null;
    for (let i = detail.entries.length - 1; i >= 0; i--) {
      if (detail.entries[i].isReturn) return detail.entries[i];
    }
    return null;
  }, [detail]);

  const latestStudentSubmission = useMemo(() => {
    if (!detail) return null;
    for (let i = detail.entries.length - 1; i >= 0; i--) {
      if (!detail.entries[i].isTeacher) return detail.entries[i];
    }
    return null;
  }, [detail]);

  const submittedAgoLabel = useMemo(() => {
    if (derivedStatus !== 'afleveret') return null;
    const raw = latestStudentSubmission?.timestamp?.trim();
    if (!raw) return null;
    // Lectio timestamps look like "28/2-2026 14:03" or "28-2-2026 14:03".
    const match = raw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ ,]+(\d{1,2}):(\d{2}))?/);
    if (!match) return null;
    const [, d, m, y, hh = '0', mm = '0'] = match;
    const year = Number(y) < 100 ? 2000 + Number(y) : Number(y);
    const submittedAt = new Date(year, Number(m) - 1, Number(d), Number(hh), Number(mm));
    if (Number.isNaN(submittedAt.getTime())) return null;

    const now = new Date(nowTick);
    const diffMs = now.getTime() - submittedAt.getTime();
    if (diffMs < 0) return null;

    const minutes = Math.floor(diffMs / 60_000);
    const hours = Math.floor(diffMs / 3_600_000);
    const days = Math.floor(diffMs / 86_400_000);

    const sameDay =
      submittedAt.getFullYear() === now.getFullYear()
      && submittedAt.getMonth() === now.getMonth()
      && submittedAt.getDate() === now.getDate();
    if (sameDay) return t('opgaveDetail.awaiting.submittedToday');

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday =
      submittedAt.getFullYear() === yesterday.getFullYear()
      && submittedAt.getMonth() === yesterday.getMonth()
      && submittedAt.getDate() === yesterday.getDate();
    if (isYesterday) return t('opgaveDetail.awaiting.submittedYesterday');

    let unit: string;
    if (days >= 1) {
      unit = days === 1
        ? t('opgaveDetail.deadline.units.dayOne')
        : t('opgaveDetail.deadline.units.day', { n: String(days) });
    } else if (hours >= 1) {
      unit = t('opgaveDetail.deadline.units.hour', { n: String(hours) });
    } else {
      unit = t('opgaveDetail.deadline.units.minute', { n: String(Math.max(minutes, 1)) });
    }
    return t('opgaveDetail.awaiting.submittedAgo', { value: unit });
  }, [derivedStatus, latestStudentSubmission?.timestamp, nowTick, t]);

  const gradeStudent = useMemo(() => {
    if (!detail) return null;
    return detail.students.find(s => s.grade && s.grade.trim()) || null;
  }, [detail]);

  const displayGrade = (gradeStudent?.grade || entry?.grade || '').trim();
  const gradeNote = (gradeStudent?.gradeNote || entry?.gradeExtra || '').trim();
  const studentNote = gradeStudent?.studentNote?.trim() || '';

  const showCustomGradeScale = !!detail?.gradeScale
    && detail.gradeScale.trim() !== ''
    && !/^7[-\s]*trin/i.test(detail.gradeScale.trim());

  if (!open) return null;

  const submitLabel =
    submitStatus === 'uploading'
      ? t('opgaveDetail.submit.uploading')
      : submitStatus === 'sending'
        ? t('opgaveDetail.submit.sending')
        : submitStatus === 'verifying'
          ? t('opgaveDetail.submit.verifying')
          : t('opgaveDetail.submit.sending2');

  // For bedoemt the latest return is already featured in GradeHero — don't
  // render it again in the timeline.
  const timelineEntries = detail
    ? (derivedStatus === 'bedoemt' && latestReturn
      ? detail.entries.filter(e => e !== latestReturn)
      : detail.entries)
    : [];
  const visibleEntries = showAllEntries ? timelineEntries : timelineEntries.slice(-3);
  const hiddenEntryCount = Math.max(0, timelineEntries.length - visibleEntries.length);

  const shouldCollapseSubmit = derivedStatus === 'bedoemt' || derivedStatus === 'afleveret';
  const submitFormExpanded = !shouldCollapseSubmit || submitFormOpen;

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
        className="absolute right-0 top-0 bottom-0 flex w-[92%] max-w-xl flex-col overflow-hidden border-l border-border bg-background shadow-[-12px_0_48px_oklch(0_0_0/0.12)] animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-label={entry?.title || t('opgaveDetail.defaultTitle')}
      >
        {/* Close */}
        <button
          type="button"
          className="absolute right-5 top-5 z-10 inline-flex size-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-[color,background-color] duration-150 hover:bg-muted hover:text-foreground cursor-pointer"
          onClick={() => onOpenChange(false)}
          aria-label={t('opgaveDetail.closeLabel')}
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="shrink-0 border-b border-border px-7 pb-5 pt-7">
          <div className="flex flex-col gap-3">
            <h2 className="pr-12 text-2xl font-bold tracking-[-0.02em] text-foreground leading-snug">
              {entry?.title || t('opgaveDetail.defaultTitle')}
            </h2>
            {entry && (
              <div className="flex flex-wrap items-center gap-2">
                {derivedStatus && <StatusChip status={derivedStatus} t={t} />}
                <span
                  className="inline-flex items-center rounded-md border border-border px-2 py-1 text-sm font-medium text-foreground"
                  style={{ '--hold-hue': holdHue } as any}
                >
                  {getHoldDisplayName(entry.hold)}
                </span>
                {relativeDeadline && (
                  <span className="inline-flex items-center gap-1.5 text-base text-foreground">
                    <Clock size={15} className="text-muted-foreground" />
                    <span className="font-medium">{relativeDeadline}</span>
                    {(entry.status === 'mangler' || entry.deadline.getTime() >= nowTick) && (
                      <span className="text-muted-foreground">· {entry.deadlineText}</span>
                    )}
                  </span>
                )}
                {detail?.studentTime && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-sm font-medium text-foreground">
                    <Hourglass size={13} className="text-muted-foreground" />
                    {t('opgaveDetail.meta.studentTime', { value: detail.studentTime })}
                  </span>
                )}
                {awaitingLabel && derivedStatus === 'afleveret' && (
                  <span className="inline-flex items-center rounded-md border border-border bg-muted/60 px-2 py-1 text-sm font-medium text-foreground">
                    {awaitingLabel}
                  </span>
                )}
                {submittedAgoLabel && (
                  <span className="inline-flex items-center rounded-md border border-border bg-background px-2 py-1 text-sm text-muted-foreground">
                    {submittedAgoLabel}
                  </span>
                )}
                {hasFravaer && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-[oklch(0.72_0.14_25/0.5)] bg-[oklch(0.95_0.03_25)] px-2.5 py-1 text-sm font-semibold text-[oklch(0.42_0.16_25)] dark:border-[oklch(0.58_0.18_25/0.35)] dark:bg-[oklch(0.28_0.03_25/0.75)] dark:text-[oklch(0.79_0.12_25)]">
                    <AlertTriangle size={14} />
                    {fravaerLabel}
                  </span>
                )}
                {entry.status === 'mangler' && getExerciseIdFromUrl(entry.url) && (
                  <button
                    type="button"
                    className="inline-flex items-center rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium transition-[color,background-color] duration-150 hover:bg-accent cursor-pointer dark:border-[oklch(0.38_0.004_285)] dark:bg-[oklch(0.2_0.003_285)] dark:text-[oklch(0.66_0.006_285)] dark:hover:border-[oklch(0.5_0.006_285)] dark:hover:bg-[oklch(0.24_0.003_285)] dark:hover:text-[oklch(0.86_0.003_90)]"
                    onClick={toggleIgnoreMissing}
                  >
                    {ignoredMissing ? t('opgaveDetail.showAsMissing') : t('opgaveDetail.ignoreMissing')}
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
                  className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground transition-[color,background-color] duration-150 hover:bg-accent cursor-pointer"
                  onClick={() => entry && loadDetail(entry.url)}
                >
                  {t('opgaveDetail.retry')}
                </button>
                {entry && (
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-[color,background-color] duration-150 hover:bg-accent hover:text-foreground no-underline"
                  >
                    <ExternalLink size={15} />
                    {t('opgaveDetail.openInLectio')}
                  </a>
                )}
              </div>
            </div>
          )}

          {detail && !loading && !error && (() => {
            // "Brief" sections — the assignment description. Primary for
            // mangler/venter/afleveret, demoted below the feedback for bedoemt.
            const briefSections = (
              <>
                {detail.note && (
                  <div className="space-y-2">
                    <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                      <MessageSquare size={16} />
                      {t('opgaveDetail.primary.teacherNote')}
                    </h3>
                    <div
                      className="rounded-xl border border-border bg-card p-4 text-base text-foreground leading-relaxed [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(detail.note) }}
                    />
                  </div>
                )}
                {detail.descriptionFiles.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                      <FileText size={16} />
                      {t('opgaveDetail.primary.taskFiles')}
                    </h3>
                    <div className="flex flex-col gap-2">
                      {detail.descriptionFiles.map((file, i) => (
                        <a
                          key={i}
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-base font-medium text-foreground no-underline transition-[color,background-color] duration-150 hover:bg-accent/40"
                        >
                          <FileDown size={16} className="text-muted-foreground" />
                          <span className="truncate">{file.name}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
            const hasBrief = !!detail.note || detail.descriptionFiles.length > 0;
            const hasGradeHero = derivedStatus === 'bedoemt' && !!displayGrade;
            const hasGroup = detail.groupMembers.length > 0 || detail.hasGroupForm;
            const bodyIsEmpty = !hasGradeHero && !hasBrief && !hasGroup && timelineEntries.length === 0;
            const emptyCopy = derivedStatus === 'mangler' || derivedStatus === 'venter'
              ? t('opgaveDetail.empty.pendingCopy')
              : t('opgaveDetail.empty.otherCopy');

            return (
            <>
              {/* Grade hero — primary for graded assignments */}
              {derivedStatus === 'bedoemt' && displayGrade && (
                <GradeHero
                  grade={displayGrade}
                  gradeNote={gradeNote}
                  studentNote={studentNote}
                  latestReturn={latestReturn}
                  t={t}
                />
              )}

              {/* Brief — primary for non-graded */}
              {derivedStatus !== 'bedoemt' && briefSections}

              {/* Empty state — when the teacher has added nothing */}
              {bodyIsEmpty && (
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/40 px-6 py-10 text-center">
                  <FileText size={28} className="text-muted-foreground/60" />
                  <h3 className="text-base font-semibold text-foreground">
                    {t('opgaveDetail.empty.title')}
                  </h3>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    {emptyCopy}
                  </p>
                </div>
              )}

              {/* Group members */}
              {(detail.groupMembers.length > 0 || detail.hasGroupForm) && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                      <Users size={16} />
                      {t('opgaveDetail.groupSection.title')}
                      <span className="ml-1 inline-flex min-w-6 items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                        {detail.groupMembers.length}
                      </span>
                    </h3>

                    <div className="space-y-2">
                      {detail.groupMembers.map((member) => (
                        <GroupMemberRow
                          key={member.contextCardId}
                          member={member}
                          schoolId={schoolId}
                          studentsMap={studentsMap}
                          removing={groupRemoving === member.contextCardId}
                          onRemove={member.removePostbackTarget
                            ? () => handleRemoveGroupMember(member.removePostbackTarget!, member.removePostbackArgument!, member.contextCardId)
                            : undefined
                          }
                        />
                      ))}
                    </div>

                    {detail.hasGroupForm && (
                      <GroupStudentPicker
                        students={detail.availableGroupStudents}
                        schoolId={schoolId}
                        studentsMap={studentsMap}
                        adding={groupAdding}
                        onAdd={handleAddGroupMember}
                      />
                    )}
                  </div>
                </>
              )}

              {/* Timeline */}
              {timelineEntries.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                        <FileText size={16} />
                        {t('opgaveDetail.timeline.title')}
                        <span className="ml-1 inline-flex min-w-6 items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                          {timelineEntries.length}
                        </span>
                      </h3>
                      {timelineEntries.length > 3 && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
                          onClick={() => setShowAllEntries(v => !v)}
                        >
                          {showAllEntries
                            ? t('opgaveDetail.timeline.showFewer')
                            : t('opgaveDetail.timeline.showAll', { n: String(hiddenEntryCount) })}
                        </button>
                      )}
                    </div>
                    <div className="space-y-3">
                      {visibleEntries.map((historyEntry, i) => (
                        <TimelineEntryCard
                          key={`${historyEntry.timestamp}-${i}`}
                          entry={historyEntry}
                          studentsMap={studentsMap}
                          t={t}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Brief — demoted for graded assignments (reference material) */}
              {derivedStatus === 'bedoemt' && hasBrief && (
                <>
                  <Separator />
                  {briefSections}
                </>
              )}

              {/* Meta line — (non-standard) karakterskala · ansvarlig */}
              {(showCustomGradeScale || detail.responsible) && (() => {
                const parts: string[] = [];
                if (showCustomGradeScale) parts.push(detail.gradeScale);
                if (detail.responsible) parts.push(t('opgaveDetail.meta.responsible', { name: detail.responsible }));
                return (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-4 text-sm text-muted-foreground">
                    {parts.map((part, i) => (
                      <span key={i} className="inline-flex items-center gap-3">
                        {i > 0 && <span aria-hidden="true" className="text-muted-foreground/50">·</span>}
                        <span>{part}</span>
                      </span>
                    ))}
                  </div>
                );
              })()}
            </>
            );
          })()}
        </div>

        {/* Footer — submission form + "Åbn i Lectio" */}
        {detail && !error && (
          <div className="shrink-0 border-t border-border bg-background">
            {detail.hasSubmissionForm && shouldCollapseSubmit && !submitFormOpen && (
              <button
                type="button"
                className="flex w-full cursor-pointer items-center justify-center gap-2 px-7 py-3 text-sm font-medium text-muted-foreground transition-[color,background-color] duration-150 hover:bg-accent hover:text-foreground"
                onClick={() => setSubmitFormOpen(true)}
              >
                <Plus size={14} />
                {t('opgaveDetail.submit.addCommentOrFile')}
              </button>
            )}

            {detail.hasSubmissionForm && submitFormExpanded && (
              <div className="space-y-3 px-7 py-5">
                {shouldCollapseSubmit && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('opgaveDetail.submit.addCommentOrFile')}
                    </span>
                    <button
                      type="button"
                      className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color] duration-150 hover:bg-muted hover:text-foreground cursor-pointer"
                      onClick={() => {
                        setSubmitFormOpen(false);
                        setComment('');
                        setSelectedFile(null);
                      }}
                      aria-label={t('opgaveDetail.closeLabel')}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                <textarea
                  className="min-h-12 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder={t('opgaveDetail.submit.commentPlaceholder')}
                  value={comment}
                  onInput={(e) => setComment((e.target as HTMLTextAreaElement).value)}
                  rows={2}
                  disabled={submitting}
                />

                <button
                  type="button"
                  className={cn(
                    "group relative cursor-pointer rounded-xl border border-dashed border-border bg-card px-4 py-3 transition-[color,background-color] duration-150 hover:bg-accent/20",
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
                        className="ml-1 inline-flex size-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-[color,background-color] duration-150 hover:bg-accent hover:text-foreground"
                        onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-base text-muted-foreground">
                      <Upload size={16} />
                      <span>{t('opgaveDetail.submit.fileDropLabel')}</span>
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
                  {submitting ? submitLabel : t('opgaveDetail.submit.sendButton')}
                </button>
              </div>
            )}

            {entry && (
              <a
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center justify-center gap-2 px-7 py-3 text-sm font-medium text-muted-foreground no-underline transition-[color,background-color] duration-150 hover:bg-accent hover:text-foreground",
                  detail.hasSubmissionForm && "border-t border-border",
                )}
              >
                <ExternalLink size={14} />
                {t('opgaveDetail.openInLectio')}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const portalTarget = document.getElementById('il-root') || document.body;
  return createPortal(sheetContent, portalTarget);
}

// ── Sub-components ─────────────────────────────────────────────────────

function StatusChip({ status, t }: { status: DerivedStatus; t: TFunction }) {
  const styles: Record<DerivedStatus, string> = {
    mangler: 'border-[oklch(0.72_0.14_25/0.55)] bg-[oklch(0.96_0.03_25)] text-[oklch(0.42_0.18_25)] dark:border-[oklch(0.58_0.18_25/0.4)] dark:bg-[oklch(0.3_0.04_25/0.7)] dark:text-[oklch(0.82_0.14_25)]',
    venter: 'border-[oklch(0.74_0.13_70/0.55)] bg-[oklch(0.97_0.04_70)] text-[oklch(0.44_0.14_70)] dark:border-[oklch(0.6_0.14_70/0.4)] dark:bg-[oklch(0.3_0.04_70/0.65)] dark:text-[oklch(0.84_0.12_70)]',
    afleveret: 'border-border bg-muted/60 text-foreground',
    bedoemt: 'border-[oklch(0.72_0.14_145/0.55)] bg-[oklch(0.96_0.04_145)] text-[oklch(0.36_0.12_145)] dark:border-[oklch(0.58_0.14_145/0.45)] dark:bg-[oklch(0.28_0.04_145/0.55)] dark:text-[oklch(0.82_0.12_145)]',
  };
  const label: Record<DerivedStatus, string> = {
    mangler: t('opgaveDetail.status.mangler'),
    venter: t('opgaveDetail.status.venter'),
    afleveret: t('opgaveDetail.status.afleveret'),
    bedoemt: t('opgaveDetail.status.bedoemt'),
  };
  return (
    <span className={cn(
      "inline-flex items-center rounded-md border px-2.5 py-1 text-sm font-semibold",
      styles[status],
    )}>
      {label[status]}
    </span>
  );
}

function GradeHero({
  grade,
  gradeNote,
  studentNote,
  latestReturn,
  t,
}: {
  grade: string;
  gradeNote: string;
  studentNote: string;
  latestReturn: OpgaveDetail['entries'][number] | null;
  t: TFunction;
}) {
  const hue = getGradeHue(grade);
  return (
    <div
      className="overflow-hidden rounded-xl border bg-card"
      style={{ borderColor: `oklch(0.75 0.12 ${hue} / 0.45)` }}
    >
      <div className="flex items-stretch gap-4 p-4">
        <div
          className="flex size-24 shrink-0 items-center justify-center rounded-xl text-4xl font-bold tracking-tight"
          style={{
            background: `oklch(0.96 0.05 ${hue})`,
            color: `oklch(0.32 0.14 ${hue})`,
          }}
        >
          {grade}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('opgaveDetail.primary.gradeLabel')}
          </div>
          {gradeNote && <div className="text-base font-medium text-foreground">{gradeNote}</div>}
          {studentNote && <div className="text-sm text-muted-foreground">{studentNote}</div>}
        </div>
      </div>

      {(latestReturn?.comment || latestReturn?.documentName) && (
        <div className="border-t border-border bg-background/40 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <GraduationCap size={14} />
            {t('opgaveDetail.primary.teacherFeedback')}
          </div>
          {latestReturn.comment && (
            <p className="whitespace-pre-wrap text-base text-foreground leading-relaxed">
              {latestReturn.comment}
            </p>
          )}
          {latestReturn.documentName && (
            <a
              href={latestReturn.documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-base font-medium text-foreground no-underline transition-[color,background-color] duration-150 hover:bg-accent/40"
            >
              <FileDown size={15} className="text-muted-foreground" />
              <span className="truncate">{latestReturn.documentName}</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function TimelineEntryCard({
  entry,
  studentsMap,
  t,
}: {
  entry: OpgaveDetail['entries'][number];
  studentsMap: StudentsMap | null;
  t: TFunction;
}) {
  const displayName = getDisplayNameFromLookupId(studentsMap, entry.userContextCardId, entry.user);
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3",
        entry.isReturn
          ? "border-[oklch(0.72_0.14_145/0.55)] bg-[oklch(0.96_0.04_145)] dark:border-[oklch(0.58_0.14_145/0.45)] dark:bg-[oklch(0.28_0.04_145/0.5)]"
          : entry.isTeacher
            ? "border-border/70 bg-muted/30"
            : "border-border bg-card",
      )}
    >
      {entry.isReturn && (
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[oklch(0.72_0.14_145/0.6)] bg-[oklch(0.98_0.02_145)] px-2 py-0.5 text-xs font-semibold text-[oklch(0.38_0.12_145)] dark:border-[oklch(0.58_0.14_145/0.5)] dark:bg-[oklch(0.32_0.06_145/0.6)] dark:text-[oklch(0.82_0.12_145)]">
          <GraduationCap size={12} />
          {t('opgaveDetail.timeline.teacherReturn')}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-base font-semibold text-foreground">
          {entry.isTeacher ? <GraduationCap size={14} /> : <User size={14} />}
          {displayName}
        </span>
        <span className="text-sm text-muted-foreground">{entry.timestamp}</span>
      </div>
      {entry.comment && (
        <p className="mt-2 whitespace-pre-wrap text-base text-foreground">{entry.comment}</p>
      )}
      {entry.documentName && (
        <a
          href={entry.documentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "mt-3 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-base font-medium no-underline transition-[color,background-color] duration-150",
            entry.isReturn
              ? "border-[oklch(0.72_0.14_145/0.5)] bg-background text-foreground hover:bg-[oklch(0.98_0.02_145)] dark:border-[oklch(0.58_0.14_145/0.4)] dark:hover:bg-[oklch(0.32_0.06_145/0.4)]"
              : "border-border bg-background text-foreground hover:bg-accent/40",
          )}
        >
          <FileDown size={15} />
          <span className="truncate">{entry.documentName}</span>
        </a>
      )}
    </div>
  );
}

// ── Group member with picture ──────────────────────────────────────────

function GroupMemberAvatar({ contextCardId, name, schoolId, size = 32, studentsMap }: {
  contextCardId: string;
  name: string;
  schoolId: string;
  size?: number;
  studentsMap: StudentsMap | null;
}) {
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const displayName = getDisplayNameFromLookupId(studentsMap, contextCardId, name);
  const preferredPictureUrl = getPictureUrlFromLookupId(studentsMap, contextCardId);

  useEffect(() => {
    if (preferredPictureUrl) {
      setPictureUrl(preferredPictureUrl);
      return;
    }
    if (!contextCardId) return;
    const cached = getCachedPictureUrl(contextCardId);
    if (cached !== undefined) {
      setPictureUrl(cached);
      return;
    }
    fetchPictureUrl(contextCardId, schoolId).then(setPictureUrl);
  }, [contextCardId, preferredPictureUrl, schoolId]);

  const initials = displayName
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
        <img src={pictureUrl} alt="" className="size-full object-cover object-top" loading="lazy" />
      ) : (
        <div className="flex size-full items-center justify-center text-xs font-medium text-muted-foreground">
          {initials}
        </div>
      )}
    </div>
  );
}

function GroupMemberRow({ member, schoolId, removing, onRemove, studentsMap }: {
  member: import('@/lib/opgave-detail').GroupMember;
  schoolId: string;
  removing: boolean;
  onRemove?: () => void;
  studentsMap: StudentsMap | null;
}) {
  const { t } = useTranslation();
  const displayName = getDisplayNameFromLookupId(studentsMap, member.contextCardId, member.name);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
      <GroupMemberAvatar
        contextCardId={member.contextCardId}
        name={displayName}
        schoolId={schoolId}
        studentsMap={studentsMap}
      />
      <span className="min-w-0 flex-1 truncate text-base font-medium text-foreground">
        {displayName}
      </span>
      {onRemove && (
        <button
          type="button"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-[color,background-color] duration-150 hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          onClick={onRemove}
          disabled={removing}
          aria-label={t('opgaveDetail.groupSection.removeLabel', { name: displayName })}
        >
          {removing ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
        </button>
      )}
    </div>
  );
}

function GroupStudentPicker({ students, schoolId, adding, onAdd, studentsMap }: {
  students: AvailableGroupStudent[];
  schoolId: string;
  adding: boolean;
  onAdd: (value: string) => void;
  studentsMap: StudentsMap | null;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = search
    ? students.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : students;

  useEffect(() => { setHighlightIndex(0); }, [search]);

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
            "flex items-center gap-2 rounded-xl border border-dashed border-ring bg-card px-4 py-2.5 ring-2 ring-ring/20 transition-[color,background-color] duration-150",
            adding ? "cursor-not-allowed opacity-70" : "hover:bg-accent/20",
          )}
        >
          {adding ? <Loader2 size={16} className="animate-spin text-muted-foreground" /> : <Plus size={16} className="text-muted-foreground" />}
          <input
            ref={inputRef}
            className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
            placeholder={t('opgaveDetail.groupSection.searchPlaceholder')}
            value={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            onKeyDown={handleKeyDown}
          />
          {!adding && <ChevronDown size={16} className="ml-auto rotate-180 text-muted-foreground transition-transform" />}
        </div>
      ) : (
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-xl border border-dashed border-border bg-card px-4 py-2.5 text-left transition-[color,background-color] duration-150",
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
          {adding ? <Loader2 size={16} className="animate-spin text-muted-foreground" /> : <Plus size={16} className="text-muted-foreground" />}
          <span className="text-base text-muted-foreground">
            {adding ? t('opgaveDetail.groupSection.adding') : t('opgaveDetail.groupSection.addButton')}
          </span>
          {!adding && <ChevronDown size={16} className="ml-auto text-muted-foreground transition-transform" />}
        </button>
      )}

      {isOpen && (
        <div className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg">
          <div ref={listRef}>
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">{t('opgaveDetail.groupSection.noStudents')}</div>
            ) : (
              filtered.map((student, i) => (
                <GroupStudentOption
                  key={student.value}
                  student={student}
                  schoolId={schoolId}
                  studentsMap={studentsMap}
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

function GroupStudentOption({ student, schoolId, highlighted, onSelect, onHover, studentsMap }: {
  student: AvailableGroupStudent;
  schoolId: string;
  highlighted: boolean;
  onSelect: () => void;
  onHover: () => void;
  studentsMap: StudentsMap | null;
}) {
  const contextCardId = `S${student.value}`;
  const displayName = getDisplayNameFromLookupId(studentsMap, contextCardId, student.name);
  return (
    <button
      type="button"
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-[color,background-color] duration-150",
        highlighted ? "bg-accent" : "hover:bg-accent/50",
      )}
      onClick={onSelect}
      onMouseEnter={onHover}
    >
      <GroupMemberAvatar
        contextCardId={contextCardId}
        name={displayName}
        schoolId={schoolId}
        size={28}
        studentsMap={studentsMap}
      />
      <span className="min-w-0 flex-1 truncate text-base text-foreground">{displayName}</span>
    </button>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-20 w-full rounded-lg" />
      <Separator />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-20 w-full rounded-lg" />
    </div>
  );
}
