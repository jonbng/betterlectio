# Page Flicker on Navigation — Analysis & Approach

## The Problem

When navigating between pages in BetterLectio, users see a brief white flash — typically 1-2 frames of blank white screen between the old and new page. In dark mode this is especially jarring (white frame on dark UI). The only page that didn't flash was skema, because it was prerendered via the Speculation Rules API.

---

## What We Had Before (Committed Baseline)

The original setup had basic FOUC prevention with no view transitions and limited preloading.

### `hide-flash.css`

```css
html:not(.il-ready):not(.il-prerendered) {
  visibility: hidden !important;
}
html.il-ready body {
  opacity: 1 !important;
  transition: opacity 0.1s ease-out !important;
}
```

- Hid the page with `visibility: hidden` until content script added `.il-ready`
- No background color set — browser painted default **white** before extension CSS loaded
- No dark mode awareness at `document_start`

### `hide-flash.content.ts`

- Ran at `document_start`
- Intercepted Lectio CSS and wrapped in `@layer lectio { }`
- Detected login/print/prerendered pages for early exit
- No belt-and-suspenders JS style injection
- No dark mode application
- No view transition handling

### `content.tsx`

- Used `requestAnimationFrame()` to move DOM and add `.il-ready` — deferred reveal to next frame unnecessarily (Preact `render()` is synchronous)

### `globals.css`

- No `@view-transition` rule, no view transition animations

### `lib/preload.ts`

- Prerendered only skema via Speculation Rules (`eagerness: "immediate"`)
- Hover-based `<link rel="prefetch">` for other links (200ms delay, custom JS handler)
- No predictive prerendering, no hover-based prerender

### Result

- **White flash on every navigation** (even dark mode) — browser painted white before extension CSS took effect
- **Only skema was instant** — everything else went through hide → load → reveal
- No smooth transitions between pages

---

## Root Cause Analysis

### Why the white flash happens

The browser paints the default page background (white) **before** any extension CSS takes effect — even with `document_start` manifest-injected CSS:

```
navigation → browser creates document → first paint (WHITE) → extension CSS loads → visibility:hidden → content script → .il-ready
```

This timing race is inherent to browser extensions.

### Why skema didn't flash

Prerendered via Speculation Rules. Content script had already run, `.il-prerendered` was set, page was fully styled before navigation.

### Why view transitions can't fix non-prerendered pages

Cross-document view transitions capture a **snapshot** of the new page at load time. The content script hasn't run yet at that point, so the snapshot always captures raw Lectio:

- `visibility: hidden` → snapshot is blank → cross-fade goes old → blank
- `opacity: 0` → raw Lectio leaks through the view transition overlay

**View transitions snapshot BEFORE extension scripts run.** This is a fundamental constraint. Perfect cross-document transitions require prerendering.

---

## Current Implementation

### Strategy

View transitions only for prerendered pages (where the snapshot is correct). Simple overlay blocker + fade-in for everything else. Aggressive prerendering makes most navigations instant.

```
prerendered → smooth view transition cross-fade
non-prerendered → themed overlay → content script → fade-in
Firefox → themed overlay → content script → fade-in
```

### Files

| File | Role |
|------|------|
| `styles/hide-flash.css` | Manifest CSS at `document_start`: themed html background, `visibility:hidden`, body opacity setup, `@view-transition`, reduced-motion |
| `entrypoints/hide-flash.content.ts` | JS at `document_start`: early dark mode, overlay blocker, `skipTransition()` for non-prerendered, CSS layer wrapping |
| `entrypoints/content.tsx` | JS at `document_idle`: builds sidebar, adds `.il-ready`, removes overlay blocker |
| `styles/globals.css` | View transition animation config (200ms ease-in-out) |
| `lib/preload.ts` | Speculation Rules: immediate prerender (predictions), hover prerender (`eagerness: "moderate"`), Firefox prefetch fallback |

---

### Layer 1: Prevent white first paint

In `hide-flash.css` (earliest CSS):

```css
html {
  background: oklch(0.985 0.003 265) !important; /* light */
}
html.dark {
  background: oklch(0.13 0.004 285) !important; /* dark */
  color-scheme: dark;
}
```

In `hide-flash.content.ts`, dark mode is read from localStorage and applied at `document_start` **before any paint**:

```ts
function applyEarlyDarkMode(): boolean {
  const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY));
  if (settings?.visual?.darkMode) {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
  }
}
```

### Layer 2: Overlay blocker

A full-viewport `<div>` is created at `document_start` and appended to `<html>`. It uses `position:fixed; inset:0; z-index:2147483647` with the themed background color. This guarantees the user never sees raw Lectio — even if `visibility:hidden` loses the CSS timing race.

```ts
function createBlockerOverlay(isDark: boolean): HTMLDivElement {
  const blocker = document.createElement('div');
  blocker.id = 'il-nav-blocker';
  blocker.style.cssText = `position:fixed;inset:0;z-index:2147483647;background:${
    isDark ? 'oklch(0.13 0.004 285)' : 'oklch(0.985 0.003 265)'
  }`;
  document.documentElement.appendChild(blocker);
  return blocker;
}
```

