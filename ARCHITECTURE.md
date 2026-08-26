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
| [WXT](https://wxt.dev/) 0.21.4 | Browser extension framework |
| [Preact](https://preactjs.com/) 10.29.8 | Lightweight React alternative (3KB) |
| TypeScript 5.9.3 | Type safety |
| Tailwind CSS 4.3.3 | Utility-first styling |
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
│   ├── elevfeedback-frame.content.ts # document_start chrome strip for Elevfeedback editor iframe
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
├── tools/geocode-schools.mjs # One-off Google Geocoding backfill for school coordinates
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
├── elevfeedback-frame.content.ts  [document_start, all_frames]
│   └── If `window.name === bl-elevfeedback-editor`, hide Lectio chrome before first paint
└── content.tsx            [document_idle]
    └── Renders custom UI wrapper, moves original DOM
```

### Execution Flow

1. User navigates to lectio.dk
2. `hide-flash.content.ts` runs at `document_start` — hides page, wraps Lectio CSS in `@layer lectio`
3. `content.tsx` runs after DOM ready: detects the page, snapshots Lectio's live navigation, extracts user data, creates `#il-root`, renders `<DashboardLayout>` with the selected sidebar or horizontal shell, moves original DOM into `#il-lectio-content`, fades out the skeleton, and initializes preloading
4. User interaction: sidebar nav, activity modals, hover prefetch, original forms work normally

### Third-Party SDK Policy (MV3)

- BetterLectio does not execute remote third-party JS at runtime for Chrome MV3 compatibility.
- UserJot SDK files are vendored into `public/vendor/userjot/` via `npm run vendor:userjot`.
- Build/zip scripts run this vendoring step automatically before packaging.

### Supabase Auth & Storage

**Edge function** (`supabase/functions/lectio-auth/index.ts` — universal for extension/iOS/Android):
1. QR login via `LandingPageQrCode.aspx` → ephemeral server cookie jar + school ID from redirect
2. Fetch `SkemaNy.aspx`, then `digitaltStudiekort.aspx`, sequentially through that jar
3. Resolve `elevid`, class, and fallback name from the schedule; enrich with student-card fields when available
4. `generateLink({ type: 'magiclink' })` → creates/finds auth user, returns `data.user.id`
5. Parse the current Lectio `pictureid`; ordinary portraits remain on Lectio and are loaded by clients with their existing Lectio session
6. Upsert `students` with platform install stamps from `client.platform`; return `token_hash` (no cookies)

Legacy: `verify-lectio-auth` (extension QR, camelCase response) and `token-for-auth` (mobile cookie handoff) stay deployed for outdated clients.

**Explicitly consented session donors:** The unified auth function keeps its otherwise-temporary full rotating jar only when the Lectio-resolved `(student_id, school_id)` matches an active `lectio_session_grants` row. The allowlist, credentials, audit table, and all RPCs are service-role-only with RLS and explicit revokes. Each jar is encrypted before database storage with a random AES-256-GCM data key; that key is wrapped by a versioned master key and both layers bind the student/school identity as authenticated additional data. Revocation synchronously deletes the credential. `lectio-session-keepalive` leases due rows with `FOR UPDATE SKIP LOCKED`, requests `/ping.aspx`, follows redirects only within HTTPS `www.lectio.dk`, saves cookie rotation, retries transient failures, and disables dead sessions. Supabase Cron invokes it every 30 minutes using a bearer secret and project URL read from Vault. The CLI can export an active grant through an audited RPC and decrypt it locally using environment-only service-role/master-key credentials; cookie files are mode `0600`. See `docs/lectio-session-operations.md`.

**Background auth orchestration** (`entrypoints/background.ts` + `lib/supabase/session.ts`):
- `entrypoints/content.tsx` is the primary auth bootstrapper on page load
- Feature modules only call `ensureSupabaseSession(...)` as a fallback
- Background dedupes concurrent auth attempts per `schoolId:userId` and shares one in-flight promise across callers, preventing duplicate `generateLink` / `verifyOtp` races
- Auth analytics include a `source` property so callsites can be traced in PostHog

**Storage bucket** `profile-pictures`: public and reserved for approved, normalized custom portraits under immutable `custom/{schoolId}/{studentId}/{submissionId}.jpg` paths. Ordinary Lectio portraits are never copied here.
Public object URLs work through the bucket's public setting; `storage.objects` has no broad public CRUD/listing policy. Profile-picture writes are service-role-only.

**Moderated custom pictures:** `referral_reward_unlocked_at` is stamped permanently when a student reaches 3 attributed referrals. Extension, Android, and iOS call `get_my_profile_picture_state` and submit JPEG/PNG/WebP (5MB, 25MP, 8000px/side maximum) to `profile-picture-submit`. The function validates JWT ownership, reward, cooldown, magic bytes, dimensions, and one-pending-at-a-time before writing to the private bucket/table. Admin downloads uploads server-side and uses Sharp with a 25MP decode limit to normalize orientation, strip metadata, resize to 1600px, and produce an sRGB JPEG for both preview and publication; browsers never render the original upload. Approval updates `custom_pfp_url` + `custom_pfp_approved_at` and starts a three-calendar-month cooldown; rejection permits immediate retry. `maintenance-cleanup` removes old failed objects/rows. Migrations: `20260803_add_moderated_profile_pictures.sql`, `20260805_allow_ios_profile_picture_submissions.sql`, and `20260807_atomic_referral_finalization.sql`.

**Auth observability:** `lectio-auth` (and legacy auth functions) emit `request_id`, profile status/source/field flags, and best-effort `auth_attempts` telemetry. Missing student-card enrichment does not reject an authenticated user: schedule-title identity is `fallback`, and a missing name is `degraded`. Clients confirm OTP completion through `confirm_auth_attempt`; the admin Auth health page treats Supabase session rows as the authoritative fallback signal. Attempts are retained for 30 days by `20260808_add_auth_attempt_observability.sql` (+ `20260812_add_lectio_auth_function_name.sql`).

**Rich student profile privacy boundary:** `get_student_profile(p_student_id)` is the only single-profile authenticated-client read path for `students.birthdate`. It is a security-definer RPC with an explicit same-school ownership check and masks `birthdate` to `null` unless `show_birthday` is enabled. iOS, Android, and the extension's viewed-student profile use it; iOS message avatars use the capped `get_student_profiles(p_student_ids)` batch equivalent. `supabase/migrations/20260806_enforce_student_birthday_privacy.sql` removes table-wide authenticated SELECT and grants column-level SELECT for all existing student fields except `birthdate`; the extension background bridge defaults generic student queries and mutation results to the matching safe projection. Schema contract starts in `20260804_add_public_student_profile_rpc.sql`. Native clients use short viewer-and-school-scoped caches and keep public profile-image requests separate from authenticated Lectio image traffic.

**Deploy:** Function JWT policy is checked into `supabase/config.toml`. Apply migrations first, then deploy `referral-click`, `referral-finalize`, `profile-picture-submit`, and `maintenance-cleanup`. Set `BL_IP_HASH_SALT` (32+ random characters), `REFERRALS_ENABLED`, and `PROFILE_PICTURES_ENABLED`; invoke cleanup daily with the service-role JWT. See `ios/docs/REFERRAL_PROFILE_PICTURE_RELEASE.md`.

**Database write hygiene:** The unused generic `public.updates` audit table and only its `lessons`/`homework_entries` writer triggers are retired by `20260826_remove_unused_updates_audit.sql`. The migration fails closed on unexpected sources or dependencies and does not affect `admin_audit_log` or the separate lesson-change notification trigger.

**School coordinates:** `public.schools` includes nullable `lat` / `lon` columns for map-friendly metadata. They are backfilled by `tools/geocode-schools.mjs`, which calls Google Maps Geocoding API v4 using the exact query `${school.name}, Denmark`, biases with `languageCode=da` and `regionCode=DK`, persists only single-match results, and reports misses for manual handling. The live backfill runs through the public Supabase API under a temporary permissive `UPDATE` RLS policy that exists only for the maintenance window.

**Lesson mapping sync v2:** Canonical mappings in `school_lesson_mappings` and per-student overrides in `user_lesson_overrides`. Clients normalize raw hold strings into stable `canonical_key` values like `ma`, `srp`, `kt`, then merge school defaults with overrides via `get_student_lesson_mappings_v2`. Migration: `supabase/migrations/20260324_add_lesson_mapping_v2.sql`.

**Settings sync:** User settings (`bl-feature-settings`) and per-school theme (`bl-school-themes-v1`) are synced to Supabase. Two tables keyed on `auth.uid()`: `user_settings` (single jsonb blob) and `user_school_themes` (one row per school). Writes go through security-definer RPCs (`upsert_user_settings`, `upsert_user_school_theme`) enforcing last-writer-wins via client clock. Hydrate at bootstrap and foreground return with a persisted per-user five-minute throttle; due hydrations bypass the local query cache. If remote is newer, local is replaced and `applySettingsSideEffects(prev, next)` re-applies live DOM/event effects (dark mode, locale, opgave deadlines event, opt-out mirror). `betterlectio:settings-hydrated` event re-renders sidebar; `SETTINGS_REQUIRING_RELOAD` shows reload toast. Settings/theme use neither a Realtime subscription nor background polling. All client writes route through `saveSettings` and `saveThemePreferenceForSchool`; `withSyncSuppressed()` depth counter prevents hydrate writes from echoing back. Schema: `supabase/migrations/20260429_add_user_settings_sync.sql`.

**Referral system:** Classmates share `https://betterlectio.dk/r/{referrer_elevid}` links. Pipeline:

1. `website/app/r/[elevid]/route.ts` validates the elevid shape and 302s to the public `referral-click` function. Installed native apps handle the universal link directly; the App Clip creates a token from the original tokenless invocation.
2. `referral-click` validates the referrer, enforces per-IP/per-referrer limits, inserts metadata (UA, Referer, daily-rotated IP hash, coarse location), sets a 180-day `bl_ref` cookie for extension attribution, and redirects to the appropriate destination. Pre-supplied native tokens are validated against an active click row before persistence.
3. After install, `runEnsureSupabaseSession` checks `wasFirstInstall` from `verify-lectio-auth` (true exactly when it just stamped `extension_installed_at` for the first time). On true, calls `maybeFinalizeReferral`.
4. `maybeFinalizeReferral` POSTs with credentials and the user JWT. It records its per-student completion flag only after a parsed 2xx outcome; network/5xx/kill-switch failures remain retryable.
5. `referral-finalize` validates JWT ownership, then calls service-role-only `finalize_referral_attribution`. The RPC locks the click and invitee rows and commits eligibility, click conversion, student attribution, and reward unlock atomically. A click therefore cannot convert twice under races.
6. Background broadcasts via `browser.storage.local['bl-referral-toast-pending']` (manifest doesn't have `tabs` permission); content-script listener shows Sonner toast.
7. Stats exposed via `get_referral_stats(student_id)` RPC. Settings → Inviter mounts `ReferralShareCard.tsx` with link, copy/share, click+conversion counts, recently-attributed names, and `ReferralInviteDialog`. The dialog opens a detached Lectio compose session from any page, ranks pinned students then classmates, searches all eligible student recipients, hides known active BetterLectio/app users, and sends the fixed Danish referral message without navigation. Confirmed recipients receive a 30-day browser-local cooldown; uncertain non-idempotent send responses require checking Beskeder and are not retried. At 3 conversions `referral-finalize` stamps the stable profile-picture reward gate.

PostHog telemetry is limited to successful attribution; operational reporting comes from Postgres/function logs. Schema includes `20260807_atomic_referral_finalization.sql`. JWT policy is in `supabase/config.toml`; `REFERRALS_ENABLED=false` is the rollback switch.

**Edge function secrets:** `BL_IP_HASH_SALT` must contain 32+ random characters. Hash input includes the UTC day, deliberately preventing long-lived IP correlation; “unique clickers” is therefore an approximate daily-identifier count. Set the feature switches and optional PostHog settings described in the release runbook.

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
| `AppSidebar.tsx` | Default custom sidebar with collapsible sections and Supabase-first profile identity |
| `HorizontalNavbar.tsx` | Opt-in desktop global bar with setting-aware primary links, active More menu, adaptive quick-action overflow/tooltips, history-aware entity back links, simplified native context titles, compact countdown, and 110rem rails aligned with the wide Forside canvas |
| `AppOverlays.tsx` | Navigation-independent Settings, onboarding, activity/private-appointment dialogs, assignment sheet, and Elevfeedback editor overlay |
| `OnboardingWizard.tsx` | First-run setup with a visual navigation-layout choice; sidebar is recommended/default, while the Lectio-like top menu remains opt-in and is applied on completion. Includes a short mobile-app QR step (same tracked `/download/app?u=` link as the drawer/invite) skipped when `app_installed_at` is set. |
| `lib/lectio-navigation.ts` | Captures native master/context rows before the original DOM is moved; preserves page/entity-specific link sets and active states |
| `SettingsModal.tsx` | Settings: appearance, behavior, sidebar toggles, subject mappings, design playground, about |
| `ReferralInviteDialog.tsx` | Compact searchable invite picker backed by a detached Lectio compose session; pinned/class defaults, active-user filtering, and safe one-click individual sends |
| `DesignPlayground.tsx` | Full-screen overlay showcasing all design system tokens and components |
| `MobileAppDrawer.tsx` | Bottom-right floating drawer pitching the stable iOS/Android app to every extension user until `app_installed_at` or `dismissed_app_prompt_at` is set. Expands to a tracked QR pointing at `/download/app?u={studentId}`. Helpers in `lib/mobile-app.ts`. |
| `MobileAppInvitePopup.tsx` | Centered cross-platform invite for the same automatic-promotion audience. Once on page load then 7 days later if untouched; suppressed during the first 24h, quiet hours (02:00–09:00), and while in class. A first QR scan stamps `app_qr_scanned_at`, triggers the Realtime thank-you transition, and redirects by platform. Realtime exists only while the QR dialog is visible; once joined, the dialog refetches its exact student row to reconcile a scan that raced setup. The scan no longer suppresses future promotion, while `app_installed_at` suppresses automatic promotion. The navigation action stays available and force-opens the QR after install or opt-out. |

### FindSkema System

| File | Purpose |
|------|---------|
| `FindSkemaPage.tsx` | Redesigned search with fuzzy matching, type filters, starred/recents, person cards, BL badges, Supabase-first names/avatars, search aliases for both Lectio + preferred names |
| `ProfilePage.tsx` | Supabase-backed student profile: description, instagram, birthday (if `show_birthday`), custom pfp, inline edit form for own profile. Tabs: schedule, classmates, teachers, hold/groups, documents |
| `lib/instagram.ts` | Shared Instagram helpers — accepts `handle`, `@handle`, or pasted URLs, renders consistently as `@handle` |
| `PersonCard.tsx` | Reusable card with lazy-loaded pictures, star toggle, type badges, navigation context, optional BL badge, Supabase-first name/avatar |
| `lib/supabase/student-lookup.ts` | `useSchoolStudents` hook (Map for O(1) lookups), `getStudentIdFromPersonId`, lookup-ID-based name/avatar resolution, search aliases, `formatDanishBirthdate` |
| `ViewingScheduleHeader.tsx` | Shows viewed entity with star, type badge, back link, teacher name lookup, expandable members panel |
| `lib/class-name.ts` | Class-name transforms/matchers for grade codes, dotted/hyphenated/slash-suffixed variants (`3hx-u`, `buEUX2601/b`), prefixed codes, and named classes (`BShannon`). `normalizeClassCode` strips Lectio hold IDs like `t25htxvx_1vx` to the trailing class code |
| `lib/findskema-storage.ts` | Starred people, recents, picture cache, canonical schedule URL generation |
| `lib/fuzzy-search.ts` | Danish text normalization (ae/o/a), multi-word matching, scoring |
| `lib/findskema-cache.ts` | Resolves AvanceretSkema afdeling/subcache + shared in-flight/TTL-cached dropdown loader |
| `lib/findskema-types.ts` | Maps AvanceretSkema IDs (`SC/RO/RE/HE/GE`) to filter types |

**Data fetching:** `subcache` must come from Lectio's `AvanceretSkema_<afdeling>_<subcache>` dataset key, not `new Date().getFullYear()`. Type mapping uses real prefixes (`SC*`=stamklasser, `RO*`=lokaler, `RE*`=ressourcer, `HE*`=hold, `GE*`=grupper). Dropdown loader is shared with in-flight dedupe.

**Class codes:** Schools use single-letter (`1x`), two-character alphanumeric (`2hf`, `2zq`), numeric (`1.4`), chained dotted (`10.st.kl.2`), letter-prefixed (`L2d`, `S2x`), suffixless prefixed (`IB1`), hyphenated (`3hx-u`), slash-suffixed vocational classes (`buEUX2601/b`), and named classes with no grade digit (`BShannon`, `BHamilton`, `Epsilon`). Some schedules expose Lectio hold IDs like `t25htxvx_1vx`; `normalizeClassCode` peels to the trailing class. Always use `lib/class-name.ts` before comparing against year-based dropdown entries (`2025x`, `2025zq`, `2025.4`, `L2025d`, `IB2025`).

**Student identity resolution:** Prefer `students.name` for display, keep Lectio names as aliases/search terms. Pictures: approved `custom_pfp_url` → authenticated Lectio/context-card image → initials, including retrying the Lectio candidate when a custom object fails to load. Lectio picture IDs are cached locally for 24 hours with stale-while-refresh; `lectio_pfp_url` and `pfp_hash` are deprecated null-only compatibility columns. Helpers in `lib/supabase/student-lookup.ts` accept both raw `elevid` and prefixed lookup IDs (`S727...`) so message names/avatars, FindSkema, member grids, group submissions, sidebar/profile stay consistent.

### Schedule & Activities

| File | Purpose |
|------|---------|
| `ActivityClassModal.tsx` | Activity detail sheet. Renders note, lektier, presentation, øvrigt indhold, Elevfeedback, related links, hold navigation |
| `ActivityClassFullModal.tsx` | Wider activity modal variant; same Elevfeedback section as the sheet |
| `ElevfeedbackSection.tsx` | Read-only Elevfeedback cards (teacher then student). Write/edit opens the iframe overlay. Supabase-first student names |
| `ElevfeedbackEditorOverlay.tsx` | Chrome-stripped same-origin iframe of Lectio's LC/CKEditor Elevfeedback editor (`name=bl-elevfeedback-editor`). Hides master menu/subnav/entity nav before first paint via `elevfeedback-frame.content.ts`. Auto-Rediger, dirty close, refetch on save. Do not reimplement `LCDocumentEditor` or load via srcdoc. |
| `PrivatAftaleDialog.tsx` | Inline create/edit private appointments. Triggered from toolbar (create) or brick click (edit). ASP.NET form tokens, hidden iframe POST. Edit mode adds delete |
| `ScheduleToolbar.tsx` | Custom toolbar: week nav, view mode toggle, calendar link, private appointment trigger, print menu |
| `lib/activity-detail.ts` | Fetch/parse `aktivitetforside2.aspx` with rich lektie content, presentation blocks (`ACP*`), øvrigt indhold, Elevfeedback tab/TOC ref, school-scoped fetch. Special homework shapes: heading wrapping single `<a>` becomes `primaryLink`; body with single `<img>` becomes `image` (constrained click-to-enlarge). |
| `lib/elevfeedback.ts` | Fetch/parse `lectab=elevindhold` view HTML (do not use `ensureActivityDoc`). Events: `betterlectio:openElevfeedbackEditor`, `betterlectio:elevfeedback-updated` |
| `lib/elevfeedback-frame.ts` | Iframe chrome-strip CSS/DOM: hide master menu, page header/subnav, entity nav, TOC; relocate **Nyt**; hide siblings of `.ls-texteditor-container`. `window.name` survives Gem/Nyt postbacks. |
| `lib/ckeditor-dark.ts` | Dark-mode CSS injection into CKEditor wysiwyg iframes |
| `components/Lightbox.tsx` | Shared image/PDF overlay viewer. Used by `ActivityClassModal`/`ActivityClassFullModal` and `BeskederThreadView`. PDFs fetched as blobs (`credentials: 'include'`) so `Content-Disposition: attachment` doesn't force download. Exports `LightboxItem`, `extensionFromUrlOrName()`, `lightboxKindForExtension()`. |
| `lib/privat-aftale.ts` | Fetch/parse `privat_aftale.aspx`, extract ASP.NET tokens, submit create/delete via hidden iframe POST |
| `lib/brick-tooltip.ts` | Schedule brick hover tooltip with async-enriched content, fetched presentation previews |
| `ScheduleCountdown.tsx` | Sidebar/horizontal countdown: time remaining in current class / until next; opens the current or upcoming activity when its URL is available |
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

**Deadline bricks:** `injectDeadlineBricks()` reads from `getCachedOpgaver(schoolId)`, then for each `td[data-date]` cell appends `<a class="il-deadline-brick">` positioned at `topEm` from `calibrateTimeMapping()`. Bricks are 1.6em high, color-matched via `getHoldHue`, click dispatches `betterlectio:openOpgaveDetail` (caught by the always-mounted `OpgaveDetailSheet` in `AppOverlays`). Gated on `isViewingOwnPage()`, schedule page (`skemany.aspx` / `skema1dag.aspx`, never `findskema.aspx`), and `schedule.opgaveDeadlines` setting. Submitted assignments filtered out; deadlines outside school hours clamped to column edge with muted dashed style. `betterlectio:opgaveDeadlinesToggled` event triggers live re-render.

**Homework sync contract:** Stored per student in `public.student_homework`, resolved against shared `public.homework_entries`. Client parses each lektie card's Lectio activity URL and extracts `absid` as the stable `entry_id`. Writes through `upsert_student_homework_status` security-definer RPC so legacy rows without `school_id` can be claimed safely on first write, client timestamps prevent stale overwrites, extension/mobile share the same patch-style contract.

**Homework completion refresh:** `LektierPage.tsx` fresh-loads completion state on mount and foreground return, then polls every 60 seconds only while visible, bypassing the local query cache. It does not use Realtime; cross-device changes converge on the next fresh load or visible poll.

**Realtime publication:** `20260827_cleanup_supabase_realtime_publication.sql` keeps the selective `supabase_realtime` publication limited to `public.students` for these flows. The QR dialog is its only remaining consumer; settings use bootstrap/foreground hydration and homework uses fresh-load/visible polling.

### Grades

| File | Purpose |
|------|---------|
| `KaraktererPage.tsx` | Grade report redesign: subject cards grouped by hold with big color-coded grades (7-step scale hue mapping), teacher notes inline, summary bar with weighted average + grade distribution, collapsible diploma/protocol/remarks. `parseKaraktererFromDOM()` parses all native tables. **Grade columns are derived from the live `KarakterGV` header row** (`canonicalColumnKey` normalizes labels → keys) rather than a hardcoded set — Lectio varies the columns per school/term (it added "Afsluttende års-/standpunktskarakter" between Intern prøve and the standpunkt columns), and a fixed list shifted every later value, swapping årskarakter ↔ eksamen and dropping the real eksamen column. Diploma blocks are matched by id suffix (`[id$="_printareaDiplomaLines"]`), one per Bevistype, because Lectio prefixes them with the `DiplomaTypeRepeater_ctlNN` control (bare-id lookup kept as legacy fallback). The summary (`KaraktererSummary`) avoids any unlabeled average: an emphasized official *Eksamensresultat* card (only when reported), a *Gennemsnit* card listing each populated column's weighted average with its own label, and a *Karakterfordeling* card over one representative grade per subject. Grade pills are a single `.il-grade-pill` element whose dark colors live in inline `--bl-grade-*-dark` custom props, promoted by `.dark .il-grade-pill { … !important }` in globals.css (verified Chromium + Firefox) — not Tailwind `dark:` display-toggling, which hid the numbers. |

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

**Standalone compose sessions:** `beginStandaloneComposeViaIframe(schoolId)` credential-fetches the inbox, submits Lectio's new-message postback through the same mutex, and returns detached `ComposeFormData`, rotating form state, and the compose document. This lets global UI load the exact `bcstudent` recipient cache and send without navigating. A successful send consumes the session; subsequent sends bootstrap a fresh one.

**Native reactions:** Reactions are Lectio replies carrying a versioned `blr1` payload in the fragment of a real `https://betterlectio.dk/download` link. BetterLectio resolves each carrier to an earlier message, aggregates the latest carrier per sender, and hides only strictly valid, resolved carriers. First reactions use the normal reply/notification flow; changes and clears edit the same carrier. Clear carriers say `Fjernede sin reaktion` and encode `emoji: null`, so the removed emoji is not retained. The shared mobile contract is documented in `docs/message-reactions-protocol.md`.

**Edited messages:** `lib/message-edit-audit.ts` recognizes only Lectio's complete terminal `Redigeret af …` audit block, removes it from rendered message HTML, and exposes the Copenhagen timestamp as localized relative metadata under the sent time. Invalid or non-terminal lookalikes remain visible. The same terminal matcher keeps edited reaction carriers valid without weakening carrier parsing.

**Lectio DOM quirk — recipient GridView links:** In `ThreadRecipientsGV`, delete links use `onclick="javascript:__doPostBack(...)"` with `href="#"`. Parsers must check `onclick` first, then `href` fallback. Same for `AttachmentsGV` — `parseAttachmentsFromDoc` in `lib/beskeder-submit.ts` must read `onclick` first, otherwise freshly-attached files never render.

| File | Purpose |
|------|---------|
| `BeskederPage.tsx` | Thread list with folder pills, Supabase-first sender names/avatars, optimistic flag/read/delete, search, bulk actions |
| `BeskederThreadView.tsx` | Thread reader with Supabase-first names/pictures, signature stripping, no-reload reply/file attachment, reaction picker/chips, and optimistic reaction state |
| `BeskederCompose.tsx` | Card-based compose with custom recipient picker (Supabase-first names/avatars, keyboard nav), recipient pills, no-reload add/remove/send, Ctrl+Enter. Falls back to native form if parser fails. |
| `WysiwygEditor.tsx` | contentEditable editor converting BBCode <-> rich HTML |
| `BBCodeToolbar.tsx` | Formatting toolbar (bold, italic, underline, link) |
| `lib/beskeder-thread-parser.ts` | Thread DOM parser, state detection, signature stripping, per-message edit targets, and reply notification fields |
| `docs/message-editing-protocol.md` | Canonical native Lectio sent-message edit postbacks, field scoping, limits, and platform behavior |
| `lib/iframe-post.ts` | Hidden iframe POST utility, form token extraction, session expiry detection |
| `lib/beskeder-submit.ts` | Mutex-serialized submission. Thread list actions, thread reply/reaction edit postbacks, compose actions, and shared file upload/attachment operations. |
| `lib/message-reactions.ts` | `blr1` encode/decode, strict carrier validation, portable sender/timestamp/occurrence locators, latest-per-actor aggregation, and safe carrier hiding |
| `lib/message-edit-audit.ts` | Strict terminal Lectio edit-audit extraction, Copenhagen timestamp conversion, and localized relative/absolute edit-time formatting |

### Forside & Other

| File | Purpose |
|------|---------|
| `ForsideGreeting.tsx` | Time-based greeting, live clock, Danish date formatting |
| `ForsideDashboard.tsx` | Redesigned forside with 4 cards (aktuel info, lektier, opgaver, beskeder). Parses native DOM, hides original 4 cards, and renders a container-responsive 1/2-col grid with priority indicators, hold colors, urgency bars, and Supabase-first names/avatars. Aktuel information is optional via `forside.showAktuelInfo` (Settings → Appearance → Home, default on) and updates live through `betterlectio:forsideSettingsChanged`. Other native dashboard islands (e.g. Registreringer) are parsed via `parseGenericIslands()` and rendered through `GenericCard`. `enhanceForsideSchedule()` creates a centered `#il-forside-layout` inside the shared content scroller: compact dashboard work area left and a sticky, primary day schedule right in both navigation modes. The canvas caps at 110rem; the schedule track grows from 30rem toward 42rem and near-viewport height, then page-container queries stack it when the actual content area becomes narrow. |
| `ForsideOpgaverCard.tsx` | Forside opgaver parser (reused by ForsideDashboard) |
| `MembersPage.tsx` | Card grid for hold/klasse members (teachers sorted first) |
| `lib/members-fetch.ts` | Fetch/parse `members.aspx` (explicit credentialed requests) |
| `lib/proevehold-enhance.ts` | DOM-only polish for the native `proevehold.aspx` (exam team) page — no Preact rebuild (stability over exam times/dates). Page-scoping `il-proevehold-page` class, disclaimer banner (i18n `proevehold.*`), and own-row highlight via `il-current-student`. Exam schedule bricks (`s2bgboxeksamen`) forced yellow via `EXAM_BRICK_HUE` in `content.tsx`. Page-scoped CSS lives in the "Lectio Modernizer" section of `globals.css`. |

### Shared Utilities

| File | Purpose |
|------|---------|
| `lib/profile-cache.ts` | User profile + viewed entity caching (school-scoped). Helpers: `isViewingOwnPage()`, `getViewedEntityId()`, `extractViewedEntity()` (URL `name` param → recents/starred → "Ukendt") |
| `lib/school-storage.ts` | Last school persistence for quick login |
| `lib/page-titles.ts` | Clean page titles with unread message badge, MutationObserver |
| `lib/preload.ts` | Speculation Rules API + hover-based prefetching |
| `lib/posthog.ts` | Efficient PostHog boundary (edge build). Distinct ID: `lectio:${studentId}`; no anonymous IDs. High-value outcomes are allowlisted; `extension loaded` and once-per-session `feature used` use a stable 10% monthly cohort, and identify helpers are no-ops. Explicit operational exceptions are retained; noisy globals are sampled at 10%, with all errors deduped/capped at five per context. Page-hide flushing occurs only after a client is created. |
| `lib/posthog-lifecycle.ts` | Legacy lifecycle queue retained for callsite compatibility; its events are dropped by the minimal PostHog allowlist. |
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
       +-- NavigationSurface   <- AppSidebar (default) or HorizontalNavbar
       +-- #il-lectio-content
            +-- injected pages  <- Tailwind base applies
            +-- #il-original-content
                 +-- Lectio DOM <- Tailwind base REVERTED, Lectio CSS applies
       +-- AppOverlays         <- shared dialogs/sheets for either layout
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

## Marketing site (`website/`)

Next.js 16 (App Router, Turbopack) at `betterlectio.dk`. Contains the landing page (`/`), download page, privacy page, uninstall flow, referral redirect, and per-school SEO landing pages.

**Privacy page (`app/privatliv/page.tsx`)** — rebuilt as an approachable, Danish, trust-and-reassurance page instead of a legal wall of text; it works as both privacy disclosure and marketing. Server component, no client JS. Flow: reassurance hero + trust chips → three promise pillars → a signature "honest ledger" (side-by-side *Det gør vi* / *Det gør vi aldrig*) → a dark card explaining that usernames/passwords are never collected and disclosing the narrow, explicit-consent encrypted session-cookie program → the three services (Supabase/PostHog/UserJot) each in one plain sentence with a "kun hvis…" tag → the complete legal detail hidden inside native `<details>`/`<summary>` accordions (accesses, external data, permissions, cookies/tracking, who's behind it) → an open-source + contact CTA. Every disclosure from the previous policy is retained, just reframed and reorganized. Styled entirely with `.site-*` classes added to `app/globals.css`. The "last updated" string is the `LAST_UPDATED` const in the page.

**Design system** — the site uses a "Student OS" visual language whose *layout* is adapted from `website/design.html`, but whose *palette and typography are aligned to the browser extension* so the marketing site and the product read as one identity. Indigo-265 primary (`oklch(0.54 0.2 265)`, the extension's `--primary`), neutrals subtly tinted with the same hue, and **OKLCH throughout** — mirroring the extension's `styles/globals.css`. Soft rounded surfaces, a glass nav pill, and a 3D schedule device-mockup with scroll parallax as the hero signature (`components/site/parallax-controller.tsx`, a render-null client component that transforms the mockup/floating cards/diagonal on scroll, disabled ≤720px and under reduced motion). The mockup itself is a faithful mini of the real app: a sidebar rail (Forside/Skema/Opgaver/Lektier/Beskeder/Karakterer) plus a week grid of hold-coloured schedule bricks, matching `screenshots/1-schedule.png`. Bento feature grid, marquee ticker, and an angled indigo footer round out the landing. Typography is **Geist** (display/body) + **Geist Mono** (data/eyebrows) — the extension's typeface — wired through `app/layout.tsx`. All CSS is namespaced under a `.site` root in `app/globals.css` (`.site-*`, with brand tokens `--blue`/`--brand-soft`/`--volt`/`--ink`/`--grey`/`--muted`/`--line`) to stay isolated from the shadcn token layer; every page composes shared `<SiteNav />` + `<SiteFooter />` from `components/site/`. The marketing site is light-theme only — dark mode appears as a *product* feature inside the hero mockup, not a site-wide theme. The former neo-brutalist `.brand-root` styling was removed, and the `/ → /download` redirect in `next.config.mjs` was dropped so `/` serves the landing page.

**Per-school SEO pages** (`/skoler/[slug]`) — at `next build`, `generateStaticParams` reads every row of `public.schools` via the server-only admin client (`website/lib/supabase.ts`), fans out one static page per school. Title is `[displayName] Lectio` (bypassing the layout's `%s — BetterLectio` template via `title.absolute`) to match `[skole] lectio` Google searches verbatim. Slug = `slugify(display_name ?? name)` with diacritic folding (`ø→oe`, `æ→ae`, `å→aa`, then `NFD` strip) and `-id` suffix on collision. Page body is composed from copy pools in `website/lib/schools-content.ts`: a 6-variant intro paragraph, ordered benefit grid, 3-variant closing CTA, 4-of-6 FAQ subset, and per-section heading variants. All variation is keyed deterministically on `(school.id, slot)` via FNV-1a + seeded Mulberry32 in `website/lib/schools.ts` (`pickByKey`, `pickManyByKey`) — same school always renders identical HTML across builds, different schools render different copy ordering and subsets so the corpus doesn't read as duplicate/doorway content. `app/sitemap.ts` includes one entry per school. Build needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (already required for existing server paths); the helper falls back to an empty list on fetch failure so a deploy without DB access still ships.

**SEO & metadata** — base metadata (title template, description, keywords, robots, OG/Twitter, canonical, appleWebApp, viewport) is centralized in `app/layout.tsx`, complemented by `app/robots.ts`, `app/sitemap.ts` (home + `/download` + `/privatliv` + one entry per school), and `app/manifest.ts`. Social-share images are **dynamic 1200×630 PNGs** built with the file-based `opengraph-image.tsx` / `twitter-image.tsx` route convention and `next/og` `ImageResponse`; the shared renderer is `website/lib/og-image.tsx` (`renderOgImage()`, using Satori's built-in font so static generation of every per-school image never depends on a network fetch). Root `app/opengraph-image.tsx` is the site-wide default; `app/skoler/[slug]/opengraph-image.tsx` renders the school name; `app/download/opengraph-image.tsx` re-exports the root. Because Next replaces (not merges) a segment's `openGraph` object and `alternates.canonical` cascades from the root layout, each route that customizes `openGraph` also carries its own file-based OG image and each indexable route sets its own canonical. Structured data (`components/site/structured-data.tsx`): Organization + WebSite + SoftwareApplication on the landing page, FAQPage + BreadcrumbList on each school page.

## Browser Compatibility

| Browser | Manifest | Status |
|---------|----------|--------|
| Chrome | V3 | Supported |
| Firefox | V2 | Supported |
| Edge | V3 | Should work (untested) |
| Safari (macOS 15+) | V3 | Ships inside the BetterLectio Mac app |

WXT handles manifest differences automatically.

### Safari

Safari is built with `bun run build:safari` (`wxt build -b safari --mv3`) into
`.output/safari-mv3/`. The `--mv3` flag is required — WXT defaults Safari to MV2,
and `manifestVersion` is a single top-level config scalar, so setting it in
`wxt.config.ts` would break the Firefox build too.

macOS only. There is no iOS Safari extension; the iOS product is the native app.
Deployment target macOS 15 guarantees Safari 18, which supports both MV3 service
workers (16.4+) and `world: "MAIN"` on content scripts (18+) — so the manifest needs
no Safari workarounds beyond the two below.

The `build:manifestGenerated` hook's Safari branch does exactly two things:

1. Renames the extension to `BetterLectio` (no space).
2. **Emits `background.scripts` alongside `background.service_worker`.** Safari does
   not apply the `host_permissions` CORS bypass to a background *service worker* —
   only to a background page/event page. Since every Supabase and PostHog request
   originates in `entrypoints/background.ts`, a service-worker-only background would
   fail CORS on every call. Safari prefers `scripts` unless `preferred_environment`
   says otherwise; Chrome-shaped tooling still sees a valid `service_worker` key.
   This is safe because `defineBackground()` is called with no options, so WXT emits
   a classic (non-module) script that loads in either environment.

Distribution is a Safari Web Extension appex bundled inside a macOS host app, which
lives in the separate mobile repo (`Ell1ott/bettermobile-mobile`) alongside the iOS
app. The Mac app shares the iOS bundle identifier `dk.echolabs.betterlectio.app` so
both platforms ship as one App Store record under Universal Purchase. The mobile
repo's `scripts/sync-safari-extension.sh` builds this repo and vendors
`.output/safari-mv3/` into `SafariExtensionResources/`, keeping Xcode builds hermetic.

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
- `lectio session import --student ID --school ID` - Audited import of an explicitly-consented encrypted Supabase session

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
