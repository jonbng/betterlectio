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
- `entrypoints/hide-flash.content.ts` - Prevents FOUC with skeleton loader
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
- `lib/findskema-storage.ts` - Starred people, recents, and picture cache persistence
- `lib/fuzzy-search.ts` - Fuzzy search algorithm for Danish text
- `lib/school-storage.ts` - Last school persistence for auto-redirect
- `lib/opgave-detail.ts` - Fetch/parse ElevAflevering.aspx pages, submission API, localStorage cache
- `lib/profile-cache.ts` - User profile and viewed entity caching
- `styles/globals.css` - Main styles, hides original Lectio UI, page-specific styling

## Architecture
Content scripts inject a custom Preact UI that wraps the original Lectio DOM. The original DOM is **moved** (not cloned) to preserve event handlers and functionality.

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