The blocker is removed by `content.tsx` after adding `.il-ready`, or immediately on early-exit paths (login, print, prerendered).

### Layer 3: View transitions (prerendered only)

`@view-transition { navigation: auto }` is declared in CSS, but non-prerendered pages **skip** the transition:

```ts
window.addEventListener('pagereveal', (e) => {
  if (!e.viewTransition) return;

  const isReady =
    document.documentElement.classList.contains('il-ready') ||
    document.documentElement.classList.contains('il-prerendered');

  if (isReady) {
    // Prerendered — snapshot is correct, let transition play
    document.documentElement.classList.add('il-vt-active');
    blocker.remove();
  } else {
    // Not prerendered — snapshot would show raw Lectio, skip it
    e.viewTransition.skipTransition();
  }
});
```

### Layer 4: Aggressive prerendering

**Immediate prerender** — predicted next pages based on current page:

```
from forside   → skema, beskeder
from skema     → forside, beskeder
from beskeder  → skema, forside
from lektier   → skema, forside
from opgaver   → skema, forside
default        → skema, forside
```

**Hover prerender** — any same-school link on hover via Speculation Rules:

```json
{
  "prerender": [{
    "source": "document",
    "where": { "href_matches": "/lectio/{schoolId}/*" },
    "eagerness": "moderate"
  }]
}
```

`eagerness: "moderate"` means Chrome prerenders on hover/pointerdown — no custom JS hover handler needed. Chrome manages limits and cancels unused prerenders automatically.

**Firefox fallback** — `<link rel="prefetch">` on hover (200ms delay).

---

## Navigation Flows

### Chrome — prerendered (most navigations)

```
hover link
↓ Chrome prerenders page (content script runs in background)
↓ sidebar ready, .il-prerendered set
click
↓ instant activation
↓ pagereveal: page ready → view transition plays
↓ 200ms cross-fade (old → new with sidebar)
= PERFECT, instant
```

### Chrome — non-prerendered (fast click without hover)

```
click link
↓ hide-flash.content.ts (document_start):
│   applies .dark + themed background
│   visibility: hidden
│   overlay blocker covers viewport
│   pagereveal → skipTransition()
↓ content.tsx (document_idle):
│   builds sidebar, moves DOM
│   adds .il-ready → visibility: visible
│   removes overlay blocker
↓ 150ms body opacity fade-in
= Themed background briefly visible, then clean fade-in
```

### Firefox — no view transitions

```
click link → new page loads
↓ hide-flash.content.ts:
│   applies .dark + themed background
│   visibility: hidden + overlay blocker
↓ content.tsx:
│   builds sidebar
│   adds .il-ready, removes blocker
↓ 150ms body opacity fade-in
= Clean fade-in, no white flash
```

---

## CSS Classes

| Class | Set by | Purpose |
|-------|--------|---------|
| `.dark` | hide-flash.content.ts (early) + content.tsx (authoritative) | Dark mode — enables themed background at first paint |
| `.il-ready` | content.tsx | Page fully set up with sidebar — safe to show |
| `.il-prerendered` | hide-flash.content.ts | Page was prerendered — already styled, instant reveal |
| `.il-vt-active` | hide-flash.content.ts (pagereveal) | View transition playing — skip body opacity fade |

## Edge Cases

- **`prefers-reduced-motion`:** View transitions disabled (`navigation: none`) → overlay + fade-in fallback.
- **Login/print pages:** `.il-ready` added and blocker removed immediately at `document_start`.
- **Back/forward cache:** Pages restored from bfcache already have `.il-ready` → `pagereveal` lets transition play.
- **Chrome prerender limits:** Chrome manages concurrent prerenders (~2-3) and cancels unused ones automatically.

---

## What We Tried and Rejected

### Pause/resume view transition animations

Paused the view transition animations at `pagereveal` to freeze the old page snapshot, then resumed after the content script finished. In theory this keeps the old page visible while setting up the new one. In practice, Chrome's cross-document view transition implementation leaks the raw DOM layer behind the snapshot — users briefly saw native Lectio UI. The approach introduced more problems than it solved.

### `opacity: 0` instead of `visibility: hidden`

Recommended because "view transitions can snapshot opacity:0 elements." In practice, `opacity: 0` leaked raw Lectio content through the view transition overlay — users saw the unstyled page for ~0.5s before the content script finished.

### Skip hiding during view transitions (`.il-vt-active` on non-prerendered)

Tried making the page visible during view transitions so the snapshot captures real content. But the content script hasn't run at snapshot time, so the snapshot captures raw Lectio.

### Fetch-before-navigation

Considered fetching the page before navigating. Adds latency without fixing the extension CSS timing race. Aggressive prerendering is strictly better.
