# Fix Auth Handling — Stop Extension From Logging Users Out

## TL;DR

> **Quick Summary**: The extension's `session-block.content.ts` completely destroys Lectio's `SessionHelper`, which kills critical auth cookies (`isloggedin3`, `LastAuthenticatedPageLoad2`, `BaseSchoolUrl`) and session renewal. This causes other tabs to detect "not logged in" and redirect to logout. Fix: let SessionHelper run normally, suppress only the popup UI, and add proactive session renewal via `/ping.aspx`.
> 
> **Deliverables**:
> - Rewritten `session-block.content.ts` → `session-renew.content.ts` (transparent popup suppression + proactive renewal)
> - Fixed `login.content.tsx` (lightweight session check, no aggressive state clearing)
> - Fixed `content.tsx` login detection (graceful handling of login.aspx redirect)
> - Updated settings UI to reflect new behavior
> - Smart login redirect (nice-to-have)
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → Final Verification

---

## Context

### Original Request
Users report getting logged out much more frequently when the BetterLectio extension is enabled. The extension should stop interfering with Lectio's authentication while still providing a clean UX (no annoying session popups). Nice-to-have: smart login redirect if already authenticated.

### Investigation Summary
**Key Findings**:
- **PRIMARY CULPRIT**: `entrypoints/session-block.content.ts` uses `Object.defineProperty(window, "SessionHelper", ...)` to replace SessionHelper with a no-op. This kills 3 critical things:
  1. `isloggedin3` cookie never written → other tabs' SessionHelper checks this every 2s and redirects to `/default.aspx` if not "Y"
  2. `LastAuthenticatedPageLoad2` cookie never updated → idle timer baseline lost
  3. Session renewal popup suppressed with no replacement → server session dies after ~60min idle
- **SECONDARY**: `login.content.tsx` fires a full GET to `skemany.aspx` for session verification — heavy, and calls `clearLoginState()` aggressively on redirect detection
- **SECONDARY**: Multi-tab cookie race conditions — all tabs nuke SessionHelper, so no tab writes auth cookies
- **LOW**: Sidebar cookie (`sidebar_state`) written to Lectio domain — benign, not fixing
- **PRE-EXISTING**: `docs/session-renewal-alternative.md` already documents the proactive renewal approach

### Lectio Session Mechanics (from decompiled `lectio-scripts/SessionHelper.ts`)
- Constructor calls `SetIsLoggedIn(true)` → writes `isloggedin3=Y` cookie
- Constructor calls `SetSchoolId(schoolId)` → writes `BaseSchoolUrl` cookie
- Constructor calls `SetLastAuthenticatedPageLoad(new Date())` → writes timestamp cookie
- `TimerSessionCheck()` runs every 2 seconds:
  - If `isloggedin3` ≠ "Y" → redirect to `/default.aspx` (LOGOUT)
  - If `BaseSchoolUrl` changed → redirect to `/default.aspx`
  - If idle > `secondsUntilTimeout` (~60min) → show timeout dialog
  - If idle > `secondsUntilWarning` (~50min) → show warning dialog
- Warning dialog has "Forlæng session" button that calls `GET /lectio/{schoolId}/ping.aspx`
- On successful ping, updates `LastAuthenticatedPageLoad2` cookie

---

## Work Objectives

### Core Objective
Fix the extension so it never interferes with Lectio's authentication flow while still providing a clean, popup-free UX. Sessions should survive indefinitely on active tabs.

### Concrete Deliverables
- New `entrypoints/session-renew.content.ts` replacing `session-block.content.ts`
- Fixed `entrypoints/login.content.tsx` with lightweight session check
- Fixed `entrypoints/content.tsx` login detection
- Updated `lib/settings-storage.ts` setting semantics
- Updated `components/SettingsModal.tsx` UI labels
- Smart login redirect on login page (nice-to-have, bundled in login.content.tsx fix)

### Definition of Done
- [ ] Extension does NOT modify, replace, or intercept `window.SessionHelper` in any way
- [ ] `isloggedin3`, `LastAuthenticatedPageLoad2`, `BaseSchoolUrl` cookies are written by Lectio's own SessionHelper (verified via DevTools)
- [ ] Session timeout popup ("Din session udløber snart") never appears to user
- [ ] Session survives 60+ minutes idle on a focused tab (proactive renewal working)
- [ ] Multi-tab scenario: opening 5+ tabs does not cause any tab to redirect to logout
- [ ] Login page: no full GET to `skemany.aspx`, uses lightweight check instead
- [ ] `bun run build` succeeds with zero errors

### Must Have
- SessionHelper runs completely unmodified — zero interference with Lectio's auth
- Popup suppressed via DOM observation (MutationObserver), not by replacing SessionHelper
- Proactive session renewal via `ping.aspx` before the 50-minute warning threshold
- Firefox compatibility: all `fetch()` calls use absolute URLs (`new URL(..., window.location.origin).href`)
- Settings toggle preserved (user can disable popup suppression + proactive renewal)
- Graceful degradation: if renewal fails, session expires naturally (no crashes, no error dialogs)

