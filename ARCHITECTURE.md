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
3. Fetch `SkemaNy.aspx` to resolve `elevid`; if Lectio has not fully propagated the new QR session yet, retry the fetch briefly before failing
4. `generateLink({ type: 'magiclink' })` → creates/finds auth user, returns `data.user.id`
5. Download Lectio profile picture (authenticated) → upload to `profile-pictures` storage bucket at `{schoolId}/{userId}.{ext}`
6. Upsert `students` record with `supabase_id` (auth UID), `lectio_pfp_url` (original), `custom_pfp_url` (Supabase Storage public URL)

**Background auth orchestration** (`entrypoints/background.ts` + `lib/supabase/session.ts`):
- `entrypoints/content.tsx` is the primary auth bootstrapper on page load
- Feature modules should only call `ensureSupabaseSession(...)` as a fallback when auth is still missing
- The background script dedupes concurrent auth attempts per `schoolId:userId` and shares one in-flight promise across callers, preventing duplicate `generateLink` / `verifyOtp` races that otherwise invalidate the first one-time token
- Auth analytics include a `source` property so callsites can be traced in PostHog

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
| `AppSidebar.tsx` | Custom sidebar navigation with collapsible sections, profile display, settings access, and Supabase-backed student name/avatar fallbacks for the current/viewed profile |
| `SettingsModal.tsx` | Settings: appearance, behavior, sidebar toggles, subject mappings, design playground, about |
| `DesignPlayground.tsx` | Full-screen overlay showcasing all design system tokens and components |

### FindSkema System

| File | Purpose |
|------|---------|
| `FindSkemaPage.tsx` | Redesigned search with fuzzy matching, type filters, starred/recents, person cards, browse sections, BetterLectio badges on students, Supabase-backed student display names/avatars, and search aliases for both Lectio + preferred names |
| `ProfilePage.tsx` | Supabase-backed student profile: description, instagram, birthday (if `show_birthday`), custom pfp, inline edit form for own profile. Instagram handles accept `handle`, `@handle`, or pasted Instagram URLs and render consistently as `@handle`. Tabs: schedule, classmates, teachers, hold/groups, documents |
| `lib/instagram.ts` | Shared Instagram helpers for normalizing stored handles and building consistent `@handle` display text + profile URLs |
| `PersonCard.tsx` | Reusable card with lazy-loaded pictures, star toggle, type badges, navigation context params, optional BetterLectio badge, and student name/avatar resolution via Supabase before Lectio fallbacks |
| `lib/supabase/student-lookup.ts` | Shared `useSchoolStudents` hook (Map for O(1) lookups) plus helpers for `getStudentIdFromPersonId`, lookup-ID-based preferred name/avatar resolution, search aliases, and `formatDanishBirthdate` |
| `ViewingScheduleHeader.tsx` | Shows viewed entity with star, type badge, back link, teacher name lookup, expandable members panel |
| `lib/class-name.ts` | Shared class-name transforms/matchers for grade codes with 1-2 alphanumeric suffixes, dotted numeric suffixes, and prefixed/suffixless variants (`1x`, `2hf`, `2zq`, `1.4`, `L2d`, `S2x`, `IB1`, year-based dropdown names) |
| `lib/findskema-storage.ts` | Starred people, recents, picture cache, canonical schedule URL generation |
| `lib/fuzzy-search.ts` | Danish text normalization (ae/o/a), multi-word matching, scoring |
| `lib/findskema-cache.ts` | Resolves AvanceretSkema afdeling/subcache params + shared in-flight/TTL-cached dropdown loader |
| `lib/findskema-types.ts` | Maps AvanceretSkema IDs (`SC/RO/RE/HE/GE`) to filter types |

**Data Fetching Note:** `subcache` must come from Lectio's `AvanceretSkema_<afdeling>_<subcache>` dataset key, not `new Date().getFullYear()`. Type mapping uses real AvanceretSkema prefixes (`SC*`=stamklasser, `RO*`=lokaler, `RE*`=ressourcer, `HE*`=hold, `GE*`=grupper). The dropdown loader is shared with in-flight dedupe to avoid duplicate `DropDown.aspx` traffic.

