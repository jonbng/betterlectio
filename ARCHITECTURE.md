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
3. `content.tsx` runs after DOM ready: detects main app page, extracts user data, creates `#il-root`, renders `<DashboardLayout>` with `<AppSidebar>`, moves original DOM into `#il-lectio-content`, fades out skeleton, initializes preloading
4. User interaction: sidebar nav, activity modals, hover prefetch, original forms work normally

### Third-Party SDK Policy (MV3)

- BetterLectio does not execute remote third-party JS at runtime for Chrome MV3 compatibility.
- UserJot SDK files are vendored into `public/vendor/userjot/` via `npm run vendor:userjot`.
- Build/zip scripts run this vendoring step automatically before packaging.

### Supabase Auth & Storage

**Edge function** (`supabase/functions/verify-lectio-auth/index.ts`):
1. QR login via `LandingPageQrCode.aspx` → extract session cookies + school ID
2. Fetch student profile from `digitaltStudiekort.aspx` (name, birthdate, picture URL)
3. Fetch `SkemaNy.aspx` to resolve `elevid`; retry briefly if Lectio hasn't propagated the new QR session yet
4. `generateLink({ type: 'magiclink' })` → creates/finds auth user, returns `data.user.id`
5. Download Lectio profile picture (authenticated) → upload to `profile-pictures` bucket at `{schoolId}/{userId}.{ext}`
6. Upsert `students` record with `supabase_id`, `lectio_pfp_url`, `custom_pfp_url`

**Background auth orchestration** (`entrypoints/background.ts` + `lib/supabase/session.ts`):
- `entrypoints/content.tsx` is the primary auth bootstrapper on page load
- Feature modules only call `ensureSupabaseSession(...)` as a fallback
- Background dedupes concurrent auth attempts per `schoolId:userId` and shares one in-flight promise across callers, preventing duplicate `generateLink` / `verifyOtp` races
- Auth analytics include a `source` property so callsites can be traced in PostHog

**Storage bucket** `profile-pictures`: public, allows jpeg/png/webp/gif, 5MB limit. Organized as `{schoolId}/{userId}.{ext}`.

**Deploy:** `bunx supabase functions deploy verify-lectio-auth --no-verify-jwt`

**Lesson mapping sync v2:** Canonical mappings in `school_lesson_mappings` and per-student overrides in `user_lesson_overrides`. Clients normalize raw hold strings into stable `canonical_key` values like `ma`, `srp`, `kt`, then merge school defaults with overrides via `get_student_lesson_mappings_v2`. Migration: `supabase/migrations/20260324_add_lesson_mapping_v2.sql`.

**Settings sync:** User settings (`bl-feature-settings`) and per-school theme (`bl-school-themes-v1`) are synced to Supabase. Two tables keyed on `auth.uid()`: `user_settings` (single jsonb blob) and `user_school_themes` (one row per school). Writes go through security-definer RPCs (`upsert_user_settings`, `upsert_user_school_theme`) enforcing last-writer-wins via client clock. Hydrate on bootstrap; if remote is newer, local is replaced and `applySettingsSideEffects(prev, next)` re-applies live DOM/event effects (dark mode, locale, opgave deadlines event, opt-out mirror). `betterlectio:settings-hydrated` event re-renders sidebar; `SETTINGS_REQUIRING_RELOAD` shows reload toast. Realtime subscription filtered by `supabase_id` re-hydrates from other devices. All client writes route through `saveSettings` and `saveThemePreferenceForSchool`; `withSyncSuppressed()` depth counter prevents hydrate writes from echoing back. Schema: `supabase/migrations/20260429_add_user_settings_sync.sql`.

**Referral system:** Classmates share `https://betterlectio.dk/r/{referrer_elevid}` links. Pipeline:

