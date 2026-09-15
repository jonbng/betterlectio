# Lectio snapshots — 2026-09-15

Fresh HTML captured from Lectio school 94 with an authenticated, consented
remote session. This directory mirrors every HTML filename in `../lectio-html/`.

- 95 historical HTML filenames, 95 fresh counterparts.
- Dynamic records (student, activity, assignment, and folder IDs) were replaced
  with equivalent records available to the current session where possible.
- Ten legacy snapshots represent expired/deleted entities, inaccessible editor
  states, or intentional error pages. Their fresh counterparts are retained for
  completeness but are not treated as structural comparisons.
- Message compose/thread states are ASP.NET postback states and cannot be
  recreated faithfully with a plain GET; inbox/folder list structure is covered.
- Snapshots contain real Lectio page data and must be handled as sensitive test
  fixtures, like the historical corpus.

See [`../docs/lectio-structure-audit-2026-09-15.md`](../docs/lectio-structure-audit-2026-09-15.md)
for findings and limitations.

