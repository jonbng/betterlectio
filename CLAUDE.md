# BetterLectio

!IMPORTANT: Please update @Claude.md and @ARCHITECTURE.md after each big change to reflect changes

**Design skill:** When building big new features that require design, or doing significant UI changes/refactors, use the `frontend-design` skill to generate high-quality, polished interfaces. Always invoke it for new page redesigns, component overhauls, or visual reworks.

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
- `components/PersonCard.tsx` - Reusable person/entity card with lazy-loaded pictures, appends navigation context (`from`, `q`, `name`)
- `components/ViewingScheduleHeader.tsx` - Header when viewing another schedule (with star/back + expandable "Medlemmer" panel for klasse/holdelement)
- `components/LektierPage.tsx` - Lektier page redesign with day-grouped homework cards
- `components/OpgaverPage.tsx` - Opgaver page redesign with urgency-first cards, relative deadlines in Danish, color-coded grades, missing assignment detection
- `components/OpgaveDetailSheet.tsx` - Side sheet for assignment details, submission history, and comment/file upload
- `components/SettingsModal.tsx` - Settings modal with appearance, notifications, about sections
- `components/ActivityClassModal.tsx` - Class/activity modal for skema activities (metadata, lektier, related links)
- `components/ScheduleCountdown.tsx` - Sidebar countdown widget showing time remaining in current class or until next class starts
- `components/ForsideOpgaverCard.tsx` - Custom forside opgaver card replacing native Lectio table with urgency-driven design, fetches missing assignments from OpgaverElev.aspx
- `components/ForsideGreeting.tsx` - Forside greeting with time-based salutation, live clock, missing assignment warnings
- `lib/schedule-cache.ts` - Fetches and caches today's schedule via network (45min TTL)
- `lib/findskema-storage.ts` - Starred people, recents, picture cache persistence, and canonical schedule URL generation (`SC/RO/RE/HE/GE/...`)
- `lib/fuzzy-search.ts` - Fuzzy search algorithm for Danish text
- `lib/findskema-cache.ts` - Resolves Lectio AvanceretSkema cache params (`afdeling` + `subcache`) from page scripts
- `lib/findskema-types.ts` - Maps Lectio AvanceretSkema IDs (`SC/RO/RE/HE/GE/...`) to BetterLectio filter types
- `lib/school-storage.ts` - Last school persistence for auto-redirect
- `lib/opgave-detail.ts` - Fetch/parse ElevAflevering.aspx pages, submission API, localStorage cache
- `lib/activity-detail.ts` - Fetch/parse aktivitetforside2.aspx pages with rich lektie content + short-term cache
- `lib/brick-tooltip.ts` - Custom schedule brick hover tooltip with async-enriched content (note, lektier, related items)
- `lib/profile-cache.ts` - User profile and viewed entity caching with URL/localStorage name fallback for entity schedules
- `lib/members-fetch.ts` - Fetch/parse utility for `members.aspx` (klasse/holdelement) returning typed member cards
- `lib/hold-mapping.ts` - V2 hold mapping system with shared subject mappings, per-hold exceptions, ignored non-academic groups, and fresh-start storage resets for old data
- `components/settings/HoldMappingEditor.tsx` - Settings UI for shared subject names/colors plus separate special-hold exceptions
- `components/DesignPlayground.tsx` - Full-screen design system playground (colors, typography, components) opened from Settings
- `styles/globals.css` - Main styles, hides original Lectio UI, page-specific styling
- `tools/lectio-cli/src/lib/aspnet.ts` - ASP.NET WebForms extraction helpers (`__VIEWSTATE`, `__EVENTVALIDATION`, postback targets, form parsing)
- `tools/lectio-cli/src/commands/asp.ts` - `lectio asp` command (`inspect`, `postback`, `field`)
- `tools/lectio-cli/src/lib/keepalive.ts` - Session keepalive daemon loop (PID/log management, periodic `forside.aspx` ping)
- `tools/lectio-cli/src/commands/keepalive.ts` - `lectio keepalive` command (`start`, `stop`, `status`, `ping`, `log`)

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
- **Primary color**: Indigo-blue at hue 265 — `oklch(0.54 0.2 265)` (light) / `oklch(0.65 0.16 265)` (dark)
- **Light mode neutrals**: Subtly tinted with hue 265 for a cohesive blue undertone
- **Dark mode neutrals**: Near-achromatic (chroma ≤ 0.006) with warm hue 285 (mauve-gray). NOT blue-tinted. Surfaces should read as true charcoal/ink, never navy.
- **Dark mode text**: Warm off-white at `oklch(0.93 0.003 90)` (hue 90 = slight warm cast). Muted text uses `oklch(0.58 0.006 285)`.
- **Dark mode semantic colors**: Red (hue 25), orange (hue 50), yellow-green (hue 80), green (hue 145) stay chromatic. Their background tints use the semantic hue, NOT hue 265.
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

