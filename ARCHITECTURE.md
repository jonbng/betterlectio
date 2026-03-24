# BetterLectio - Architecture & Project Documentation

## Overview

**BetterLectio** is a browser extension that enhances [Lectio](https://www.lectio.dk/), a Danish educational management system. It provides a modern, clean interface while preserving all original Lectio functionality.

### Key Goals
- Replace Lectio's outdated UI with a modern design
- Improve navigation with a custom sidebar
- Optimize performance with preloading/prefetching
- Maintain full compatibility with existing Lectio features
- Support both Chrome (Manifest V3) and Firefox (Manifest V2)

---

## Technology Stack

| Technology | Purpose |
|------------|---------|
| [WXT](https://wxt.dev/) 0.20.6 | Browser extension framework |
| [Preact](https://preactjs.com/) 10.28.0 | Lightweight React alternative (3KB) |
| TypeScript 5.9.2 | Type safety |
| Tailwind CSS 4.1.18 | Utility-first styling |
| shadcn/ui + Radix UI | Component system + accessible primitives |
| Lucide + Tabler Icons | Icon libraries |
| @dnd-kit, @tanstack/react-table, recharts, sonner, zod, next-themes | DnD, tables, charts, toasts, validation, theming |
| PostHog (posthog-node edge build) | Product analytics + error tracking |
| **Bun** | Package manager and runtime |

---

## Project Structure

```
betterlectio/
├── entrypoints/              # Extension entry points
│   ├── content.tsx           # Main content script
│   ├── login.content.tsx     # Login page redesign
│   ├── hide-flash.content.ts # FOUC prevention + CSS layer wrapping
│   ├── session-renew.content.ts # Blocks session timeout popup
│   ├── redirect-forside.content.ts # Redirects default.aspx to forside.aspx
│   └── background.ts         # Background service worker
├── components/               # UI components (AppSidebar, FindSkemaPage, etc.)
│   └── ui/                   # shadcn/ui components (20+)
├── lib/                      # Utility libraries (parsers, caches, storage)
│   └── userjot.ts            # UserJot widget bootstrap + identify bridge
├── hooks/                    # React/Preact hooks
├── styles/globals.css        # Main stylesheet
├── public/                   # Icons, logos, assets
│   └── vendor/userjot/       # Vendored UserJot SDK + chunks (MV3-compliant)
├── tools/vendor-userjot.mjs  # Fetches UserJot SDK/chunks before release builds
├── tools/lectio-cli/         # Authenticated Lectio CLI + WebForms helpers
├── lectio-scripts/           # Reference: Decompiled Lectio JS
├── lectio-html/              # Reference: HTML snapshots
└── .github/workflows/        # CI/CD (build, release)
```

---

## Architecture

### Content Script Injection Model

Custom UI is layered on top of the original Lectio DOM:

```
Content Scripts (inject into lectio.dk pages)
├── hide-flash.content.ts  [document_start]
│   ├── Hides page until custom UI is ready (FOUC)
│   └── Wraps Lectio CSS in @layer lectio (cascade layers)
└── content.tsx            [document_idle]
    └── Renders custom UI wrapper, moves original DOM
```

### Execution Flow

1. User navigates to lectio.dk
2. `hide-flash.content.ts` runs at `document_start` — hides page, wraps Lectio CSS in `@layer lectio`
3. `content.tsx` runs after DOM ready:
   - Detects main app page, extracts user data
   - Creates `#il-root`, renders `<DashboardLayout>` with `<AppSidebar>`
   - Moves (not clones) original DOM into `#il-lectio-content`
   - Fades out skeleton, initializes preloading
4. User interaction: sidebar nav, activity modals, hover prefetch, original forms work normally

### Third-Party SDK Policy (MV3)

- BetterLectio does not execute remote third-party JS at runtime for Chrome MV3 compatibility.
- UserJot SDK files are vendored into `public/vendor/userjot/` via `npm run vendor:userjot`.
- Build/zip scripts run this vendoring step automatically before packaging.

### Supabase Auth & Storage

**Edge function** (`supabase/functions/verify-lectio-auth/index.ts`):
1. QR login via `LandingPageQrCode.aspx` → extract session cookies + school ID
2. Fetch student profile from `digitaltStudiekort.aspx` (name, birthdate, picture URL)
3. `generateLink({ type: 'magiclink' })` → creates/finds auth user, returns `data.user.id`
4. Download Lectio profile picture (authenticated) → upload to `profile-pictures` storage bucket at `{schoolId}/{userId}.{ext}`
5. Upsert `students` record with `supabase_id` (auth UID), `lectio_pfp_url` (original), `custom_pfp_url` (Supabase Storage public URL)

**Storage bucket** `profile-pictures`: public, allows jpeg/png/webp/gif, 5MB limit. Pictures are organized as `{schoolId}/{userId}.{ext}`.

**Deploy:** `bunx supabase functions deploy verify-lectio-auth --no-verify-jwt`

**Lesson mapping sync v2:** Supabase now has canonical lesson mappings in `school_lesson_mappings` and per-student overrides in `user_lesson_overrides`. Clients normalize raw hold strings into stable `canonical_key` values like `ma`, `srp`, and `kt`, then merge school defaults with user overrides via `get_student_lesson_mappings_v2`. The migration lives in `supabase/migrations/20260324_add_lesson_mapping_v2.sql`; mobile rollout notes live in `docs/mobile-lesson-mapping-migration.md`.

---

## Key Components

### Entry Points

| Script | Purpose |
|--------|---------|
| `hide-flash.content.ts` | FOUC prevention + CSS cascade layer wrapping via MutationObserver |
| `session-block.content.ts` | Overrides `window.SessionHelper` to block session timeout popup |
| `login.content.tsx` | Complete login page redesign with school search, keyboard nav, auto-redirect |
| `content.tsx` | Primary entry: transforms UI, injects page-specific components, schedule enhancements, enriched hover tooltips |

### Navigation & Layout

| Component | Purpose |
|-----------|---------|
| `AppSidebar.tsx` | Custom sidebar navigation with collapsible sections, profile display, settings access |
| `SettingsModal.tsx` | Settings: appearance, behavior, sidebar toggles, subject mappings, design playground, about |
| `DesignPlayground.tsx` | Full-screen overlay showcasing all design system tokens and components |

### FindSkema System

| File | Purpose |
|------|---------|
| `FindSkemaPage.tsx` | Redesigned search with fuzzy matching, type filters, starred/recents, person cards, browse sections, BetterLectio badges on students |
| `ProfilePage.tsx` | Supabase-backed student profile: description, instagram, birthday (if `show_birthday`), custom pfp, inline edit form for own profile. Tabs: schedule, classmates, teachers, hold/groups, documents |
| `PersonCard.tsx` | Reusable card with lazy-loaded pictures, star toggle, type badges, navigation context params, optional BetterLectio badge |
| `lib/supabase/student-lookup.ts` | Shared `useSchoolStudents` hook (Map for O(1) lookups), `getStudentIdFromPersonId`, `formatDanishBirthdate` |
| `ViewingScheduleHeader.tsx` | Shows viewed entity with star, type badge, back link, teacher name lookup, expandable members panel |
| `lib/class-name.ts` | Shared class-name transforms/matchers for letter-based, numeric, and letter-prefixed class codes (`1x`, `1.4`, `L2d`, year-based dropdown names) |
| `lib/findskema-storage.ts` | Starred people, recents, picture cache, canonical schedule URL generation |
| `lib/fuzzy-search.ts` | Danish text normalization (ae/o/a), multi-word matching, scoring |
| `lib/findskema-cache.ts` | Resolves AvanceretSkema afdeling/subcache params + shared in-flight/TTL-cached dropdown loader |
| `lib/findskema-types.ts` | Maps AvanceretSkema IDs (`SC/RO/RE/HE/GE`) to filter types |

**Data Fetching Note:** `subcache` must come from Lectio's `AvanceretSkema_<afdeling>_<subcache>` dataset key, not `new Date().getFullYear()`. Type mapping uses real AvanceretSkema prefixes (`SC*`=stamklasser, `RO*`=lokaler, `RE*`=ressourcer, `HE*`=hold, `GE*`=grupper). The dropdown loader is shared with in-flight dedupe to avoid duplicate `DropDown.aspx` traffic.

**Class Code Note:** Schools can use letter-based grade codes (`1x`), numeric ones (`1.4`), or letter-prefixed ones (`L2d`). FindSkema/member resolution should normalize all through `lib/class-name.ts` before comparing against year-based dropdown entries like `2025x`, `2025.4`, or `L2025d`.

### Schedule & Activities

| File | Purpose |
|------|---------|
| `ActivityClassModal.tsx` | In-place modal for activity details from schedule/forside links |
| `lib/activity-detail.ts` | Fetch/parse `aktivitetforside2.aspx` with rich lektie content + school-scoped localStorage cache (cache key includes `schoolId`) |
| `lib/brick-tooltip.ts` | Custom schedule brick hover tooltip with async-enriched content |
| `ScheduleCountdown.tsx` | Sidebar countdown: time remaining in current class / until next class |
| `lib/schedule-cache.ts` | School-scoped fetch + cache for today's schedule (45min TTL) |

### Homework & Assignments

| File | Purpose |
|------|---------|
| `LektierPage.tsx` | Day-grouped homework cards with file/activity links, teacher notes |
| `OpgaverPage.tsx` | Urgency-first cards with 4-tier visual urgency, relative Danish deadlines, color-coded grade badges, hold filters |
| `OpgaveDetailSheet.tsx` | Side sheet with full assignment details, submission history, comment/file upload (posts via ASP.NET form tokens, file upload via `/dokumentupload.aspx`, localStorage caching with 5-min TTL, session expiry detection) |
| `lib/opgave-detail.ts` | `fetchOpgaveDetail(url)` fetch+parse, `submitComment(detail, comment)` POST with tokens, `uploadFileAndSubmit(detail, file, comment, schoolId)`, `getCachedDetail`/`invalidateDetailCache` school-scoped localStorage cache |

### Grades

| File | Purpose |
|------|---------|
| `KaraktererPage.tsx` | Grade report redesign: subject cards grouped by hold with big color-coded grade numbers (7-step scale hue mapping), teacher notes inline, summary bar with weighted average + grade distribution, collapsible diploma lines/protocol/remarks sections. Includes `parseKaraktererFromDOM()` parser for all 5 native tables. |

### Hold/Subject Mapping

| File | Purpose |
|------|---------|
| `lib/hold-mapping.ts` | Resolve raw hold codes through canonical lesson keys (`1x MA`, `2.4 MA`, `L2d MA` -> `ma`), shared names/colors, ignored non-academic groups, and legacy localStorage migration. ~40 built-in Danish subjects. School-scoped localStorage. Functions: `getCanonicalHoldKey(holdCode)`, `getHoldDisplayName(holdCode)`, `getFullHoldDisplayName(holdCode)` (class-prefixed label), `getHoldHue(holdCode)`, `registerHold(holdCode)`, `scanDOMForHolds(root?)`, `getAllHolds()`, `setHoldDisplayName`/`setHoldColorHue`, `resetAllMappings()`/`clearHoldMappings()` |
| `lib/hold-mapping-sync.ts` | Hydrates canonical lesson mappings from Supabase v2, seeds discovered local mappings into `school_lesson_mappings`, and upserts/resets `user_lesson_overrides` for cross-device sync |
| `settings/HoldMappingEditor.tsx` | Settings UI for canonical lesson-key display names/colors |

### Beskeder (Messages) System

**No-reload architecture:** All message actions use hidden iframe POSTs instead of native `doPostBack()`. Serialized mutex prevents ASP.NET ViewState desync. Non-idempotent operations (send/reply/delete) avoid automatic native fallback on uncertain parse errors to prevent duplicate side effects.

| File | Purpose |
|------|---------|
| `BeskederPage.tsx` (in content.tsx) | Thread list with folder pills, sender avatars, optimistic flag/read/delete, search, bulk actions |
| `BeskederThreadView.tsx` | Thread reader with sender pictures, signature stripping, no-reload reply + file attachment |
| `BeskederCompose.tsx` | Card-based compose with a fully custom recipient picker (students/teachers from AvanceretSkema, avatar thumbnails via context cards, keyboard navigation), recipient pills with avatars, no-reload add/remove recipient actions, no-reload send, and Ctrl+Enter. Falls back to showing native form if parser fails. |
| `WysiwygEditor.tsx` | contentEditable editor converting between BBCode and rich HTML |
| `BBCodeToolbar.tsx` | Formatting toolbar (bold, italic, underline, link) |
| `lib/beskeder-thread-parser.ts` | Thread DOM parser, state detection, signature stripping |
| `lib/iframe-post.ts` | Hidden iframe POST utility, form token extraction, session expiry detection |
| `lib/beskeder-submit.ts` | Mutex-serialized submission layer. Thread list: `toggleFlagViaIframe`, `toggleReadViaIframe`, `deleteThreadViaIframe`, `selectFolderViaIframe`, `executeSearchViaIframe`, `executeBulkActionViaIframe`, `markAllReadViaIframe`. Thread view: `sendReplyViaIframe`. Compose: `addRecipientViaIframe`, `removeRecipientViaIframe`, `sendMessageViaIframe`. Shared: `uploadFileToLectio`, `attachFileViaIframe`. |

### Forside & Other

| File | Purpose |
|------|---------|
| `ForsideGreeting.tsx` | Time-based greeting, live clock, Danish date formatting |
| `ForsideDashboard.tsx` | Redesigned forside dashboard with 4 cards (aktuel info, lektier, opgaver, beskeder). Parses native DOM, hides only the 4 specific original cards, renders 2-col grid with priority indicators, hold colors, urgency bars, sender avatars, relative times |
| `ForsideOpgaverCard.tsx` | Forside opgaver parser (reused by ForsideDashboard) |
| `MembersPage.tsx` | Card grid for hold/klasse members (teachers sorted first) |
| `lib/members-fetch.ts` | Fetch/parse `members.aspx` (explicit credentialed requests) |

### Shared Utilities

| File | Purpose |
|------|---------|
| `lib/profile-cache.ts` | User profile + viewed entity caching (school-scoped profile keys with same-school merge guard). Helpers: `isViewingOwnPage()`, `getViewedEntityId()`, `extractViewedEntity()` (fallback chain: URL `name` param -> recents/starred lookup -> `"Ukendt"`) |
| `lib/school-storage.ts` | Last school persistence for quick login |
| `lib/page-titles.ts` | Clean page titles with unread message badge, MutationObserver |
| `lib/preload.ts` | Speculation Rules API + hover-based prefetching |
| `lib/posthog.ts` | PostHog analytics singleton (edge build). Distinct ID: `lectio:${studentId}` (raw elevid). Identify sends name, school, class. `flushAt:1` for short-lived contexts. All calls silently caught. |
| `lib/utils.ts` | Helper functions (`cn()`) |

---

## CSS Architecture

### Cascade Layer Strategy

Lectio's CSS is wrapped in `@layer lectio { }` at `document_start`:

```
Layer order (lowest -> highest priority):
  lectio        <- Lectio's entire CSS bundle + inline styles
  theme         <- Tailwind theme layer
  base          <- Tailwind base + our resets
  components    <- Our custom styles (globals.css)
  utilities     <- Tailwind utility classes
```

Extension CSS automatically beats Lectio CSS without `!important`. Only ~99 `!important` declarations remain (for inline style overrides, display toggling, critical layout).

### Tailwind-First Rule For Custom UI

All custom/injected Preact UI should be styled with Tailwind utility classes directly in `.tsx` components.

- Do not add new component-specific plain CSS blocks for custom UI.
- Prefer semantic token utilities (`bg-background`, `text-foreground`, `bg-primary`, `border-border`, `ring-ring`) so theme switching propagates automatically.
- Keep `globals.css` for platform-level concerns only:
  - token definitions/overrides (`:root`, `.dark`, `data-il-theme`)
  - layer/base plumbing
  - native Lectio overrides and isolation (`#il-original-content`, `.ls-*`, `.s2*`)

### Content Isolation

```
DOM structure:
  body
  +-- #il-root (baseline: Geist font, --foreground color)
       +-- AppSidebar          <- Tailwind base applies
       +-- #il-lectio-content
            +-- injected pages  <- Tailwind base applies
            +-- #il-original-content
                 +-- Lectio DOM <- Tailwind base REVERTED, Lectio CSS applies
```

- `#il-original-content :where(*) { all: revert-layer }` in `@layer base` prevents Tailwind preflight from breaking Lectio's native DOM
- `#il-root` has explicit font/color/line-height baseline to prevent Lectio inheritance

### Lectio Modernizer

The "Lectio Modernizer" section in `globals.css` restyles native Lectio elements in `@layer components`:
- Tables (`table.lf-grid`, `ls-std-table-inputlist`), buttons (`.buttonfilled`, `.buttonoutlined`, etc.), form elements, schedule bricks (`.s2skemabrik`), links, cards (`.ls-card-filled`, `.lf-island`), tabs, status badges, messages, typography

### When to use `!important`
- Overriding inline `style=""` attributes
- `display: none/block` for element hiding (defense against Lectio JS toggling)
- Critical layout: body overflow, sidebar position:fixed, z-index
- Dark mode rules targeting native Lectio elements

---

## Browser Compatibility

| Browser | Manifest | Status |
|---------|----------|--------|
| Chrome | V3 | Supported |
| Firefox | V2 | Supported |
| Edge | V3 | Should work (untested) |

WXT handles manifest differences automatically.

---

## Development

```bash
bun install              # Install dependencies
bun run dev              # Development (Chrome)
bun run dev:firefox      # Development (Firefox)
bun run build            # Production build (Chrome)
bun run build:firefox    # Production build (Firefox)
bun run zip              # Package extension
```

Default dev URL: `https://www.lectio.dk/lectio/94/SkemaNy.aspx` (Soro Akademis Skole).

---

## Lectio CLI (`tools/lectio-cli`)

Standalone CLI for fetching/posting authenticated Lectio pages, debugging, and automation.

### Commands
- `lectio fetch <path>` / `lectio post <path>` - Authenticated GET/POST
- `lectio asp inspect|postback|field` - ASP.NET WebForms state inspection + postback helpers
- `lectio keepalive start|stop|status|ping|log` - Background session keepalive daemon

### ASP.NET Utilities (`src/lib/aspnet.ts`)
- `extractASPData`, `extractAllFormFields`, `extractForm` - Parse hidden state fields + form values
- `extractPostbackTargets` - Discover `__doPostBack()` calls
- `buildPostBody` - Create URL-encoded POST body
- Standard postback flow: GET page -> extract fields -> merge user fields -> POST

### HTTP/Auth
- `src/lib/http.ts` sends `Referer: https://www.lectio.dk` on all requests
- `src/lib/browser.ts` captures full browser cookies via CDP `Network.getAllCookies`
- Keepalive daemon pings `forside.aspx` every 10 min, PID/log in `~/.lectio-cli/`

---

## Reference Materials

- `lectio-scripts/` - Decompiled Lectio JS (internal behavior, event handlers, validation)
- `lectio-html/` - HTML snapshots (original DOM structure, CSS classes, IDs)
- `tools/lectio-cli/` - CLI tool for page fetching, ASP.NET postbacks, session management

---

## Performance Optimizations

1. **Preact over React** - 3KB vs 40KB+ bundle
2. **Skeleton loading** - Perceived instant load (FOUC prevention)
3. **Speculation Rules API** - Browser-level prerendering
4. **Hover prefetching** - Links prefetched on hover (65ms delay)
5. **Picture caching** - Profile pictures cached 7 days, lazy-loaded via IntersectionObserver
6. **CSS Cascade Layers** - No specificity wars, clean style overrides