### Must NOT Have (Guardrails)
- Must NOT use `Object.defineProperty` to override any Lectio globals
- Must NOT write cookies directly — let Lectio's SessionHelper handle all cookie writes
- Must NOT intercept, modify, or block any Lectio network requests
- Must NOT add new permissions to the extension manifest (no `cookies`, no `webRequest`)
- Must NOT add unnecessary abstractions or wrapper classes — keep it simple like the existing codebase
- Must NOT add JSDoc comments to every function — match existing code style (minimal comments)
- Must NOT touch sidebar cookie behavior (benign, out of scope)
- Must NOT touch `lib/preload.ts` or prefetching (out of scope)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: None (no test framework in project)
- **Framework**: None

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Build verification**: `bun run build` must succeed
- **Code review**: TypeScript strict mode, no `as any`, no `@ts-ignore`
- **Browser testing**: Use Playwright to load extension in Chrome, navigate Lectio pages, verify cookies and behavior
- **Static analysis**: grep for forbidden patterns (`Object.defineProperty.*SessionHelper`, direct cookie writes)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — core rewrite + independent fixes):
├── Task 1: Replace session-block with session-renew (popup suppression + proactive renewal) [deep]
├── Task 2: Fix login.content.tsx session verification [quick]
├── Task 3: Update settings storage + UI labels [quick]

Wave 2 (After Wave 1 — dependent fixes):
├── Task 4: Fix content.tsx login detection behavior [quick]
├── Task 5: Add smart login redirect (nice-to-have) [quick]

Wave 3 (After Wave 2 — verification):
├── Task 6: Build verification + forbidden pattern scan [quick]

Wave FINAL (After ALL tasks — independent review):
├── Task F1: Plan compliance audit [deep]
├── Task F2: Code quality review [quick]
├── Task F3: Forbidden pattern & regression scan [quick]
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1    | —         | 4, 6, F1-F3 |
| 2    | —         | 5, 6, F1-F3 |
| 3    | —         | 6, F1-F3 |
| 4    | 1         | 6, F1-F3 |
| 5    | 2         | 6, F1-F3 |
| 6    | 1, 2, 3, 4, 5 | F1-F3 |
| F1   | 6         | — |
| F2   | 6         | — |
| F3   | 6         | — |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `deep`, T2 → `quick`, T3 → `quick`
- **Wave 2**: 2 tasks — T4 → `quick`, T5 → `quick`
- **Wave 3**: 1 task — T6 → `quick`
- **FINAL**: 3 tasks — F1 → `deep`, F2 → `quick`, F3 → `quick`

---

## TODOs