**FindSkema dropdown cache key:** Do not assume `subcache` equals current calendar year. Read both `afdeling` and `subcache` from Lectio's `AvanceretSkema_<afdeling>_<subcache>` dataset key (from page scripts or `FindSkemaAdv.aspx`) before calling `cache/DropDown.aspx?type=AvanceretSkema...`. This avoids missing students when school year and calendar year differ.

**FindSkema type mapping:** Do not assume `K*` means classes or `L*` means rooms on all schools. Real AvanceretSkema IDs commonly use `SC*` for stamklasser and `RO*` for lokaler (`RE*` for ressourcer, `HE*` for hold, `GE*` for grupper). Always map by actual ID prefixes via shared helper logic.

**Lectio Modernizer:** The "Lectio Modernizer" section in `globals.css` restyles Lectio's native elements (tables, buttons, forms, schedule bricks, links, etc.) with modern design. When adding new Lectio element overrides, add them to this section under `@layer components`. Key targets: `table.lf-grid` (data tables), `.buttonfilled`/`.buttonoutlined`/`.buttonfilledtonal` (buttons), `input`/`select`/`textarea` (form elements), `.s2skemabrik` (schedule bricks), `.lf-island` (card containers).

## Features
- **Login Page Redesign** - School selector with search, "continue to last school" quick access
- **Session Popup Block** - Blocks "Din session udløber snart" popup
- **Custom Sidebar** - Modern navigation with collapsible sections, settings modal access
- **FindSkema Redesign** - Fuzzy search, single-select type filters, starred people, recent searches, person cards, auto-focus search on typing, and default browse cards per selected filter
- **Schedule Enhancements** - Today highlight, current time indicator, optional time label, countdown bar, back navigation, enriched hover tooltips (async-fetched note, rich lektier with links, related items)
- **Viewing Header** - Shows whose schedule with star toggle, type badge, back link, teacher full-name lookup, and expandable medlemmer panel for klasse/holdelement
- **Settings Modal** - Appearance, notifications, advanced settings, version info
- **Experimental Dark Mode** - Manual toggle for dark color palette
- **Clean Page Titles** - Modern titles with unread message badge count
- **Forside Redesign** - Time-based greeting, live clock, masonry card layout, custom opgaver card (replaces native table with urgency-driven Preact component, progress bars, detail sheet on click)
- **Lektier Redesign** - Day-grouped homework cards with file/activity links and teacher notes
- **Opgaver Redesign** - Urgency-first cards with relative Danish deadlines ("Om 3 timer", "I morgen"), visual urgency gradient (overdue→imminent→soon→later), compact submitted rows with color-coded grade badges, hold filters
- **Opgave Detail Sheet** - Side sheet opens on assignment click with full details, submission history, comment/file upload (fetches ElevAflevering.aspx via fetch-and-parse)
- **Activity Class Modal** - Opens from aktivitetforside2 links in skema/forside, showing activity metadata, phase, note, rich lektier, and related links without leaving the page
- **Hold/Subject Mapping** - Shared subject mappings keep names/colors synced across classes ("1x MA", "2v MA", "3b MA" share Matematik), while only unknown academic holds stay as separate exceptions and non-academic groups are ignored
- **Beskeder Navigation Redesign** - Horizontal pill-bar folder navigation (CSS-only, replaces vertical sidebar tree with wrapping chip row, expandable dropdown submenus for Hold/Grupper)
- **Design System Playground** - Full-screen overlay (Settings → Design System) showcasing all colors, typography, components, cards, and patterns used in the extension

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

# Fetch + inspect ASP.NET fields and postback targets
bun run lectio fetch beskeder2.aspx --asp

# ASP.NET utilities
bun run lectio asp inspect beskeder2.aspx --targets
bun run lectio asp postback beskeder2.aspx -t 'm$Content$aktelvbtn2' --dump-body

# Standard post command with auto ASP.NET extraction
bun run lectio post beskeder2.aspx --asp-target 'm$Content$aktelvbtn2' --form __LASTFOCUS=

# Keep session alive in background
bun run lectio keepalive start
bun run lectio keepalive status
bun run lectio keepalive stop

# Check session status
bun run lectio status

# Search for schools
bun run lectio schools --search "sorø"
```

All commands support `--json` for machine-readable output. Session cookies are stored in `~/.lectio-cli/` (outside repo). Keepalive runtime files are `~/.lectio-cli/keepalive.pid` and `~/.lectio-cli/keepalive.log`.

## Reference Materials
- `tools/lectio-cli/` - CLI tool for fetching authenticated Lectio pages
- `lectio-scripts/` - Decompiled Lectio source code
- `lectio-html/` - HTML snapshots captured with the CLI tool
- `ARCHITECTURE.md` - Full project documentation
