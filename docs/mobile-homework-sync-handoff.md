# Mobile Homework Sync Handoff

This document is the implementation handoff for the iOS app homework-completion sync.

If you are the developer doing the mobile work, follow this contract exactly. Do not invent a different persistence model. The extension and the database already assume this shape.

## Non-negotiable rules

You must do these things exactly:

1. Reuse the existing tables `homework_entries` and `student_homework`.
2. Treat Lectio activity `absid` as the stable homework sync key and send it as `entry_id`.
3. Read synced completion through `get_student_homework_statuses(p_school_id, p_student_id)` or an equivalent filtered read of the same rows.
4. Write completion through `upsert_student_homework_status(...)`.
5. Treat the database as the persisted source of truth.
6. Use patch/upsert semantics. Do not blob-sync the entire lektier list.
7. Respect `client_updated_at` and assume stale writes can be rejected.

If you do not follow the same `entry_id` contract, sync between extension and iOS will break.

## Existing database model

No new duplicate table was created for this feature.

The sync model uses these existing tables:

- `public.homework_entries`
- `public.student_homework`

We extended them instead of replacing them.

## Core idea

The model is split into:

- one shared homework/activity row in `homework_entries`
- one per-student completion row in `student_homework`

The shared key across clients is the Lectio activity id from URLs like:

```text
/lectio/94/aktivitet/aktivitetforside2.aspx?absid=73519294392
```

That value becomes:

- `entry_id = "73519294392"`

Important: use the activity `absid`, not the `#hw...` anchor for an individual homework item.

Completion is synced at the card/activity level, not per individual homework bullet.

## Required database objects

### `homework_entries`

Shared activity/homework metadata.

Relevant fields:

- `id` - internal UUID primary key
- `entry_id` - stable Lectio activity id (`absid`)
- `school_id` - school scope
- `lesson_date`
- `display_date`
- `hold`
- `title`
- `teacher`
- `room`
- `note`
- `items_json`
- `source_updated_at`
- `updated_at`

Notes:

- rows may already exist from importer flows
- some legacy rows may still have been created before `school_id` existed
- the write RPC can claim/fix those rows on first write

### `student_homework`

Per-student completion state.

Relevant fields:

- `student_id`
- `homework_id`
- `is_done`
- `client_updated_at`
- `last_modified_by`
- `done_updated_at`
- `updated_at`

Notes:

- one row per `(student_id, homework_id)`
- `client_updated_at` is the client-generated timestamp used for stale-write protection
- `done_updated_at` / `updated_at` are server-side timestamps

### RPCs

- `get_student_homework_statuses(p_school_id, p_student_id)`
- `upsert_student_homework_status(...)`

## Read contract

For mobile, the intended read flow is:

1. resolve the current BetterLectio student row
2. get `school_id`
3. get `student_id`
4. read synced statuses for that student
5. map the result by `entry_id`

The RPC returns rows shaped like:

- `entry_id`
- `homework_id`
- `school_id`
- `student_id`
- `is_done`
- `client_updated_at`
- `last_modified_by`
- `done_updated_at`
- `updated_at`
- `lesson_date`

The mobile app should build an in-memory map keyed by `entry_id`.

Example:

```swift
[String: HomeworkStatus]
// [entryId: status]
```

## Write contract

When the user toggles completion on mobile, call:

- `upsert_student_homework_status`

Required arguments:

- `p_school_id`
- `p_student_id`
- `p_entry_id`
- `p_is_done`

Recommended arguments:

- `p_client_updated_at`
- `p_last_modified_by`

If mobile has enough metadata for first-write backfill, also send:

- `p_lesson_date`
- `p_display_date`
- `p_hold`
- `p_title`
- `p_teacher`
- `p_room`
- `p_note`
- `p_items_json`

The extension currently sends `last_modified_by = "extension"`.

Mobile should send:

- `last_modified_by = "ios"`

or another stable string agreed across clients.

## Why the extra metadata exists

Not every lektier row is guaranteed to already exist in `homework_entries`.

The current RPC behavior is:

1. if a matching `homework_entries` row already exists for that `entry_id`, use it
2. if a legacy row exists with `school_id is null`, claim/update it for the current school
3. if no row exists, create one from the supplied metadata

That means iOS can safely be the first client that syncs a given homework row.

## Exact implementation instructions

### 1. Parse the correct Lectio identifier

You must extract the activity id from URLs like:

- `...aktivitetforside2.aspx?absid=73519294392`
- sometimes `id=...` appears in linked content pages, but the sync key is still the activity-level id used by the card