**Class Code Note:** Schools can use single-letter grade codes (`1x`), two-character alphanumeric suffixes like `2hf` or `2zq`, numeric ones like `1.4`, letter-prefixed variants like `L2d` or `S2x`, and suffixless prefixed variants like `IB1`. FindSkema/member resolution should normalize all through `lib/class-name.ts` before comparing against year-based dropdown entries like `2025x`, `2025zq`, `2025.4`, `L2025d`, or `IB2025`.

**Student Identity Resolution Note:** Student-facing UI should prefer `students.name` for display, while keeping native Lectio names as aliases/search terms. For pictures, prefer `students.custom_pfp_url`, then `students.lectio_pfp_url`, and only fall back to Lectio/context-card image fetches when no Supabase-backed student row is available. The shared helpers in `lib/supabase/student-lookup.ts` accept both raw `elevid` values and prefixed lookup IDs like `S727...` so message names/avatars, FindSkema cards/search, member grids, group submissions, and sidebar/profile surfaces stay consistent.

### Schedule & Activities

| File | Purpose |
|------|---------|
| `ActivityClassModal.tsx` | In-place modal for activity details from schedule/forside links. Renders note, lektier, presentation content, øvrigt indhold, related links, and hold navigation in the side sheet |
| `PrivatAftaleDialog.tsx` | Inline dialog for creating/editing private appointments. Triggered from toolbar (create) or brick click (edit). Fetches ASP.NET form tokens, submits via hidden iframe POST — no page navigation. Edit mode adds delete. Fields: title, start/end date+time, comment |
| `ScheduleToolbar.tsx` | Custom schedule toolbar: week nav, view mode toggle, calendar link, private appointment dialog trigger, print menu |
| `lib/activity-detail.ts` | Fetch/parse `aktivitetforside2.aspx` with rich lektie content, presentation blocks (`ACP*`), øvrigt indhold, navigation/form tokens, and school-scoped localStorage cache (cache key includes `schoolId`) |
| `lib/privat-aftale.ts` | Fetch/parse `privat_aftale.aspx` form page, extract ASP.NET tokens, submit create/delete via hidden iframe POST |
| `lib/brick-tooltip.ts` | Custom schedule brick hover tooltip with async-enriched content, including fetched presentation previews when available |
| `ScheduleCountdown.tsx` | Sidebar countdown: time remaining in current class / until next class |
| `lib/schedule-cache.ts` | School-scoped fetch + cache for today's schedule (45min TTL) |

### Homework & Assignments

| File | Purpose |
|------|---------|
| `LektierPage.tsx` | Day-grouped homework cards with file/activity links, teacher notes, and Supabase-backed done-state sync keyed by Lectio `absid`/`entry_id` while preserving the existing checkbox UI |
| `OpgaverPage.tsx` | Single chronological timeline of all assignments grouped by week. Auto-scrolls to current week on mount. Compact rows with left-border status indicators (red=missing, amber=waiting, green=completed), fravær badges, hold color pills, inline grade badges, hover-visible ignore toggle for missing items, combined elevtimer per week header. Search + hold filter toolbar. |
| `OpgaveDetailSheet.tsx` | Side sheet with full assignment details, submission history, comment/file upload (posts via ASP.NET form tokens, file upload via `/dokumentupload.aspx`, localStorage caching with 5-min TTL, session expiry detection), plus Supabase-backed group-member names/avatars |
| `lib/opgave-detail.ts` | `fetchOpgaveDetail(url)` fetch+parse, `submitComment(detail, comment)` POST with tokens, `uploadFileAndSubmit(detail, file, comment, schoolId)`, `getCachedDetail`/`invalidateDetailCache` school-scoped localStorage cache |
| `lib/supabase/resources/homework.ts` | Homework table access plus `upsert_student_homework_status(...)` RPC wrapper. Reads visible `homework_entries` by `school_id` + `entry_id`, writes per-student completion with optimistic invalidation of `homework_entries`/`student_homework` caches |

