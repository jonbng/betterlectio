import { useEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { Smartphone, X, Check } from 'lucide-react';
import type { Tables } from '@/database.types';
import { useQuery } from '@/lib/supabase/hooks';
import { subscribe, unsubscribe } from '@/lib/supabase/realtime';
import { getCachedProfile } from '@/lib/profile-cache';
import { capture, captureFeatureUsedOncePerSession, getDistinctId } from '@/lib/posthog';
import { useTranslation } from '@/lib/i18n';
import type { TFunction } from '@/lib/i18n/types';
import {
  renderMobileAppQrSvg,
  shouldPromoteMobileApp,
  isInviteSnoozed,
  stampInviteShown,
  getInviteSnoozeAt,
  hasInviteThanksBeenShown,
  markInviteThanksShown,
} from '@/lib/mobile-app';
import { getCachedSchedule, getTodaySchedule, type ScheduleBlock } from '@/lib/schedule-cache';
import { getCountdownState } from '@/components/ScheduleCountdown';

type Student = Tables<'students'>;

const QUIET_HOURS_START = 2; // 02:00 inclusive
const QUIET_HOURS_END = 9;   // 09:00 exclusive
const SUCCESS_DISPLAY_MS = 4000;
/** Don't pitch the mobile app until the student has had the extension for at
 *  least this long. Avoids competing with the onboarding popup on day 0.
 *  Cross-device because we read `students.extension_installed_at` (set on
 *  first-ever Supabase auth, not per-browser). */
const MIN_AGE_BEFORE_INVITE_MS = 24 * 60 * 60 * 1000;

function isTooFresh(student: Student, now = Date.now()): boolean {
  // Prefer the explicit "first time we saw this extension" timestamp; fall
  // back to created_at so legacy rows without extension_installed_at still
  // gate correctly. If neither exists, fail open (don't lock the popup out
  // forever — the rest of the eligibility chain still applies).
  const stamp = student.extension_installed_at ?? student.created_at;
  if (!stamp) return false;
  const t = Date.parse(stamp);
  if (!Number.isFinite(t)) return false;
  return now - t < MIN_AGE_BEFORE_INVITE_MS;
}

/** Debug-only event: force-open the popup regardless of gates. */
export const MOBILE_APP_INVITE_OPEN_EVENT = 'betterlectio:open-mobile-app-invite';

// Strong easing curves (built-in CSS easings are too weak — see emil-design-eng).
const EASE_OUT_STRONG = 'cubic-bezier(0.23, 1, 0.32, 1)';
const EASE_DRAWER = 'cubic-bezier(0.32, 0.72, 0, 1)';

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

  // Debug trigger from the sidebar — bumps a nonce that PopupInner uses to
  // bypass all eligibility/snooze/quiet-hours/in-class gates.
  const [forceNonce, setForceNonce] = useState(0);
  useEffect(() => {
    const onOpen = () => setForceNonce((n) => n + 1);
    window.addEventListener(MOBILE_APP_INVITE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(MOBILE_APP_INVITE_OPEN_EVENT, onOpen);
  }, []);

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

  // Live updates drive both the first-scan thank-you state and immediate
  // suppression once either native app stamps app_installed_at.
  useEffect(() => {
    if (!schoolId || !studentId) return;
    const channel = `mobile-app-invite:${schoolId}:${studentId}`;
    void subscribe({
      channel,
      table: 'students',
      schoolId,
      filter: `id=eq.${studentId}`,
    });
    return () => { void unsubscribe(channel); };
  }, [schoolId, studentId]);

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

  // Once PopupInner has opened, keep it mounted regardless of student-row
  // changes (e.g. app_qr_scanned_at flipping mid-session) so it can play its
  // own success/exit animations instead of being unmounted by a parent gate.
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false);

  if (!schoolId || !studentId) return null;

  const forced = forceNonce > 0;
  // Installation suppresses automatic promotion, but the explicit navigation
  // action can always reopen the QR for another device.
  if (!forced && student?.app_installed_at) return null;

  if (!forced && !hasOpenedOnce) {
    if (!student) return null;
    if (!shouldPromoteMobileApp(student)) return null;
    if (isTooFresh(student)) return null;
  }

  return (
    <PopupInner
      key={forceNonce}
      schoolId={schoolId}
      studentId={studentId}
      blocks={blocks}
      forceNonce={forceNonce}
      qrScannedAt={student?.app_qr_scanned_at ?? null}
      onOpened={() => setHasOpenedOnce(true)}
    />
  );
}

