# BetterLectio

!IMPORTANT: Please update @AGENTS.md and @ARCHITECTURE.md after each big change to reflect changes

**Design skill:** When building big new features that require design, or doing significant UI changes/refactors, use the `frontend-design` skill to generate high-quality, polished interfaces. Always invoke it for new page redesigns, component overhauls, or visual reworks.

@ARHITECTURE.md

Browser extension that modernizes [Lectio](https://www.lectio.dk/), a Danish school management system.

## Tech Stack
- **WXT** 0.21 - Browser extension framework. `vite` (required peer, pin **Vite 7** — Vite 8's Rolldown rejects WXT's IIFE background/content scripts) and `web-ext` (optional peer, opens the browser in `wxt dev`) are listed in `devDependencies`. Node `>=22`.
- **Preact** - Lightweight React alternative (aliased from React)
- **TypeScript** + **Tailwind CSS**
- **shadcn/ui** + **Radix UI** - UI components

## Key Files

### Entry Points
- `entrypoints/content.tsx` - Main content script, renders custom UI wrapper, injects page-specific components
- `entrypoints/login.content.tsx` - Login page redesign with school selector
- `entrypoints/hide-flash.content.ts` - FOUC prevention + intercepts Lectio CSS into @layer lectio
- `entrypoints/elevfeedback-frame.content.ts` - `document_start` + `all_frames` chrome strip for the Elevfeedback editor iframe (`window.name === bl-elevfeedback-editor`). Do not use srcdoc — CKEditor and ASP.NET save need the live Lectio page.
- `entrypoints/session-block.content.ts` - Blocks session timeout popup

### Components
- `components/AppSidebar.tsx` - Default sidebar navigation with collapsible sections; student names prefer Supabase `name`, while avatars prefer approved `custom_pfp_url` then live Lectio DOM data
- `components/HorizontalNavbar.tsx` - Opt-in desktop top navigation (`interface.navigationLayout = "horizontal"`). Primary Forside/Skema/Elever/Beskeder links respect navigation settings; More reflects active secondary pages. Quick actions use tooltips and collapse into overflow before narrow-desktop collisions. Live Lectio context rows retain page-specific navigation, strip redundant active-section suffixes, and add history-aware back links for viewed entities. Its rails share the 110rem wide-screen cap used by Forside. The sidebar remains the default.
- `components/AppOverlays.tsx` - Layout-independent owner for Settings, onboarding, activity/private-appointment dialogs, the assignment detail sheet, and the Elevfeedback editor overlay. Keep these outside either navigation surface so global events work in both layouts.
- `components/OnboardingWizard.tsx` - First-run setup for theme, navigation layout, subject colors, optional profile details, and a mobile-app QR pitch (`renderMobileAppQrSvg`). Navigation asks users to choose between the default/recommended sidebar and the Lectio-like top menu; finishing reloads only when the mounted navigation shell must change. The app step is skipped when `app_installed_at` is already set.
- `components/FindSkemaPage.tsx` - FindSkema redesign with fuzzy search, starred/recents, person cards, Supabase-backed student avatars, and student search matching both Lectio names and Supabase preferred names
- `components/ProfilePage.tsx` - Student profile with tabbed skema/classmates/teachers/hold/dokumenter views. Supabase-backed: description, instagram, birthday (if `show_birthday`), BL badge. Own-profile inline edit form.
- `components/ProfilPage.tsx` - Logged-in student's profile editor. Includes the referral-unlocked custom profile-picture card: locked progress, private upload preview, moderation status/rejection feedback, and approval cooldown.
- `lib/instagram.ts` - Shared Instagram helpers that accept `handle`, `@handle`, or pasted URLs and normalize to `@handle` display/link
- `components/PersonCard.tsx` - Reusable person/entity card with lazy-loaded pictures, navigation context (`from`, `q`, `name`), optional BL badge, Supabase-first name/avatar resolution
- `components/DokumenterPage.tsx` - Documents redesign: collapsible folder tree (hold colors), file list with extension-based icons/badges, breadcrumbs, search, in-app image/PDF preview, drag-and-drop upload, create folder, sort. Parses native DOM via `lib/dokumenter-parser.ts`
- `components/ViewingScheduleHeader.tsx` - Header when viewing another schedule (star/back + expandable "Medlemmer" panel)
- `components/LektierPage.tsx` - Day-grouped homework cards with Supabase-backed done-state sync (optimistic local toggle, cross-device persistence). Completion state fresh-loads on mount/foreground return and then polls every 60 seconds only while the page is visible; it does not use Realtime.
- `components/OpgaverPage.tsx` - Single chronological timeline of all assignments grouped by week, auto-scrolls to current week, compact rows with status indicators, fravær badges, hold pills, grade badges, ignore-missing toggle, combined elevtimer per week
- `components/OpgaveDetailSheet.tsx` - Assignment detail side sheet with submission history, comment/file upload, and Supabase-first group-member names/avatars. Always mounted by `AppOverlays`; listens for `betterlectio:openOpgaveDetail` event so any surface (incl. schedule deadline bricks) can open it without navigation.
- `components/BeskederThreadView.tsx` - Thread view with Supabase-first sender names/avatars, WYSIWYG reply, no-reload reply/attach, and Lectio-native message reactions
- `components/BeskederCompose.tsx` - Card-based compose with custom recipient picker (avatars + keyboard nav), recipient pills, WYSIWYG editor; Supabase-first student names/avatars while keeping Lectio names for postbacks. Recipient directory loads from Lectio's `bcteacher/bcstudent/bchold/bcgroup` caches via `lib/beskeder-recipients-cache.ts` — AvanceretSkema IDs aren't accepted by the recipient form. Every postback re-injects `RepliesNotAllowedChkBox` since `parseFormTokens` would otherwise drop it (visible checkbox, not hidden).
- `components/WysiwygEditor.tsx` - contentEditable editor converting BBCode <-> rich HTML
- `components/BBCodeToolbar.tsx` - Formatting toolbar (bold, italic, underline, link)
- `components/ActivityClassModal.tsx` - Activity detail sheet from skema/forside, rendering note, lektier, presentation, øvrigt indhold, Elevfeedback, related links, hold navigation. Image-only homework items render as click-to-zoom previews; image previews, link-only homework titles, and homework links with image/`pdf` extensions open the shared `<Lightbox>` instead of navigating.
- `components/ElevfeedbackSection.tsx` - Read-only Elevfeedback cards in the activity sheet/modal. Parses `lectab=elevindhold` view HTML; **Skriv/Rediger** opens `ElevfeedbackEditorOverlay` rather than mounting CKEditor in the 560px sheet. Student headings prefer Supabase `students.name`.
- `components/ElevfeedbackEditorOverlay.tsx` - Same-origin iframe of Lectio's LC/CKEditor Elevfeedback page (`name=bl-elevfeedback-editor`). Hides master menu, page header/subnav, entity nav, tabs, and TOC before first paint; relocates **Nyt** into the editor island. Auto-enters **Rediger**, CKEditor dark-mode, dirty-close via `LCDocumentEditor.ConfirmEditorDirtyAndNotSaving`. Do not reimplement `LCDocumentEditor`, inject isolated HTML via srcdoc, or save through the Beskeder WYSIWYG.
- `components/Lightbox.tsx` - Shared overlay viewer for images and PDFs with darkened backdrop, click-outside/Esc to close, download/close footer. Exports `LightboxItem`, `extensionFromUrlOrName()`, `lightboxKindForExtension()`. PDFs fetched as blobs (`credentials: 'include'`) so Lectio's `Content-Disposition: attachment` doesn't force download. Keyframes in `globals.css`.
- `components/PrivatAftaleDialog.tsx` - Dialog for creating/editing private appointments inline. Triggered from schedule toolbar (create) or by clicking a private appointment brick (edit). Fetches ASP.NET form via `lib/privat-aftale.ts`, submits via hidden iframe POST. Edit mode adds delete. Ctrl+Enter to submit.
- `components/ScheduleToolbar.tsx` - Schedule toolbar: week nav, view mode toggle, calendar link, private appointment trigger, print menu
- `components/SettingsModal.tsx` - Settings modal (appearance, behavior, sidebar, fag, about)
- `components/ScheduleCountdown.tsx` - Sidebar/horizontal countdown widget. Current-class states open that activity; before-school, break, and cancelled-class states open the upcoming activity when available.
- `components/ForsideGreeting.tsx` - Time-based greeting, live clock
- `components/ForsideDashboard.tsx` - Redesigned forside: 4 cards (aktuel info, lektier, opgaver, beskeder) parsed from native DOM, responsive 1/2-col grid with priority indicators, hold colors, urgency bars, relative times, Supabase-first names/avatars in message previews. Aktuel information can be hidden via Settings → Udseende → Forside (`forside.showAktuelInfo`, default on); the dashboard re-renders live on `betterlectio:forsideSettingsChanged` / `betterlectio:settings-hydrated`. Other native dashboard islands (e.g. Registreringer) parsed via `parseGenericIslands()` and rendered through `GenericCard` with consistent styling, alternated across columns. `enhanceForsideSchedule()` wraps the compact greeting/dashboard work area and day schedule in the centered `#il-forside-layout` grid so the schedule stays in the right column for both navigation modes. The canvas grows to 110rem and the schedule grows proportionally up to 42rem/near-viewport height; page and dashboard container queries stack or reduce columns based on real available content width.
- `components/ForsideOpgaverCard.tsx` - Forside opgaver card with urgency design (parser reused by ForsideDashboard)
- `components/KaraktererPage.tsx` - Grade report redesign: subject cards with big color-coded grades, teacher notes inline, summary bar, collapsible diploma/protocol/remarks, DOM parser. **Grade columns are parsed dynamically from the live `KarakterGV` header row** (`canonicalColumnKey`) — Lectio varies which columns exist per school/term (e.g. it added "Afsluttende års-/standpunktskarakter" mid-table), so a fixed column list silently shifts values and swaps årskarakter/eksamen. Diploma blocks are matched by id **suffix** (`[id$="_printareaDiplomaLines"]`, one per Bevistype) since Lectio prefixes them with the repeater control (`..._ctl00_...`); the bare-id lookup is a legacy fallback. **Summary** (`KaraktererSummary`) never shows an unlabeled average: an emphasized official *Eksamensresultat* card only when Lectio reports one, a *Gennemsnit* card listing each populated column's weighted average individually labeled, and a *Karakterfordeling* card counting one representative grade per subject (most-final via `representativeGrade`). Grade pills are a single `.il-grade-pill` element carrying dark colors as inline `--bl-grade-*-dark` custom props, promoted by a `.dark .il-grade-pill` rule in globals.css (`!important` beats the inline light colors) — verified in Chromium + Firefox. Do NOT use Tailwind `dark:` display-toggling here; it proved fragile and hid the numbers. **Linjer på bevis** (`DiplomaLinesTable`) is expanded by default, color-codes grades via `SmallGradePill`, and hides the whole Eksamenskarakter column group when no line has an exam grade (collapsing to a clean 4-column table for pre-exam students).
- `components/ModulregnskaberPage.tsx` - Fully custom page (no native equivalent) showing afholdt/planlagt moduler across all hold. Mounted on `forside.aspx?bl=modulregnskaber`. Fetches hold list from `studieplan.aspx`, fans out to `subnav/modulregnskab.aspx?holdelementid=<id>` via `lib/modulregnskab-fetch.ts`. Summary stats + per-hold cards with side-by-side dual meters: `AfholdtMeter` (linear progress with planned overlay + holdnorm tick) and `AfvigelseMeter` (centered bidirectional, severity-colored marker, clamped to ±20% visually while label shows real value).
- `components/DesignPlayground.tsx` - Design system playground from Settings
- `components/settings/HoldMappingEditor.tsx` - Canonical lesson-key editor for subject names/colors (e.g. `1x MA`/`L2d MA`/`2zq MA`/`S2x MA`/`IB1 MA`/`BShannon DA` -> `ma`/`da`)
- `components/MobileAppDrawer.tsx` - Bottom-right floating drawer pitching the iOS/Android app to all extension users until `app_installed_at` or `dismissed_app_prompt_at` is set. Collapsed = small button; expanded = horizontal panel with a tracked QR code pointing to `https://betterlectio.dk/download/app?u={studentId}`. Mounted in `DashboardLayout`. Helpers in `lib/mobile-app.ts`.
- `components/ReferralShareCard.tsx` - "Inviter venner" share card in Settings → Inviter. Shows `betterlectio.dk/r/{elevid}` link with copy + native share, one-click Lectio invitations, plus stats (clicks, conversions) and recent attributed friends. Stats from `get_referral_stats(student_id)` RPC. Fires `referral share link copied` on copy/share.
- `components/ReferralInviteDialog.tsx` - Always-Danish one-click Lectio invite picker. Loads student recipients through a detached compose session, shows pinned students then classmates before search, hides known active BetterLectio/app users, and sends `Hey, prøv lige BetterLectio: {link}` without the normal signature. Confirmed sends have a school/sender/recipient-scoped 30-day local cooldown; ambiguous send responses are never retried automatically.
- `components/MobileAppInvitePopup.tsx` - Centered cross-platform app invite for the same automatic-promotion audience as `MobileAppDrawer`. Shown once on page load, then 7 days later if untouched. Suppressed during quiet hours (02:00–09:00), while in a class (uses `getCountdownState`), and during the first 24h after `students.extension_installed_at` (so it doesn't compete with the day-0 onboarding popup). Snooze stamp at `bl-mobile-app-invite-last-shown:{studentId}`. The QR encodes `?u={studentId}` so a real scan stamps the first `app_qr_scanned_at` server-side and redirects to App Store or Google Play from the visitor's platform. Realtime exists only while its QR dialog is visible; after the channel joins, it reconciles the exact student row so a scan during subscription setup is not missed. It drives the one-time "Tak" transition and removes automatic promotion when `app_installed_at` appears. The sidebar/horizontal-navbar action remains available to every identified student and force-opens the QR even after install or opt-out. Mounted as sibling to `<MobileAppDrawer />`. Helpers in `lib/mobile-app.ts`.

### Libraries
- `lib/modulregnskab-fetch.ts` - Parses `subnav/modulregnskab.aspx?holdelementid=<id>` into `{holdRow, breakdown}`, fetches hold list from `studieplan.aspx`, `fetchAllModulregnskaber(schoolId)` fans out in parallel. School-scoped localStorage caches (hold list 6h, modulregnskab 10min). Distinguishes `hold` vs `uden-kreditering` vs `teacher` rows via `IndentedBlock` wrapper.
- `lib/beskeder-thread-parser.ts` - Thread DOM parser, state detection, signature stripping (parsers accept optional `doc: Document`)
- `lib/iframe-post.ts` - Hidden iframe POST for no-reload ASP.NET postbacks, token extraction, session expiry
- `lib/beskeder-submit.ts` - No-reload message ops (flag, read, delete, folder, search, reply, send, recipients, attach) with serialized mutex
- `lib/message-reactions.ts` - Cross-platform `blr1` carrier protocol, message locators, strict parsing, aggregation, and carrier hiding. Clear carriers use neutral text plus `emoji: null`; edited messages use `lib/message-edit-audit.ts` to replace Lectio's verbose terminal audit line with localized edit metadata; see `docs/message-reactions-protocol.md`
- `lib/bbcode-convert.ts` - BBCode <-> HTML conversion + paste sanitizer
- `lib/opgave-detail.ts` - Fetch/parse ElevAflevering.aspx, submission API, localStorage cache
- `lib/activity-detail.ts` - Fetch/parse `aktivitetforside2.aspx` with rich lektie content, presentation sections, øvrigt indhold, Elevfeedback tab ref (`lectab=elevindhold`), navigation/form tokens. `parseArticle` detects two special homework shapes: a heading wrapping a single `<a>` becomes `primaryLink` (clickable title, no duplicate pill); a body containing a single `<img>` becomes `image` (constrained click-to-enlarge preview). Elevfeedback view HTML is fetched separately — do not reuse `ensureActivityDoc()` (no `actHeader` on that tab).
- `lib/elevfeedback.ts` - Parse/fetch Elevfeedback view page and editor events (`openElevfeedbackEditor` / `notifyElevfeedbackUpdated`). Save stays Lectio's CKEditor postback; do not round-trip LC HTML through the Beskeder BBCode editor.
- `lib/elevfeedback-frame.ts` - Chrome-strip CSS/helpers for the editor iframe (master menu, `#s_m_HeaderContent_subnav_div`, entity nav, tabs, TOC). Relocates **Nyt** out of the hidden TOC, then hides every sibling of `.ls-texteditor-container` up to `<html>`. Used by `elevfeedback-frame.content.ts` at `document_start`.
- `lib/ckeditor-dark.ts` - Shared dark-mode injection into `.cke_wysiwyg_frame` (native activity pages + Elevfeedback overlay).
- `lib/privat-aftale.ts` - Fetch/parse privat_aftale.aspx form, extract ASP.NET tokens, submit create/delete via hidden iframe POST
- `lib/brick-tooltip.ts` - Schedule brick hover tooltip with async-enriched content
- `lib/hold-mapping.ts` - Canonical lesson-key normalization (`1x MA`/`2.4 MA`/`L2d MA`/`2zq MA`/`S2x MA`/`IB1 MA`/`BShannon DA`/`buEUX2601/b DA` -> `ma`/`da`), shared mappings, ignored non-academic groups, legacy migration helpers
- `lib/hold-mapping-sync.ts` - Supabase v2 hydration + upsert/reset sync bridge for canonical mappings and user overrides
- `lib/settings-sync.ts` - Cross-device sync bridge for `bl-feature-settings` and per-school theme. Hydrates at bootstrap and foreground return with a persisted per-user five-minute throttle; due hydrations bypass the local query cache. It debounces pushes by 500ms and resolves conflicts last-writer-wins through security-definer RPCs. There is no settings/theme Realtime subscription or polling. Hydrate writes wrapped in `withSyncSuppressed()` prevent echo. When hydrate replaces local, `applySettingsSideEffects(prev, next)` re-applies live DOM/event effects, dispatches `betterlectio:settings-hydrated`, shows reload toast for `SETTINGS_REQUIRING_RELOAD`. Unauthorized errors suppressed from PostHog. Schema: `supabase/migrations/20260429_add_user_settings_sync.sql`.
- `lib/dokumenter-parser.ts` - DOM parser for DokumentOversigt.aspx: folder tree, document grid (desktop/mobile), breadcrumb, file category/extension helpers, move target extraction
- `lib/fravaer-parse.ts` + `components/FravaerPage.tsx` - Fravær (absence) redesign. Parses the **Oversigt** (`subnav/fravaerelev.aspx`) summary/holds table and the **Fraværsårsager** (`subnav/fravaerelev_fravaersaarsager.aspx`) records + missing-reasons tables, then merges them (`fetchCombinedFravaerData`). **Column mapping is content-anchored, NOT index-based — Lectio reshuffles these tables (like KaraktererPage's `KarakterGV`).** The 2026 layout: (1) the oversigt absence table is a compact 5-col `[hold, Periode/Moduler(fraction), Opgjort/Procent, skr Periode/Elevtid(fraction), skr Opgjort/Procent]` — the parser splits the 4 data cells into alm/skr halves and classifies each by `%` (assessed percent) vs `/` (period count) rather than fixed columns; a fixed mapping put the `0/19` fraction into the headline percent → `parsePct`→0 → page showed 0% absence. (2) the records GV dropped the standalone Godskrevet/type column and merged it into the Fravær cell as text (`"Fravær 100%"` / `"Godskrevet 100%"`), so `fravaerPct` is regex-extracted and godskrevet is text-detected (no more `ok.gif`); rows are mapped by anchoring on the `a.s2skemabrik` activity cell and the `a[href*="fravaer_aarsag"]` edit cell, reading `[Registreret, Bemærkning, Fraværsårsag]` between them. (3) the missing-reasons table is shorter (5 desktop cells) — never guard on a fixed cell count or it silently skips every row and the "Mangler årsag" banner disappears. The redesign has a **period selector** (`PeriodSelector`) wired to `submitPeriodChange` (date inputs in `dd/mm-yyyy` ↔ `yyyy-mm-dd`, plus a "Hele skoleåret" preset); the records page itself has no period picker (always all records, filtered client-side), only the oversigt POST honors the range.
- `lib/class-name.ts` - Shared class-name helpers for year->grade transforms and matching class codes: grade-based (`1x`, `2hf`, `2zq`, `1.4`), chained dotted (`10.st.kl.2`), prefixed (`L2d`, `S2x`, `IB1`), hyphenated (`3hx-u`), slash-suffixed vocational classes (`buEUX2601/b`), and named classes without a grade digit (`BShannon`, `Epsilon`). Normalizes Lectio hold IDs like `t25htxvx_1vx` to the class portion after the last `_`.
- `lib/findskema-storage.ts` - Starred people, recents, picture cache, canonical schedule URL generation
- `lib/findskema-cache.ts` - Resolves AvanceretSkema cache params (`afdeling` + `subcache`) + shared in-flight/TTL cached dropdown loader
- `lib/findskema-types.ts` - Maps AvanceretSkema IDs (`SC/RO/RE/HE/GE/...`) to filter types
- `lib/fuzzy-search.ts` - Fuzzy search for Danish text
- `lib/profile-cache.ts` - User profile + viewed entity caching with URL/localStorage fallback
- `lib/userjot.ts` - UserJot widget bootstrap + identify bridge (loads vendored SDK from extension assets)
- `lib/members-fetch.ts` - Fetch/parse `members.aspx` for klasse/holdelement
- `lib/proevehold-enhance.ts` - Light, DOM-only enhancer for Lectio's `proevehold.aspx` (exam team) page. **No Preact rebuild — stability matters since this page carries real exam times/dates.** Adds `il-proevehold-page` scoping class on `<html>`, injects a disclaimer banner ("BetterLectio takes no responsibility for mistakes", i18n `proevehold.*`) at the top of the island, and adds `il-current-student` to the logged-in student's row (matched by normalized `getCachedProfile().fullName` against the Navn column, parenthetical `(k)` stripped). Whole thing try/catch + null-guarded. Called from `content.tsx` when pathname includes `proevehold.aspx`. Exam schedule bricks (`s2bgboxeksamen`) are forced to a yellow hue (`EXAM_BRICK_HUE = 95`) in both brick-enhance paths so they keep Lectio's native exam color instead of the default purple.
- `lib/schedule-cache.ts` - Today's schedule cache (45min TTL)
- `lib/opgaver-deadlines-cache.ts` - School-scoped localStorage cache (6h TTL) of parsed `OpgaveEntry[]`. Populated by `OpgaverPage.tsx`, refreshed by schedule page on load via `fetchAndCacheOpgaver` (toggles `CurrentExerciseFilterCB`/`ShowThisTermOnlyCB` if filtered). Read by `injectDeadlineBricks()` in `entrypoints/content.tsx` to render deadline bricks at the deadline's exact time. Only on own schedule, only on `skemany.aspx` / `skema1dag.aspx`, only when `schedule.opgaveDeadlines` is on. Submitted assignments filtered out; `mangler` past deadlines stay rendered. Click dispatches `betterlectio:openOpgaveDetail`.
- `lib/page-data-cache.ts` - School-scoped page-presence cache for optional sidebar links (books/SPS)
- `lib/lectio-navigation.ts` - Snapshots Lectio's live master menu, page identity, `.ls-subnav1`, and optional `.ls-subnav2` before the native DOM is moved. Horizontal navigation must use this source of truth because rows vary by page, role, and viewed entity; do not replace it with a fixed contextual link list.
- `lib/posthog.ts` - PostHog analytics singleton (posthog-node edge build), capture/identify/captureException helpers; `getContentDistinctId()` + enriched `$exception` properties
- `lib/lectio-error-popup.ts` - MutationObserver-based detector for Lectio's native `.ls-alertbox`/`[data-title^="Fejl"]` error popups. Extracts title + body, dedupes per DOM element.
- `lib/url-history.ts` - Per-tab (sessionStorage) URL breadcrumb trail to enrich error reports
- `lib/supabase/resources/homework.ts` - Homework queries + `upsert_student_homework_status` RPC bridge for synced completion state
- `lib/supabase/student-lookup.ts` - Shared student lookup helpers: `useSchoolStudents(schoolId)` (returns `studentsMap` Map for O(1) lookups), `getStudentIdFromPersonId()`, lookup-ID-based name/avatar resolution, search aliases, `formatDanishBirthdate()`
- `lib/school-storage.ts` - Last school persistence
- `lib/referral.ts` - Background-side `maybeFinalizeReferral(...)` that POSTs to `referral-finalize` edge function with `credentials: 'include'`. Guarded by per-student localStorage flag so it runs once. Called from `runEnsureSupabaseSession` only when edge function reported `wasFirstInstall: true`. On success, `tabs.sendMessage`s `betterlectio:referral-attributed` to every Lectio tab; content script shows toast.
- `lib/referral-invite.ts` - Pure invite candidate filtering/ranking/search, exact Danish message copy, and 30-day local send cooldown helpers. Filters self, non-students, and known active extension/app users; default groups are pinned students then classmates.
- `lib/supabase/resources/referrals.ts` - Wraps `get_referral_stats(student_id)` RPC. Used by `ReferralShareCard`. Exports `buildReferralUrl(studentId)`.
- `lib/supabase/resources/profile-pictures.ts` - Shared extension client for `get_my_profile_picture_state` and the moderated `profile-picture-submit` Edge Function.
- `lib/mobile-app.ts` - Shared promotion predicate plus `mobileAppDownloadUrlFor(studentId)` / `renderMobileAppQrSvg(studentId)` helpers used by the drawer, popup, and navigation. The public rollout ignores legacy `app_eligible`, `app_qr_scanned_at`, and `marked_android_at`; only `app_installed_at` or `dismissed_app_prompt_at` suppresses promotion. Owns the per-student 7-day invite snooze in localStorage.
- `styles/globals.css` - Main styles, Lectio modernizer, page-specific styling

### Build Tools
- `tools/geocode-schools.mjs` - One-off Google Geocoding backfill for `public.schools.lat` / `public.schools.lon`. Queries `${name}, Denmark` against Google Maps Geocoding API v4, writes only single-result matches, reports misses for manual cleanup.
- `tools/vendor-userjot.mjs` - Downloads UserJot SDK + chunks into `public/vendor/userjot/` for MV3-compliant local loading

### Lectio CLI (`tools/lectio-cli/`)
- `src/lib/aspnet.ts` - ASP.NET WebForms extraction helpers
- `src/commands/asp.ts` - `lectio asp` command (inspect, postback, field)
- `src/lib/keepalive.ts` - Session keepalive daemon
- `src/commands/keepalive.ts` - `lectio keepalive` command

## Analytics (PostHog)

Uses `posthog-node` (edge build via Vite `conditions: ['edge', ...]`) for lightweight server-style event capture in both content scripts and MV3 service workers.

**Distinct ID convention:** `lectio:${studentId}` where `studentId` is the raw Lectio `elevid` (globally unique). **No anonymous tracking** — all events require an identified user. Pre-login pages do not send analytics. `lib/posthog.ts` enforces this at egress: all helpers only call the SDK when `isLectioStudentDistinctId(distinctId)` passes (canonical `lectio:` prefix + non-empty trimmed elevid, `[0-9A-Za-z_-]{1,48}`). Invalid ids are dropped silently.

**Efficient event policy:** `lib/posthog.ts` allowlists feedback, onboarding, install/update, `extension loaded`, bypass, successful app-invite, and referral-share outcomes. `extension loaded` is captured at 100% because it is the denominator for the bypass rate — `betterlectio bypass engaged` is also at 100%, so a sampled denominator would inflate the rate ~10×. Only once-per-session `feature used` uses a stable 10% monthly user cohort. All analytics `page` values come from `getPageSlug()`, which lowercases the slug so mixed-case Lectio paths (`SkemaNy.aspx` vs `skemany.aspx`) do not split one page into two. Identify/person-property helpers and routine settings and invite-impression events are compatibility no-ops. The referral edge functions send only successful `referral attributed`; clicks, rejections, and unlocks are measured from Postgres instead.

**Exceptions:** Explicit operational `$exception` callsites are retained. Noisy ambient sources (`window.error`, unhandled rejections, `console.error`, background globals, and CSP violations) are deterministically sampled at 10%. All errors are deduplicated by source/message and capped at five per extension context, preventing storms from consuming the quota.

**Adding new events:** Do not add an event unless it answers a durable question that cannot be answered from Supabase. New events must be explicitly added to the allowlist in `lib/posthog.ts`, or use the sampled `feature used` helper; callsites alone do not emit anything. All calls remain try/catch wrapped.

**Non-actionable Supabase error suppression:** Self-recovering auth-transition/transport errors (`Unauthorized` ownership rejections, `JWT expired` / `PGRST301`, transient network failures) must NOT reach `captureException` — they burn free-tier quota and fan one moment out into several colliding fingerprints. The single source of truth is `lib/supabase-error-noise.ts` (`isNonActionableSupabaseError` + the individual `isAuthOwnershipError` / `isExpiredJwtError` / `isTransientNetworkError` predicates). Every capture site that reports Supabase errors gates on it: `lib/settings-sync.ts`, `lib/hold-mapping-sync.ts`, the global handlers in `entrypoints/content.tsx`, and `entrypoints/background.ts` (`captureSupabaseError`, which additionally suppresses PGRST116 and scopes the unauthorized check to `rpc` actions). Do NOT add a fourth local copy of this guard — three divergent copies (matching only `unauthorized`) are what let "JWT expired" noise recur from the content script after the background-only fix in PR #39.

**Auto properties:** Allowed captures include `$browser`, `$os`, `$screen_height`, `$screen_width`, `$current_url`, `$pathname`, and `extension_version`. Sampled exceptions merge the same set in page contexts.

**Config:** `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` env vars. Host permission for `https://eu.i.posthog.com/*` in manifest.

**Uninstall tracking:** `entrypoints/background.ts` calls `browser.runtime.setUninstallURL('https://betterlectio.dk/uninstall?u={studentId}')` whenever it resolves a student identity. Cleared on `SIGNED_OUT`. `/uninstall` page (in `website/app/uninstall/`) stamps `students.extension_uninstalled_at` (first-uninstall only), then renders feedback form. Reason chips + textarea persist via `submitUninstallFeedback`. Schema: `supabase/migrations/20260427_add_students_uninstall_tracking.sql`.

**Reinstall tracking:** `students.extension_reinstalled_at timestamptz` is stamped server-side by `verify-lectio-auth` the first time it sees an existing row whose `extension_uninstalled_at` is set but `extension_reinstalled_at` is still null. The original uninstall timestamp is preserved so the admin uninstalls dashboard can show a "Reinstalled" badge + recovered count alongside the original churn signal. Schema: `supabase/migrations/20260506_add_students_reinstall_tracking.sql`.

## Supabase Auth & Storage

**Edge function:** `supabase/functions/verify-lectio-auth/index.ts` handles QR-code-based auth. Flow: QR login → extract session cookies → sequential `SkemaNy.aspx` and `digitaltStudiekort.aspx` requests through the shared rotating jar → generate magic link → upsert student metadata. It never downloads or uploads the ordinary Lectio portrait. Schedule title is the fallback name source; missing profile enrichment must not block authentication.

**Background auth dedupe:** `entrypoints/background.ts` is the single coordinator for Supabase auth. Startup auth originates from `entrypoints/content.tsx`; feature code only calls `ensureSupabaseSession(...)` as fallback. Background dedupes concurrent attempts per `schoolId:userId` so multiple callers don't burn the same one-time magic-link token.

**Session ownership validation:** `ensureSupabaseSession(schoolId, source, studentId?)` accepts the page's raw `elevid`. When provided, background validates the existing session owns that specific student before accepting it. Stale sessions are signed out and a fresh QR reauth is triggered. Always pass `studentId` from callers about to write student-scoped RPCs (e.g. `upsert_user_lesson_override_v2`, `upsert_student_homework_status`).

**Unauthorized RPC recovery:** Security-definer RPCs raise `'Unauthorized'` when the session doesn't own the `(student_id, school_id)` tuple. Content-script `sendRpc` in `lib/supabase/client.ts` detects this, calls `forceReauthenticate()` (signs out + re-runs full QR flow), and retries once. `forceReauthenticate` is deduped per `schoolId:studentId` with a 60s failure cooldown. Unauthorized errors from these RPCs are intentionally suppressed from PostHog — they're an expected auth-transition state.

**Auth UID:** Edge function sets `supabase_id` on `students` from `data.user.id` returned by `generateLink()`.

**Mobile auth source of truth:** `supabase/functions/lectio-auth/index.ts` is the universal QR → Supabase mint for extension, iOS, and Android (`verify_jwt = true`). Clients mint a Lectio login QR from `studentIndstillinger` locally, send only `qrId`/`userId`/`schoolId` (never Lectio cookies), and keep their own Lectio jar for scraping — the edge jar is mint-only and cookies are not returned. Platform install stamps come from `client.platform` (`extension_*` vs `app_installed_at` + `android_installed_at`/`iphone_installed_at`). Legacy `token-for-auth` (cookie handoff) and `verify-lectio-auth` remain deployed for outdated clients during soak; do not point new clients at them. Schema: `supabase/migrations/20260811_split_app_installed_platform.sql`, `20260812_add_lectio_auth_function_name.sql`.

**Consented Lectio session donors:** Only the unified `lectio-auth` flow may capture its rotating cookie jar, and only after Lectio-derived identity matches an active row in the private, service-role-only `lectio_session_grants` allowlist. Jars are envelope-encrypted (AES-256-GCM DEK plus versioned wrapped master key), never returned or logged, and stored separately from `lectio_tokens`. Revocation deletes credentials immediately. `lectio-session-keepalive` atomically leases due rows and calls `/ping.aspx` every 30 minutes through Supabase Cron; only HTTPS `www.lectio.dk` redirects may receive cookies. Secrets live in Edge secrets/Vault. Local admin import uses environment-only service-role/key credentials and writes mode-`0600` cookies. Operations: `docs/lectio-session-operations.md`. Schema: `20260826233000_add_consent_gated_lectio_sessions.sql`, `20260826233100_schedule_lectio_session_keepalive.sql`.

**Auth observability:** `auth_attempts` is the 30-day operational record for `lectio-auth`, `token-for-auth`, and `verify-lectio-auth`; edge telemetry is best-effort and must never alter an auth outcome. Responses include `request_id`, `profile_status`, `profile_source`, and `profile_fields`. Authenticated clients call `confirm_auth_attempt` after a usable session exists. Admin reads only the service-role `get_auth_health` RPC; never expose `auth_user_id` in the UI. PostHog is secondary correlation, not the source of truth. Schema: `supabase/migrations/20260808_add_auth_attempt_observability.sql`, `20260812_add_lectio_auth_function_name.sql`.

**Canonical Supabase source:** deploy functions and migrations only from this `extension/supabase` tree. The old iOS-local deployable copy was removed so it cannot overwrite production with stale auth behavior.

**Retired generic audit log:** `public.updates` and its `lessons`/`homework_entries` audit triggers are removed by `20260826_remove_unused_updates_audit.sql`; they had no reader and created substantial write/storage churn. Keep `admin_audit_log` and the separate lesson notification trigger intact.

**Realtime publication:** `supabase_realtime` remains selective. `20260827_cleanup_supabase_realtime_publication.sql` keeps only `public.students` published for these flows: settings hydrate by refetch, homework fresh-loads/polls while visible, and QR Realtime is scoped to an open QR dialog with post-join reconciliation.

**Profile picture storage:** Ordinary school portraits remain on Lectio and are requested with the viewer's authenticated Lectio session; clients cache the parsed `pictureid` for 24 hours with stale-while-refresh. Never download or copy these portraits into Supabase. The public `profile-pictures` bucket is reserved for approved custom images under immutable `custom/{schoolId}/{studentId}/{submissionId}.jpg` paths. Referral-unlocked students may submit JPEG/PNG/WebP images (5MB, 25MP, 8000px/side maximum) through `profile-picture-submit`; submissions live privately and never affect rendering until approval. Admin must decode through `normalizeProfilePicture`, which strips metadata and publishes only a bounded 1600px sRGB JPEG; never render or publish the original object. Rejections carry a required reason and allow immediate retry. Cleanup is performed by `maintenance-cleanup`. `students.lectio_pfp_url` and `pfp_hash` remain deprecated null-only compatibility fields until old clients can no longer query them. Schema/RPCs: `20260803_add_moderated_profile_pictures.sql`, `20260805_allow_ios_profile_picture_submissions.sql`, `20260826_stop_mirroring_lectio_profile_pictures.sql`; Admin queue: `admin/app/(dashboard)/moderation`.

**Student identity rendering rule:** When a UI surface can identify a student (`students.id`, raw `elevid`, or lookup ID like `S727...`), prefer `students.name` for display, then keep Lectio names as aliases/search terms. For pictures: approved `custom_pfp_url` → authenticated Lectio/context-card image fetch → initials; a custom-image load failure must continue to the Lectio candidate rather than jumping straight to initials. Never render the deprecated `lectio_pfp_url`. Applies to FindSkema, members, Beskeder, group submissions, sidebar.

**Privacy-safe rich-profile reads:** iOS, Android, and the extension's viewed-student profile read through `get_student_profile(p_student_id)` from `20260804_add_public_student_profile_rpc.sql`, not a direct `students.birthdate` select. The security-definer RPC verifies that the target is in the authenticated viewer's school and returns `birthdate = null` unless `show_birthday` is true. Native message-avatar lists use the equivalent capped batch RPC `get_student_profiles(p_student_ids)`. `20260806_enforce_student_birthday_privacy.sql` revokes authenticated table-wide SELECT and grants every existing student column except `birthdate`; the background query bridge uses the same explicit safe projection for legacy queries and mutation return values. Keep these lists aligned when adding student columns, and keep future rich-profile fields in the RPCs' explicit return contracts. Public Supabase profile images must use an unauthenticated image loader; never pass their URLs through a Lectio loader that attaches cookies.

**Deploy:** `bunx supabase functions deploy lectio-auth`; `bunx supabase functions deploy lectio-session-keepalive --no-verify-jwt`; legacy: `bunx supabase functions deploy verify-lectio-auth --no-verify-jwt`; `bunx supabase functions deploy profile-picture-submit`

**Student activity (`last_seen_at`):** `public.students.last_seen_at timestamptz` is stamped from `entrypoints/content.tsx` after auth via `maybeTouchLastSeen` (`lib/supabase/resources/student-activity.ts`) → `touch_student_last_seen(p_student_id, p_school_id)` security-definer RPC. Client throttle is once per day per `(schoolId, studentId)` via localStorage (`bl-last-seen-touched:{schoolId}:{studentId}`); the RPC enforces a 12h server-side backstop and validates `auth.uid()` owns the row. Standard predicate for "still active": `last_seen_at > now() - interval '14 days' AND extension_uninstalled_at IS NULL`. Use this Supabase timestamp—not PostHog—for active-user metrics. Migration: `supabase/migrations/20260501_add_students_last_seen_at.sql`.

**Active-user helper:** `lib/active-user.ts` (extension) and `admin/lib/active-user.ts` (admin) export `isActiveStudent(student)` + `ACTIVE_WINDOW_DAYS = 14`. The client helper falls back to `extension_installed_at` when `last_seen_at` is null so fresh installs aren't marked inactive while heartbeats backfill. Admin also exports `activeCutoffIso()` for `.gte("last_seen_at", ...)` filters — overview counts use heartbeat only (no install fallback), so the dashboard reflects the heartbeat signal honestly. **BL badge gate:** FindSkema (`hasBL`/`schoolBLCount`) and `ProfilePage` (`hasBetterLectio`) require `isActiveStudent(s) || s.app_installed_at` — the badge no longer shows for students who installed but haven't pinged in 14 days, except app users (iOS app doesn't write `last_seen_at`). When loading students for badge logic, `useSchoolStudents` now selects `last_seen_at` and `extension_uninstalled_at`. Admin overview shows an "Active (14d)" card; admin students table has a Status column with active/inactive/uninstalled/never filters.

**School student count:** `public.schools` carries nullable `student_count int` + `student_count_updated_at timestamptz`, populated opportunistically by clients. `lib/findskema-cache.ts` calls `maybeUpdateSchoolStudentCount` (in `lib/school-student-count.ts`) after `fetchAvanceretSkemaDropdownItems` resolves; the helper counts dropdown entries whose ID prefix is `S` but not `SC` (real students, not stamklasser), then fires `update_school_student_count(p_school_id, p_count)`. Throttle is double-gated: 24h client-side localStorage flag (`bl-school-student-count-attempted:{schoolId}`) and a security-definer RPC that no-ops unless the row is missing the count, was updated >14 days ago, or the new count differs by >20. Migration: `supabase/migrations/20260501_add_schools_student_count.sql`.

**School coordinates:** `public.schools` now stores nullable `lat` / `lon` (`double precision`) alongside `id` / `name` / `display_name`. Backfill is a one-off maintenance task via `bun run geocode:schools`, which geocodes `${name}, Denmark` through Google Maps Geocoding API v4, persists only exact single-result matches, and leaves misses null for manual follow-up. The live run temporarily creates a permissive `UPDATE` RLS policy on `public.schools` and drops it immediately afterward. Admin uses these coordinates in `admin/app/(dashboard)/map/page.tsx` to render a Leaflet map of Denmark with one circle per school sized by extension-install count (CARTO light tiles, `react-leaflet`/`leaflet`, dynamic-imported client-side via `install-map-client.tsx` so SSR stays clean).

**Lesson mapping sync v2:** Canonical mappings live in `school_lesson_mappings` (school defaults keyed by `canonical_key` like `ma`, `srp`, `kt`) and `user_lesson_overrides` (per-student overrides). Migration: `supabase/migrations/20260324_add_lesson_mapping_v2.sql`.

**Homework completion sync:** Lektier completion persists per student in `student_homework`, keyed from Lectio activity `entry_id`/`absid`. Same checkbox UI, synced cross-device with optimistic local state and writes through `upsert_student_homework_status(...)`. Schema: `supabase/migrations/20260324_add_homework_completion_sync.sql`.

**Referral system:** Classmates share `https://betterlectio.dk/r/{referrer_elevid}`. `referral-click` creates rate-limited, daily-IP-hashed click tokens; supplied tokens must be validated against the referrer before clients persist them. iOS App Clip creates the token itself when Apple invokes the original tokenless URL and shares it with the full app through the dedicated App Group. `referral-finalize` verifies JWT ownership and delegates to `finalize_referral_attribution`, whose row lock and single database transaction make the click conversion, student attribution, and three-conversion reward atomic. Fresh-install window is 7 days; click retention is 180 days. `REFERRALS_ENABLED=false` is the server kill switch. Schema: `20260430_add_referral_tracking.sql`, `20260723_referral_reward_unlocked_at.sql`, `20260807_atomic_referral_finalization.sql`. Admin: `admin/app/(dashboard)/referrals/page.tsx`.

## Internationalization (i18n)

Custom lightweight i18n for BetterLectio's injected UI only. **Lectio's native DOM stays in Danish.**

- **Supported locales:** `da` (default), `en`. Defined in `lib/i18n/locales.ts` — adding a locale = create `lib/i18n/dictionaries/<code>.ts` (must `satisfies DaDictionary`) and append to `SUPPORTED_LOCALES`.
- **Source of truth:** `lib/i18n/dictionaries/da.ts`. `DaDictionary = WidenLeaves<typeof da>` forces every other locale to match the same nested key structure at compile time.
- **API:** `useTranslation()` hook returns `{ locale, t }`. `t(key, vars?)` (non-hook) for module-scope. `setLocale(code)` persists + dispatches `betterlectio:locale-changed`. `getLocale()` lazy-resolves stored setting → `navigator.language` base → `da`.
- **Provider mounting:** `lib/i18n/render.tsx` exports a drop-in replacement for `preact`'s `render` that wraps every root in `<I18nProvider>`. Both content entrypoints import from `@/lib/i18n/render`. Context doesn't cross roots — always render through this helper.
- **Key path & types:** `t('settings.appearance.language')` typed via `Path<DaDictionary>`. Missing keys → TS error in other locales. Runtime missing → fall back to default-locale, then raw key. `import.meta.env.DEV` warns.
- **Interpolation:** `t('greeting', { name: 'Jonathan' })` substitutes `{name}`. No pluralization/ICU.
- **Settings:** `interface.language` lives in `lib/settings-storage.ts`. Picker in Settings Appearance section; `handleSettingChange` calls `setLocale(value)` for live re-render. `language` added to `identifyIfNeeded` person properties.
- **Bundling:** all dictionaries eagerly bundled via static `import` (MV3 content scripts can't dynamic-`import()` post-build).

## Architecture
Content scripts inject a custom Preact UI that wraps the original Lectio DOM. The original DOM is **moved** (not cloned) to preserve event handlers and functionality.

## CSS Cascade Layers
Lectio's CSS is intercepted at `document_start` by `hide-flash.content.ts` and wrapped in `@layer lectio { }`. This puts ALL of Lectio's styles into the lowest-priority layer.

**Layer order** (lowest -> highest): `lectio < theme < base < components < utilities`

When adding new CSS overrides for Lectio elements, put them in `@layer components { }` in `globals.css` — they'll automatically beat Lectio's styles. Only use `!important` when overriding **inline styles** (e.g., Lectio's JS-set `style="width:..."` on schedule bricks) or `display: none/block` for element hiding.

**Content isolation:** `#il-original-content :where(*) { all: revert-layer }` in `@layer base` prevents Tailwind's preflight from breaking Lectio's native DOM.

## Styling Rule (Tailwind-First)

All custom/injected Preact UI should be styled with Tailwind utility classes directly in `.tsx` components.

- Profile pictures / avatars must use `object-top` so the top of the head is always visible.
- Do not add new component-specific plain CSS blocks for custom UI.
- Prefer semantic token utilities (`bg-background`, `text-foreground`, `bg-primary`, `border-border`, `ring-ring`) so theme switching propagates.
- Keep `globals.css` for platform-level concerns: token definitions (`:root`, `.dark`, `data-il-theme`), layer plumbing, native Lectio overrides.

### Typography / hierarchy (injected UI)

Use Tailwind step utilities (`text-xs`, `text-sm`, `text-base`, …) plus weight and color—not one-off `text-[11px]`. Hierarchy:

- **Page or card title** — `text-base font-semibold`
- **Primary line in list row** — `text-sm font-medium text-foreground`
- **Secondary / description** — `text-sm text-muted-foreground`
- **Meta** — `text-xs text-muted-foreground` (timestamps, "kl." lines, table headers)
- **Section chrome** — `text-xs font-semibold uppercase tracking-wide text-muted-foreground`
- **Badges / pills / counts / tiny initials** — `text-xs` or smaller only where physically small

## Color System — OKLCH Only

**All colors MUST use `oklch()`.** Never use `hsl()`, `rgb()`, `rgba()`, or hex anywhere.

- **CSS variables** in `:root` / `.dark` are all `oklch(L C H)`
- **Primary**: hue 265 — `oklch(0.54 0.2 265)` (light) / `oklch(0.65 0.16 265)` (dark)
- **Light mode neutrals**: subtly tinted with hue 265
- **Dark mode neutrals**: near-achromatic (chroma ≤ 0.006) with warm hue 285 (mauve-gray). NOT blue-tinted.
- **Dark mode text**: warm off-white `oklch(0.93 0.003 90)`. Muted: `oklch(0.58 0.006 285)`.
- **Dark mode semantic colors**: red (25), orange (50), yellow-green (80), green (145). Background tints use the semantic hue, NOT 265.
- **Alpha**: `oklch(L C H / alpha)` or `color-mix(in oklch, var(--token) N%, transparent)`
- **Tailwind arbitrary**: underscores for spaces — `bg-[oklch(0.54_0.2_265)]`
- **Shadows**: `oklch(0 0 0 / alpha)` not `rgba(0,0,0,alpha)`

## Cross-Browser Compatibility

**IMPORTANT:** Firefox is stricter than Chrome with URL handling. When using `fetch()`, always use absolute URLs:

```ts
// WRONG - breaks on Firefox
fetch("/lectio/login_list.aspx")

// CORRECT
fetch(new URL("/lectio/path.aspx", window.location.origin).href)
fetch(`${window.location.origin}/lectio/${schoolId}/path.aspx`)
```

`window.location.href = "/relative/path"` and `<a href="/path">` work fine — only applies to `fetch()` and similar APIs.

**FindSkema dropdown cache key:** Don't assume `subcache` equals current calendar year. Read both `afdeling` and `subcache` from Lectio's `AvanceretSkema_<afdeling>_<subcache>` dataset key.

**Cross-school cache safety:** All caches with identity/form state must be scoped by `schoolId`. Includes name-id lookup, schedule/page-data caches, activity/assignment detail caches, profile cache.

**Beskeder safety:** For non-idempotent iframe-post actions (send/reply/delete), don't auto-fallback to native postback on parse errors — can duplicate side effects. Show refresh/retry prompt instead.

**Beskeder recipient picker cache:** Compose recipient autocomplete uses Lectio's `bcteacher/bcstudent/bchold/bcgroup` caches, NOT `AvanceretSkema`. AvanceretSkema's `HE*/GE*` IDs silently fail validation server-side. Use `fetchBeskederRecipientItems` from `lib/beskeder-recipients-cache.ts`.

**Standalone compose:** Global surfaces such as `ReferralInviteDialog` must call `beginStandaloneComposeViaIframe(schoolId)` instead of relying on compose controls in the current page DOM. It credential-fetches the inbox, enters new-message state through the serialized iframe mutex, and returns detached compose controls/form state plus the document that registered the recipient cache URLs. A successful send consumes that state; bootstrap a fresh compose session before sending another message.

**Beskeder no-reply checkbox:** `RepliesNotAllowedChkBox` is a visible `<input type="checkbox">`, so `parseFormTokens` (hidden inputs only) doesn't include it. ASP.NET only POSTs checkboxes when checked. Every compose postback must re-inject `{ [noReplyCheckboxName]: 'on' }` when DOM is checked, or server resets to unchecked. `BeskederCompose.tsx` centralizes this via `formStateWithNoReply(state)`.

**Beskeder recipient GridView links:** In `ThreadRecipientsGV`, Lectio renders delete links as `<a href="#" onclick="javascript:__doPostBack(...)">`, not `href="javascript:__doPostBack(...)"`. Always check `onclick` first, then `href`. Same applies to `AttachmentsGV` — `parseAttachmentsFromDoc` must read `onclick` first or freshly-attached files silently fail to render.

**FindSkema type mapping:** AvanceretSkema IDs use `SC*` for stamklasser, `RO*` for lokaler, `RE*` for ressourcer, `HE*` for hold, `GE*` for grupper. Map by actual ID prefixes.

**Class name parsing:** Don't assume class codes always end in a single letter. Support 1-2 alphanumeric suffixes (`2hf`, `2zq`), dotted numeric (`1.4`), chained dotted (`10.st.kl.2`), letter-prefixed (`L2d`, `S2x`), suffixless prefixed (`IB1`), hyphenated (`3hx-u`), and slash-suffixed vocational classes (`buEUX2601/b`). When a value contains `_` (Lectio hold IDs like `t25htxvx_1vx`), `normalizeClassCode` peels to the class portion after the last `_`. Reuse `lib/class-name.ts`.

**Lectio Modernizer:** "Lectio Modernizer" section in `globals.css` restyles native elements with modern design. Add new overrides under `@layer components`. Key targets: `table.lf-grid`, `.buttonfilled`/`.buttonoutlined`/`.buttonfilledtonal`, `input`/`select`/`textarea`, `.s2skemabrik`, `.lf-island`.

**MV3 remote-code compliance:** Don't execute third-party JS directly from CDNs at runtime. UserJot must load from vendored local assets (`public/vendor/userjot/**`) generated by `npm run vendor:userjot`.

**Safari background CORS:** Safari does NOT apply the `host_permissions` CORS bypass to a background *service worker* — only to a background page/event page. All Supabase and PostHog traffic originates in `entrypoints/background.ts`, so the Safari branch of `build:manifestGenerated` emits `background.scripts` alongside `background.service_worker`. Do not remove it: without `scripts`, every background network call fails CORS on Safari. Safari builds must use `--mv3` (`bun run build:safari`) since WXT defaults Safari to MV2; `manifestVersion` is a single top-level config scalar, so it can't be set per-browser in `wxt.config.ts`. Safari is macOS-only — no iOS Safari extension. See ARCHITECTURE.md → Browser Compatibility → Safari.

**Version single-source:** `wxt.config.ts` has no `version` key — WXT falls back to `package.json`, which `release.yml` bumps. Don't reintroduce it; the workflow used to patch it with a hardcoded `sed` line number.

**Firefox sources ZIP:** WXT 0.21 uses `includeSources - excludeSources`. `wxt.config.ts` `zip.includeSources` is the allowlist of files AMO needs to rebuild; do not switch back to exclude-only. Production zip names stay `{{name}}-{{packageVersion}}-{{browser}}.zip`.

**Store publishing:** `.github/workflows/release.yml` runs `bun run submit` (`wxt submit` from the repo-locked WXT 0.21). Never `npx wxt@latest`. Chrome Web Store v1 refresh-token secrets still work; v1 is retired 15 Oct 2026, after which `wxt submit init` can switch the project to the CWS v2 service-account flow.

## Marketing site (`website/`)

Next.js 16 App Router site at `betterlectio.dk`. Routes: `/` (landing), `/download`, `/download/app` (tracked platform-neutral app redirect), `/download/ios` (explicit/legacy App Store redirect), `/privatliv`, `/uninstall`, `/r/[elevid]` (referral redirect), and `/skoler/[slug]` (SEO).

- **Privacy page (`/privatliv`)**: Deliberately *not* a legal wall of text — it's an approachable, Danish, reassurance-first trust page that doubles as marketing. Server component (no client JS): reassurance hero + trust chips → 3 promise pillars → the signature **honest ledger** ("Det gør vi" green / "Det gør vi aldrig" red, side by side) → a dark "Vi ser aldrig dit Lectio-login" card answering the scariest question up front → 3 services in plain language (Supabase/PostHog/UserJot, each with a "kun hvis…" tag) → the full legal detail tucked into native `<details>` accordions → open-source/contact CTA. All substance from the old policy is preserved, just reframed. Styling is `.site-*` classes in `app/globals.css` (`.site-privacy`, `.site-promise`, `.site-ledger`, `.site-assure`, `.site-svc`, `.site-detail`, `.site-oss`, `.site-section-head`). Update the `LAST_UPDATED` const in the page on policy changes.

- **Design system**: "Student OS" look — layout/structure adapted from `website/design.html`, but the palette + type are **aligned to the browser extension** so the site and product read as one. Indigo-265 primary (`oklch(0.54 0.2 265)`), neutrals subtly tinted with the same hue, **OKLCH throughout** (matching the extension's `styles/globals.css`), soft rounded surfaces, glass nav, a 3D schedule device-mockup with scroll parallax as the hero signature (the mockup is a faithful mini of the real app — sidebar rail + week grid of hold-coloured bricks), bento feature grid, marquee ticker, angled indigo footer. Fonts: **Geist** (body/display) + **Geist Mono** (data/eyebrows) — same as the extension. All styles are namespaced under a `.site` root in `app/globals.css` (`.site-*` classes; brand tokens `--blue`/`--brand-soft`/`--volt`/`--ink`/`--grey`/`--muted`/`--line`) so they never collide with the shadcn tokens; pages compose `<SiteNav />` + `<SiteFooter />` from `components/site/`. Light-theme only (marketing) — dark mode is a *product* feature shown in the mockup, not a site theme. Parallax + ticker respect `prefers-reduced-motion`. The old neo-brutalist `.brand-root` system was fully removed.
- **No root redirect**: `next.config.mjs` previously 302'd `/` → `/download`; now `/` is the static landing page (`app/page.tsx`).

- **Per-school SEO pages**: `website/app/skoler/[slug]/page.tsx` is fully SSG (`dynamic = 'force-static'`, `dynamicParams = false`). At build time, `generateStaticParams` reads every row of `public.schools` and generates one page per school with title `[displayName] Lectio` (`title.absolute` bypasses the `%s — BetterLectio` template). Sitemap includes all school URLs.
- **Content variation**: `website/lib/schools.ts` exposes `pickByKey`/`pickManyByKey` (FNV-1a hash + seeded Mulberry32) keyed on `(school.id, slot)`. Pools live in `website/lib/schools-content.ts` (intro, benefits, closing, FAQ, headings). Each school renders deterministic, byte-stable HTML across rebuilds; different schools differ in intro paragraph, benefit ordering, FAQ subset, and headings. **When adding new copy**: add to the relevant pool in `schools-content.ts` — never inline strings into the page so variation surface stays in one place.
- **Slug**: `slugify` folds Danish letters (`ø→oe`, `æ→ae`, `å→aa`) before NFD strip; collisions get a `-id` suffix.
- **SEO / metadata / OG images**: Base metadata (title template, description, keywords, robots, OG, Twitter, canonical, appleWebApp, viewport) lives in `app/layout.tsx`; `robots.ts`, `sitemap.ts` (home + `/download` + `/privatliv` + every school), and `manifest.ts` round it out. **OG/Twitter images are dynamic 1200×630** via the file-based `opengraph-image.tsx`/`twitter-image.tsx` route convention, rendered by the shared `lib/og-image.tsx` `renderOgImage()` (Satori built-in font — no network fetch, so static school-image generation never flakes; brand-blue gradient + inlined logo glyph). Root `app/opengraph-image.tsx` is the default; `app/skoler/[slug]/opengraph-image.tsx` bakes the school name in; `app/download/opengraph-image.tsx` re-exports the root render. **Gotcha:** Next *replaces* (not merges) the whole `openGraph` object when a segment sets its own, so any route that overrides `openGraph` must also carry a file-based OG image at its segment or it loses the image (that's why `/download` — a client page whose metadata lives in `app/download/layout.tsx` — has its own re-export). `dynamic`/`dynamicParams` can't be re-exported from another module (Next needs them statically parseable), so the school `twitter-image.tsx` declares them inline. `alternates.canonical` **cascades from the root layout**, so every indexable page sets its own canonical (`/privatliv` did not and was inheriting `/`). **JSON-LD** via `components/site/structured-data.tsx`: landing renders Organization + WebSite + SoftwareApplication (`siteJsonLd()`); school pages render FAQPage (from the same FAQ pool) + BreadcrumbList (`schoolJsonLd()`).

## Commands
```bash
bun run dev          # Development (Chrome)
bun run dev:firefox  # Development (Firefox)
bun run dev:safari   # Development (Safari, MV3)
bun run build        # Production build
bun run build:safari # Production build (Safari, MV3 -> .output/safari-mv3)
bun run zip          # Package extension
bun run geocode:schools -- --google-key "$GOOGLE_MAPS_API_KEY"  # One-off schools lat/lon backfill
```

## Lectio CLI Tool

CLI for fetching authenticated Lectio pages. Location: `tools/lectio-cli/`

```bash
cd tools/lectio-cli && bun install && cd ../..  # First time setup
bun run lectio auth --school 94                  # Authenticate
bun run lectio fetch skemany.aspx -o lectio-html/lectio/94/skemany.html
bun run lectio fetch beskeder2.aspx --asp        # Fetch + inspect ASP.NET fields
bun run lectio asp inspect beskeder2.aspx --targets
bun run lectio asp postback beskeder2.aspx -t 'm$Content$aktelvbtn2' --dump-body
bun run lectio post beskeder2.aspx --asp-target 'm$Content$aktelvbtn2' --form __LASTFOCUS=
bun run lectio keepalive start|stop|status       # Session keepalive daemon
bun run lectio session import --student ID --school ID # Import consented Supabase jar
bun run lectio status                            # Check session
bun run lectio schools --search "soro"           # Search schools
```

All commands support `--json`. Session cookies in `~/.lectio-cli/`.

## Reference Materials
- `tools/lectio-cli/` - CLI for fetching authenticated Lectio pages
- `lectio-scripts/` - Decompiled Lectio source code
- `lectio-html/` - HTML snapshots captured with the CLI tool
- `ARCHITECTURE.md` - Full project documentation