1. `website/app/r/[elevid]/route.ts` validates the elevid shape and 302s to `https://<project>.supabase.co/functions/v1/referral-click?ref={elevid}`.
2. `referral-click` validates the referrer exists, inserts a `referral_clicks` row with metadata (UA, Referer, hashed IP, country, landing URL), sets a 180-day `bl_ref` cookie (`SameSite=None; Secure; HttpOnly`) on the supabase domain, 302s to `https://betterlectio.dk/download?ref=1` (which triggers an "invited" banner).
3. After install, `runEnsureSupabaseSession` checks `wasFirstInstall` from `verify-lectio-auth` (true exactly when it just stamped `extension_installed_at` for the first time). On true, calls `maybeFinalizeReferral`.
4. `maybeFinalizeReferral` POSTs to `referral-finalize` with `credentials: 'include'` and `Authorization: Bearer <jwt>`. Per-student `bl-referral-finalize-attempted:{studentId}` flag written *before* the fetch — cookie is single-use, edge function is source of truth.
5. `referral-finalize` validates JWT owns the studentId, reads cookie, looks up click row, runs eligibility gates (`self_referral`, `already_referred`, `returning_user` for installs >7d, `expired` for clicks >180d), stamps `students.referred_by` + `referred_at` + `referral_click_id` plus `referral_clicks.converted_at` + `converted_student_id`. Cookie cleared regardless. Returns `{ attributed, referrerName }`.
6. Background broadcasts via `browser.storage.local['bl-referral-toast-pending']` (manifest doesn't have `tabs` permission); content-script listener shows Sonner toast.
7. Stats exposed via `get_referral_stats(student_id)` RPC. Settings → Inviter mounts `ReferralShareCard.tsx` with link, copy/share, click+conversion counts, recently-attributed names.

PostHog telemetry: `referral link clicked`, `referral link clicked invalid`, `referral attributed`, `referral attribution rejected`, `referral share link copied`. Schema: `supabase/migrations/20260430_add_referral_tracking.sql` + `20260430_referral_tracking_constraints.sql`. Admin: `admin/app/(dashboard)/referrals/page.tsx`. Deploy: `bunx supabase functions deploy referral-click --no-verify-jwt` and `bunx supabase functions deploy referral-finalize`.

**Edge function secrets:** `referral-click` reads `BL_IP_HASH_SALT` to compute `ip_hash = sha256(salt + ":" + ip)`. Salt must be stable across calls so `count(distinct ip_hash)` yields correct unique counts. Set via `bunx supabase secrets set BL_IP_HASH_SALT=<random>`. Both `referral-click` and `referral-finalize` also read `POSTHOG_API_KEY` (same as `VITE_POSTHOG_KEY`) and optionally `POSTHOG_HOST` (defaults `https://eu.i.posthog.com`).

---

## Key Components

### Entry Points

| Script | Purpose |
|--------|---------|
| `hide-flash.content.ts` | FOUC prevention + CSS cascade layer wrapping via MutationObserver |
| `session-block.content.ts` | Overrides `window.SessionHelper` to block session timeout popup |
| `login.content.tsx` | Login page redesign with school search, keyboard nav, auto-redirect |
| `content.tsx` | Primary entry: transforms UI, injects page-specific components, schedule enhancements, hover tooltips |

### Navigation & Layout

| Component | Purpose |
|-----------|---------|
| `AppSidebar.tsx` | Custom sidebar with collapsible sections, profile display, settings access, Supabase-first student name/avatar |
| `SettingsModal.tsx` | Settings: appearance, behavior, sidebar toggles, subject mappings, design playground, about |
| `DesignPlayground.tsx` | Full-screen overlay showcasing all design system tokens and components |
| `MobileAppDrawer.tsx` | Bottom-right floating drawer pitching the iOS app. Gated on `students.app_eligible=true && app_installed_at is null && app_qr_scanned_at is null && marked_android_at is null && dismissed_app_prompt_at is null`. Expands to QR pointing at `/download/ios?u={studentId}` plus "Jeg er på Android" CTA. Helpers in `lib/mobile-app.ts`. |
| `MobileAppInvitePopup.tsx` | Centered "early access" invite for same eligible students. Once on page load then 7 days later if untouched. Suppressed during quiet hours (02:00–09:00) and while in class. Snooze in `bl-mobile-app-invite-last-shown:{studentId}`. QR encodes per-student `?u=` URL. Soft close just snoozes; "Jeg er på Android" writes `marked_android_at`. |

### FindSkema System

| File | Purpose |
|------|---------|
| `FindSkemaPage.tsx` | Redesigned search with fuzzy matching, type filters, starred/recents, person cards, BL badges, Supabase-first names/avatars, search aliases for both Lectio + preferred names |
| `ProfilePage.tsx` | Supabase-backed student profile: description, instagram, birthday (if `show_birthday`), custom pfp, inline edit form for own profile. Tabs: schedule, classmates, teachers, hold/groups, documents |
| `lib/instagram.ts` | Shared Instagram helpers — accepts `handle`, `@handle`, or pasted URLs, renders consistently as `@handle` |
| `PersonCard.tsx` | Reusable card with lazy-loaded pictures, star toggle, type badges, navigation context, optional BL badge, Supabase-first name/avatar |
| `lib/supabase/student-lookup.ts` | `useSchoolStudents` hook (Map for O(1) lookups), `getStudentIdFromPersonId`, lookup-ID-based name/avatar resolution, search aliases, `formatDanishBirthdate` |
| `ViewingScheduleHeader.tsx` | Shows viewed entity with star, type badge, back link, teacher name lookup, expandable members panel |
| `lib/class-name.ts` | Class-name transforms/matchers for grade codes with 1-2 alphanumeric suffixes, chained dotted, prefixed/suffixless variants. `normalizeClassCode` strips Lectio hold IDs like `t25htxvx_1vx` to the trailing class code |
| `lib/findskema-storage.ts` | Starred people, recents, picture cache, canonical schedule URL generation |
| `lib/fuzzy-search.ts` | Danish text normalization (ae/o/a), multi-word matching, scoring |
| `lib/findskema-cache.ts` | Resolves AvanceretSkema afdeling/subcache + shared in-flight/TTL-cached dropdown loader |
| `lib/findskema-types.ts` | Maps AvanceretSkema IDs (`SC/RO/RE/HE/GE`) to filter types |

**Data fetching:** `subcache` must come from Lectio's `AvanceretSkema_<afdeling>_<subcache>` dataset key, not `new Date().getFullYear()`. Type mapping uses real prefixes (`SC*`=stamklasser, `RO*`=lokaler, `RE*`=ressourcer, `HE*`=hold, `GE*`=grupper). Dropdown loader is shared with in-flight dedupe.

**Class codes:** Schools use single-letter (`1x`), two-character alphanumeric (`2hf`, `2zq`), numeric (`1.4`), chained dotted (`10.st.kl.2`), letter-prefixed (`L2d`, `S2x`), suffixless prefixed (`IB1`). Some schedules expose Lectio hold IDs like `t25htxvx_1vx`; `normalizeClassCode` peels to the trailing class. Always use `lib/class-name.ts` before comparing against year-based dropdown entries (`2025x`, `2025zq`, `2025.4`, `L2025d`, `IB2025`).

**Student identity resolution:** Prefer `students.name` for display, keep Lectio names as aliases/search terms. Pictures: `custom_pfp_url` → `lectio_pfp_url` → Lectio/context-card image fetch. Helpers in `lib/supabase/student-lookup.ts` accept both raw `elevid` and prefixed lookup IDs (`S727...`) so message names/avatars, FindSkema, member grids, group submissions, sidebar/profile stay consistent.

### Schedule & Activities

| File | Purpose |
|------|---------|
| `ActivityClassModal.tsx` | In-place modal for activity details. Renders note, lektier, presentation, øvrigt indhold, related links, hold navigation |
| `PrivatAftaleDialog.tsx` | Inline create/edit private appointments. Triggered from toolbar (create) or brick click (edit). ASP.NET form tokens, hidden iframe POST. Edit mode adds delete |
| `ScheduleToolbar.tsx` | Custom toolbar: week nav, view mode toggle, calendar link, private appointment trigger, print menu |
| `lib/activity-detail.ts` | Fetch/parse `aktivitetforside2.aspx` with rich lektie content, presentation blocks (`ACP*`), øvrigt indhold, school-scoped cache. Special homework shapes: heading wrapping single `<a>` becomes `primaryLink`; body with single `<img>` becomes `image` (constrained click-to-enlarge). |
| `components/Lightbox.tsx` | Shared image/PDF overlay viewer. Used by `ActivityClassModal`/`ActivityClassFullModal` and `BeskederThreadView`. PDFs fetched as blobs (`credentials: 'include'`) so `Content-Disposition: attachment` doesn't force download. Exports `LightboxItem`, `extensionFromUrlOrName()`, `lightboxKindForExtension()`. |
| `lib/privat-aftale.ts` | Fetch/parse `privat_aftale.aspx`, extract ASP.NET tokens, submit create/delete via hidden iframe POST |
| `lib/brick-tooltip.ts` | Schedule brick hover tooltip with async-enriched content, fetched presentation previews |
| `ScheduleCountdown.tsx` | Sidebar countdown: time remaining in current class / until next |
| `lib/schedule-cache.ts` | School-scoped fetch + cache for today's schedule (45min TTL) |

### Homework & Assignments

| File | Purpose |
|------|---------|
| `LektierPage.tsx` | Day-grouped homework cards with file/activity links, teacher notes, Supabase-backed done-state sync keyed by `absid`/`entry_id` |
| `OpgaverPage.tsx` | Single chronological timeline of all assignments grouped by week. Auto-scrolls to current week. Compact rows with left-border status indicators (red=missing, amber=waiting, green=completed), fravær badges, hold pills, inline grade badges, hover-visible ignore toggle, combined elevtimer per week. Search + hold filter toolbar. |
| `OpgaveDetailSheet.tsx` | Side sheet with full assignment details, submission history, comment/file upload (ASP.NET form tokens, file upload via `/dokumentupload.aspx`, localStorage cache 5min TTL, session expiry detection), Supabase-first group-member names/avatars |
| `lib/opgave-detail.ts` | `fetchOpgaveDetail(url)`, `submitComment(detail, comment)`, `uploadFileAndSubmit(detail, file, comment, schoolId)`, school-scoped cache helpers |
| `lib/opgaver-deadlines-cache.ts` | School-scoped cache (6h TTL) of parsed `OpgaveEntry[]`. Populated by `OpgaverPage`; refreshed by schedule page via `fetchAndCacheOpgaver` (handles `CurrentExerciseFilterCB`/`ShowThisTermOnlyCB` postback). Read by `injectDeadlineBricks()` to render deadline bricks on schedule. |
| `lib/supabase/resources/homework.ts` | Homework table access + `upsert_student_homework_status(...)` RPC. Reads `homework_entries` by `school_id` + `entry_id`, writes per-student completion with optimistic invalidation |

**Deadline bricks:** `injectDeadlineBricks()` reads from `getCachedOpgaver(schoolId)`, then for each `td[data-date]` cell appends `<a class="il-deadline-brick">` positioned at `topEm` from `calibrateTimeMapping()`. Bricks are 1.6em high, color-matched via `getHoldHue`, click dispatches `betterlectio:openOpgaveDetail` (caught by always-mounted `OpgaveDetailSheet` in `AppSidebar`). Gated on `isViewingOwnPage()`, schedule page (`skemany.aspx` / `skema1dag.aspx`, never `findskema.aspx`), and `schedule.opgaveDeadlines` setting. Submitted assignments filtered out; deadlines outside school hours clamped to column edge with muted dashed style. `betterlectio:opgaveDeadlinesToggled` event triggers live re-render.

**Homework sync contract:** Stored per student in `public.student_homework`, resolved against shared `public.homework_entries`. Client parses each lektie card's Lectio activity URL and extracts `absid` as the stable `entry_id`. Writes through `upsert_student_homework_status` security-definer RPC so legacy rows without `school_id` can be claimed safely on first write, client timestamps prevent stale overwrites, extension/mobile share the same patch-style contract.

**Realtime:** `LektierPage.tsx` subscribes to `student_homework` and `homework_entries` via Supabase Realtime. External updates invalidate browser cache, causing refetch and cross-device reflection.

### Grades

| File | Purpose |
|------|---------|
| `KaraktererPage.tsx` | Grade report redesign: subject cards grouped by hold with big color-coded grades (7-step scale hue mapping), teacher notes inline, summary bar with weighted average + grade distribution, collapsible diploma/protocol/remarks. `parseKaraktererFromDOM()` parser for all 5 native tables. |

### Documents

| File | Purpose |
|------|---------|
| `DokumenterPage.tsx` | Documents redesign with collapsible folder tree (hold colors), file list with extension-based icons/badges, breadcrumbs, search, in-app image/PDF preview, drag-and-drop upload via `dokumentupload.aspx`, create folder, sort |
| `lib/dokumenter-parser.ts` | DOM parser for `DokumentOversigt.aspx`: recursive folder tree (`#s_m_Content_Content_FolderTreeView`), document grid (desktop + mobile), breadcrumb, file category/extension classification, move-target dropdown |

**Folder navigation:** Uses `window.location.href` with `?folderid=XXX` (page reload) matching Lectio's native tree. Sort triggers ASP.NET `__doPostBack` natively.

**File upload:** Drag-and-drop POSTs to `dokumentupload.aspx`, receives `serializedId` JSON, then triggers Lectio's document chooser postback.

**Preview:** Images via `<img>` to `dokumenthent.aspx?documentid=XXX`. PDFs use `<iframe>` with same URL. Modal overlay with download/edit actions.

### Hold/Subject Mapping

| File | Purpose |
|------|---------|
| `lib/hold-mapping.ts` | Resolve raw hold codes through canonical lesson keys (`1x MA`, `2.4 MA`, `L2d MA` -> `ma`), shared names/colors, ignored non-academic groups, legacy migration. ~40 built-in Danish subjects. School-scoped localStorage. Functions: `getCanonicalHoldKey`, `getHoldDisplayName`, `getFullHoldDisplayName`, `getHoldHue`, `registerHold`, `scanDOMForHolds`, `getAllHolds`, `setHoldDisplayName`/`setHoldColorHue`, `resetAllMappings`/`clearHoldMappings` |
| `lib/hold-mapping-sync.ts` | Hydrates canonical mappings from Supabase v2, seeds discovered local mappings into `school_lesson_mappings`, upserts/resets `user_lesson_overrides` |
| `settings/HoldMappingEditor.tsx` | Settings UI for canonical lesson-key display names/colors |

### Beskeder (Messages) System

**No-reload architecture:** All message actions use hidden iframe POSTs instead of native `doPostBack()`. Serialized mutex prevents ASP.NET ViewState desync. Non-idempotent operations (send/reply/delete) avoid automatic native fallback on parse errors to prevent duplicate side effects.

**Lectio DOM quirk — recipient GridView links:** In `ThreadRecipientsGV`, delete links use `onclick="javascript:__doPostBack(...)"` with `href="#"`. Parsers must check `onclick` first, then `href` fallback. Same for `AttachmentsGV` — `parseAttachmentsFromDoc` in `lib/beskeder-submit.ts` must read `onclick` first, otherwise freshly-attached files never render.

| File | Purpose |
|------|---------|
| `BeskederPage.tsx` | Thread list with folder pills, Supabase-first sender names/avatars, optimistic flag/read/delete, search, bulk actions |
| `BeskederThreadView.tsx` | Thread reader with Supabase-first names/pictures, signature stripping, no-reload reply + file attachment |
| `BeskederCompose.tsx` | Card-based compose with custom recipient picker (Supabase-first names/avatars, keyboard nav), recipient pills, no-reload add/remove/send, Ctrl+Enter. Falls back to native form if parser fails. |
| `WysiwygEditor.tsx` | contentEditable editor converting BBCode <-> rich HTML |
| `BBCodeToolbar.tsx` | Formatting toolbar (bold, italic, underline, link) |
| `lib/beskeder-thread-parser.ts` | Thread DOM parser, state detection, signature stripping |
| `lib/iframe-post.ts` | Hidden iframe POST utility, form token extraction, session expiry detection |
| `lib/beskeder-submit.ts` | Mutex-serialized submission. Thread list: `toggleFlagViaIframe`, `toggleReadViaIframe`, `deleteThreadViaIframe`, `selectFolderViaIframe`, `executeSearchViaIframe`, `executeBulkActionViaIframe`, `markAllReadViaIframe`. Thread view: `sendReplyViaIframe`. Compose: `addRecipientViaIframe`, `removeRecipientViaIframe`, `sendMessageViaIframe`. Shared: `uploadFileToLectio`, `attachFileViaIframe`. |

### Forside & Other

| File | Purpose |
|------|---------|
| `ForsideGreeting.tsx` | Time-based greeting, live clock, Danish date formatting |
| `ForsideDashboard.tsx` | Redesigned forside with 4 cards (aktuel info, lektier, opgaver, beskeder). Parses native DOM, hides original 4 cards, renders 2-col grid with priority indicators, hold colors, urgency bars, Supabase-first names/avatars. Other native dashboard islands (e.g. Registreringer) parsed via `parseGenericIslands()` and rendered through `GenericCard`. |
| `ForsideOpgaverCard.tsx` | Forside opgaver parser (reused by ForsideDashboard) |
| `MembersPage.tsx` | Card grid for hold/klasse members (teachers sorted first) |
| `lib/members-fetch.ts` | Fetch/parse `members.aspx` (explicit credentialed requests) |

### Shared Utilities

| File | Purpose |
|------|---------|
| `lib/profile-cache.ts` | User profile + viewed entity caching (school-scoped). Helpers: `isViewingOwnPage()`, `getViewedEntityId()`, `extractViewedEntity()` (URL `name` param → recents/starred → "Ukendt") |
| `lib/school-storage.ts` | Last school persistence for quick login |
| `lib/page-titles.ts` | Clean page titles with unread message badge, MutationObserver |
| `lib/preload.ts` | Speculation Rules API + hover-based prefetching |
| `lib/posthog.ts` | PostHog analytics singleton (edge build). Distinct ID: `lectio:${studentId}`. All helpers validate `isLectioStudentDistinctId` before enqueueing — no anonymous or malformed ids. Identify sends name, school, class, year, dark mode, theme. Page-hide flushing. `captureException` enriches `$exception` events with auto props + tab `recent_urls` / profile ids when `distinctId` omitted (`getContentDistinctId()`). All calls silently caught. |
| `lib/posthog-lifecycle.ts` | Queues deferred lifecycle events (`extension installed` / `extension updated`) until an identified user is available |
| `lib/logout-tracking.ts` | Passive Lectio logout/session-loss heuristics. Stores last authenticated activity and recent explicit logout intent |
| `lib/lectio-error-popup.ts` | MutationObserver detector for Lectio's native error popup (`[data-title^="Fejl"]`). Extracts title + body, dedupes per element. Fires `lectio native error` PostHog event + paired `captureException` + `toast.info`. |
| `lib/url-history.ts` | Per-tab (sessionStorage) URL breadcrumb trail (`pushUrlToHistory` / `getRecentUrls`) |
| `lib/utils.ts` | Helper functions (`cn()`) |

### Internationalization (i18n)

Lightweight, custom i18n covering BetterLectio's injected UI only — Lectio's native DOM stays in Danish. Default `da`, `en` as second locale; both eagerly bundled (MV3 can't dynamic-import).

| File | Purpose |
|------|---------|
| `lib/i18n/locales.ts` | `SUPPORTED_LOCALES = ['da', 'en'] as const`, `DEFAULT_LOCALE`, `LOCALE_LABELS`, `isSupportedLocale()`, `LocaleCode` type |
| `lib/i18n/types.ts` | Recursive `Path<DaDictionary>` for `TranslationKey`, `Dictionary` shape, `TFunction` signature |
| `lib/i18n/format.ts` | `interpolate(template, vars)` (`{name}` substitution); `handleMissing` dev-only warn |
| `lib/i18n/state.ts` | Module-scope `currentLocale`, `getLocale()` (lazy-init from `resolveInitialLocale`), `setLocale()` (persists + dispatches `betterlectio:locale-changed`) |
| `lib/i18n/resolve.ts` | `resolveInitialLocale()` — stored setting → `navigator.language` base → `da` |
| `lib/i18n/t.ts` | `makeT(locale)` walks dictionary by dot-path with default-locale fallback. Non-hook `t(key, vars)` for module-scope |
| `lib/i18n/dates.ts` | Locale-aware date formatting via `Intl.DateTimeFormat`. Exports `getLocaleTag()`, `formatWeekday`/`formatWeekdayCapitalized`, `formatMonth`, `formatLocaleDate`, `formatLocaleTime` |
| `lib/i18n/provider.tsx` | `<I18nProvider>` + `useTranslation()` hook |
| `lib/i18n/render.tsx` | Drop-in replacement for `preact`'s `render` that wraps every root in `<I18nProvider>`. Both content entrypoints import from here — Context doesn't cross roots |
| `lib/i18n/dictionaries/da.ts` | Source of truth. `DaDictionary = WidenLeaves<typeof da>` |
| `lib/i18n/dictionaries/en.ts` | English dictionary — `satisfies DaDictionary` enforces parity |
| `lib/i18n/dictionaries/index.ts` | `DICTIONARIES: Record<LocaleCode, DaDictionary>` |
| `lib/i18n/index.ts` | Public barrel re-export |

**Reactivity:** Preact Context + `useTranslation()`. `setLocale()` dispatches `betterlectio:locale-changed`; every `<I18nProvider>` listens, updates state, re-renders. No reload.

**Settings integration:** `interface.language` is a top-level category in `lib/settings-storage.ts`. Picker in `SettingsModal.tsx` Appearance section. `handleSettingChange` calls `setLocale(value)` and `setPersonProperties(distinctId, { language: value })`. Added to `identifyIfNeeded` person properties.

**Adding a locale:** create `lib/i18n/dictionaries/<code>.ts` (must `satisfies DaDictionary`), append to `SUPPORTED_LOCALES`, add `LOCALE_LABELS` entry. Two files. Zod enum derives from `SUPPORTED_LOCALES`.

---

## CSS Architecture

### Cascade Layer Strategy

Lectio's CSS is wrapped in `@layer lectio { }` at `document_start`:

```
Layer order (lowest -> highest):
  lectio        <- Lectio's entire CSS bundle + inline styles
  theme         <- Tailwind theme layer
  base          <- Tailwind base + our resets
  components    <- Our custom styles (globals.css)
  utilities     <- Tailwind utility classes
```

Extension CSS automatically beats Lectio CSS without `!important`. Only ~99 `!important` declarations remain (inline style overrides, display toggling, critical layout).

### Tailwind-First Rule For Custom UI

All custom/injected Preact UI styled with Tailwind utility classes directly in `.tsx` components.

Typography roles documented in `AGENTS.md` under **Typography / hierarchy**.

- No new component-specific plain CSS blocks for custom UI.
- Prefer semantic token utilities (`bg-background`, `text-foreground`, `bg-primary`, `border-border`, `ring-ring`).
- `globals.css` is for platform-level concerns: token definitions (`:root`, `.dark`, `data-il-theme`), layer plumbing, native Lectio overrides.

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

"Lectio Modernizer" section in `globals.css` restyles native Lectio elements in `@layer components`: tables (`table.lf-grid`), buttons (`.buttonfilled`, `.buttonoutlined`), form elements, schedule bricks (`.s2skemabrik`), links, cards (`.lf-island`), tabs, status badges, typography.

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

Standalone CLI for fetching/posting authenticated Lectio pages.

### Commands
- `lectio fetch <path>` / `lectio post <path>` - Authenticated GET/POST
- `lectio asp inspect|postback|field` - ASP.NET WebForms state inspection
- `lectio keepalive start|stop|status|ping|log` - Background session keepalive

### ASP.NET Utilities (`src/lib/aspnet.ts`)
- `extractASPData`, `extractAllFormFields`, `extractForm` - Parse hidden state fields + form values
- `extractPostbackTargets` - Discover `__doPostBack()` calls
- `buildPostBody` - Create URL-encoded POST body
- Standard flow: GET page → extract fields → merge user fields → POST

### HTTP/Auth
- `src/lib/http.ts` sends `Referer: https://www.lectio.dk` on all requests
- `src/lib/browser.ts` captures full browser cookies via CDP `Network.getAllCookies`
- Keepalive daemon pings `forside.aspx` every 10 min, PID/log in `~/.lectio-cli/`

---

## Reference Materials

- `lectio-scripts/` - Decompiled Lectio JS
- `lectio-html/` - HTML snapshots
- `tools/lectio-cli/` - CLI tool

---

## Performance Optimizations

1. **Preact over React** - 3KB vs 40KB+ bundle
2. **Skeleton loading** - Perceived instant load (FOUC prevention)
3. **Speculation Rules API** - Browser-level prerendering
4. **Hover prefetching** - 65ms delay
5. **Picture caching** - 7 days, lazy-loaded via IntersectionObserver
6. **CSS Cascade Layers** - No specificity wars
