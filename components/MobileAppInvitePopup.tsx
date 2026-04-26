import { useEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { Smartphone, X } from 'lucide-react';
import type { Tables } from '@/database.types';
import { useQuery, useMutation } from '@/lib/supabase/hooks';
import { getCachedProfile } from '@/lib/profile-cache';
import { capture, captureFeatureUsedOncePerSession, getDistinctId } from '@/lib/posthog';
import { useTranslation } from '@/lib/i18n';
import {
  renderAppStoreQrSvg,
  isInviteSnoozed,
  stampInviteShown,
  getInviteSnoozeAt,
} from '@/lib/mobile-app';
import { getCachedSchedule, getTodaySchedule, type ScheduleBlock } from '@/lib/schedule-cache';
import { getCountdownState } from '@/components/ScheduleCountdown';

type Student = Tables<'students'>;

const QUIET_HOURS_START = 2; // 02:00 inclusive
const QUIET_HOURS_END = 9;   // 09:00 exclusive

function isQuietHours(now = new Date()): boolean {
  const h = now.getHours();
  return h >= QUIET_HOURS_START && h < QUIET_HOURS_END;
}

function isCurrentlyInClass(blocks: ScheduleBlock[]): boolean {
  const now = new Date();
  const state = getCountdownState(
    blocks,
    now.getHours() * 60 + now.getMinutes(),
    now.getSeconds(),
  );
  return state.type === 'in-class';
}

export function MobileAppInvitePopup() {
  const profile = getCachedProfile();
  const schoolId = profile?.schoolId ?? null;
  const studentId = profile?.studentId ?? null;

  const { data: student, refetch, isLoading } = useQuery<Student>({
    schoolId: schoolId ?? '',
    table: 'students',
    filters: [{ column: 'id', op: 'eq', value: studentId ?? '' }],
    single: true,
    enabled: !!schoolId && !!studentId,
  });

  // Same RLS auth-race retry the drawer uses.
  useEffect(() => {
    if (student) return;
    if (!schoolId || !studentId) return;
    if (isLoading) return;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      attempt += 1;
      refetch();
      if (attempt < 6) {
        timer = setTimeout(tick, Math.min(8000, 1000 * 2 ** (attempt - 1)));
      }
    };
    timer = setTimeout(tick, 1000);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [student, schoolId, studentId, isLoading, refetch]);

  // Schedule blocks for the in-class gate. Start with cache; fetch if missing.
  const [blocks, setBlocks] = useState<ScheduleBlock[] | null>(() =>
    schoolId ? getCachedSchedule(schoolId) : null,
  );
  useEffect(() => {
    if (!schoolId) return;
    if (blocks) return;
    let cancelled = false;
    getTodaySchedule(schoolId)
      .then((b) => { if (!cancelled) setBlocks(b); })
      .catch(() => { if (!cancelled) setBlocks([]); });
    return () => { cancelled = true; };
  }, [schoolId, blocks]);

  if (!schoolId || !studentId) return null;
  if (!student) return null;
  if (!student.app_eligible) return null;
  if (student.app_installed_at) return null;
  if (student.marked_android_at) return null;
  if (student.dismissed_app_prompt_at) return null;

  return (
    <PopupInner
      schoolId={schoolId}
      studentId={studentId}
      blocks={blocks}
    />
  );
}

interface PopupInnerProps {
  schoolId: string;
  studentId: string;
  blocks: ScheduleBlock[] | null;
}

function PopupInner({ schoolId, studentId, blocks }: PopupInnerProps) {
  const { t } = useTranslation();
  const distinctId = getDistinctId(studentId);
  const [open, setOpen] = useState(false);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const decidedRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const { mutate: updateStudent } = useMutation<Partial<Student>>({
    table: 'students',
    method: 'update',
    schoolId,
  });

  // Decide once per mount, after schedule blocks are known.
  useEffect(() => {
    if (decidedRef.current) return;
    if (blocks == null) return; // wait for schedule cache/fetch
    decidedRef.current = true;

    if (isQuietHours()) return;
    if (isInviteSnoozed(studentId)) return;
    if (isCurrentlyInClass(blocks)) return;

    const previous = getInviteSnoozeAt(studentId);
    stampInviteShown(studentId);
    setOpen(true);

    captureFeatureUsedOncePerSession('mobile_app_invite_shown', distinctId, {
      school_id: schoolId,
      trigger: previous ? 're_prompt' : 'first_time',
    });
  }, [blocks, distinctId, schoolId, studentId]);

  // Render QR once when we're going to show.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    renderAppStoreQrSvg()
      .then((svg) => { if (!cancelled) setQrSvg(svg); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  // Esc to close (soft snooze).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSoft();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (dismissed || !open) return null;

  function closeSoft() {
    setOpen(false);
    setDismissed(true);
    capture('mobile_app_invite_dismissed', distinctId, { school_id: schoolId });
  }

  function markAndroid() {
    setOpen(false);
    setDismissed(true);
    updateStudent(
      { marked_android_at: new Date().toISOString() },
      [{ column: 'id', op: 'eq', value: studentId }],
    );
    capture('mobile_app_marked_android', distinctId, {
      school_id: schoolId,
      source: 'invite_popup',
    });
  }

  function onOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) closeSoft();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in-0 duration-200"
      onClick={onOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bl-mobile-invite-title"
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-md rounded-2xl bg-background border border-border shadow-2xl p-6 animate-in zoom-in-95 fade-in-0 duration-200"
      >
        <button
          type="button"
          onClick={closeSoft}
          aria-label={t('mobileApp.close')}
          className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
            <Smartphone className="size-3" />
            {t('mobileApp.invite.eyebrow')}
          </span>
        </div>

        <h2
          id="bl-mobile-invite-title"
          className="text-xl font-semibold leading-tight text-foreground pr-6"
        >
          {t('mobileApp.invite.title')}
        </h2>

        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {t('mobileApp.invite.body')}
        </p>

        <div className="mt-5 flex items-center justify-center">
          <div className="rounded-xl bg-white p-4 shadow-sm border border-border">
            <div className="grid h-[180px] w-[180px] place-items-center">
              {qrSvg ? (
                <div
                  className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              ) : (
                <div className="h-full w-full animate-pulse rounded bg-zinc-200" />
              )}
            </div>
          </div>
        </div>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          {t('mobileApp.invite.scanHint')}
        </p>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={markAndroid}
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('mobileApp.invite.androidCta')}
          </button>
          <button
            type="button"
            onClick={closeSoft}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('mobileApp.invite.primaryCta')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
