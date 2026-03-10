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

### Entry Points
- `entrypoints/content.tsx` - Main content script, renders custom UI wrapper, injects page-specific components
- `entrypoints/login.content.tsx` - Login page redesign with school selector
- `entrypoints/hide-flash.content.ts` - FOUC prevention + intercepts Lectio CSS into @layer lectio
- `entrypoints/session-block.content.ts` - Blocks session timeout popup

### Components
- `components/AppSidebar.tsx` - Sidebar navigation with collapsible sections
- `components/FindSkemaPage.tsx` - FindSkema redesign with fuzzy search, starred/recents, person cards
- `components/PersonCard.tsx` - Reusable person/entity card with lazy-loaded pictures, navigation context (`from`, `q`, `name`)
- `components/ViewingScheduleHeader.tsx` - Header when viewing another schedule (star/back + expandable "Medlemmer" panel)
- `components/LektierPage.tsx` - Day-grouped homework cards
- `components/OpgaverPage.tsx` - Urgency-first assignment cards, relative Danish deadlines, color-coded grades
- `components/OpgaveDetailSheet.tsx` - Assignment detail side sheet with submission history, comment/file upload
- `components/BeskederThreadView.tsx` - Thread view with sender avatars, WYSIWYG reply, no-reload reply/attach
- `components/BeskederCompose.tsx` - Card-based compose with custom recipient directory picker (avatars + keyboard navigation), recipient pills, and WYSIWYG editor
- `components/WysiwygEditor.tsx` - contentEditable editor converting BBCode <-> rich HTML
- `components/BBCodeToolbar.tsx` - Formatting toolbar (bold, italic, underline, link)
- `components/ActivityClassModal.tsx` - Activity detail modal from skema/forside links
- `components/SettingsModal.tsx` - Settings modal (appearance, behavior, sidebar, fag, about)
- `components/ScheduleCountdown.tsx` - Sidebar countdown widget
- `components/ForsideGreeting.tsx` - Time-based greeting, live clock
- `components/ForsideOpgaverCard.tsx` - Forside opgaver card with urgency design
- `components/DesignPlayground.tsx` - Design system playground from Settings
- `components/settings/HoldMappingEditor.tsx` - Subject names/colors + hold exceptions UI

### Libraries
- `lib/beskeder-thread-parser.ts` - Thread DOM parser, state detection, signature stripping (parsers accept optional `doc: Document`)
- `lib/iframe-post.ts` - Hidden iframe POST for no-reload ASP.NET postbacks, token extraction, session expiry
- `lib/beskeder-submit.ts` - No-reload message operations (flag, read, delete, folder, search, reply, send, recipients, attach) with serialized mutex
- `lib/bbcode-convert.ts` - BBCode <-> HTML conversion + paste sanitizer
- `lib/opgave-detail.ts` - Fetch/parse ElevAflevering.aspx, submission API, localStorage cache
- `lib/activity-detail.ts` - Fetch/parse aktivitetforside2.aspx with rich lektie content + cache
- `lib/brick-tooltip.ts` - Schedule brick hover tooltip with async-enriched content
- `lib/hold-mapping.ts` - Shared subject mappings, per-hold exceptions, ignored non-academic groups, fresh-start resets
- `lib/findskema-storage.ts` - Starred people, recents, picture cache, canonical schedule URL generation
- `lib/findskema-cache.ts` - Resolves AvanceretSkema cache params (`afdeling` + `subcache`) + shared in-flight/TTL cached dropdown loader
- `lib/findskema-types.ts` - Maps AvanceretSkema IDs (`SC/RO/RE/HE/GE/...`) to filter types
- `lib/fuzzy-search.ts` - Fuzzy search for Danish text
- `lib/profile-cache.ts` - User profile + viewed entity caching with URL/localStorage name fallback
- `lib/userjot.ts` - UserJot widget bootstrap + identify bridge (loads vendored SDK from extension assets)
- `lib/members-fetch.ts` - Fetch/parse `members.aspx` for klasse/holdelement
- `lib/schedule-cache.ts` - Today's schedule cache (45min TTL)
- `lib/page-data-cache.ts` - School-scoped page-presence cache for optional sidebar links (books/SPS)
- `lib/school-storage.ts` - Last school persistence
- `styles/globals.css` - Main styles, Lectio modernizer, page-specific styling

### Build Tools
- `tools/vendor-userjot.mjs` - Downloads UserJot SDK + chunks into `public/vendor/userjot/` for MV3-compliant local loading

### Lectio CLI (`tools/lectio-cli/`)
- `src/lib/aspnet.ts` - ASP.NET WebForms extraction helpers
- `src/commands/asp.ts` - `lectio asp` command (inspect, postback, field)
- `src/lib/keepalive.ts` - Session keepalive daemon
- `src/commands/keepalive.ts` - `lectio keepalive` command

## Architecture
Content scripts inject a custom Preact UI that wraps the original Lectio DOM. The original DOM is **moved** (not cloned) to preserve event handlers and functionality.

## CSS Cascade Layers
Lectio's CSS is intercepted at `document_start` by `hide-flash.content.ts` and wrapped in `@layer lectio { }`. This puts ALL of Lectio's styles into the lowest-priority CSS cascade layer, so our extension's styles automatically win without needing `!important`.

**Layer order** (lowest -> highest priority): `lectio < theme < base < components < utilities`

When adding new CSS overrides for Lectio elements, put them in `@layer components { }` in `globals.css` — they'll automatically beat Lectio's styles. Only use `!important` when overriding **inline styles** (e.g., Lectio's JS-set `style="width:..."` on schedule bricks) or `display: none/block` for element hiding (defense against Lectio JS toggling).

**Content isolation:** `#il-original-content :where(*) { all: revert-layer }` in `@layer base` prevents Tailwind's preflight from breaking Lectio's native DOM. Elements inside `#il-original-content` get Lectio's CSS; everything else (sidebar, injected pages) gets Tailwind's base. If you insert custom UI into `#il-lectio-content` (outside `#il-original-content`), Tailwind works normally.

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

**FindSkema type mapping:** Do not assume `K*` means classes or `L*` means rooms. Real AvanceretSkema IDs use `SC*` for stamklasser, `RO*` for lokaler, `RE*` for ressourcer, `HE*` for hold, `GE*` for grupper. Always map by actual ID prefixes.

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
