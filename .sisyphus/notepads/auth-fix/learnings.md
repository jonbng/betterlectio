# Auth Fix — Learnings

## Project Conventions
- Content scripts use `defineContentScript()` from WXT
- WXT auto-discovers entrypoints by filename in `entrypoints/`
- Settings stored in localStorage under `il-feature-settings` key
- Danish text used for UI labels
- `[BetterLectio]` prefix for console.log messages
- Firefox compat: fetch() MUST use absolute URLs via `new URL(..., window.location.origin).href`
- Only permission is `storage` — NO new permissions allowed

## Lectio Session Mechanics
- SessionHelper constructor writes 3 cookies: `isloggedin3=Y`, `BaseSchoolUrl`, `LastAuthenticatedPageLoad2`
- `TimerSessionCheck()` runs every 2s, checks `isloggedin3` cookie
- Warning dialog at ~50min idle: text "Din session udløber snart"
- Timeout dialog at ~60min idle: text "Din session er udløbet"
- jQuery UI wraps dialogs in `.ui-dialog` elements
- "Forlæng session" button calls GET `/lectio/{schoolId}/ping.aspx`