**Homework sync contract:** Completion is stored per student in `public.student_homework` and resolved against shared `public.homework_entries`. The client parses each lektie card's Lectio activity URL and extracts `absid` as the stable `entry_id`. Writes go through the `upsert_student_homework_status` security-definer RPC so legacy rows without `school_id` can be claimed safely on first write, client timestamps can prevent stale overwrites, and both extension/mobile can share the same patch-style contract.

**Realtime behavior:** `LektierPage.tsx` subscribes to `student_homework` and `homework_entries` via Supabase Realtime. External updates invalidate the browser cache for those tables, which causes the page to refetch and reflect cross-device changes without changing the existing UI.

### Grades

| File | Purpose |
|------|---------|
| `KaraktererPage.tsx` | Grade report redesign: subject cards grouped by hold with big color-coded grade numbers (7-step scale hue mapping), teacher notes inline, summary bar with weighted average + grade distribution, collapsible diploma lines/protocol/remarks sections. Includes `parseKaraktererFromDOM()` parser for all 5 native tables. |

### Documents

| File | Purpose |
|------|---------|
| `DokumenterPage.tsx` | Documents page redesign with collapsible folder tree sidebar (hold colors), file list with extension-based type icons and color-coded badges, breadcrumb navigation, client-side search, in-app image/PDF preview overlay, drag-and-drop file upload via `dokumentupload.aspx`, create folder, sort by columns |
| `lib/dokumenter-parser.ts` | DOM parser for `DokumentOversigt.aspx`: recursive folder tree walking (`#s_m_Content_Content_FolderTreeView`), document grid parsing (desktop + mobile layouts), breadcrumb builder, file category/extension classification, move-target dropdown extraction |

**Folder navigation:** Uses `window.location.href` with `?folderid=XXX` query params (page reload) rather than iframe-post, matching Lectio's native tree navigation. Sort triggers ASP.NET `__doPostBack` natively.

**File upload:** Drag-and-drop uploads POST to `dokumentupload.aspx` (same as `LectioFileUpload.ts`), receive `serializedId` JSON, then trigger Lectio's document chooser postback.

**Preview:** Images render inline via `<img>` pointing to `dokumenthent.aspx?documentid=XXX`. PDFs use `<iframe>` with the same URL. Both open in a modal overlay with download/edit actions.

### Hold/Subject Mapping

| File | Purpose |
|------|---------|
| `lib/hold-mapping.ts` | Resolve raw hold codes through canonical lesson keys (`1x MA`, `2.4 MA`, `L2d MA` -> `ma`), shared names/colors, ignored non-academic groups, and legacy localStorage migration. ~40 built-in Danish subjects. School-scoped localStorage. Functions: `getCanonicalHoldKey(holdCode)`, `getHoldDisplayName(holdCode)`, `getFullHoldDisplayName(holdCode)` (class-prefixed label), `getHoldHue(holdCode)`, `registerHold(holdCode)`, `scanDOMForHolds(root?)`, `getAllHolds()`, `setHoldDisplayName`/`setHoldColorHue`, `resetAllMappings()`/`clearHoldMappings()` |
| `lib/hold-mapping-sync.ts` | Hydrates canonical lesson mappings from Supabase v2, seeds discovered local mappings into `school_lesson_mappings`, and upserts/resets `user_lesson_overrides` for cross-device sync |
| `settings/HoldMappingEditor.tsx` | Settings UI for canonical lesson-key display names/colors |

### Beskeder (Messages) System

**No-reload architecture:** All message actions use hidden iframe POSTs instead of native `doPostBack()`. Serialized mutex prevents ASP.NET ViewState desync. Non-idempotent operations (send/reply/delete) avoid automatic native fallback on uncertain parse errors to prevent duplicate side effects.

**Lectio DOM quirk — recipient GridView links:** In `ThreadRecipientsGV`, the delete links use `onclick="javascript:__doPostBack(...)"` with `href="#"`, not `href="javascript:__doPostBack(...)"`. Parsers must check the `onclick` attribute first, then `href` as a fallback — never rely solely on `a[href*="__doPostBack"]` selectors for this table.