- [ ] 1. Replace session-block with transparent popup suppression + proactive renewal

  **What to do**:
  - Delete `entrypoints/session-block.content.ts`
  - Create `entrypoints/session-renew.content.ts` with TWO responsibilities:
    1. **Popup suppression** (MAIN world, `document_start`): Use a MutationObserver on `document.body` to detect and immediately remove/hide jQuery UI dialog elements containing "Din session udløber snart" or "Din session er udløbet" text. When the WARNING dialog is detected: hide it, then silently trigger the renewal by calling `GET /lectio/{schoolId}/ping.aspx` (extract schoolId from `BaseSchoolUrl` cookie). When the TIMEOUT dialog is detected: hide it and reload the page silently. This approach lets SessionHelper run completely unmodified — it writes its cookies, runs its timer, and tries to show dialogs. We just intercept the DOM output.
    2. **Proactive renewal** (`document_idle`): Check every 60 seconds and on `visibilitychange`. If tab is visible AND `LastAuthenticatedPageLoad2` cookie shows idle > 45 minutes, proactively call `GET /lectio/{schoolId}/ping.aspx`. Do NOT write cookies ourselves — the MutationObserver approach already handles renewal through SessionHelper's own dialog flow. The proactive renewal is a safety net for the case where the tab is focused but user hasn't interacted.
  - Both parts must check the `sessionPopupBlocker` setting from localStorage (same key `il-feature-settings`, path `behavior.sessionPopupBlocker`) — if disabled, do nothing (let Lectio show its popups normally)
  - The MutationObserver must target dialog elements: watch for `childList` additions to `body`, check if added nodes are `.ui-dialog` elements containing session-related text
  - **Firefox compatibility**: All `fetch()` calls MUST use `new URL("/lectio/{schoolId}/ping.aspx", window.location.origin).href`
  - **CRITICAL**: Do NOT use `Object.defineProperty` on anything. Do NOT modify `window.SessionHelper`. Do NOT write to `document.cookie`.
  - Update `wxt.config.ts` if the content script registration needs to change (the old one was `session-block`, the new file is `session-renew` — WXT auto-discovers entrypoints by filename, so just the file rename handles this)

  **Must NOT do**:
  - Must NOT replace or modify SessionHelper in any way
  - Must NOT write cookies directly (no `document.cookie =`)
  - Must NOT add new extension permissions
  - Must NOT add excessive comments or JSDoc — match existing codebase style
  - Must NOT create wrapper classes or abstractions — keep it a simple content script like the existing codebase

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core auth logic with subtle browser extension timing issues, MutationObserver patterns, and multi-world content script design
  - **Skills**: [`playwright`]
    - `playwright`: Needed for QA scenarios verifying DOM behavior in browser context
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: No UI work, purely behavioral
    - `vercel-react-best-practices`: Not React component work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 6, F1-F3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `entrypoints/session-block.content.ts:1-47` — Current implementation to DELETE. Study its structure: WXT content script with `defineContentScript()`, `MAIN` world, `document_start`, localStorage settings check. New file follows same pattern but different approach.
  - `entrypoints/hide-flash.content.ts` — Example of a simple content script in this project. Match style and complexity level.
  - `docs/session-renewal-alternative.md:24-71` — Pre-existing proactive renewal implementation sketch. Use as starting point for the renewal logic, but add the MutationObserver popup suppression on top.

  **API/Type References** (contracts to implement against):
  - `lectio-scripts/SessionHelper.ts:78-123` — `ShowWarningDialog()` method. This is what creates the jQuery UI dialog we need to suppress. It appends a `<div>` with text "Din session udløber snart" to `body`, then calls `.dialog()` on it. The dialog has a "Forlæng session" button that calls `GET ping.aspx`.
  - `lectio-scripts/SessionHelper.ts:125-153` — `ShowTimeoutDialog()` method. Creates dialog with "Din session er udløbet" text. On close/click, reloads page.
  - `lectio-scripts/SessionHelper.ts:162-226` — `TimerSessionCheck()` runs every 2s. Shows warning at `_secondsUntilWarning` (~3000s = 50min), timeout at `_secondsUntilTimeout` (~3600s = 60min). We DON'T touch this — we just hide its DOM output.
  - `lectio-scripts/SessionHelper.ts:237-261` — Constructor. Writes `isloggedin3`, `BaseSchoolUrl`, `LastAuthenticatedPageLoad2` cookies. We MUST let this run.

  **External References**:
  - MutationObserver API: Standard DOM API for watching child additions to body

  **WHY Each Reference Matters**:
  - `session-block.content.ts` — Shows the exact WXT content script structure we need to match. Also shows what to DELETE.
  - `docs/session-renewal-alternative.md` — Contains the proactive renewal logic (cookie reading, ping timing, fetch pattern). Copy and adapt the `shouldRenew()` and `renewSession()` functions but remove the `document.cookie =` line (we must NOT write cookies).
  - `SessionHelper.ts:78-153` — Understanding the exact DOM structure of dialogs is critical for the MutationObserver to detect them. The warning dialog contains `<h3>Din session udløber snart.</h3>` and the timeout dialog contains `<h3>Din session er udløbet.</h3>`. jQuery UI wraps these in `.ui-dialog` elements.
  - `SessionHelper.ts:237-261` — Proves that the constructor writes all critical cookies. This is why we MUST let it run.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Forbidden patterns absent from new file
    Tool: Bash (grep)
    Preconditions: Task 1 complete, file saved
    Steps:
      1. Run: grep -n "Object.defineProperty" entrypoints/session-renew.content.ts
      2. Run: grep -n "document.cookie\s*=" entrypoints/session-renew.content.ts
      3. Run: grep -n "window.SessionHelper" entrypoints/session-renew.content.ts (excluding comments)
    Expected Result: All three greps return zero results
    Failure Indicators: Any match found
    Evidence: .sisyphus/evidence/task-1-forbidden-patterns.txt

  Scenario: Old session-block file is deleted
    Tool: Bash (ls)
    Preconditions: Task 1 complete
    Steps:
      1. Run: ls entrypoints/session-block.content.ts 2>&1
    Expected Result: "No such file or directory"
    Failure Indicators: File still exists
    Evidence: .sisyphus/evidence/task-1-old-file-deleted.txt

  Scenario: New file uses absolute URLs for fetch (Firefox compat)
    Tool: Bash (grep)
    Preconditions: Task 1 complete
    Steps:
      1. Run: grep -n "fetch(" entrypoints/session-renew.content.ts
      2. Verify each fetch call uses `new URL(...)` or template literal with `window.location.origin`
      3. Run: grep -n 'fetch("/' entrypoints/session-renew.content.ts (relative URL pattern)
    Expected Result: Step 3 returns zero results (no relative URLs in fetch)
    Failure Indicators: Any fetch with relative URL
    Evidence: .sisyphus/evidence/task-1-absolute-urls.txt

  Scenario: Settings check works (feature disabled = no-op)
    Tool: Bash (grep)
    Preconditions: Task 1 complete
    Steps:
      1. Verify file reads `il-feature-settings` from localStorage
      2. Verify file checks `behavior.sessionPopupBlocker` setting
      3. Verify early return if setting is disabled
    Expected Result: Settings check pattern present matching session-block.content.ts pattern
    Evidence: .sisyphus/evidence/task-1-settings-check.txt

  Scenario: Build succeeds with new file
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. Run: bun run build 2>&1
    Expected Result: Build completes without errors related to session-renew
    Failure Indicators: Build errors mentioning session-renew or missing session-block
    Evidence: .sisyphus/evidence/task-1-build.txt
  ```

  **Commit**: YES (groups with Tasks 2, 3 in Commit 1)
  - Message: `fix(auth): replace SessionHelper destruction with transparent popup suppression and proactive renewal`
  - Files: `entrypoints/session-renew.content.ts` (new), `entrypoints/session-block.content.ts` (deleted)
  - Pre-commit: `bun run build`

- [ ] 2. Fix login.content.tsx session verification

  **What to do**:
  - Replace the heavy `GET skemany.aspx` session verification (lines 41-48) with a lightweight `HEAD` request to `ping.aspx`:
    - Instead of `fetch(scheduleUrl, { method: 'GET', credentials: 'include', redirect: 'follow' })`, use `fetch(new URL("/lectio/{schoolId}/ping.aspx", window.location.origin).href, { method: 'HEAD', credentials: 'include', redirect: 'manual' })`
    - Check `response.status` — if 200, session is valid. If 302 or 0 (opaque redirect in manual mode), session expired.
    - Extract `schoolId` from `lastSchool.url` (already has it in the URL pattern `/lectio/{id}/default.aspx`)
  - Fix error handling in `checkAndRedirectIfLoggedIn()` (lines 64-68):
    - Currently: catch block returns `false` silently — this is CORRECT behavior (don't clear state on transient network error). Keep this.
    - The redirect detection (line 51) that calls `clearLoginState()` is reasonable for the login redirect case — but with `redirect: 'manual'`, we check status instead of URL.
  - Remove the import/usage pattern that fetches a full HTML page for verification
  - **Firefox compatibility**: Use `new URL()` for the ping URL (already required)

  **Must NOT do**:
  - Must NOT change the login page rendering logic (lines 76-192)
  - Must NOT change the school parsing logic
  - Must NOT remove `clearLoginState()` entirely — it's still needed for genuine session expiry detection
  - Must NOT add new imports or dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, focused change to one function in one file
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed for this code change, QA is grep-based

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 5, 6, F1-F3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `entrypoints/login.content.tsx:25-74` — The `checkAndRedirectIfLoggedIn()` function to modify. Understand the full flow: checks cached login state, checks staleness (24h), then verifies with server.
  - `entrypoints/login.content.tsx:41-48` — The specific fetch call to replace. Currently: `fetch(scheduleUrl, { method: 'GET', credentials: 'include', redirect: 'follow' })` followed by checking `response.url.includes('login.aspx')`.

  **API/Type References**:
  - `lib/profile-cache.ts:89-116` — `getCachedLoginState()` and `clearLoginState()` — these are used by `checkAndRedirectIfLoggedIn()`. The cached state has `{ isLoggedIn, schoolId, lastChecked }`.
  - `lib/school-storage.ts` — `getLastSchool()` returns `{ id, name, url }` where `url` is like `/lectio/94/default.aspx`.

  **External References**:
  - `CLAUDE.md` Firefox compatibility section — Documents the `new URL(..., window.location.origin).href` pattern required for fetch

  **WHY Each Reference Matters**:
  - `login.content.tsx:25-74` — This is the function we're modifying. Need to understand the full control flow to make a targeted change.
  - `login.content.tsx:41-48` — The exact lines to replace. The current approach downloads a full HTML page just to check if we get redirected.
  - `lib/profile-cache.ts` — Need to understand `clearLoginState()` behavior to know when it's appropriate to call it.
  - `lib/school-storage.ts` — Need to know the shape of `lastSchool` to extract `schoolId` for the ping URL.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No more GET to skemany.aspx
    Tool: Bash (grep)
    Preconditions: Task 2 complete
    Steps:
      1. Run: grep -n "skemany" entrypoints/login.content.tsx
    Expected Result: Zero results
    Failure Indicators: Any reference to skemany.aspx remains
    Evidence: .sisyphus/evidence/task-2-no-skemany.txt

  Scenario: Uses ping.aspx with absolute URL
    Tool: Bash (grep)
    Preconditions: Task 2 complete
    Steps:
      1. Run: grep -n "ping.aspx" entrypoints/login.content.tsx
      2. Verify the fetch uses `new URL(...)` pattern or `window.location.origin`
      3. Run: grep -n 'fetch("/' entrypoints/login.content.tsx
    Expected Result: ping.aspx found with absolute URL pattern, no relative fetch URLs
    Failure Indicators: Relative URL in fetch, or skemany.aspx still present
    Evidence: .sisyphus/evidence/task-2-ping-check.txt

  Scenario: Network errors don't clear login state
    Tool: Bash (grep)
    Preconditions: Task 2 complete
    Steps:
      1. Read the catch block in checkAndRedirectIfLoggedIn()
      2. Verify it does NOT call clearLoginState()
    Expected Result: catch block returns false without clearing state
    Failure Indicators: clearLoginState() called in catch block
    Evidence: .sisyphus/evidence/task-2-error-handling.txt

  Scenario: Build succeeds
    Tool: Bash
    Preconditions: Task 2 complete
    Steps:
      1. Run: bun run build 2>&1
    Expected Result: Build completes without errors
    Evidence: .sisyphus/evidence/task-2-build.txt
  ```

  **Commit**: YES (groups with Tasks 1, 3 in Commit 1)
  - Message: (grouped in Commit 1)
  - Files: `entrypoints/login.content.tsx`
  - Pre-commit: `bun run build`

