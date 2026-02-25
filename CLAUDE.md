# BetterLectio

!IMPORTANT: Please update @Claude.md and @ARCHITECTURE.md after each big change to reflect changes

@ARHITECTURE.md

Browser extension that modernizes [Lectio](https://www.lectio.dk/), a Danish school management system.

## Tech Stack
- **WXT** - Browser extension framework
- **Preact** - Lightweight React alternative (aliased from React)
- **TypeScript** + **Tailwind CSS**
- **shadcn/ui** + **Radix UI** - UI components

## Key Files
- `entrypoints/content.tsx` - Main content script, renders custom UI wrapper
- `entrypoints/login.content.tsx` - Login page redesign with school selector
- `entrypoints/hide-flash.content.ts` - Prevents FOUC with skeleton loader + intercepts Lectio CSS into @layer lectio
- `entrypoints/session-block.content.ts` - Blocks session timeout popup
- `components/AppSidebar.tsx` - Custom sidebar navigation with collapsible sections
- `components/FindSkemaPage.tsx` - Complete FindSkema redesign with fuzzy search, starred/recents
- `components/LoginPage.tsx` - School selector with "continue to last school" feature
- `components/PersonCard.tsx` - Reusable person/entity card with lazy-loaded pictures
- `components/ViewingScheduleHeader.tsx` - Header when viewing another schedule (with star/back)
- `components/LektierPage.tsx` - Lektier page redesign with day-grouped homework cards
- `components/OpgaverPage.tsx` - Opgaver page redesign with urgency-first cards, relative deadlines in Danish, color-coded grades
- `components/OpgaveDetailSheet.tsx` - Side sheet for assignment details, submission history, and comment/file upload
- `components/SettingsModal.tsx` - Settings modal with appearance, notifications, about sections
- `components/ActivityClassModal.tsx` - Class/activity modal for skema activities (metadata, lektier, related links)
- `lib/findskema-storage.ts` - Starred people, recents, and picture cache persistence
- `lib/fuzzy-search.ts` - Fuzzy search algorithm for Danish text
- `lib/school-storage.ts` - Last school persistence for auto-redirect
- `lib/opgave-detail.ts` - Fetch/parse ElevAflevering.aspx pages, submission API, localStorage cache
- `lib/activity-detail.ts` - Fetch/parse aktivitetforside2.aspx pages with rich lektie content + short-term cache
- `lib/profile-cache.ts` - User profile and viewed entity caching
- `lib/hold-mapping.ts` - Hold-to-subject mapping system with auto-guess dictionary and user overrides
- `components/settings/HoldMappingEditor.tsx` - Settings UI for managing hold display names and colors
- `styles/globals.css` - Main styles, hides original Lectio UI, page-specific styling

## Architecture
Content scripts inject a custom Preact UI that wraps the original Lectio DOM. The original DOM is **moved** (not cloned) to preserve event handlers and functionality.

## CSS Cascade Layers
Lectio's CSS is intercepted at `document_start` by `hide-flash.content.ts` and wrapped in `@layer lectio { }`. This puts ALL of Lectio's styles into the lowest-priority CSS cascade layer, so our extension's styles automatically win without needing `!important`.

**Layer order** (lowest → highest priority): `lectio < theme < base < components < utilities`

When adding new CSS overrides for Lectio elements, put them in `@layer components { }` in `globals.css` — they'll automatically beat Lectio's styles. Only use `!important` when overriding **inline styles** (e.g., Lectio's JS-set `style="width:..."` on schedule bricks) or `display: none/block` for element hiding (defense against Lectio JS toggling).

**Content isolation:** `#il-original-content :where(*) { all: revert-layer }` in `@layer base` prevents Tailwind's preflight from breaking Lectio's native DOM. Elements inside `#il-original-content` get Lectio's CSS; everything else (sidebar, injected pages) gets Tailwind's base. If you insert custom UI into `#il-lectio-content` (outside `#il-original-content`), Tailwind works normally.

## Color System — OKLCH Only

**All colors MUST use `oklch()`.** Never use `hsl()`, `rgb()`, `rgba()`, or hex (`#rrggbb`) anywhere in the codebase.

- **CSS variables** in `:root` / `.dark` are all `oklch(L C H)` values
- **Primary color**: Indigo-blue at hue 265 — `oklch(0.54 0.2 265)` (light) / `oklch(0.68 0.17 265)` (dark)
- **Neutrals**: Subtly tinted with hue 265 for a cohesive blue undertone
- **Alpha colors**: Use `oklch(L C H / alpha)` or `color-mix(in oklch, var(--token) N%, transparent)`
- **Tailwind arbitrary values**: Use underscores for spaces — `bg-[oklch(0.54_0.2_265)]`
- **Shadows**: Use `oklch(0 0 0 / alpha)` instead of `rgba(0,0,0,alpha)`

## Cross-Browser Compatibility

**IMPORTANT:** Firefox is stricter than Chrome with URL handling. When using `fetch()`, always use absolute URLs:

```ts
// WRONG - breaks on Firefox
fetch("/lectio/login_list.aspx")

// CORRECT - works on all browsers
fetch(new URL("/lectio/path.aspx", window.location.origin).href)

// ALSO CORRECT - template literal with origin
fetch(`${window.location.origin}/lectio/${schoolId}/path.aspx`)
```

Note: `window.location.href = "/relative/path"` and `<a href="/path">` work fine with relative URLs - this only applies to `fetch()` and similar APIs.

**Lectio Modernizer:** The "Lectio Modernizer" section in `globals.css` restyles Lectio's native elements (tables, buttons, forms, schedule bricks, links, etc.) with modern design. When adding new Lectio element overrides, add them to this section under `@layer components`. Key targets: `table.lf-grid` (data tables), `.buttonfilled`/`.buttonoutlined`/`.buttonfilledtonal` (buttons), `input`/`select`/`textarea` (form elements), `.s2skemabrik` (schedule bricks), `.lf-island` (card containers).

## Features
- **Login Page Redesign** - School selector with search, "continue to last school" quick access
- **Session Popup Block** - Blocks "Din session udløber snart" popup
- **Custom Sidebar** - Modern navigation with collapsible sections, settings modal access
- **FindSkema Redesign** - Fuzzy search, type filters, starred people, recent searches, person cards
- **Schedule Enhancements** - Today highlight, current time indicator, optional time label, back navigation
- **Viewing Header** - Shows whose schedule with star toggle, type badge, back link
- **Settings Modal** - Appearance, notifications, advanced settings, version info
- **Experimental Dark Mode** - Manual toggle for dark color palette
- **Clean Page Titles** - Modern titles with unread message badge count
- **Forside Redesign** - Time-based greeting, live clock, masonry card layout
- **Lektier Redesign** - Day-grouped homework cards with file/activity links and teacher notes
- **Opgaver Redesign** - Urgency-first cards with relative Danish deadlines ("Om 3 timer", "I morgen"), visual urgency gradient (overdue→imminent→soon→later), compact submitted rows with color-coded grade badges, hold filters
- **Opgave Detail Sheet** - Side sheet opens on assignment click with full details, submission history, comment/file upload (fetches ElevAflevering.aspx via fetch-and-parse)
- **Activity Class Modal** - Opens from aktivitetforside2 links in skema/forside, showing activity metadata, phase, note, rich lektier, and related links without leaving the page
- **Hold/Subject Mapping** - Auto-guesses subject names from hold codes ("1x HI" → "Historie") via built-in Danish dictionary, user can override display names and colors in Settings → Fag

## Commands
```bash
bun run dev          # Development (Chrome)
bun run dev:firefox  # Development (Firefox)
bun run build        # Production build
bun run zip          # Package extension
```

## Lectio CLI Tool

A CLI tool for fetching authenticated Lectio pages. Use this to capture raw HTML for development and testing.

**Location:** `tools/lectio-cli/`

```bash
# First time: install dependencies
cd tools/lectio-cli && bun install && cd ../..

# Authenticate (opens browser for login)
bun run lectio auth --school 94

# Fetch pages and save to lectio-html/
bun run lectio fetch skemany.aspx -o lectio-html/lectio/94/skemany.html
bun run lectio fetch beskeder2.aspx -o lectio-html/lectio/94/beskeder2.html

# Check session status
bun run lectio status

# Search for schools
bun run lectio schools --search "sorø"
```

All commands support `--json` for machine-readable output. Session cookies are stored in `~/.lectio-cli/` (outside repo).

## Reference Materials
- `tools/lectio-cli/` - CLI tool for fetching authenticated Lectio pages
- `lectio-scripts/` - Decompiled Lectio source code
- `lectio-html/` - HTML snapshots captured with the CLI tool
- `ARCHITECTURE.md` - Full project documentation
