# Lectio HTML structure audit — 2026-09-15

## Executive summary

Lectio has changed its shared page chrome and its absence markup since the
historical snapshots. Most BetterLectio features remain compatible because
their stable IDs and semantic anchors are unchanged. The one breaking area was
**absence parsing on iOS and Android**; both native parsers have now been
updated for the new layout while retaining legacy-layout support. The browser
extension already handled the new absence layouts.

Observed Lectio version: **23.123 → 24.031**.

## Scope and method

- Compared all 95 HTML files in `lectio-html/` with filename-matched captures in
  `lectio-html-2026-09-15/`.
- Captured authenticated pages through the Lectio CLI and public entry pages
  directly. Dynamic entity IDs were substituted with equivalent current
  records when the historical IDs had expired.
- Compared normalized DOM signatures: element names, stable/normalized IDs,
  classes, and attribute names. Text, URLs, form values, styles, large numeric
  IDs, and repeated row counts were treated as data and not structure.
- Traced changed selectors and column layouts into the browser extension, iOS,
  and Android implementations.
- 85 pairs were structurally comparable. Ten were error/inaccessible state
  captures. All 95 filenames have a fresh counterpart.

## Confirmed structural changes

### 1. Absence pages — native-app breakage fixed

The overview table still has five data cells, but the current page now renders
an explicit third header row and each row is:

`[hold, ordinary period fraction, ordinary assessed %, written period fraction, written assessed %]`

The table ID also gained the intermediate `FravaerOversigt` component prefix.

The reasons/registrations table changed from eight non-mobile cells:

`[week, activity, %, type, registered, remark, reason/note, edit]`

to seven:

`[week, activity, merged type + %, registered, remark, reason/comment, edit]`

The reasons page also no longer contains
`FremmoedeFravaer` / `SkriftligFravaer` summary spans.

Original impact:

- **iOS — high severity.** It fetches only the reasons page for the complete
  report (`LectioHTTPClient+Absence.swift:21-30`), so missing summary spans fall
  back to `0%` (`StudentParser.swift:423-431`). Its fixed registration indices
  (`StudentParser.swift:483-528`) now interpret the registration timestamp as
  the absence type, shift the remaining fields, and read the edit cell as the
  reason. Registration IDs still work because they are found from the edit
  link independently.
- **Android — high severity.** It fetches the correct two pages
  (`AbsenceRepository.kt:37-76`), but `parseTeamRow` still assumes the legacy
  alternating eight-value layout (`AbsenceParser.kt:43-81`). Fractions and
  percentages are therefore assigned to the wrong properties. The registration
  parser also assumes the removed standalone type column
  (`AbsenceParser.kt:118-177`), producing a null percentage and shifted status,
  timestamp, remark, and cause.
- **Browser extension — compatible.** It selects the overview table by ID
  suffix, supports both five- and nine-cell layouts, classifies `%` versus `/`
  by content (`lib/fravaer-parse.ts:101-165`), and anchors registration parsing
  on the activity and edit-link cells (`lib/fravaer-parse.ts:255-348`). A live
  parser probe returned 12 holds, correct `8,0%` / `0,0%` totals, and five
  registrations.

The iOS client now fetches the overview and reasons pages separately, derives
totals from the `Samlet` row, and anchors registration columns on their activity
and edit links. Android now classifies overview values by content and applies
the same anchored registration parsing. Both retain the legacy layout and have
dedicated 24.031 regression tests.

### 2. Shared Lectio chrome — changed, currently non-breaking

Across all 85 comparable pages:

- `lectioBorderTop/Right/Bottom/Left` disappeared.
- `ls-master-header-container` and `ls-searchbox-container` appeared.
- The old generic `button` wrapper was largely replaced by `buttonoutlined`.
- Many tables moved from `ls-table-layout` to `ls-table-layout1`.

BetterLectio's extension navigation explicitly accepts both `buttonlink` and
`buttonoutlined` (`lib/lectio-navigation.ts:37-74`), and its current styling
already includes `buttonoutlined`. The removed border classes only leave stale
dark-mode cleanup rules; no functional dependency was found. Native parsers do
not depend on these shared chrome classes.

### 3. Assignment details — substantial redesign, stable parser contract

Current assignment pages add an `ls-elevaflevering-*` component/layout system,
including mobile table wrappers. The legacy functional IDs remain present:

- `m_Content_registerAfl_pa`
- `m_Content_NameLbl`
- `m_Content_StudentGV`
- `m_Content_RecipientGV`
- `table.ls-std-table-inputlist`

The extension, iOS, and Android parsers use those IDs and label-based info rows,
so no break was found in the captured assignment variants.

## Stable surfaces checked

The following parser contracts were unchanged in the fresh pages:

- Schedule: `table.s2skema`, day/date cells, bricks, and week controls.
- Assignment list: `ExerciseGV` and its 11 desktop columns.
- Homework: `MaterialLektieOverblikGV`, activity bricks, and three desktop
  columns.
- Message list: `threadGV`, ten-cell rows, mobile thread containers, and
  new-message controls. The extension parser returned 42 current threads.
- Home dashboard: all five BetterLectio-consumed island IDs remain.
- Documents: folder tree, `lec-node-id`, document grid, and editable-folder
  controls remain. Current accessible folders were empty, so populated file-row
  parsing was not revalidated.
- Student identity/card: `msapplication-starturl`, `MainTitle` context card,
  profile image ID, and context-card fragment contract remain.
- FindSkema: `Autocomplete.registerDataSetUrl` retains the same format; only the
  school year/cache token changed.
- Grade report: main table, notes table, diploma area, and protocol IDs remain.
  The current account has no grade rows this early in the school year, so
  row-level column parsing could not be compared.
- Activity detail: header, homework container, inline homework container,
  entity navigation, and tabs remain. A current homework-bearing activity was
  captured.

Direct parser probes against the fresh HTML also produced 55 assignments and
one homework item without selector failures.

## Coverage limitations

- Message compose, reply, and open-thread pages are postback-generated states;
  plain GETs return a folder list. Their old snapshots remain the best coverage
  until the capture process performs the required safe postbacks.
- Some old assignment/activity/document/private-appointment IDs had expired or
  belonged to a different session user. Current equivalents were used where
  possible; ten intentional/error/inaccessible pairs are excluded from
  conclusions.
- The current account has no grade rows and no files in the sampled document
  folders.

## Follow-up

1. Add an authenticated postback-aware capture path for compose/thread states
   before relying on future message diffs.

## Verification notes

- Android's legacy and Lectio 24.031 `AbsenceParserTest` cases pass. The new
  cases cover reordered overview values, totals, and merged registration cells.
- iOS has matching Lectio 24.031 regression coverage for cross-page totals and
  merged registration cells. It could not be executed in this Linux workspace,
  which has no Xcode toolchain.
- Extension parser probes against fresh HTML succeeded for absence, assignments,
  homework, documents, and message lists.
- `bun run compile` currently fails on pre-existing React/Preact JSX typing
  conflicts in shared UI components; the audit added no TypeScript source
  changes.