interface PopupInnerProps {
  schoolId: string;
  studentId: string;
  blocks: ScheduleBlock[] | null;
  /** When > 0, the popup was force-opened from the debug button — skip all gates. */
  forceNonce: number;
  /** Live `students.app_qr_scanned_at` value — null until the student scans. */
  qrScannedAt: string | null;
  /** Called the first time the popup actually opens; locks the parent gate. */
  onOpened: () => void;
}

type ViewState = 'invite' | 'thanks';

function PopupInner({
  schoolId,
  studentId,
  blocks,
  forceNonce,
  qrScannedAt,
  onOpened,
}: PopupInnerProps) {
  const { t } = useTranslation();
  const distinctId = getDistinctId(studentId);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ViewState>('invite');
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const decidedRef = useRef(false);
  const successHandledRef = useRef(false);
  // Baseline `qrScannedAt` captured at the moment the popup actually opens.
  // Used to gate the success transition: we only play the thanks view when
  // `qrScannedAt` flips from null → timestamp WHILE the popup is open. If it
  // was already a timestamp at open (debug-triggered re-open after a previous
  // scan), the popup stays on the invite view.
  const qrAtOpenRef = useRef<string | null | undefined>(undefined);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Respect prefers-reduced-motion (skip movement, keep opacity transitions).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Decide once per mount, after schedule blocks are known.
  useEffect(() => {
    if (decidedRef.current) return;

    // Debug bypass: open immediately without touching snooze stamp or analytics.
    if (forceNonce > 0) {
      decidedRef.current = true;
      qrAtOpenRef.current = qrScannedAt;
      setOpen(true);
      onOpened();
      return;
    }

    if (blocks == null) return; // wait for schedule cache/fetch
    decidedRef.current = true;

    if (isQuietHours()) return;
    if (isInviteSnoozed(studentId)) return;
    if (isCurrentlyInClass(blocks)) return;

    const previous = getInviteSnoozeAt(studentId);
    stampInviteShown(studentId);
    qrAtOpenRef.current = qrScannedAt;
    setOpen(true);
    onOpened();

    captureFeatureUsedOncePerSession('mobile_app_invite_shown', distinctId, {
      school_id: schoolId,
      trigger: previous ? 're_prompt' : 'first_time',
    });
  }, [blocks, distinctId, schoolId, studentId, forceNonce, onOpened]);

  // Render QR once when we're going to show. Tagged with studentId so the
  // /download/app selects the correct store and stamps app_qr_scanned_at.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    renderMobileAppQrSvg(studentId)
      .then((svg) => { if (!cancelled) setQrSvg(svg); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, studentId]);

  // Realtime success transition: when app_qr_scanned_at flips while the popup
  // is open, swap to the thanks view and auto-close after SUCCESS_DISPLAY_MS.
  // Only fires once per student lifetime — subsequent opens (e.g. via the
  // debug trigger after scanning) keep showing the QR / invite view.
  useEffect(() => {
    if (!open) return;
    if (view !== 'invite') return;
    if (!qrScannedAt) return;
    // Only trigger the success transition for fresh scans — i.e. qrScannedAt
    // flipping from null → timestamp while this popup instance is open. If a
    // timestamp was already set when the popup opened (e.g. the user reopens
    // via the debug button after previously scanning), keep showing the
    // regular invite view.
    if (qrAtOpenRef.current) return;
    if (successHandledRef.current) return;
    if (hasInviteThanksBeenShown(studentId)) return;
    successHandledRef.current = true;
    markInviteThanksShown(studentId);

    setView('thanks');
    capture('mobile_app_invite_success_shown', distinctId, {
      school_id: schoolId,
    });

    const closeTimer = setTimeout(() => {
      // Trigger exit animation; actual unmount happens after the transition.
      setExiting(true);
      const unmountTimer = setTimeout(() => {
        setOpen(false);
        setDismissed(true);
      }, reduceMotion ? 0 : 220);
      return () => clearTimeout(unmountTimer);
    }, SUCCESS_DISPLAY_MS);

    return () => clearTimeout(closeTimer);
  }, [open, view, qrScannedAt, distinctId, schoolId, reduceMotion, studentId]);

  // Esc to close (soft snooze) — works in any view so the user can dismiss
  // the success state instead of being forced to wait it out.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSoft();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view]);

  if (dismissed || !open) return null;

  function closeSoft() {
    setExiting(true);
    if (view === 'invite') {
      capture('mobile_app_invite_dismissed', distinctId, { school_id: schoolId });
    }
    setTimeout(() => {
      setOpen(false);
      setDismissed(true);
    }, reduceMotion ? 0 : 180);
  }

  function onOverlayClick(e: MouseEvent) {
    if (e.target !== e.currentTarget) return;
    closeSoft();
  }

  // Strong custom easings via inline style — the built-in Tailwind/animate-css
  // easings are too weak (per emil-design-eng).
  const overlayStyle = {
    transition: reduceMotion ? 'none' : `opacity 220ms ${EASE_OUT_STRONG}`,
    opacity: exiting ? 0 : 1,
  };
  const dialogStyle = {
    transition: reduceMotion
      ? 'none'
      : `opacity 240ms ${EASE_OUT_STRONG}, transform 280ms ${EASE_DRAWER}`,
    opacity: exiting ? 0 : 1,
    transform: exiting ? 'scale(0.97)' : 'scale(1)',
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
      style={overlayStyle}
      onClick={onOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bl-mobile-invite-title"
      data-bl-popup-state={view}
    >
      {/* Layered shadows: ambient (soft, large) + directional (smaller, sharper).
          Single light source — both shadows offset downward. */}
      <div
        ref={dialogRef}
        className="relative w-full max-w-2xl rounded-2xl bg-background border border-border p-6 sm:p-8 origin-center will-change-transform"
        style={{
          ...dialogStyle,
          boxShadow:
            '0 1px 2px oklch(0 0 0 / 0.04), 0 8px 24px oklch(0 0 0 / 0.10), 0 28px 64px oklch(0 0 0 / 0.18)',
          // Entrance: when first mounted (not exiting), fade+scale from rest.
          // Use @starting-style via inline keyframes-free CSS would be ideal,
          // but for cross-browser we lean on the data-state animate-in classes
          // applied by tailwindcss-animate.
        }}
      >
        <button
          type="button"
          onClick={closeSoft}
          aria-label={t('mobileApp.close')}
          className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground active:scale-[0.95] transition-[color,background-color,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </button>

        {/* Crossfade between invite and thanks. Both layers are siblings; only
            one is visible at a time. Blur masks the visual gap during the
            transition (per emil-design-eng's blur-mask trick). */}
        <div className="relative">
          <div
            className="transition-[opacity,filter] duration-[220ms] ease-out"
            style={{
              opacity: view === 'invite' ? 1 : 0,
              filter: view === 'invite' ? 'blur(0px)' : 'blur(6px)',
              pointerEvents: view === 'invite' ? 'auto' : 'none',
            }}
            aria-hidden={view !== 'invite'}
          >
            <InviteContent t={t} qrSvg={qrSvg} />
          </div>

          {view === 'thanks' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <ThanksContent t={t} reduceMotion={reduceMotion} />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface InviteContentProps {
  t: TFunction;
  qrSvg: string | null;
}

function InviteContent({ t, qrSvg }: InviteContentProps) {
  return (
    <div className="flex flex-col-reverse sm:flex-row sm:items-stretch gap-6 sm:gap-8">
      {/* Left: copy + actions. Stagger entrance via animation-delay. */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div
          className="flex items-center gap-2 mb-3 opacity-0 animate-[bl-rise_360ms_cubic-bezier(0.23,1,0.32,1)_forwards]"
          style={{ animationDelay: '20ms' }}
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
            <Smartphone className="size-3" />
            {t('mobileApp.invite.eyebrow')}
          </span>
        </div>

        <h2
          id="bl-mobile-invite-title"
          className="text-xl sm:text-2xl font-semibold leading-[1.15] tracking-tight text-foreground text-balance opacity-0 animate-[bl-rise_360ms_cubic-bezier(0.23,1,0.32,1)_forwards]"
          style={{ animationDelay: '70ms' }}
        >
          {t('mobileApp.invite.title')}
        </h2>

        <p
          className="mt-3 text-sm text-muted-foreground leading-relaxed text-pretty opacity-0 animate-[bl-rise_360ms_cubic-bezier(0.23,1,0.32,1)_forwards]"
          style={{ animationDelay: '120ms' }}
        >
          {t('mobileApp.invite.body')}
        </p>

      </div>

      {/* Right: QR. Slight scale-up entrance. */}
      <div
        className="shrink-0 flex flex-col items-center opacity-0 animate-[bl-qr-in_420ms_cubic-bezier(0.23,1,0.32,1)_forwards]"
        style={{ animationDelay: '60ms' }}
      >
        <div
          className="rounded-xl bg-white p-4 border border-border"
          style={{
            boxShadow:
              '0 1px 2px oklch(0 0 0 / 0.04), 0 6px 16px oklch(0 0 0 / 0.08)',
          }}
        >
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
    </div>
  );
}

interface ThanksContentProps {
  t: TFunction;
  reduceMotion: boolean;
}

function ThanksContent({ t, reduceMotion }: ThanksContentProps) {
  // The success state is rare ("peak-end finish strong"): allow a slightly
  // more delightful entrance than the invite content.
  const checkAnim = reduceMotion
    ? undefined
    : 'bl-success-pop 520ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards';

  return (
    <div
      className="flex flex-col items-center justify-center text-center py-2"
      role="status"
      aria-live="polite"
    >
      <div
        className="relative grid place-items-center size-16 rounded-full bg-primary/10 opacity-0"
        style={{
          animation: reduceMotion
            ? 'bl-fade-in 200ms ease-out forwards'
            : checkAnim,
        }}
      >
        {/* Soft halo behind the check */}
        <div
          className="absolute inset-0 rounded-full bg-primary/15"
          style={{
            animation: reduceMotion
              ? undefined
              : 'bl-success-halo 900ms cubic-bezier(0.23, 1, 0.32, 1) 80ms forwards',
            opacity: 0,
          }}
          aria-hidden="true"
        />
        <Check className="size-8 text-primary relative z-[1]" strokeWidth={2.5} />
      </div>

      <h2
        className="mt-5 text-xl sm:text-2xl font-semibold leading-tight tracking-tight text-foreground text-balance opacity-0"
        style={{
          animation: reduceMotion
            ? 'bl-fade-in 200ms ease-out 80ms forwards'
            : 'bl-rise 380ms cubic-bezier(0.23, 1, 0.32, 1) 140ms forwards',
        }}
      >
        {t('mobileApp.invite.thanksTitle')}
      </h2>

      <p
        className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-sm text-pretty opacity-0"
        style={{
          animation: reduceMotion
            ? 'bl-fade-in 200ms ease-out 160ms forwards'
            : 'bl-rise 380ms cubic-bezier(0.23, 1, 0.32, 1) 220ms forwards',
        }}
      >
        {t('mobileApp.invite.thanksBody')}
      </p>
    </div>
  );
}
