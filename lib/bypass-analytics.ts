// Analytics for the "show native Lectio" escape hatch.
//
// When a user presses the bypass button, it's a strong signal that a
// BetterLectio redesign is broken for them on this exact page. We want every
// occurrence to be loud and easy to find in PostHog, with enough context to
// reproduce without a follow-up conversation:
//
//   - a named event (`betterlectio bypass engaged`)
//   - a paired `captureException` so it surfaces in Error Tracking too
//   - identity + page + settings + viewport + recent navigation
//   - any native Lectio error popup that was visible at the moment of click
//
// Both calls are flushed synchronously before the reload so the request isn't
// aborted by the page unload.

import {
  capture,
  captureException,
  flushAnalytics,
  getDistinctId,
  getPageSlug,
} from '@/lib/posthog';
import { getCachedProfile } from '@/lib/profile-cache';
import { getSettings } from '@/lib/settings-storage';
import { getThemePreferenceForSchool } from '@/lib/theme-storage';
import { getSchoolYearFromClassName } from '@/lib/class-name';
import { getRecentUrls } from '@/lib/url-history';

// Stable Error Tracking group for the paired bypass exception. Release-independent
// by design (see the capture call below).
const BYPASS_EXCEPTION_FINGERPRINT = 'betterlectio-bypass-engaged';

interface VisibleLectioError {
  title: string;
  body: string;
}

/**
 * Find a Lectio native error popup currently visible in the DOM. Users often
 * hit the bypass button BECAUSE one of these just appeared — including its
 * contents in the event means we usually don't need to ask "what did you see?".
 */
function scanForVisibleLectioError(): VisibleLectioError | null {
  try {
    const nodes = document.querySelectorAll<HTMLElement>('[data-title^="Fejl"]');
    for (const el of Array.from(nodes)) {
      // offsetParent is null for display:none / detached nodes. Dialogs are
      // usually position:fixed (offsetParent null even when visible), so accept
      // those too.
      const style = window.getComputedStyle(el);
      const isHidden =
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        (el.offsetParent === null && style.position !== 'fixed');
      if (isHidden) continue;

      return {
        title: (el.getAttribute('data-title') ?? '').slice(0, 300),
        body: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 2000),
      };
    }
  } catch {
    // Non-critical
  }
  return null;
}

function getLectioVersion(): string | undefined {
  try {
    // Lectio puts its build version on the body via ls-version-* classes and
    // on a footer element. Cheap to read; undefined if the page doesn't have it.
    const match = document.body?.className?.match(/ls-version-([\w.-]+)/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

/**
 * Capture both a `betterlectio bypass engaged` analytics event and a paired
 * `$exception` so the signal is visible in both PostHog surfaces. Returns only
 * after PostHog's HTTP flush resolves so a subsequent `window.location.reload()`
 * doesn't abort the in-flight request.
 *
 * No-op when the user isn't identified (mirrors posthog.ts policy — we never
 * send anonymous events).
 */
export async function captureBypassEngaged(
  extraProps?: Record<string, unknown>,
): Promise<void> {
  try {
    const profile = getCachedProfile();
    if (!profile?.studentId) {
      return;
    }
    const distinctId = getDistinctId(profile.studentId);

    const settings = getSettings();
    const theme = getThemePreferenceForSchool(profile.schoolId ?? null);
    const schoolYear = profile.className
      ? getSchoolYearFromClassName(profile.className)
      : null;
    const visibleError = scanForVisibleLectioError();
    const recentUrls = getRecentUrls(5);

    const page = getPageSlug();

    const props: Record<string, unknown> = {
      trigger: 'sidebar_button',

      // Identity
      school_id: profile.schoolId ?? undefined,
      school_name: profile.schoolName ?? undefined,
      student_id: profile.studentId,
      class_name: profile.className ?? undefined,
      school_year: schoolYear,
      user_name: profile.fullName ?? profile.name ?? undefined,

      // Page
      page,
      document_title: document.title,
      referrer: document.referrer || undefined,
      recent_urls: recentUrls,
      previous_url: recentUrls[1],
      time_on_page_s: Math.round(performance.now() / 1000),
      lectio_version: getLectioVersion(),

      // Settings / theme (surface whether the user is on a custom theme that
      // might be the actual cause)
      dark_mode: settings.visual?.darkMode,
      theme_id: theme?.themeId,

      // Display (layout issues often correlate with viewport size / zoom)
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      scroll_y: Math.round(
        window.scrollY ||
          document.documentElement.scrollTop ||
          document.body.scrollTop ||
          0,
      ),
      device_pixel_ratio: window.devicePixelRatio,

      // If Lectio's own error popup is on screen right now, that's almost
      // certainly why the user clicked.
      has_visible_lectio_error: !!visibleError,
      visible_lectio_error_title: visibleError?.title,
      visible_lectio_error_body: visibleError?.body,

      ...extraProps,
    };

    capture('betterlectio bypass engaged', distinctId, props);
    captureException(
      new Error(
        'User engaged BetterLectio bypass — redesign suspected broken on this page',
      ),
      distinctId,
      {
        ...props,
        source: 'bypass_button',
        // This capture is intentional — one deliberate user action, not a code
        // fault. A fixed fingerprint keeps every press in a single Error
        // Tracking issue. Without it PostHog groups by the minified stack frames
        // of content.js, which move on every release and mint a fresh issue each
        // time (15 issues across 0.0.27–0.0.37).
        $exception_fingerprint: BYPASS_EXCEPTION_FINGERPRINT,
      },
    );

    // Wait for HTTP flush before the caller reloads so the request isn't
    // cancelled by the page unload.
    await flushAnalytics();
  } catch {
    // Never let analytics block the escape hatch
  }
}