- [ ] 3. Update settings storage + UI labels for new session behavior

  **What to do**:
  - In `lib/settings-storage.ts`: the setting key `sessionPopupBlocker` (line 29) stays the same for backward compatibility (existing users have it saved under this key). No code change needed in this file.
  - In `components/SettingsModal.tsx` (lines 542-549): Update the `FeatureToggle` for `behavior-session`:
    - Change `label` from `"Bloker session popup"` to `"Smart session vedligeholdelse"`
    - Change `description` from `"Forhindrer 'Din session udløber snart' popup"` to `"Skjuler session popup og fornyer automatisk din session"`
    - Keep `requiresReload` attribute (the new content script still needs reload)
    - Keep `enabled` and `onChange` bindings exactly as-is

  **Must NOT do**:
  - Must NOT rename the `sessionPopupBlocker` key in the schema (breaks existing user settings)
  - Must NOT change any other FeatureToggle in the behavior section
  - Must NOT add new settings or toggles
  - Must NOT change the settings storage logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two string changes in one file, no logic changes
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not a visual design task, just changing label text

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 6, F1-F3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `components/SettingsModal.tsx:542-549` — The exact `FeatureToggle` component to modify. Note the Danish text strings. Only change `label` and `description` props.

  **API/Type References**:
  - `lib/settings-storage.ts:28-34` — `BehaviorSettingsSchema` showing the `sessionPopupBlocker` key. Confirm the key name stays the same.
  - `lib/settings-storage.ts:87-95` — `SETTINGS_REQUIRING_RELOAD` array includes `behavior.sessionPopupBlocker`. This must remain.

  **WHY Each Reference Matters**:
  - `SettingsModal.tsx:542-549` — The lines to edit. Need exact current text to do the replacement.
  - `settings-storage.ts:28-34` — Confirms we do NOT rename the key, only the UI label.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Label and description updated correctly
    Tool: Bash (grep)
    Preconditions: Task 3 complete
    Steps:
      1. Run: grep -n "Smart session vedligeholdelse" components/SettingsModal.tsx
      2. Run: grep -n "Skjuler session popup og fornyer automatisk din session" components/SettingsModal.tsx
      3. Run: grep -n "Bloker session popup" components/SettingsModal.tsx
    Expected Result: Steps 1-2 each return exactly one match. Step 3 returns zero matches.
    Failure Indicators: Old label still present, or new label missing
    Evidence: .sisyphus/evidence/task-3-label-update.txt

  Scenario: Setting key unchanged in schema
    Tool: Bash (grep)
    Preconditions: Task 3 complete
    Steps:
      1. Run: grep -n "sessionPopupBlocker" lib/settings-storage.ts
    Expected Result: Key still present, unchanged
    Failure Indicators: Key renamed or missing
    Evidence: .sisyphus/evidence/task-3-key-preserved.txt

  Scenario: Build succeeds
    Tool: Bash
    Preconditions: Task 3 complete
    Steps:
      1. Run: bun run build 2>&1
    Expected Result: Build completes without errors
    Evidence: .sisyphus/evidence/task-3-build.txt
  ```

  **Commit**: YES (groups with Tasks 1, 2 in Commit 1)
  - Message: (grouped in Commit 1)
  - Files: `components/SettingsModal.tsx`
  - Pre-commit: `bun run build`

- [ ] 4. Fix content.tsx login detection behavior

  **What to do**:
  - In `entrypoints/content.tsx` lines 97-108: The current logic detects `login.aspx` in the URL and calls `updateLoginState()`, which calls `isLoggedIn()` (checks DOM for logged-in indicators), and if not logged in, calls `clearLoginState()` (removes both `LOGIN_STATE_KEY` and `PROFILE_CACHE_KEY` from localStorage).
  - **The issue**: This is actually CORRECT behavior for genuine session expiry redirects to `login.aspx`. However, it could be problematic during transient auth flows where the user briefly hits `login.aspx` before being redirected elsewhere. With Task 1 fixing the root cause (SessionHelper destruction), this code path should be hit less frequently.
  - **Changes needed**:
    1. Add a guard: only call `updateLoginState()` if we are NOT on a login.aspx page that has a `ReturnUrl` query parameter with a valid school path (this indicates an auth redirect in progress, not a genuine logout). Pattern: `login.aspx?ReturnUrl=%2flectio%2f94%2fforside.aspx`.
    2. If `ReturnUrl` is present, log it and skip the state clearing — the user is being redirected through auth flow.
    3. If NO `ReturnUrl`, proceed as before (genuine logout, clear state).
  - Also review lines 119-124: same `updateLoginState()` call for "on school page but no main header" — this is fine as-is (if no `.ls-master-header`, user is genuinely not logged in). No changes needed here.

  **Must NOT do**:
  - Must NOT remove `updateLoginState()` or `clearLoginState()` entirely — they are needed for genuine logouts
  - Must NOT change any UI rendering logic in `initLayout()`
  - Must NOT change the import structure
  - Must NOT add new dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small conditional guard added to one code path in one file
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed, QA is code-level verification

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: Task 6, F1-F3
  - **Blocked By**: Task 1 (need to understand new session-renew behavior first)

  **References**:

  **Pattern References**:
  - `entrypoints/content.tsx:97-108` — The login.aspx detection block to modify. Currently: regex test → log → `updateLoginState()` → add class → return. We add a ReturnUrl check before `updateLoginState()`.
  - `entrypoints/content.tsx:119-124` — The secondary "school page but no header" check. Review but leave as-is.

  **API/Type References**:
  - `lib/profile-cache.ts:121-135` — `updateLoginState()` function. Calls `isLoggedIn()` to check DOM, then `clearLoginState()` if not logged in. Understanding this flow is critical for knowing when state gets cleared.
  - `lib/profile-cache.ts:68-87` — `isLoggedIn()` function. Checks meta tag for `elevid`, `masterbody` class, and logout link. On `login.aspx`, none of these exist → returns false → triggers `clearLoginState()`.
  - `lib/profile-cache.ts:109-116` — `clearLoginState()` function. Removes both `LOGIN_STATE_KEY` and `PROFILE_CACHE_KEY` from localStorage. This is destructive — profile cache is expensive to rebuild.

  **WHY Each Reference Matters**:
  - `content.tsx:97-108` — The exact code we're modifying. Need to understand the return flow.
  - `profile-cache.ts:121-135` — Understanding `updateLoginState()` → `isLoggedIn()` → `clearLoginState()` chain shows why login.aspx always triggers a state clear.
  - `profile-cache.ts:68-87` — Shows that `isLoggedIn()` checks DOM elements that don't exist on login.aspx, so it always returns false there.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: ReturnUrl guard present in login.aspx detection
    Tool: Bash (grep)
    Preconditions: Task 4 complete
    Steps:
      1. Run: grep -n "ReturnUrl" entrypoints/content.tsx
      2. Verify the ReturnUrl check is used as a guard before updateLoginState()
    Expected Result: ReturnUrl check found, used to skip state clearing during auth redirects
    Failure Indicators: No ReturnUrl handling, or updateLoginState() still called unconditionally
    Evidence: .sisyphus/evidence/task-4-returnurl-guard.txt

  Scenario: Genuine logout still clears state
    Tool: Bash (read)
    Preconditions: Task 4 complete
    Steps:
      1. Read the login.aspx detection block in content.tsx
      2. Verify that when NO ReturnUrl is present, updateLoginState() is still called
    Expected Result: updateLoginState() called for genuine logouts (no ReturnUrl)
    Failure Indicators: updateLoginState() removed entirely or never called
    Evidence: .sisyphus/evidence/task-4-genuine-logout.txt

  Scenario: Secondary check (lines 119-124) unchanged
    Tool: Bash (grep)
    Preconditions: Task 4 complete
    Steps:
      1. Run: grep -n "On school page but not logged in" entrypoints/content.tsx
    Expected Result: Comment and behavior unchanged
    Failure Indicators: Comment missing or logic modified
    Evidence: .sisyphus/evidence/task-4-secondary-check.txt

  Scenario: Build succeeds
    Tool: Bash
    Preconditions: Task 4 complete
    Steps:
      1. Run: bun run build 2>&1
    Expected Result: Build completes without errors
    Evidence: .sisyphus/evidence/task-4-build.txt
  ```

  **Commit**: YES (groups with Task 5 in Commit 2)
  - Message: `fix(auth): add ReturnUrl guard to login.aspx detection and use lightweight session check`
  - Files: `entrypoints/content.tsx`
  - Pre-commit: `bun run build`

