# BetterLectio

!IMPORTANT: Please update @AGENTS.md and @ARCHITECTURE.md after each big change to reflect changes

**Design skill:** When building big new features that require design, or doing significant UI changes/refactors, use the `frontend-design` skill to generate high-quality, polished interfaces. Always invoke it for new page redesigns, component overhauls, or visual reworks.

@ARHITECTURE.md

Browser extension that modernizes [Lectio](https://www.lectio.dk/), a Danish school management system.

## Tech Stack
- **WXT** - Browser extension framework
- **Preact** - Lightweight React alternative (aliased from React)
- **TypeScript** + **Tailwind CSS**
- **shadcn/ui** + **Radix UI** - UI components

## Key Files

### Entry Points
- `entrypoints/content.tsx` - Main content script, renders custom UI wrapper, injects page-specific components
- `entrypoints/login.content.tsx` - Login page redesign with school selector
- `entrypoints/hide-flash.content.ts` - FOUC prevention + intercepts Lectio CSS into @layer lectio
- `entrypoints/session-block.content.ts` - Blocks session timeout popup

### Components
- `components/AppSidebar.tsx` - Sidebar navigation with collapsible sections; student name/avatar prefer Supabase `name` and `custom_pfp_url`/`lectio_pfp_url` before Lectio DOM data
- `components/FindSkemaPage.tsx` - FindSkema redesign with fuzzy search, starred/recents, person cards, Supabase-backed student avatars, and student search that matches both Lectio names and Supabase preferred names
- `components/ProfilePage.tsx` - Student profile header with tabbed skema/classmates/teachers/hold & grupper/native dokumenter views. Supabase-backed: shows description, instagram, birthday (if `show_birthday`), BL badge. Own-profile inline edit form for description/instagram/show_birthday.
- `lib/instagram.ts` - Shared Instagram helpers that accept `handle`, `@handle`, or pasted Instagram URLs, then normalize storage and format consistent `@handle` display/link values.
- `components/PersonCard.tsx` - Reusable person/entity card with lazy-loaded pictures, navigation context (`from`, `q`, `name`), optional BetterLectio badge, and student name/avatar resolution via Supabase before Lectio fallbacks
- `components/DokumenterPage.tsx` - Documents page redesign with collapsible folder tree sidebar (hold colors from hold-mapping), file list with extension-based type icons and color-coded badges, breadcrumb navigation, client-side search, in-app image/PDF preview overlay, drag-and-drop file upload, create folder, sort by columns. Parses native Lectio DOM via `lib/dokumenter-parser.ts`
- `components/ViewingScheduleHeader.tsx` - Header when viewing another schedule (star/back + expandable "Medlemmer" panel)
- `components/LektierPage.tsx` - Day-grouped homework cards with Supabase-backed done-state sync (same UI, optimistic local toggle, cross-device persistence)
- `components/OpgaverPage.tsx` - Single chronological timeline of all assignments grouped by week, auto-scrolls to current week, compact rows with status indicators (missing/waiting/completed), fravær badges, hold pills, grade badges, ignore-missing toggle on hover, combined elevtimer per week header
- `components/OpgaveDetailSheet.tsx` - Assignment detail side sheet with submission history, comment/file upload, and group-member names/avatars that prefer Supabase student data. Always mounted in `AppSidebar` and listens for the `betterlectio:openOpgaveDetail` custom event so any surface (including the schedule's deadline bricks) can open it without navigation.
- `components/BeskederThreadView.tsx` - Thread view with sender names/avatars preferring Supabase student data, WYSIWYG reply, no-reload reply/attach
- `components/BeskederCompose.tsx` - Card-based compose with custom recipient directory picker (avatars + keyboard navigation), recipient pills, and WYSIWYG editor; student recipients prefer Supabase names/avatars while keeping Lectio names for postbacks. Recipient directory loads from Lectio's own compose caches (`bcteacher/bcstudent/bchold/bcgroup` via `lib/beskeder-recipients-cache.ts`) — AvanceretSkema IDs are not accepted by the recipient form. Every compose postback re-injects `RepliesNotAllowedChkBox` state because ASP.NET checkboxes aren't hidden fields and `parseFormTokens` would otherwise drop it, silently resetting "Skal ikke kunne besvares".
- `components/WysiwygEditor.tsx` - contentEditable editor converting BBCode <-> rich HTML
- `components/BBCodeToolbar.tsx` - Formatting toolbar (bold, italic, underline, link)
- `components/ActivityClassModal.tsx` - Activity detail modal from skema/forside links, rendering lektier, presentation content, øvrigt indhold, and related links in the side sheet. Image-only homework items render as constrained click-to-zoom previews; clicking image previews, link-only homework titles, or any homework link whose extension is an image (`jpg/png/gif/webp/svg/heic/...`) or `pdf` opens the shared `<Lightbox>` overlay instead of navigating to Lectio.
- `components/Lightbox.tsx` - Shared overlay viewer for images and PDFs with darkened backdrop, click-outside / Esc to close, and download/close footer. Exports `LightboxItem`, `extensionFromUrlOrName()`, and `lightboxKindForExtension()` helpers. PDFs are fetched as blobs (`credentials: 'include'`) so Lectio's `Content-Disposition: attachment` doesn't force a download. Uses the `lightbox-fade-in` / `lightbox-scale-in` keyframes from `globals.css`.
- `components/PrivatAftaleDialog.tsx` - Dialog for creating and editing private appointments (Privat aftale) inline. Triggered from schedule toolbar (create) or by clicking a private appointment brick (edit). Fetches ASP.NET form via `lib/privat-aftale.ts`, submits via hidden iframe POST — no page navigation. Fields: title (20 char max), start/end date+time, optional comment. Edit mode adds delete button. Ctrl+Enter to submit.
- `components/ScheduleToolbar.tsx` - Schedule toolbar with week navigation, view mode toggle, calendar link, private appointment dialog trigger, and print menu
- `components/SettingsModal.tsx` - Settings modal (appearance, behavior, sidebar, fag, about)
- `components/ScheduleCountdown.tsx` - Sidebar countdown widget
- `components/ForsideGreeting.tsx` - Time-based greeting, live clock
- `components/ForsideDashboard.tsx` - Redesigned forside dashboard: 4 cards (aktuel info, lektier, opgaver, beskeder) parsed from native DOM, 2-col grid layout with priority indicators, hold colors, urgency bars, relative times, and Supabase-backed student names/avatars in message previews. Any other native dashboard island we don't have a custom version for (e.g. Registreringer) is parsed via `parseGenericIslands()` and rendered through `GenericCard` — same card shell with `CardHeader` and a list of rows preserving the native priority dots, links, and timeCol values. Extras are alternated across the two columns to stay masonry-like.
- `components/ForsideOpgaverCard.tsx` - Forside opgaver card with urgency design (parser reused by ForsideDashboard)
- `components/KaraktererPage.tsx` - Grade report redesign: subject cards with big color-coded grades, teacher notes inline, summary bar, collapsible diploma/protocol/remarks sections, DOM parser
- `components/ModulregnskaberPage.tsx` - Fully custom page (no native equivalent) showing afholdt/planlagt moduler across every hold the student is on. Mounted on `forside.aspx?bl=modulregnskaber` as a safe host URL. Fetches hold list from `studieplan.aspx`, then fans out to `subnav/modulregnskab.aspx?holdelementid=<id>` via `lib/modulregnskab-fetch.ts`. Summary stats (incl. gns. afvigelse) + per-hold card grid with color pill (hold-mapping hue) and **side-by-side dual meters**: `AfholdtMeter` (linear progress with planned overlay + holdnorm tick) and `AfvigelseMeter` (centered bidirectional track, severity-colored marker, fill grows outward from midline; visual range clamped to ±20% while the label shows the real value). Severity pill retains trend icon + signed percentage; expandable lærer breakdown.
- `components/DesignPlayground.tsx` - Design system playground from Settings
- `components/settings/HoldMappingEditor.tsx` - Canonical lesson-key editor for subject names/colors (e.g. `1x MA`/`L2d MA`/`2zq MA`/`S2x MA`/`IB1 MA` -> `ma`)
- `components/MobileAppDrawer.tsx` - Bottom-right floating drawer that pitches the iOS BetterLectio app to eligible students. Visible only when `students.app_eligible=true && app_installed_at is null && app_qr_scanned_at is null && marked_android_at is null && dismissed_app_prompt_at is null`. Collapsed = small `Smartphone` button; expanded = horizontal panel with QR code (via `qrcode` lib) pointing to `https://betterlectio.dk/download/ios?u={studentId}`, plus a single "Jeg er på Android" CTA that writes `marked_android_at`. `app_installed_at` is set server-side when a student logs into the mobile app, and `app_qr_scanned_at` is set when they scan the QR — both hide the surface automatically. Mounted in `entrypoints/content.tsx`'s `DashboardLayout` sibling to `<Toaster />`. Shares helpers with the invite popup via `lib/mobile-app.ts`.
- `components/ReferralShareCard.tsx` - "Inviter klassekammerater" share card mounted in Settings → Inviter. Shows the user's `betterlectio.dk/r/{elevid}` link with copy + native share buttons, plus stats (clicks, conversions) and a list of recent attributed classmates. Stats come from the `get_referral_stats(student_id)` RPC via `lib/supabase/resources/referrals.ts`. Fires `referral share link copied` on copy/share.
- `components/MobileAppInvitePopup.tsx` - Centered "early access" invite dialog for the same eligible students as `MobileAppDrawer` (identical eligibility fields, including `app_qr_scanned_at`). Shown once on page load, then re-prompted **7 days later** if still untouched. Suppressed during quiet hours (02:00–09:00 local), while the student is currently in a class (`getCountdownState` from `ScheduleCountdown` against `getCachedSchedule`/`getTodaySchedule`), and during the **first 24 hours** after `students.extension_installed_at` (so it never competes with the day-0 onboarding popup; cross-device because the timestamp is set on first-ever Supabase auth). Snooze stamp at `bl-mobile-app-invite-last-shown:{studentId}` (per-device). The QR encodes `https://betterlectio.dk/download/ios?u={studentId}` so a real scan stamps `students.app_qr_scanned_at` server-side. Subscribes to a Realtime channel on the `students` row; when `app_qr_scanned_at` flips while the popup is open, the content cross-fades to a "Tak / Thanks for installing" success view (Check icon + halo ripple), then auto-closes after **4 seconds**. A `hasOpenedOnce` lock keeps the popup mounted across the row update so the success animation can play. The success transition fires **at most once per student** (gated on `bl-mobile-app-invite-thanks-shown:{studentId}` via `markInviteThanksShown` in `lib/mobile-app.ts`); subsequent opens keep showing the QR. X / Esc / outside-click also close during the success state (interrupting the auto-close timer). Layered shadows, custom easings, `:active scale(0.97)`, staggered entrance, `text-balance`/`text-pretty` on copy, and `prefers-reduced-motion` support. There is **no** "I'll scan" CTA — only soft close and a single "Jeg er på Android" action that writes `marked_android_at`. Keyframes (`bl-rise`, `bl-qr-in`, `bl-success-pop`, `bl-success-halo`) live in `styles/globals.css`. Mounted as a sibling to `<MobileAppDrawer />` in `DashboardLayout`. Helpers in `lib/mobile-app.ts`.

### Libraries
- `lib/modulregnskab-fetch.ts` - Parses `subnav/modulregnskab.aspx?holdelementid=<id>` into `{holdRow, breakdown}`, fetches student's hold list from `studieplan.aspx`, and `fetchAllModulregnskaber(schoolId)` fans out to all hold in parallel. School-scoped localStorage caches (hold list 6h, modulregnskab 10min). Distinguishes `hold` vs `uden-kreditering` vs `teacher` rows via the `IndentedBlock` wrapper.
- `lib/beskeder-thread-parser.ts` - Thread DOM parser, state detection, signature stripping (parsers accept optional `doc: Document`)
- `lib/iframe-post.ts` - Hidden iframe POST for no-reload ASP.NET postbacks, token extraction, session expiry
- `lib/beskeder-submit.ts` - No-reload message operations (flag, read, delete, folder, search, reply, send, recipients, attach) with serialized mutex
- `lib/bbcode-convert.ts` - BBCode <-> HTML conversion + paste sanitizer
- `lib/opgave-detail.ts` - Fetch/parse ElevAflevering.aspx, submission API, localStorage cache
- `lib/activity-detail.ts` - Fetch/parse aktivitetforside2.aspx with rich lektie content, presentation sections, øvrigt indhold, navigation/form tokens + cache. `parseArticle` detects two special homework shapes: (1) when the heading wraps a single `<a>` it emits `primaryLink` and removes that link from `links` so the renderer can promote the title to a clickable link without duplicating it as a pill; (2) when the body contains a single `<img>` and nothing else of substance, it emits `image` (and pulls the img out of `contentHtml`) so the renderer can show a constrained, click-to-enlarge preview instead of an unbounded raw image.
- `lib/privat-aftale.ts` - Fetch/parse privat_aftale.aspx form, extract ASP.NET tokens, submit create/delete via hidden iframe POST
- `lib/brick-tooltip.ts` - Schedule brick hover tooltip with async-enriched content
- `lib/hold-mapping.ts` - Canonical lesson-key normalization (`1x MA`/`2.4 MA`/`L2d MA`/`2zq MA`/`S2x MA`/`IB1 MA` -> `ma`), shared local mappings, ignored non-academic groups, legacy localStorage migration helpers
- `lib/hold-mapping-sync.ts` - Supabase v2 hydration + upsert/reset sync bridge for canonical lesson mappings and user overrides
- `lib/settings-sync.ts` - Cross-device sync bridge for `bl-feature-settings` (single jsonb blob) and per-school theme (`bl-school-themes-v1`). Hydrates on bootstrap, debounced push (500ms) on every `saveSettings` / `saveThemePreferenceForSchool`, last-writer-wins via `upsert_user_settings(...)` and `upsert_user_school_theme(...)`. Realtime subscription on both tables filtered by `supabase_id=eq.<auth uid>` re-hydrates when another device writes. Hydrate writes are wrapped in `withSyncSuppressed()` so the resulting `saveSettings` doesn't echo back as a push. When hydrate replaces local, `applySettingsSideEffects(prev, next)` re-applies live DOM/event side effects, dispatches `betterlectio:settings-hydrated`, and shows the same Sonner reload toast as `handleSettingChange` for `SETTINGS_REQUIRING_RELOAD`. Unauthorized errors are suppressed from PostHog. Schema lives in `supabase/migrations/20260429_add_user_settings_sync.sql`.
- `lib/dokumenter-parser.ts` - DOM parser for DokumentOversigt.aspx: folder tree (recursive node walking), document grid (desktop/mobile layouts), breadcrumb builder, file category/extension helpers, move target extraction
- `lib/class-name.ts` - Shared class-name helpers for year->grade transforms and matching grade-based class codes with 1-2 alphanumeric suffixes, chained dotted alphanumeric suffixes, and prefixed/suffixless variants (e.g. `1x`, `2hf`, `2zq`, `1.4`, `L2d`, `S2x`, `IB1`, `10.st.kl.2`). Also normalizes Lectio hold identifiers like `t25htxvx_1vx` down to the class portion after the last underscore.
- `lib/findskema-storage.ts` - Starred people, recents, picture cache, canonical schedule URL generation
- `lib/findskema-cache.ts` - Resolves AvanceretSkema cache params (`afdeling` + `subcache`) + shared in-flight/TTL cached dropdown loader
- `lib/findskema-types.ts` - Maps AvanceretSkema IDs (`SC/RO/RE/HE/GE/...`) to filter types
- `lib/fuzzy-search.ts` - Fuzzy search for Danish text
- `lib/profile-cache.ts` - User profile + viewed entity caching with URL/localStorage name fallback
- `lib/userjot.ts` - UserJot widget bootstrap + identify bridge (loads vendored SDK from extension assets)
- `lib/members-fetch.ts` - Fetch/parse `members.aspx` for klasse/holdelement
- `lib/schedule-cache.ts` - Today's schedule cache (45min TTL)
- `lib/opgaver-deadlines-cache.ts` - School-scoped localStorage cache of the parsed `OpgaveEntry[]` list (6h TTL). Populated by `OpgaverPage.tsx` whenever it has fresh data, refreshed in the background by the schedule page on load via `fetchAndCacheOpgaver` (toggles `CurrentExerciseFilterCB`/`ShowThisTermOnlyCB` if filtered). Read by `injectDeadlineBricks()` in `entrypoints/content.tsx` to render assignment deadline bricks at the deadline's exact time on the corresponding `td[data-date]` cell. Only renders on own schedule, only on `skemany.aspx` / `skema1dag.aspx`, and only when `schedule.opgaveDeadlines` is on (default true). Submitted assignments are filtered out; `mangler` past deadlines stay rendered. Click dispatches `betterlectio:openOpgaveDetail`.
- `lib/page-data-cache.ts` - School-scoped page-presence cache for optional sidebar links (books/SPS)
- `lib/posthog.ts` - PostHog analytics singleton (posthog-node edge build), capture/identify/captureException helpers; `getContentDistinctId()` + enriched `$exception` properties
- `lib/lectio-error-popup.ts` - MutationObserver-based detector for Lectio's native `.ls-alertbox`/`[data-title^="Fejl"]` error popups. Extracts title + body, dedupes per DOM element.
- `lib/url-history.ts` - Tiny per-tab (sessionStorage) URL breadcrumb trail used to enrich error reports with recent navigation context.
- `lib/supabase/resources/homework.ts` - Homework queries + `upsert_student_homework_status` RPC bridge for synced completion state
- `lib/supabase/student-lookup.ts` - Shared student lookup/display helpers: `useSchoolStudents(schoolId)` (returns `studentsMap` Map for O(1) lookups), `getStudentIdFromPersonId()`, lookup-ID-based preferred name/avatar resolution, search aliases, and `formatDanishBirthdate()`
- `lib/school-storage.ts` - Last school persistence
- `lib/referral.ts` - Background-side `maybeFinalizeReferral({ studentId, schoolId, accessToken, extensionVersion })` that POSTs to the `referral-finalize` edge function with `credentials: 'include'` so the `bl_ref` cookie set by `referral-click` is sent. Guarded by a per-student localStorage flag (`bl-referral-finalize-attempted:{studentId}`) so it runs once. Called from `runEnsureSupabaseSession` in `entrypoints/background.ts` only when the edge function reported `wasFirstInstall: true`. On success it `tabs.sendMessage`s a `betterlectio:referral-attributed` payload to every Lectio tab; the content script shows a Sonner toast.
- `lib/supabase/resources/referrals.ts` - Wraps `get_referral_stats(student_id)` (security-definer RPC). Used by `ReferralShareCard`. Also exports `buildReferralUrl(studentId)`.
- `lib/mobile-app.ts` - Shared `appStoreUrlFor(studentId)` + `renderAppStoreQrSvg(studentId)` helpers used by both `MobileAppDrawer` and `MobileAppInvitePopup`. The studentId is appended as `?u=` so the public `/download/ios` redirect (in the marketing site) can stamp `students.app_qr_scanned_at` server-side. Also owns the per-student invite snooze in localStorage (`isInviteSnoozed`, `stampInviteShown`, `getInviteSnoozeAt`) — 7-day cooldown.
- `styles/globals.css` - Main styles, Lectio modernizer, page-specific styling

### Build Tools
- `tools/vendor-userjot.mjs` - Downloads UserJot SDK + chunks into `public/vendor/userjot/` for MV3-compliant local loading

### Lectio CLI (`tools/lectio-cli/`)
- `src/lib/aspnet.ts` - ASP.NET WebForms extraction helpers
- `src/commands/asp.ts` - `lectio asp` command (inspect, postback, field)
- `src/lib/keepalive.ts` - Session keepalive daemon
- `src/commands/keepalive.ts` - `lectio keepalive` command

## Analytics (PostHog)

Uses `posthog-node` (edge build via Vite `conditions: ['edge', ...]`) for lightweight server-style event capture that works in both content scripts and MV3 service workers.

**Distinct ID convention:** `lectio:${studentId}` where `studentId` is the raw Lectio `elevid` (globally unique across schools). Never build the ID string manually. **No anonymous tracking** — all PostHog events require an identified user. Pre-login pages (login) do not send analytics. `lib/posthog.ts` enforces this at egress: `capture`, `identify`, `identifyIfNeeded`, `captureOncePerSessionByKey` / `captureFeatureUsedOncePerSession`, and `captureException` only call the SDK when `isLectioStudentDistinctId(distinctId)` passes (canonical `lectio:` prefix + non-empty trimmed elevid, `[0-9A-Za-z_-]{1,48}`). Invalid ids are dropped silently.

**Identify:** On each page load (content.tsx), `identifyIfNeeded()` sets person properties: `name`, `school_id`, `school_name`, `class_name`, `school_year`, `dark_mode`, `theme_id`, `extension_version`, `lectio_version`. PostHog auto-wraps as `$set`, so never wrap in `$set` yourself. Use `setPersonProperties()` for targeted profile updates after settings/theme changes.

**Background analytics rule:** Never call `identify()` from `entrypoints/background.ts` with partial properties like only `school_id` or `extension_version`. Background events/errors must first resolve a named student row from Supabase; if `students.name` is missing, skip the PostHog event rather than creating a nameless person.

**Events:**
- `extension loaded` (content.tsx) — DAU, school, page. Props: `school_id`, `page`, `extension_version`
- `extension installed` / `extension updated` — queued in background on lifecycle changes, emitted once the extension has an identified user
- `supabase auth succeeded/failed` (background.ts) — Supabase auth tracking. Include `source` (`bootstrap`, `hold-mapping-sync`, etc.) when adding new auth callsites so first-attempt failures can be traced back to the caller. Success/failure events should also preserve `auth_stage` and `auth_server_school_id` when the edge function provides them.
- `setting changed` / `theme changed` — settings + theme instrumentation
- `betterlectio profile updated` — own BetterLectio profile edits (`description`, `instagram`, `show_birthday`)
- `feature used` — once-per-session feature telemetry (`findskema`, `forside_dashboard`, `lektier_page`, `homework_toggle`, `beskeder_*`, `hold_mapping_editor`, `mobile_app_invite_shown`, etc.)
- `mobile_app_invite_shown` — fires once per session when the iOS app invite popup actually opens. Props: `school_id`, `trigger` (`first_time` | `re_prompt`).
- `mobile_app_invite_dismissed` — soft snooze (close / outside-click / Esc on the invite popup). Re-prompts after 7 days.
- `mobile_app_invite_success_shown` — fires when the popup transitions to its "Tak for installation" success view because Realtime saw `app_qr_scanned_at` flip while open. Props: `school_id`.
- `mobile_app_invite_opened_from_drawer` — drawer's "Læs mere" button opened the full invite popup. Props: `school_id`.
- `mobile_app_marked_android` — extended to include `source: 'invite_popup' | 'tab'`. Writes `marked_android_at`, hiding both surfaces permanently.
- `lectio session lost` — passive logout detection when an identified user is unexpectedly sent back to `login.aspx` or another school page without the normal authenticated shell, excluding recent explicit logout clicks
- `lectio native error` — Lectio's native error popup fired on the current page. Usually indicates the extension broke a postback/form. Props: `error_title`, `error_body`, `dialog_html`, `recent_urls`, `previous_url`, `school_id`, `page`, `trigger_path`, `referrer`. Also fires a paired `captureException`. The user sees a Sonner `toast.info` confirming the error was reported.
- `betterlectio bypass engaged` — user pressed the sidebar "vis original Lectio" escape hatch (`EyeOff` icon next to the theme switcher). Strong signal that a redesign is broken on the current page. Rich props: `trigger`, identity (`school_id`, `school_name`, `student_id`, `class_name`, `school_year`, `user_name`), page context (`page`, `document_title`, `referrer`, `recent_urls`, `previous_url`, `time_on_page_s`, `lectio_version`), settings (`dark_mode`, `theme_id`), display (`viewport_width`, `viewport_height`, `scroll_y`, `device_pixel_ratio`), and any visible Lectio native error popup at click time. Always fires a paired `captureException` with `source: 'bypass_button'` so it also surfaces in Error Tracking. Flushed synchronously before the reload (1500ms cap). Implemented in `lib/bypass-analytics.ts`; flag + one-shot bypass in `lib/bypass-redesigns.ts`, wired into `entrypoints/hide-flash.content.ts` + `entrypoints/content.tsx`.
- `settings synced from cloud` — fires when `hydrateSettingsFromSupabase` replaces local settings with a newer remote row. Props: `school_id`, `required_reload`.
- `settings sync failed` — fires on terminal sync errors that aren't auth-ownership noise. Props: `school_id`, `phase` (`push` | `push-theme`), `error_message`.
- `referral link clicked` — server-side from the `referral-click` edge function. Distinct id is the *referrer's* `lectio:{elevid}`. Props: `country`, `referer_host`, `has_referer`, `school_id`. Each click also inserts a row in `referral_clicks`.
- `referral link clicked invalid` — server-side, same as above when the referenced elevid doesn't match a known student (stale link, typo). Props: `reason`.
- `referral attributed` — server-side from `referral-finalize`. Distinct id is the *invitee's* `lectio:{elevid}`. Fires once per attribution. Props: `referrer_student_id`, `click_age_seconds`, `school_id`, `extension_version`, `country`. Also writes `students.referred_by` + `students.referred_at` + `students.referral_click_id` and stamps `referral_clicks.converted_at`.
- `referral attribution rejected` — server-side. Fires when finalize finds a click but won't attribute. Props: `reason` (`self_referral` | `already_referred` | `returning_user` | `expired`), `referrer_student_id`. Click row gets `rejection_reason` + `expired_at` set.
- `referral share link copied` — client-side from the Settings → Inviter card. Props: `method` (`copy` | `native_share`).
- `captureException` — sent via posthog-node `$exception` pipeline. In content scripts, `distinctId` can be omitted: `getContentDistinctId()` resolves from `__IL_CACHED_PROFILE__` / `getCachedProfile()` so library catches still attribute (still no anonymous). Each exception merges the same auto props as `capture()` plus `recent_urls`, `referrer`, `student_id`, `class_name`, and `runtime` (`content-script` vs `service-worker`). Global handlers tag `source` (`window.error`, `unhandledrejection`, `console.error` — throttled), `background`, `background-unhandledrejection`. Rate limit: 25/page in the content script.

**Adding new events:** Be conservative — we're on PostHog's free tier. Import helpers from `@/lib/posthog`. Only capture events when you have an identified user. Prefer `captureFeatureUsedOncePerSession()` for feature-adoption telemetry and `identifyIfNeeded()` / `setPersonProperties()` for person updates. All calls are try/catch wrapped.

**Auto properties:** Every `capture()` call includes `$browser`, `$os`, `$screen_height`, `$screen_width`, `$current_url`, `$pathname`, `extension_version`. `captureException()` merges the same set in page contexts (service worker sends `extension_version`, `runtime`, and `$os` as user agent).

**Config:** `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` env vars. Host permission for `https://eu.i.posthog.com/*` in manifest.

**Uninstall tracking:** `entrypoints/background.ts` calls `browser.runtime.setUninstallURL('https://betterlectio.dk/uninstall?u={studentId}')` whenever it resolves a student identity (in `getAnalyticsIdentity`, after a successful Supabase student lookup). Cleared on `SIGNED_OUT` so a re-auth as a different student overwrites the URL. The `?u=` student id is the raw Lectio elevid. The `/uninstall` page (Next.js, in `website/app/uninstall/`) stamps `students.extension_uninstalled_at` (first-uninstall only — `is null` guard) server-side, then renders a feedback form. Reason chips + freeform textarea persist via the `submitUninstallFeedback` server action to `students.extension_uninstall_reason` / `extension_uninstall_feedback`. Page emits PostHog `uninstall page viewed` on mount and `uninstall reason submitted` on submit (browser-side via `posthog-js`). Schema lives in `supabase/migrations/20260427_add_students_uninstall_tracking.sql`.

## Supabase Auth & Storage

**Edge function:** `supabase/functions/verify-lectio-auth/index.ts` handles QR-code-based auth. Flow: QR login → extract session cookies → fetch student profile from `digitaltStudiekort.aspx` plus `SkemaNy.aspx` (with short retries for `elevid` propagation) → generate magic link → upload profile picture to storage → upsert student record.

**Background auth dedupe:** `entrypoints/background.ts` is the single coordinator for Supabase auth. Startup auth should originate from `entrypoints/content.tsx`; feature code should only call `ensureSupabaseSession(...)` as a fallback when auth is still missing. The background script dedupes concurrent auth attempts per `schoolId:userId` so multiple content-script callers do not burn the same one-time magic-link token and produce false `Email link is invalid or has expired` failures.

**Session ownership validation:** `ensureSupabaseSession(schoolId, source, studentId?)` accepts the current page's raw Lectio `elevid` as `studentId`. When provided, the background validates that any existing session actually owns that specific student (`students.id = elevid AND supabase_id = auth.uid()`) before accepting it. Stale sessions left over from a previously logged-in Lectio user are signed out and a fresh QR reauth is triggered. Always pass `studentId` from callers that are about to write student-scoped RPCs (e.g. `upsert_user_lesson_override_v2`, `upsert_student_homework_status`) so we don't end up calling security-definer RPCs that raise `'Unauthorized'` server-side. The content-script bootstrap and `hold-mapping-sync.ts` already do this.

**Unauthorized RPC recovery:** Our security-definer RPCs raise `'Unauthorized'` when the session doesn't own the `(student_id, school_id)` tuple. The content-script `sendRpc` in `lib/supabase/client.ts` detects this, calls `forceReauthenticate()` from `lib/supabase/session.ts` (which signs out + re-runs the full QR flow), and retries the RPC once. `forceReauthenticate` is deduped per `schoolId:studentId` and has a 60s failure cooldown, so a burst of mutations triggers at most one reauth per page. Unauthorized errors from these RPCs are intentionally suppressed from PostHog in both the background (`captureSupabaseError`) and `lib/hold-mapping-sync.ts` — they represent an expected auth-transition state, not a code bug.

**Auth UID:** The edge function sets `supabase_id` on the `students` table from `data.user.id` returned by `generateLink()`. This links the Lectio student ID to the Supabase auth user.

**Profile picture storage:** Profile pictures are downloaded from Lectio (using session cookies) and uploaded to the `profile-pictures` Supabase Storage bucket at `{schoolId}/{userId}.{ext}`. The public URL is stored in `students.custom_pfp_url`. The original Lectio URL is kept in `students.lectio_pfp_url` as a reference. The bucket is public with allowed mime types (jpeg, png, webp, gif) and 5MB limit.

**Student identity rendering rule:** When a UI surface can identify a student (`students.id`, raw `elevid`, or a lookup/context-card ID like `S727...`), prefer `students.name` for display, then keep Lectio names as aliases/search terms. For pictures, prefer `students.custom_pfp_url`, then `students.lectio_pfp_url`, and only then fall back to Lectio/context-card image fetching. This is the expected behavior for FindSkema cards/search, members, Beskeder names/avatars, assignment group members, and the sidebar profile avatar.

**Deploy:** `bunx supabase functions deploy verify-lectio-auth --no-verify-jwt`

**Lesson mapping sync v2:** Canonical lesson mappings live in Supabase v2 tables `school_lesson_mappings` (school defaults keyed by normalized `canonical_key` like `ma`, `srp`, `kt`) and `user_lesson_overrides` (per-student display/color/icon overrides). Migration: `supabase/migrations/20260324_add_lesson_mapping_v2.sql`. Mobile migration notes in `docs/mobile-lesson-mapping-migration.md`.

**Homework completion sync:** Lektier completion persists per student in Supabase via `student_homework`, keyed from Lectio activity `entry_id`/`absid`. Same checkbox UI, but completion is synced cross-device with optimistic local state and RPC writes through `upsert_student_homework_status(...)`. Schema/RLS: `supabase/migrations/20260324_add_homework_completion_sync.sql` + FK index migration `supabase/migrations/20260324_add_student_homework_homework_idx.sql`.

**Referral system:** Classmates share `https://betterlectio.dk/r/{referrer_elevid}`. The link 302s through `website/app/r/[elevid]/route.ts` to the `referral-click` Supabase edge function, which inserts a `referral_clicks` row, sets a 180-day `bl_ref` cookie on the `*.supabase.co` domain (`SameSite=None; Secure; HttpOnly`), and 302s on to `betterlectio.dk/download?ref=1` (the `?ref=1` triggers a banner). After QR-auth, when `verify-lectio-auth` reports `wasFirstInstall: true` (the request that just stamped `extension_installed_at`), `entrypoints/background.ts` POSTs to `referral-finalize` with `credentials: 'include'`. That function reads the cookie, validates eligibility (no self-referral, no existing `referred_by`, freshly-installed within 7d, click ≤ 180d), stamps `students.referred_by` + `students.referred_at` + `students.referral_click_id`, marks the click row converted, clears the cookie, and returns the referrer's name so the content script can show a Sonner toast. Attempts are deduped by localStorage flag `bl-referral-finalize-attempted:{studentId}` so we never re-call. Eligible students see a share card with stats in **Settings → Inviter**, backed by the `get_referral_stats(student_id)` RPC. Schema lives in `supabase/migrations/20260430_add_referral_tracking.sql`. Admin dashboard: `admin/app/(dashboard)/referrals/page.tsx`.

## Internationalization (i18n)

Custom lightweight i18n for BetterLectio's injected UI only. **Lectio's native DOM stays in Danish.**

- **Supported locales:** `da` (default), `en`. Defined in `lib/i18n/locales.ts` — adding a new locale = create `lib/i18n/dictionaries/<code>.ts` (must `satisfies DaDictionary`) and append to `SUPPORTED_LOCALES`.
- **Source of truth:** `lib/i18n/dictionaries/da.ts`. `DaDictionary` is the `WidenLeaves<typeof da>` type, so every other locale is forced at compile time to match the same nested key structure.
- **API:**
  - `useTranslation()` hook → `{ locale, t }` for components.
  - `t(key, vars?)` (non-hook, from `@/lib/i18n`) for module-scope code; reads the current locale.
  - `setLocale(code)` persists + dispatches `betterlectio:locale-changed`; the `<I18nProvider>` listener triggers re-render across all Preact roots.
  - `getLocale()` returns the resolved locale (lazy: stored setting → `navigator.language` base code → `da`).
- **Provider mounting:** `lib/i18n/render.tsx` exports a drop-in replacement for `preact`'s `render` that wraps every root in `<I18nProvider>`. Both content entrypoints import `render` from `@/lib/i18n/render` instead of `preact`. Each injected page mounts its own Preact root, and Context does not cross roots — always render through this helper.
- **Key path & types:** `t('settings.appearance.language')` is fully typed via `Path<DaDictionary>`. Missing keys → TS error in other locales. Missing key at runtime → fall back to default-locale string, then to the raw key. `import.meta.env.DEV` also `console.warn`s.
- **Interpolation:** `t('greeting', { name: 'Jonathan' })` substitutes `{name}` placeholders. No pluralization/ICU.
- **Settings:** `interface.language` lives in `lib/settings-storage.ts` under the new `interface` category. The Settings modal Appearance section has the picker; `handleSettingChange` calls `setLocale(value)` for live re-render and pushes the value to PostHog. `language` is also added to `identifyIfNeeded` person properties on every page load.
- **Bundling:** all locale dictionaries are eagerly bundled via static `import` (MV3 content scripts can't dynamic-`import()` post-build).

## Architecture
Content scripts inject a custom Preact UI that wraps the original Lectio DOM. The original DOM is **moved** (not cloned) to preserve event handlers and functionality.

## CSS Cascade Layers
Lectio's CSS is intercepted at `document_start` by `hide-flash.content.ts` and wrapped in `@layer lectio { }`. This puts ALL of Lectio's styles into the lowest-priority CSS cascade layer, so our extension's styles automatically win without needing `!important`.

**Layer order** (lowest -> highest priority): `lectio < theme < base < components < utilities`

When adding new CSS overrides for Lectio elements, put them in `@layer components { }` in `globals.css` — they'll automatically beat Lectio's styles. Only use `!important` when overriding **inline styles** (e.g., Lectio's JS-set `style="width:..."` on schedule bricks) or `display: none/block` for element hiding (defense against Lectio JS toggling).

**Content isolation:** `#il-original-content :where(*) { all: revert-layer }` in `@layer base` prevents Tailwind's preflight from breaking Lectio's native DOM. Elements inside `#il-original-content` get Lectio's CSS; everything else (sidebar, injected pages) gets Tailwind's base. If you insert custom UI into `#il-lectio-content` (outside `#il-original-content`), Tailwind works normally.

## Styling Rule (Tailwind-First)

All custom/injected Preact UI should be styled with Tailwind utility classes directly in `.tsx` components.

- Profile pictures / avatars must use `object-top` (not default `object-center`) so the top of the head is always visible instead of being cropped off in small circular thumbnails.
- Do not add new component-specific plain CSS blocks for custom UI.
- Prefer semantic token utilities (`bg-background`, `text-foreground`, `bg-primary`, `border-border`, `ring-ring`) so theme switching propagates automatically.
- Keep `globals.css` for platform-level concerns only:
  - token definitions/overrides (`:root`, `.dark`, `data-il-theme`)
  - layer/base plumbing
  - native Lectio overrides and isolation (`#il-original-content`, `.ls-*`, `.s2*`)

### Typography / hierarchy (injected UI)

Use Tailwind step utilities (`text-xs`, `text-sm`, `text-base`, …) plus weight and color—not one-off `text-[11px]` for the same role. Hierarchy:

- **Page or card title** — `text-base font-semibold` (or existing card title pattern).
- **Primary line in a list row** — `text-sm font-medium text-foreground`.
- **Secondary / description** — `text-sm text-muted-foreground` (same size as primary; mute for hierarchy).
- **Meta** — `text-xs text-muted-foreground` (timestamps, “kl.” lines, tight table headers).
- **Section chrome** — `text-xs font-semibold uppercase tracking-wide text-muted-foreground` (strip labels like “LEKTER”).
- **Badges / pills / counts / initials in tiny circles** — `text-xs` or smaller only where the control is physically small.

## Color System — OKLCH Only

**All colors MUST use `oklch()`.** Never use `hsl()`, `rgb()`, `rgba()`, or hex (`#rrggbb`) anywhere in the codebase.

- **CSS variables** in `:root` / `.dark` are all `oklch(L C H)` values
- **Primary color**: Indigo-blue at hue 265 — `oklch(0.54 0.2 265)` (light) / `oklch(0.65 0.16 265)` (dark)
- **Light mode neutrals**: Subtly tinted with hue 265 for a cohesive blue undertone
- **Dark mode neutrals**: Near-achromatic (chroma <= 0.006) with warm hue 285 (mauve-gray). NOT blue-tinted. Surfaces should read as true charcoal/ink, never navy.
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

**FindSkema dropdown cache key:** Do not assume `subcache` equals current calendar year. Read both `afdeling` and `subcache` from Lectio's `AvanceretSkema_<afdeling>_<subcache>` dataset key (from page scripts or `FindSkemaAdv.aspx`) before calling `cache/DropDown.aspx?type=AvanceretSkema...`.

**Cross-school cache safety:** All caches that include identity/form state must be scoped by `schoolId` (and never reused globally across schools). This includes name-id lookup, schedule/page-data caches, activity detail cache, assignment detail cache, and profile cache.

**Beskeder safety:** For non-idempotent iframe-post actions (send/reply/delete), do not auto-fallback to native postback on uncertain/parse errors — this can duplicate side effects. Show a refresh/retry prompt instead.

**Beskeder recipient picker cache:** The compose recipient autocomplete is backed by Lectio's `bcteacher/bcstudent/bchold/bcgroup` DropDown caches, NOT `AvanceretSkema`. Their IDs are what the `addRecipientDD` form accepts; AvanceretSkema's `HE*/GE*` (and other) IDs silently fail validation server-side. Use `fetchBeskederRecipientItems` from `lib/beskeder-recipients-cache.ts`, which harvests the exact `registerDataSetUrl(...)` URLs from the compose page's inline scripts.

**Beskeder no-reply checkbox:** `RepliesNotAllowedChkBox` ("Skal ikke kunne besvares") is a visible `<input type="checkbox">`, so `parseFormTokens` (hidden-inputs only) never includes it in `formState.tokens`. ASP.NET also only POSTs a checkbox when checked. Every compose postback must therefore re-inject `{ [noReplyCheckboxName]: 'on' }` when the DOM checkbox is checked — otherwise the server resets it to unchecked on every postback. `BeskederCompose.tsx` centralizes this via `formStateWithNoReply(state)`.

**Beskeder recipient GridView links:** In `ThreadRecipientsGV`, Lectio renders delete links as `<a href="#" onclick="javascript:__doPostBack(...)">`, not `href="javascript:__doPostBack(...)"`. When parsing recipient remove targets, always check the `onclick` attribute first (then `href` as a fallback) — `a[href*="__doPostBack"]` will never match this table. The same pattern applies to `AttachmentsGV` (attached-file delete buttons) — `parseAttachmentsFromDoc` must read `onclick` first or freshly-attached files silently fail to render in the compose/reply UI.

**FindSkema type mapping:** Do not assume `K*` means classes or `L*` means rooms. Real AvanceretSkema IDs use `SC*` for stamklasser, `RO*` for lokaler, `RE*` for ressourcer, `HE*` for hold, `GE*` for grupper. Always map by actual ID prefixes.

**Class name parsing:** Do not assume grade-based class codes always end in a single letter (`1x`, `2a`). Support 1-2 alphanumeric suffixes after the grade like `2hf` or `2zq`, dotted numeric suffixes like `1.4` / `2.4`, chained dotted alphanumeric suffixes like `10.st.kl.2`, letter-prefixed variants like `L2d` or `S2x`, and suffixless prefixed variants like `IB1`. When a value contains an underscore (Lectio hold identifiers like `t25htxvx_1vx`), `normalizeClassCode` peels it down to the class portion after the last `_` when that tail is itself a valid class code. Reuse `lib/class-name.ts` so year-based dropdown names and student class codes stay comparable across all formats.

**Lectio Modernizer:** The "Lectio Modernizer" section in `globals.css` restyles native Lectio elements with modern design. Add new overrides to this section under `@layer components`. Key targets: `table.lf-grid`, `.buttonfilled`/`.buttonoutlined`/`.buttonfilledtonal`, `input`/`select`/`textarea`, `.s2skemabrik`, `.lf-island`.

**MV3 remote-code compliance:** Do not execute third-party JS directly from CDNs at runtime. UserJot must be loaded from vendored local assets (`public/vendor/userjot/**`) generated by `npm run vendor:userjot`.

## Commands
```bash
bun run dev          # Development (Chrome)
bun run dev:firefox  # Development (Firefox)
bun run build        # Production build
bun run zip          # Package extension
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
bun run lectio status                            # Check session
bun run lectio schools --search "soro"           # Search schools
```

All commands support `--json`. Session cookies in `~/.lectio-cli/` (outside repo).

## Reference Materials
- `tools/lectio-cli/` - CLI for fetching authenticated Lectio pages
- `lectio-scripts/` - Decompiled Lectio source code
- `lectio-html/` - HTML snapshots captured with the CLI tool
- `ARCHITECTURE.md` - Full project documentation
