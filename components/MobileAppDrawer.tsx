import { useEffect, useRef, useState } from 'preact/hooks';
import { cn } from '@/lib/utils';
import type { Tables } from '@/database.types';
import { useQuery, useMutation } from '@/lib/supabase/hooks';
import { getCachedProfile } from '@/lib/profile-cache';
import { getSession } from '@/lib/supabase/client';
import { capture, captureFeatureUsedOncePerSession, getDistinctId } from '@/lib/posthog';
import { useTranslation } from '@/lib/i18n';
import { renderMobileAppQrSvg, shouldPromoteMobileApp } from '@/lib/mobile-app';
import { MOBILE_APP_INVITE_OPEN_EVENT } from '@/components/MobileAppInvitePopup';

type Student = Tables<'students'>;

const PANEL_WIDTH = 175;

// Strong drawer easing — feels intentional vs. default cubic-bezier.
// (Ionic/iOS-style curve; recommended by emil-design-eng for drawers.)
const DRAWER_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';
const DRAWER_DURATION_MS = 320;

// Browser page zoom multiplies every CSS pixel, so `px` / `rem` / `vw` all
// grow with zoom. We counter-scale the assembly with `scale(1 / zoom)` so
// the drawer keeps a constant on-screen size regardless of zoom level.
function getPageZoom(): number {
  if (typeof window === 'undefined') return 1;
  // Canonical "browser zoom" detection. Slightly off when devtools is docked
  // (it shrinks innerWidth without changing outerWidth) but close enough for
  // an unobtrusive UI element.
  const ratio = window.outerWidth / window.innerWidth;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

export const MOBILE_APP_DRAWER_OPEN_EVENT = 'betterlectio:open-mobile-app-drawer';

export function MobileAppDrawer() {
  const profile = getCachedProfile();
  const schoolId = profile?.schoolId ?? null;
  const studentId = profile?.studentId ?? null;

  const { data: student, isLoading, error, refetch } = useQuery<Student>({
    schoolId: schoolId ?? '',
    table: 'students',
    filters: [{ column: 'id', op: 'eq', value: studentId ?? '' }],
    single: true,
    enabled: !!schoolId && !!studentId,
  });

  // Auth race: the Supabase session is set up in the background after content
  // scripts mount. If the first query fires before auth lands, RLS denies
  // the read and useQuery returns null without auto-recovering. Retry on a
  // short backoff until we have a row (or give up after a handful of tries).
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

  // One-shot session probe so we can tell auth races apart from RLS issues.
  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((s) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.log('[MobileAppDrawer] supabase session', s);
      })
      .catch((err) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.log('[MobileAppDrawer] supabase session error', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!schoolId || !studentId) return null;
  if (!student) return null;
  if (!shouldPromoteMobileApp(student)) return null;

  return <DrawerInner schoolId={schoolId} studentId={studentId} />;
}

function DrawerInner({ schoolId, studentId }: { schoolId: string; studentId: string }) {
  const { t } = useTranslation();
  const distinctId = getDistinctId(studentId);
  const [open, setOpen] = useState(false);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { mutate: updateStudent } = useMutation<Partial<Student>>({
    table: 'students',
    method: 'update',
    schoolId,
  });

  // Once-per-session "shown" telemetry
  useEffect(() => {
    captureFeatureUsedOncePerSession('mobile_app_prompt', distinctId, {
      school_id: schoolId,
    });
  }, [distinctId, schoolId]);

  // Generate QR once (carries studentId so we can record scans server-side).
  useEffect(() => {
    let cancelled = false;
    renderMobileAppQrSvg(studentId).then((svg) => {
      if (!cancelled) setQrSvg(svg);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  // Outside click + Escape close
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // External open trigger (sidebar button)
  useEffect(() => {
    const onOpenRequest = () => {
      setOpen(true);
      capture('mobile_app_prompt_opened', distinctId, {
        school_id: schoolId,
        source: 'sidebar',
      });
    };
    window.addEventListener(MOBILE_APP_DRAWER_OPEN_EVENT, onOpenRequest);
    return () => window.removeEventListener(MOBILE_APP_DRAWER_OPEN_EVENT, onOpenRequest);
  }, [distinctId, schoolId]);

  if (dismissed) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      capture('mobile_app_prompt_opened', distinctId, {
        school_id: schoolId,
        source: 'tab',
      });
    }
  };

  const markNotInterested = () => {
    setDismissed(true);
    updateStudent(
      { dismissed_app_prompt_at: new Date().toISOString() },
      [{ column: 'id', op: 'eq', value: studentId }],
    );
    capture('mobile_app_marked_not_interested', distinctId, { school_id: schoolId });
  };

  // Track browser page zoom so we can counter-scale and keep the drawer at
  // a constant on-screen size as the user zooms.
  const [pageZoom, setPageZoom] = useState(getPageZoom);
  useEffect(() => {
    const update = () => setPageZoom(getPageZoom());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const inverseScale = 1 / pageZoom;

  // Closed: assembly is shifted right by panel width so only the tab
  // protrudes from the screen edge. Open: shift to 0 so the panel is fully
  // visible and the tab rides along to its left. Translate magnitude is
  // divided by zoom because the visible width of the assembly is scaled by
  // (1 / zoom) and we want exactly that visible width to slide off-screen.
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const closedShiftCss = (PANEL_WIDTH + 15) * inverseScale;
  const containerStyle = {
    translate: `${open ? 0 : closedShiftCss}px -50%`,
    scale: String(inverseScale),
    transformOrigin: 'right center',
    transition: reduceMotion
      ? 'none'
      : `translate ${DRAWER_DURATION_MS}ms ${DRAWER_EASING}`,
    willChange: 'translate',
  } as const;

  return (
    <div
      ref={containerRef}
      className="fixed right-0 top-[80%] z-[60] flex items-stretch mr-[15px]"
      style={containerStyle}
    >
      {/* Tab handle — overlaps the panel by 1px (-mr-px + z-10) so the tab's
          white bg masks the panel's left border for the tab's vertical
          extent. Result: a clean seam where the handle meets the panel,
          while the panel's rounded outline remains visible above and below. */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="bl-mobile-app-panel"
        aria-label={t('mobileApp.openLabel')}
        className={cn(
          'relative z-10 -mr-px flex h-[100px] w-9 items-center justify-center',
          'rounded-l-2xl border border-r-0 border-black bg-white text-black',
          'transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
          'active:scale-[0.97]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40',
        )}
      >
        <span
          className="select-none text-[12px] font-semibold uppercase tracking-wider"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          {t('mobileApp.tabLabel')}
        </span>
      </button>

      {/* Panel — slides into view as the assembly translates left */}
      <div
        id="bl-mobile-app-panel"
        aria-hidden={!open}
        className={cn(
          'relative flex flex-col bg-white text-black rounded-xl rounded-tl-none',
          // Border drawn via ::after on top of all children so hover/active
          // backgrounds inside the panel can never paint over it.
          "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border after:border-black after:content-['']",
        )}
        style={{ width: PANEL_WIDTH }}
      >
        <h3 className="px-4 pb-3 pt-4 text-[12px] font-semibold leading-tight text-black">
          {t('mobileApp.title')}
        </h3>

        <div className="mx-auto mb-4 grid h-[150px] w-[150px] place-items-center">
          {qrSvg ? (
            <div
              className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : (
            <div className="h-full w-full animate-pulse rounded bg-zinc-200" />
          )}
        </div>

        <div className="flex flex-col border-t border-zinc-200">
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent(MOBILE_APP_INVITE_OPEN_EVENT));
              capture('mobile_app_invite_opened_from_drawer', distinctId, {
                school_id: schoolId,
              });
            }}
            tabIndex={open ? 0 : -1}
            className="px-4 py-2.5 text-left text-[12px] font-semibold text-black transition-colors duration-150 ease-out hover:bg-zinc-100 active:bg-zinc-200"
          >
            {t('mobileApp.readMore')}
          </button>
          <div className="h-px bg-zinc-200" aria-hidden="true" />
          <button
            type="button"
            onClick={markNotInterested}
            tabIndex={open ? 0 : -1}
            className="rounded-b-xl px-4 py-2.5 text-left text-[12px] font-medium text-zinc-500 transition-colors duration-150 ease-out hover:bg-zinc-100 hover:text-zinc-700 active:bg-zinc-200"
          >
            {t('mobileApp.notInterestedCta')}
          </button>
        </div>
      </div>
    </div>
  );
}