- [ ] 5. Add smart login redirect (nice-to-have)

  **What to do**:
  - In `entrypoints/login.content.tsx`: The `checkAndRedirectIfLoggedIn()` function (lines 25-74) already implements the redirect logic. Task 2 replaces the heavy GET to `skemany.aspx` with a HEAD to `ping.aspx`. This task builds on top of Task 2's changes.
  - **Additional improvement**: When the ping check confirms the session is valid, redirect to `forside.aspx` instead of `skemany.aspx`:
    1. After Task 2's ping check confirms session is valid (status 200), compute the redirect URL: `new URL(lastSchool.url.replace("default.aspx", "forside.aspx"), window.location.origin).href`
    2. Change line 62 from `window.location.href = scheduleUrl` to `window.location.href = forsideUrl`
    3. This redirects to the school's forside (home page) — more useful than skemany (schedule search) page
  - Also verify that the `continueToLastSchool` setting check (line 99) properly gates this behavior — it already does, no change needed.
  - Ensure the redirect only happens on the main login page (`/` or `/index.html` or `login_list.aspx`), not on `/lectio/{id}/login.aspx` (school-specific login where user explicitly logged out). This is already handled by the `isMainPage || isLoginListPage` check in `initLoginPage()` (lines 78-86).

  **Must NOT do**:
  - Must NOT redirect if `continueToLastSchool` setting is disabled
  - Must NOT redirect on school-specific login pages (`/lectio/{id}/login.aspx`)
  - Must NOT add visible UI during the redirect check (no loading spinners)
  - Must NOT block login page rendering if redirect check is slow — the check runs before render (line 99), and if it fails (returns false), rendering continues normally

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small change to redirect URL in one function, builds on Task 2
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed, QA is code-level

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4)
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 6, F1-F3
  - **Blocked By**: Task 2 (builds on the ping.aspx change)

  **References**:

  **Pattern References**:
  - `entrypoints/login.content.tsx:25-74` — `checkAndRedirectIfLoggedIn()` function. After Task 2 modifies the fetch to use ping.aspx, this task changes the redirect destination from skemany to forside.
  - `entrypoints/login.content.tsx:57-63` — The redirect block. Currently `window.location.href = scheduleUrl`. Change to use `forside.aspx`.
  - `entrypoints/login.content.tsx:97-101` — The gate: `if (settings.behavior?.continueToLastSchool ?? true) && await checkAndRedirectIfLoggedIn()`. Already properly gates the redirect.

  **API/Type References**:
  - `lib/school-storage.ts` — `getLastSchool()` returns `{ id, name, url }` where `url` is like `/lectio/94/default.aspx`. We derive the forside URL from this.

  **WHY Each Reference Matters**:
  - `login.content.tsx:25-74` — The function we're modifying. Need full context of the redirect flow.
  - `login.content.tsx:57-63` — The specific redirect line to change.
  - `login.content.tsx:97-101` — Confirms the settings gate is already in place.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Redirect goes to forside.aspx, not skemany.aspx
    Tool: Bash (grep)
    Preconditions: Task 5 complete (builds on Task 2)
    Steps:
      1. Run: grep -n "forside.aspx" entrypoints/login.content.tsx
      2. Run: grep -n "skemany" entrypoints/login.content.tsx
    Expected Result: forside.aspx found in redirect URL. skemany.aspx not found anywhere.
    Failure Indicators: Still redirecting to skemany, or forside not present
    Evidence: .sisyphus/evidence/task-5-forside-redirect.txt

  Scenario: Settings gate preserved
    Tool: Bash (grep)
    Preconditions: Task 5 complete
    Steps:
      1. Run: grep -n "continueToLastSchool" entrypoints/login.content.tsx
    Expected Result: Settings check still present, gating the redirect
    Failure Indicators: Settings check removed
    Evidence: .sisyphus/evidence/task-5-settings-gate.txt

  Scenario: Build succeeds
    Tool: Bash
    Preconditions: Task 5 complete
    Steps:
      1. Run: bun run build 2>&1
    Expected Result: Build completes without errors
    Evidence: .sisyphus/evidence/task-5-build.txt
  ```

  **Commit**: YES (groups with Task 4 in Commit 2)
  - Message: (grouped in Commit 2)
  - Files: `entrypoints/login.content.tsx`
  - Pre-commit: `bun run build`

- [ ] 6. Build verification + forbidden pattern scan

  **What to do**:
  - Run a full build and comprehensive forbidden pattern scan across the entire extension codebase:
    1. `bun run build` — must succeed with zero errors
    2. `bun run build:firefox` — must also succeed (cross-browser)
    3. Grep for forbidden patterns across `entrypoints/` and `lib/`:
       - `Object.defineProperty.*SessionHelper` — MUST NOT exist anywhere
       - `document.cookie\s*=` — MUST NOT exist (we don't write cookies)
       - `window.SessionHelper` outside of comments — MUST NOT exist
       - `fetch.*skemany\.aspx` in `login.content.tsx` — MUST NOT exist
       - Relative URL in fetch: `fetch\s*\(\s*["']/` — MUST NOT exist (Firefox compat)
    4. Verify old file deleted: `entrypoints/session-block.content.ts` MUST NOT exist
    5. Verify new file exists: `entrypoints/session-renew.content.ts` MUST exist
    6. Verify no new permissions in manifest output (check `.output/` for `permissions` field)

  **Must NOT do**:
  - Must NOT modify any files — this is a verification-only task
  - Must NOT run tests (no test infrastructure)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running commands and checking output, no code changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential, after all implementation)
  - **Blocks**: F1-F3
  - **Blocked By**: Tasks 1, 2, 3, 4, 5

  **References**:

  **Pattern References**:
  - `wxt.config.ts` — Extension configuration. Check that permissions array hasn't changed.
  - `CLAUDE.md` Firefox compatibility section — Documents the absolute URL requirement for fetch.

  **WHY Each Reference Matters**:
  - `wxt.config.ts` — Verification target: confirm permissions unchanged.
  - `CLAUDE.md` — Defines the fetch URL pattern we're scanning for compliance.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Chrome build succeeds
    Tool: Bash
    Steps:
      1. Run: bun run build 2>&1
    Expected Result: Build succeeds, zero errors
    Evidence: .sisyphus/evidence/task-6-build-chrome.txt

  Scenario: Firefox build succeeds
    Tool: Bash
    Steps:
      1. Run: bun run build:firefox 2>&1
    Expected Result: Build succeeds, zero errors
    Evidence: .sisyphus/evidence/task-6-build-firefox.txt

  Scenario: All forbidden patterns absent
    Tool: Bash (grep)
    Steps:
      1. Run: grep -rn "Object.defineProperty.*SessionHelper" entrypoints/ lib/
      2. Run: grep -rn "document\.cookie\s*=" entrypoints/ lib/
      3. Run: grep -rn "window\.SessionHelper" entrypoints/ lib/ | grep -v "^.*:.*//.*SessionHelper"
      4. Run: grep -n "skemany\.aspx" entrypoints/login.content.tsx
      5. Run: grep -rPn 'fetch\s*\(\s*["\x27]/' entrypoints/ lib/
    Expected Result: All five greps return zero results
    Failure Indicators: Any match found
    Evidence: .sisyphus/evidence/task-6-forbidden-patterns.txt

  Scenario: Old file deleted, new file exists
    Tool: Bash
    Steps:
      1. Run: ls entrypoints/session-block.content.ts 2>&1
      2. Run: ls entrypoints/session-renew.content.ts 2>&1
    Expected Result: Step 1 returns "No such file or directory". Step 2 shows the file.
    Evidence: .sisyphus/evidence/task-6-file-swap.txt

  Scenario: No new permissions added
    Tool: Bash (grep)
    Steps:
      1. Run: grep -A5 "permissions" wxt.config.ts
      2. Verify only "storage" permission (or whatever was there before)
    Expected Result: No new permissions like "cookies", "webRequest", "webRequestBlocking"
    Evidence: .sisyphus/evidence/task-6-permissions.txt
  ```

  **Commit**: NO (verification only, no files changed)

---

## Final Verification Wave

> 3 review agents run in PARALLEL. ALL must APPROVE.

- [ ] F1. **Plan Compliance Audit** — `deep`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, check behavior). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `quick`
  Run `bun run build`. Review all changed files for: `as any`/`@ts-ignore`, empty catches without comments, `console.log` spam (only `[BetterLectio]` prefixed allowed), unused imports. Check for AI slop: excessive comments, over-abstraction, generic variable names.
  Output: `Build [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Forbidden Pattern & Regression Scan** — `quick`
  Search entire codebase for:
  - `Object.defineProperty.*SessionHelper` — MUST NOT exist
  - Direct cookie writes outside of Lectio's own code (grep for `document.cookie\s*=` in `entrypoints/` and `lib/`)
  - `fetch.*skemany\.aspx` in `login.content.tsx` — MUST NOT exist
  - `clearLoginState()` calls that are too aggressive (called on transient network errors)
  Output: `Forbidden Patterns [N found/0 expected] | VERDICT`

---

## Commit Strategy

- **Commit 1** (after Wave 1): `fix(auth): replace SessionHelper destruction with transparent popup suppression and proactive renewal` — `entrypoints/session-renew.content.ts` (new), `entrypoints/session-block.content.ts` (deleted), `components/SettingsModal.tsx`
- **Commit 2** (after Wave 2): `fix(auth): use lightweight session check on login page and add smart redirect` — `entrypoints/login.content.tsx`, `entrypoints/content.tsx`
- **Commit 3** (after Wave 3): No commit needed (verification only)

---

## Success Criteria

### Verification Commands
```bash
bun run build  # Expected: Build succeeds, zero errors
grep -r "Object.defineProperty.*SessionHelper" entrypoints/ lib/  # Expected: No results
grep -r "document.cookie\s*=" entrypoints/ lib/  # Expected: No results (we don't write cookies)
grep "skemany.aspx" entrypoints/login.content.tsx  # Expected: No results
```

### Final Checklist
- [ ] All "Must Have" items present and verified
- [ ] All "Must NOT Have" items absent from codebase
- [ ] Build succeeds on both Chrome and Firefox targets
- [ ] No new permissions added to manifest
- [ ] Settings UI updated with new labels
- [ ] Smart login redirect works (nice-to-have)