Preferred sources, in order:

1. explicit parsed `absid`
2. `id` only if the mobile homework card truly represents the same activity-level entity
3. never the `#hw...` fragment for an individual homework bullet

### 2. Keep sync scoped correctly

All homework sync is school-scoped and student-scoped.

At minimum, scope by:

- `school_id`
- `student_id`

Do not reuse one student's homework completion cache for another student on the same device.

### 3. Preserve the current granularity

Do not implement per-item completion.

Current shared behavior is:

- one toggle per lektier card/activity
- one persisted completion state per `entry_id`

If mobile stores per-item completion locally, it must not be written into this sync model.

### 4. Respect optimistic sync races

The extension already had a flicker race where stale remote snapshots briefly overrode optimistic local toggles.

Mobile should avoid the same bug.

Use this rule:

- pending local write wins over remote state until remote `client_updated_at >= pending.client_updated_at`

Recommended local state model:

- `remoteStatusByEntryId`
- `pendingWritesByEntryId`
- derived effective UI state from `pending -> remote -> local fallback`

Do not let a stale refetch temporarily overwrite an optimistic toggle.

### 5. Use `client_updated_at` on every write

Every write should send a fresh client timestamp.

Example:

- ISO-8601 UTC string from the device clock

This is required because the server currently protects against stale updates with:

- `student_homework.client_updated_at <= excluded.client_updated_at`

If you omit it, you lose the intended stale-write protection.

### 6. Handle unsynced/partial rows safely

If mobile cannot resolve a stable `entry_id` for a homework card:

- do not write bad data
- do not invent a synthetic persisted key like `date-hold-title`
- keep it local-only if necessary

If mobile can resolve `entry_id` but lacks metadata:

- writes may still succeed if the DB row already exists
- but first-write creation for a missing row needs the metadata fields listed above

### 7. Respect RLS and auth identity

RLS is set up so users only read/write their own completion rows and homework rows in their own school.

That means the mobile app must use the authenticated BetterLectio/Supabase user tied to the correct `students.supabase_id`.

Do not write using a different identity model.

## Sync expectations

The DB is the persisted source of truth.

Intended cross-client flow:

1. extension or iOS reads status rows for the current student
2. client renders card completion using `entry_id`
3. user toggles a card
4. client writes one upsert with a new `client_updated_at`
5. server accepts newer writes and ignores stale ones
6. other clients refetch / receive realtime updates and converge on the same state

This is patch-sync, not snapshot-sync.

## Suggested iOS payload shape

When you have enough metadata, write something like:

```json
{
  "p_school_id": 94,
  "p_student_id": "72721772841",
  "p_entry_id": "73519294392",
  "p_is_done": true,
  "p_client_updated_at": "2026-03-25T18:42:10.123Z",
  "p_last_modified_by": "ios",
  "p_lesson_date": "2026-02-26",
  "p_display_date": "to 26/2",
  "p_hold": "1x DA",
  "p_title": null,
  "p_teacher": "Eskil Ronnov Due",
  "p_room": "25",
  "p_note": null,
  "p_items_json": [
    {
      "id": "73519294392_0",
      "text": "Las om Folkeviserne i Litteraturens Veje...",
      "file_url": null,
      "activity_url": "/lectio/94/aktivitet/aktivitetforside2.aspx?id=73519294393...",
      "note": null
    }
  ]
}
```

The exact item text can differ based on mobile parsing. The important persisted identity is still `p_entry_id`.

## What must be tested

Before calling the mobile implementation done, verify all of this:

1. mark a lektie done in the extension -> iOS shows it done
2. mark a lektie done in iOS -> extension shows it done
3. unmark in either client -> both converge to unmarked
4. first write on a homework row that was missing from `homework_entries` succeeds
5. legacy rows with `school_id = null` still sync correctly after first write
6. stale writes from an older client timestamp do not override a newer toggle
7. optimistic mobile UI does not flicker from done -> not done -> done during refetch
8. homework without a stable `entry_id` stays local-only and does not create bad DB rows

## Things you must not do

Do not do any of these:

- create a second homework-sync table
- persist completion keyed by `#hw...` anchors
- persist completion keyed by title/date/hold fallbacks
- write directly to `student_homework` if the RPC is available
- assume all `homework_entries` rows already exist
- replace optimistic local state with stale remote snapshots

## Final instruction

If you need to change this contract, coordinate it across both clients and the DB first. Do not silently fork the model on iOS.