| File | Purpose |
|------|---------|
| `BeskederPage.tsx` (in content.tsx) | Thread list with folder pills, sender names/avatars preferring Supabase student data, optimistic flag/read/delete, search, bulk actions |
| `BeskederThreadView.tsx` | Thread reader with sender names/pictures preferring Supabase student data, signature stripping, no-reload reply + file attachment |
| `BeskederCompose.tsx` | Card-based compose with a fully custom recipient picker (students/teachers from AvanceretSkema, rendered names/avatars preferring Supabase student data while raw Lectio names remain for postbacks, keyboard navigation), recipient pills with avatars, no-reload add/remove recipient actions, no-reload send, and Ctrl+Enter. Falls back to showing native form if parser fails. |
| `WysiwygEditor.tsx` | contentEditable editor converting between BBCode and rich HTML |
| `BBCodeToolbar.tsx` | Formatting toolbar (bold, italic, underline, link) |
| `lib/beskeder-thread-parser.ts` | Thread DOM parser, state detection, signature stripping |
| `lib/iframe-post.ts` | Hidden iframe POST utility, form token extraction, session expiry detection |
| `lib/beskeder-submit.ts` | Mutex-serialized submission layer. Thread list: `toggleFlagViaIframe`, `toggleReadViaIframe`, `deleteThreadViaIframe`, `selectFolderViaIframe`, `executeSearchViaIframe`, `executeBulkActionViaIframe`, `markAllReadViaIframe`. Thread view: `sendReplyViaIframe`. Compose: `addRecipientViaIframe`, `removeRecipientViaIframe`, `sendMessageViaIframe`. Shared: `uploadFileToLectio`, `attachFileViaIframe`. |

### Forside & Other

| File | Purpose |
|------|---------|
| `ForsideGreeting.tsx` | Time-based greeting, live clock, Danish date formatting |
| `ForsideDashboard.tsx` | Redesigned forside dashboard with 4 cards (aktuel info, lektier, opgaver, beskeder). Parses native DOM, hides only the 4 specific original cards, renders 2-col grid with priority indicators, hold colors, urgency bars, sender names/avatars preferring Supabase student data, relative times |
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
| `lib/posthog.ts` | PostHog analytics singleton (edge build). Distinct ID: `lectio:${studentId}` (raw elevid). All `capture` / `identify` / session-once helpers / `captureException` validate `isLectioStudentDistinctId` before enqueueing — no anonymous or malformed distinct ids. Identify sends name, school, class, year, dark mode, and theme. Includes once-per-session feature helpers plus page-hide flushing to keep request volume lower without losing short-lived events. `captureException` enriches `$exception` events with auto props + tab `recent_urls` / profile ids when `distinctId` is omitted (`getContentDistinctId()`). All calls silently caught. |
| `lib/posthog-lifecycle.ts` | Queues deferred lifecycle events (`extension installed` / `extension updated`) in extension storage until an identified user is available in a content script. |
| `lib/logout-tracking.ts` | Passive Lectio logout/session-loss heuristics. Stores last authenticated activity and recent explicit logout intent so unexpected returns to `login.aspx` can be tracked without touching auth flow. |
| `lib/lectio-error-popup.ts` | MutationObserver detector for Lectio's native error popup (`LectioAlertBox.RegisterAlerts` renders elements with `[data-title^="Fejl"]`). Extracts title + body, dedupes per DOM element. Wired in `content.tsx` to fire a `lectio native error` PostHog event + paired `captureException` + `toast.info` confirming the report to the user. |
| `lib/url-history.ts` | Per-tab (sessionStorage) URL breadcrumb trail (`pushUrlToHistory` / `getRecentUrls`) used to enrich error reports with recent navigation context. |
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

Typography roles for injected UI (title, primary/secondary body, meta, section chrome) are documented in `AGENTS.md` under **Typography / hierarchy**.

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
