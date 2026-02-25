# BetterLectio - Architecture & Project Documentation

## Overview

**BetterLectio** is a browser extension that enhances the user experience of [Lectio](https://www.lectio.dk/), a Danish educational management system widely used by schools in Denmark. The extension provides a modern, clean interface while preserving all original Lectio functionality.

### Key Goals
- Replace Lectio's outdated UI with a modern design
- Improve navigation with a custom sidebar
- Optimize performance with preloading/prefetching
- Maintain full compatibility with existing Lectio features
- Support both Chrome (Manifest V3) and Firefox (Manifest V2)

---

## Technology Stack

### Core Framework
| Technology | Version | Purpose |
|------------|---------|---------|
| [WXT](https://wxt.dev/) | 0.20.6 | Modern browser extension framework |
| [Preact](https://preactjs.com/) | 10.28.0 | Lightweight React alternative (3KB) |
| [TypeScript](https://www.typescriptlang.org/) | 5.9.2 | Type safety |
| [Tailwind CSS](https://tailwindcss.com/) | 4.1.18 | Utility-first styling |
| [Vite](https://vitejs.dev/) | (via WXT) | Build tool |

### UI Components
| Library | Purpose |
|---------|---------|
| [shadcn/ui](https://ui.shadcn.com/) | Component system built on Radix UI |
| [Radix UI](https://www.radix-ui.com/) | Unstyled, accessible primitives |
| [Lucide Icons](https://lucide.dev/) | Icon library |
| [Tabler Icons](https://tabler.io/icons) | Additional icon set |

### Additional Libraries
- **@dnd-kit** - Drag-and-drop functionality
- **@tanstack/react-table** - Table components
- **recharts** - Charting library
- **sonner** - Toast notifications
- **zod** - Schema validation
- **next-themes** - Theme management
- **clsx + tailwind-merge** - Dynamic class utilities

### Development Tools
- **Bun** - Package manager and runtime
- **GitHub Actions** - CI/CD for automated builds

---

## Project Structure

```
betterlectio/
├── entrypoints/              # Extension entry points
│   ├── content.tsx           # Main content script
│   ├── login.content.tsx     # Login page redesign
│   ├── hide-flash.content.ts # FOUC prevention script
│   ├── session-block.content.ts # Blocks session timeout popup
│   ├── redirect-forside.content.ts # Redirects default.aspx to forside.aspx
│   └── background.ts         # Background service worker
│
├── components/               # UI components
│   ├── AppSidebar.tsx        # Main sidebar navigation
│   ├── LoginPage.tsx         # School selector UI
│   ├── FindSkemaPage.tsx     # FindSkema search page redesign
│   ├── PersonCard.tsx        # Reusable person/entity card
│   ├── MembersPage.tsx       # Members list card grid
│   ├── LektierPage.tsx      # Lektier page redesign (day-grouped cards)
│   ├── OpgaverPage.tsx      # Opgaver page redesign (urgency-first cards + submitted rows)
│   ├── OpgaveDetailSheet.tsx # Side sheet for assignment details + submission
│   ├── ViewingScheduleHeader.tsx  # Header when viewing others
│   ├── SettingsModal.tsx     # Settings/about modal
│   ├── ActivityClassModal.tsx # Modal for class/activity detail from schedule links
│   ├── ForsideGreeting.tsx   # Dynamic greeting for forside
│   └── ui/                   # shadcn/ui components (20+)
│
├── lib/                      # Utility libraries
│   ├── preload.ts            # Speculation Rules & prefetching
│   ├── profile-cache.ts      # User profile & entity caching
│   ├── school-storage.ts     # Last school persistence
│   ├── findskema-storage.ts  # Starred/recents/picture cache
│   ├── fuzzy-search.ts       # Fuzzy search algorithm
│   ├── hold-mapping.ts       # Hold-to-subject name mapping system
│   ├── opgave-detail.ts      # Fetch/parse assignment detail pages
│   ├── activity-detail.ts    # Fetch/parse activity detail pages (aktivitetforside2)
│   ├── page-titles.ts        # Clean page title management
│   └── utils.ts              # Helper functions (cn())
│
├── hooks/                    # React/Preact hooks
│   └── use-mobile.ts         # Mobile detection hook
│
├── styles/
│   └── globals.css           # Main stylesheet
│
├── public/
│   ├── icon/                 # Extension icons (16-128px)
│   └── assets/               # Logo variants, favicon
│
├── docs/                     # Additional documentation
├── tools/lectio-cli/         # CLI for fetching Lectio pages
├── lectio-scripts/           # Reference: Decompiled Lectio JS
├── lectio-html/              # Reference: HTML snapshots
│
├── .github/workflows/        # CI/CD (build, release)
├── wxt.config.ts             # WXT extension configuration
└── CLAUDE.md                 # AI assistant instructions
```

---

## Architecture

### Content Script Injection Model

The extension follows a **content script injection architecture** where custom UI is layered on top of the original Lectio DOM:

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser Extension                         │
├─────────────────────────────────────────────────────────────┤
│  Content Scripts (inject into lectio.dk pages)              │
│  ├── hide-flash.content.ts  [document_start]                │
│  │   ├── Hides page until custom UI is ready (FOUC)         │
│  │   └── Wraps Lectio CSS in @layer lectio (cascade layers) │
│  └── content.tsx            [document_idle]                 │
│      └── Renders custom UI wrapper, moves original DOM      │
├─────────────────────────────────────────────────────────────┤
│  Background Script (service worker)                         │
│  └── Minimal - room for future features                     │
├─────────────────────────────────────────────────────────────┤
│  Popup                                                      │
│  └── Simple status display                                  │
└─────────────────────────────────────────────────────────────┘
```

### Execution Flow

```
1. User navigates to lectio.dk
         │
         ▼
2. hide-flash.content.ts runs at document_start
   ├── Injects CSS (visibility: hidden until ready)
   └── Intercepts Lectio <link>/<style> tags → wraps in @layer lectio
         │
         ▼
3. content.tsx runs after DOM ready
   ├── Checks for main app page (.ls-master-header)
   ├── Extracts user data (name, class, profile pic)
   ├── Injects Geist font
   ├── Removes original body children (preserving nodes)
   ├── Creates #il-root container
   ├── Renders <DashboardLayout> with <AppSidebar>
   ├── Moves original DOM into #il-lectio-content
   ├── Fades out skeleton, fades in content
   └── Initializes preloading system
         │
         ▼
4. User interaction
   ├── Sidebar navigation → Native Lectio links
   ├── Activity link click → BetterLectio modal (in-place) with fallback navigation
   ├── Hover on links → Prefetch in background
   └── Original forms/scripts → Work normally (DOM preserved)
```

---

## Key Components

### 1. Hide Flash Script (`entrypoints/hide-flash.content.ts`)

**Purpose:** Prevent Flash of Unstyled Content (FOUC) + CSS cascade layer wrapping

- Runs at `document_start` (earliest possible moment)
- Hides the page with `visibility: hidden` until custom UI is ready
- Supports prerendering optimization
- **CSS Layer Wrapping:** Intercepts Lectio's `<link href="lectio-css.bundle.css">` and inline `<style>` tags via MutationObserver, wraps them in `@layer lectio { }` so our extension CSS always wins without `!important`
- Layer order: `lectio < theme < base < components < utilities`

### 2. Session Block (`entrypoints/session-block.content.ts`)

**Purpose:** Prevents Lectio's "Din session udløber snart" popup

- Runs at `document_start` in MAIN world
- Overrides `window.SessionHelper` before Lectio initializes it
- Server session still renews on normal navigation

### 3. Login Page (`entrypoints/login.content.tsx`)

**Purpose:** Complete redesign of the school selection page

Features:
- Parses school list from Lectio's login_list.aspx
- "Continue to last school" quick access button
- Search/filter schools by name
- Keyboard navigation support
- Auto-redirect if session is still valid

### 4. Main Content Script (`entrypoints/content.tsx`)

**Purpose:** Primary entry point that transforms the UI

Key responsibilities:
- Detects main app pages (vs login, etc.)
- Extracts profile picture URL before DOM manipulation
- Redirects messages page to "Nyeste" folder by default
- Renders the custom `<DashboardLayout>`
- Moves (not clones) original DOM to preserve event handlers
- Initializes the preloading system
- Injects page-specific components (FindSkema, Forside greeting, Members page)
- Handles schedule enhancements (today highlight, time indicator, optional time label)
- Updates page titles to cleaner format
- Listens for settings modal open events from background script

### 5. App Sidebar (`components/AppSidebar.tsx`)

**Purpose:** Custom navigation replacing Lectio's header

Features:
- Dynamic school name extraction
- User profile display with dropdown menu
- Profile picture click-to-enlarge with fullscreen overlay
- Navigation groups with collapsible sections
- Profile dropdown with settings modal access
- Active page detection and highlighting
- Uses cached profile data when viewing other schedules
- Collapsible sidebar support

### 6. FindSkema Page (`components/FindSkemaPage.tsx`)

**Purpose:** Complete redesign of the FindSkema search page

Features:
- Fuzzy search with Danish text normalization (handles æ, ø, å)
- Type filter toggles (Elev, Lærer, Klasse, Lokale, Ressource, Hold, Gruppe)
- Starred people section with persistent storage
- Recent searches with click-to-remove
- Person cards with lazy-loaded profile pictures
- Back navigation preservation (returns to search with query intact)

### 7. Person Card (`components/PersonCard.tsx`)

**Purpose:** Reusable card component for displaying people/entities

### 8. Activity Class Modal (`components/ActivityClassModal.tsx`)

**Purpose:** Show class/activity details in-place from schedule/forside activity links without leaving the current page.

Features:
- Opens via custom `betterlectio:openActivityModal` event dispatched from content script link interception
- Uses `createPortal` from `preact/compat` into `#il-root` (same modal strategy as settings/opgave sheet)
- Renders activity metadata (date/time/module/hold/teacher/room), phase link, note, rich lektie content, and related items
- Supports large rich HTML lektier blocks with sanitized markup and absolute URL normalization
- Falls back to native Lectio navigation if fetch/parse fails (reliability-first behavior)

### 9. Activity Detail Parser (`lib/activity-detail.ts`)

**Purpose:** Fetch and parse `aktivitet/aktivitetforside2.aspx` into typed modal-friendly data.

Responsibilities:
- Fetch activity pages with credentials
- Parse header brick + tooltip metadata, phase links, tabs, note, lektier articles, and related TOC entries
- Normalize relative links to absolute URLs for Firefox compatibility
- Sanitize rendered homework HTML (remove scripts/event handlers)
- Cache parsed results in localStorage (short TTL) to improve reopen performance

Features:
- Lazy-loaded profile pictures using IntersectionObserver
- Picture caching in localStorage (7-day TTL)
- Star toggle for favorites
- Type-specific badges with colors
- Initials fallback when no picture available
- Delete button for recent items

### 8. Viewing Schedule Header (`components/ViewingScheduleHeader.tsx`)

**Purpose:** Shows whose schedule you're viewing when not on your own

Features:
- Displays name, subtitle (class/code), and profile picture
- Star toggle to add to favorites
- Type-specific badge and icon (Elev, Lærer, Klasse, Lokale, Hold, etc.)
- "Back to search" or "Back to your schedule" link
- Preserves search query in back navigation

### 9. Forside Greeting (`components/ForsideGreeting.tsx`)

**Purpose:** Dynamic greeting header for the forside (home) page

Features:
- Time-based greeting (God morgen/formiddag/eftermiddag/aften)
- Displays user's first name from cached profile
- Live clock with Danish locale formatting
- Formatted date display (weekday, day, month)

### 10. Settings Modal (`components/SettingsModal.tsx`)

**Purpose:** Extension settings and about information

Sections:
- **Udseende (Appearance)** - Experimental dark mode toggle
- **Adfærd** - Session management, messages redirect, preloading
- **Sidebar** - Toggle sidebar menu items
- **Fag** - Hold/subject name and color management (HoldMappingEditor)
- **Avanceret** - Advanced settings, clear cache option
- **Om (About)** - Version info, install date, links to GitHub/bug reports

### 11. Members Page (`components/MembersPage.tsx`)

**Purpose:** Card grid display for hold/klasse member lists

Features:
- Parses member table from Lectio DOM
- Displays as PersonCard grid
- Supports starring members
- Teachers sorted first, then students

### 12. Lektier Page (`components/LektierPage.tsx`)

**Purpose:** Redesigned homework overview grouped by day

Features:
- Parses homework table from Lectio DOM (tooltips + cell content)
- Groups entries by date with Danish day/month formatting
- Today section highlighted with "I dag" badge
- Homework cards show module, time, hold badge, teacher/room
- File download links, activity links, and text-only items
- Teacher notes rendered in muted callout blocks
- Toggleable via settings

### 13. Opgaver Page (`components/OpgaverPage.tsx`)

**Purpose:** Redesigned assignments page with urgency-first deadline display

Features:
- Parses assignment table from Lectio DOM (`#s_m_Content_Content_ExerciseGV`)
- **Upcoming section**: Flat card list sorted by deadline, urgency drives visual treatment
  - Deadline is the hero element — shown as relative time in Danish ("Om 3 timer", "I morgen", "Lige overskredet")
  - 4 urgency tiers: overdue (red), imminent <24h (orange), soon 1-3d (amber), later 3d+ (neutral)
  - Urgency controls: left border thickness/color, deadline text size/weight, background tint
  - Cards show deadline, title, hold pill, student hours, awaiting info
- **Submitted section**: Compact bordered rows with title, hold pill, grade badge, date
  - Color-coded grade badges (hue varies by grade: 12=gold, 10=green, 7=blue, etc.)
  - Expandable notes and grade extra info
  - "Vis alle" expansion (initially 6 items)
- Hold filter pills for filtering by subject
- Clicking assignment title opens detail sheet sidebar
- Toggleable via settings

### 13b. Opgave Detail Sheet (`components/OpgaveDetailSheet.tsx`)

**Purpose:** Side sheet showing full assignment details without leaving the redesigned page

Features:
- Fetches `ElevAflevering.aspx` HTML via `fetch()` and parses with `DOMParser`
- Info section: teacher, student time, grade scale, deadline, UV-beskrivelse
- Assignment note (rendered HTML), description file downloads
- Student status: awaiting badge, delivery status, grade + grade note
- Submission history timeline (teacher entries styled differently)
- Submission form: textarea + file drag-and-drop/picker + send button
- Posts comments via ASP.NET form tokens (`__EVENTTARGET`, `__VIEWSTATEX`, etc.)
- File upload via `/dokumentupload.aspx` endpoint
- localStorage caching with 5-minute TTL (invalidated on submission)
- Error handling with retry button and "Open in Lectio" fallback
- Session expiry detection

### 13c. Opgave Detail Parser (`lib/opgave-detail.ts`)

**Purpose:** Fetch, parse, and cache ElevAflevering.aspx pages

Functions:
- `fetchOpgaveDetail(url)` — fetch + parse assignment detail page
- `submitComment(detail, comment)` — POST comment with ASP.NET form tokens
- `uploadFileAndSubmit(detail, file, comment, schoolId)` — upload file + submit
- `getCachedDetail(url)` / `invalidateDetailCache(url)` — localStorage cache management

### 13d. Hold/Subject Mapping (`lib/hold-mapping.ts`)

**Purpose:** Map Lectio hold codes to human-readable subject names

Features:
- Built-in Danish subject dictionary (~40 entries, case-insensitive)
- Extracts abbreviation from hold code ("1x HI" → "HI" → "Historie")
- School-scoped localStorage persistence (`il-hold-mappings`)
- User overrides for display names and color hues
- DOM scanning for hold discovery (tooltips + context card spans)
- In-memory cache for fast lookups

Functions:
- `getHoldDisplayName(holdCode)` — display name or fallback
- `getHoldHue(holdCode)` — user override hue or hash default
- `registerHold(holdCode, holdelementId?)` — add/update mapping
- `scanDOMForHolds(root?)` — discover holds from DOM
- `getAllHolds()` — all mappings sorted (for settings UI)
- `setHoldDisplayName(holdCode, name)` / `setHoldColorHue(holdCode, hue)` — user overrides
- `resetAllMappings()` / `clearHoldMappings()` — reset/clear

### 13e. Hold Mapping Editor (`components/settings/HoldMappingEditor.tsx`)

**Purpose:** Settings UI for managing hold display names and colors

Features:
- Table-like list of discovered holds
- Inline-editable display names (click to edit)
- Auto-guessed indicator (sparkle) vs user-edited (pencil)
- Color circle picker with 12 preset hues + rainbow "Standard" reset
- "Nulstil alle navne" button to reset all overrides
- Empty state message when no holds discovered yet

### 14. Profile Cache (`lib/profile-cache.ts`)

**Purpose:** Persist user profile data and detect viewed entities

Features:
- Caches logged-in user's name, class, and profile picture
- Detects viewed entity from URL parameters (elevid, laererid, lokaleid, etc.)
- Login state tracking to clear cache on logout
- `isViewingOwnPage()` and `getViewedEntityId()` helpers

### 15. School Storage (`lib/school-storage.ts`)

**Purpose:** Remember last used school for quick login

Features:
- Stores last school ID, name, and URL
- Used by login page for "Continue to last school" feature

### 16. FindSkema Storage (`lib/findskema-storage.ts`)

**Purpose:** Persistent storage for FindSkema features

Features:
- Starred people (max 50), recent searches (max 10)
- Profile picture URL cache (7-day TTL, max 1000 entries)
- Fetch picture URLs from Lectio context cards

### 17. Fuzzy Search (`lib/fuzzy-search.ts`)

**Purpose:** Fast fuzzy matching for search

Features:
- Danish text normalization (æ→ae, ø→o, å→a)
- Multi-word search (all terms must match)
- Scoring with bonuses for sequential/boundary matches

### 18. Page Titles (`lib/page-titles.ts`)

**Purpose:** Clean, modern page titles

Features:
- Maps Lectio pages to friendly titles
- Dynamic titles for schedule pages (shows viewed person)
- Unread message count badge in title
- MutationObserver for dynamic updates

### 19. Preload System (`lib/preload.ts`)

**Purpose:** Performance optimization through speculative loading

- Uses Speculation Rules API for instant navigation
- Hover-based prefetching with 65ms delay
- Falls back gracefully for unsupported browsers

### 20. Global Styles (`styles/globals.css`)

**Purpose:** Complete visual overhaul

Key areas:
- Schedule page: today highlight, current time indicator, column widths
- FindSkema page: hidden original UI, card grid layout
- Members page: card grid styling
- Messages page: two-column layout
- Forside: masonry layout, greeting area
- Entity schedules: show Lectio subnavigation

---

## Configuration Files

### `wxt.config.ts`
```typescript
export default defineConfig({
  extensionApi: "chrome",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "BetterLectio",
    permissions: ["storage"],
    // React aliased to Preact for smaller bundle
  },
  runner: {
    startUrls: ["https://www.lectio.dk/lectio/94/SkemaNy.aspx"],
  },
});
```

### `package.json` Scripts
```json
{
  "scripts": {
    "dev": "wxt",                    // Development mode
    "dev:firefox": "wxt -b firefox", // Firefox development
    "build": "wxt build",            // Production build (Chrome)
    "build:firefox": "wxt build -b firefox",
    "zip": "wxt zip",                // Package for Chrome
    "zip:firefox": "wxt zip -b firefox"
  }
}
```

### `components.json` (shadcn/ui)
```json
{
  "style": "new-york",
  "tailwind": { "cssVariables": true },
  "iconLibrary": "lucide"
}
```

---

## Browser Compatibility

| Browser | Manifest Version | Status |
|---------|------------------|--------|
| Chrome | V3 | Supported |
| Firefox | V2 | Supported |
| Edge | V3 | Should work (untested) |

The WXT framework handles manifest differences automatically.

---

## Development

### Prerequisites
- [Bun](https://bun.sh/) (recommended) or npm/pnpm
- Chrome or Firefox for testing

### Getting Started

```bash
# Install dependencies
bun install

# Start development mode (Chrome)
bun run dev

# Start development mode (Firefox)
bun run dev:firefox

# Build for production
bun run build
bun run build:firefox

# Package extension
bun run zip
bun run zip:firefox
```

### Development URL
The extension opens to `https://www.lectio.dk/lectio/94/SkemaNy.aspx` by default (school ID 94 - Sorø Akademis Skole).

---

## Reference Materials

### `/lectio-scripts/`
Decompiled Lectio JavaScript source code. Useful for understanding:
- Internal Lectio behavior
- Event handlers and form submissions
- Client-side validation logic

### `/lectio-html/`
HTML snapshots of Lectio pages before extension modification:
- Original DOM structure reference
- CSS class names and IDs
- Server-rendered content patterns

---

## Features Summary

### Login & Session
- Complete login page redesign with school search
- "Continue to last school" quick access
- Session popup blocker (no more "session expiring" popups)
- Auto-redirect if session is still valid

### Navigation & UI
- Modern sidebar with collapsible sections
- Settings modal (appearance, notifications, about)
- Experimental dark mode toggle
- Clean page titles with unread badge
- Custom favicon

### Schedule Features
- Today column highlight with "I dag" label
- Current time indicator line (optional time label)
- Viewing header with star toggle and back navigation
- Support for all entity types (student, teacher, class, room, hold, group, resource)

### FindSkema Page
- Complete redesign with fuzzy search
- Type filter toggles
- Starred people and recent searches
- Person cards with lazy-loaded pictures
- Back navigation preserves search query

### Members Page
- Card grid layout for hold/klasse members
- Star toggle on each card
- Teachers sorted first

### Lektier Page
- Day-grouped homework cards with "I dag" highlight
- File links, activity links, and text-only homework items
- Teacher notes in muted callout blocks
- Module, time, hold badge, teacher/room per card

### Opgaver Page
- Urgency-first cards with relative Danish deadlines ("Om 3 timer", "I morgen", "2 dage forsinket")
- 4-tier visual urgency: overdue (red), imminent (orange), soon (amber), later (neutral)
- Deadline text size grows with urgency — overdue cards are visually heavier
- Compact submitted rows with color-coded grade badges
- Hold filter pills for subject filtering
- **Detail sheet sidebar**: click assignment to open side sheet with full details, submission history, comment/file upload
- **Hold/subject name mapping**: auto-guesses subject names from Danish dictionary, user can override in Settings → Fag

### Other Pages
- Forside: time-based greeting, live clock, masonry layout
- Messages: two-column layout, auto-redirect to Nyeste
- UV beskrivelser: grid of pills

### Performance
- Skeleton loading (FOUC prevention)
- Speculation Rules prerendering
- Hover-based prefetching
- Profile picture caching (7-day TTL)

### Preserved from Original Lectio
- All form submissions and event handlers
- Navigation and search functionality
- Entity subnavigation on schedule pages

---

## CSS Architecture

### Cascade Layer Strategy

Lectio's CSS is wrapped in `@layer lectio { }` at `document_start`, establishing this layer priority:

```
Layer order (lowest → highest priority):
  lectio        ← Lectio's entire CSS bundle + inline styles
  theme         ← Tailwind theme layer
  base          ← Tailwind base + our resets
  components    ← Our custom styles (globals.css @layer components)
  utilities     ← Tailwind utility classes
```

**Key benefits:**
- Extension CSS automatically beats Lectio CSS without `!important`
- Lectio's CSS still loads and works for everything we haven't overridden
- Resilient to Lectio updates (their CSS still functions, just at lower priority)
- Only ~99 `!important` declarations remain (for inline style overrides, display toggling, critical layout)

### Content Isolation

Since `@layer base > @layer lectio`, Tailwind's preflight (margin:0, padding:0, border:0, color:inherit, etc.) would break Lectio's native layout. Two defenses:

1. **Lectio content revert** (`@layer base`): `#il-original-content :where(*) { all: revert-layer }` reverts ALL Tailwind base resets for elements inside Lectio's native DOM, letting Lectio's CSS apply naturally. Our `@layer components` overrides still win (higher layer).

2. **Root baseline** (`@layer components`): `#il-root` has explicit font, color, and line-height to prevent Lectio body styles from leaking into our custom UI via inheritance.

```
DOM structure:
  body
  └── #il-root (baseline: Geist font, --foreground color, etc.)
       ├── AppSidebar          ← Tailwind base applies ✓
       └── #il-lectio-content
            ├── injected pages  ← Tailwind base applies ✓
            └── #il-original-content
                 └── Lectio DOM ← Tailwind base REVERTED, Lectio CSS applies ✓
```

### Lectio Modernizer (Phase 3)

The "Lectio Modernizer" section in `globals.css` restyles Lectio's **native** elements with modern design. Since all styles live in `@layer components`, they automatically beat Lectio's `@layer lectio` styles without `!important`.

**Modernized elements:**
- **Tables** (`table.lf-grid`) — Modern headers, clean borders, subtle hover
- **Info tables** (`ls-std-table-inputlist`) — Label/value pair tables
- **Buttons** (`.buttonfilled`, `.buttonoutlined`, `.buttonfilledtonal`, `.buttonicon`) — Rounded, proper padding, hover transitions
- **Form elements** — Inputs, selects, textareas, checkboxes, datepickers with consistent border-radius and focus rings
- **Schedule bricks** (`.s2skemabrik`) — Rounded corners, hover shadow, cleaner typography
- **Links** — Consistent blue color, hover underline with offset
- **Cards** (`.ls-card-filled`, `.lf-island`) — Modern border-radius, consistent borders
- **Tabs** (`.lectioTabToolbar`) — Pill-style tab navigation
- **Status badges** (`.exercisewait`, `.attention`) — Color-coded pills
- **Messages** (`.ls-info-message`, `.ls-warning-message`, `.ls-error-message`) — Color-coded alert boxes
- **Typography** — Labels, headings, context card links
- **Misc** — Horizontal rules, horizontal link lists, homework notes, tooltips

### When to use `!important`
- Overriding Lectio's inline `style=""` attributes (e.g., schedule brick widths)
- `display: none/block` for hiding/showing Lectio elements (defense against JS toggling)
- Critical layout: body overflow, sidebar position:fixed, z-index
- Dark mode rules targeting native Lectio elements

---

## Performance Optimizations

1. **Preact over React** - 3KB vs 40KB+ bundle size
2. **Skeleton loading** - Perceived instant load
3. **Speculation Rules API** - Browser-level prerendering
4. **Hover prefetching** - Links prefetched on hover (65ms delay)
5. **Picture caching** - Profile pictures cached 7 days, lazy-loaded
6. **IntersectionObserver** - Pictures only fetched when visible
7. **CSS Cascade Layers** - No specificity wars, clean style overrides

---

## Contributing

The codebase is well-structured for contributions:
- TypeScript for type safety
- Component-based architecture
- shadcn/ui for consistent styling
- Clear separation of concerns
- Reference materials included

---

## License

See LICENSE file in repository root.
