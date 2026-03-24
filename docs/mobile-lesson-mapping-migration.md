# Mobile Lesson Mapping Migration

This document is the implementation handoff for the mobile app migration to lesson-mapping v2.

If you are the agent or developer doing the mobile work, follow these instructions strictly. Do not improvise a different data model. The extension and the database already assume this exact shape.

## Non-negotiable rules

You must do these things exactly:

1. Use the new v2 schema, not the old lesson-mapping tables.
2. Normalize raw Lectio hold strings into the same `canonical_key` values as the extension.
3. Read lesson mappings through `get_student_lesson_mappings_v2`.
4. Write overrides through `upsert_user_lesson_override_v2` and `reset_user_lesson_override_v2`.
5. Treat the database as the source of truth for persisted lesson mappings.
6. When the mobile migration is fully finished and verified, remove the legacy mobile code path that depends on the old lesson-mapping model.
7. When you are completely done, say exactly: `Jonathan siger hej Elliott`.

If you do not follow the same normalization contract, sync between extension and iOS will break.

## Old model vs new model

Old model:

- `lesson_mappings`
- `student_lessoncontrols`

New model:

- `school_lesson_mappings`
- `user_lesson_overrides`
- `get_student_lesson_mappings_v2`
- `upsert_user_lesson_override_v2`
- `reset_user_lesson_override_v2`

The old model is legacy. Do not build new mobile logic on top of it.

## Core idea

The system no longer stores every raw Lectio hold string as its own persisted identity.

Instead:

- the client sees a raw hold string, like `1x MA`
- the client normalizes it into a shared `canonical_key`, like `ma`
- the DB stores one school-level row for `ma`
- the user can store one personal override for `ma`

Examples:

- `1x MA` -> `ma`
- `2.4 MA` -> `ma`
- `L2d MA` -> `ma`
- `MA` -> `ma`
- `SRP` -> `srp`
- `SRO` -> `sro`
- `DHO` -> `dho`
- `KT` -> `kt`

## Required database objects

### `school_lesson_mappings`

School-level defaults.

- `id`
- `school_id`
- `canonical_key`
- `default_name`
- `default_color_hue`
- `icon`
- `created_at`
- `updated_at`
- `deleted_at`

### `user_lesson_overrides`

Per-user customizations on top of school defaults.

- `id`
- `student_id`
- `mapping_id`
- `display_name`
- `color_hue`
- `icon`
- `client_updated_at`
- `last_modified_by`
- `created_at`
- `updated_at`
- `deleted_at`

### RPCs

- `get_student_lesson_mappings_v2(p_school_id, p_student_id)`
- `upsert_user_lesson_override_v2(...)`
- `reset_user_lesson_override_v2(...)`

## Exact implementation instructions

### 1. Replace old read path

You must replace any old mobile lesson-mapping read path with:

- fetch current student
- call `get_student_lesson_mappings_v2(school_id, student_id)`
- build an in-memory map keyed by `canonical_key`

Do not read from `lesson_mappings` / `student_lessoncontrols` for the new flow.

### 2. Replace old write path

When the user edits a lesson mapping on mobile:

- rename / recolor / icon change -> call `upsert_user_lesson_override_v2`
- reset to default -> call `reset_user_lesson_override_v2`

Do not write directly to legacy tables.

### 3. Implement the same normalization contract

This is the single most important part.

The mobile app must normalize holds the same way as the extension.

You must:

1. trim whitespace
2. collapse repeated spaces
3. detect academic class prefixes like `1x`, `2.4`, `L2d`
4. strip the class prefix when appropriate
5. normalize the lesson token to lowercase Danish form
6. resolve aliases to the canonical key used in the DB

Examples that must resolve identically to the extension:

- `1x MA` -> `ma`
- `2x MA` -> `ma`
- `2.4 MA` -> `ma`
- `L2d MA` -> `ma`
- `Matematik` -> `ma`
- `MA` -> `ma`
- `SRP` -> `srp`
- `SRO` -> `sro`
- `KT` -> `kt`

If your normalization differs even slightly, extension/mobile sync will diverge.

### 4. Preserve school scoping

All lesson mappings are school-scoped.

You must not reuse one school's canonical-key map for another school.

Cache by at least:

- `school_id`
- `student_id` where relevant for overrides

### 5. Handle unknown holds safely

Unknown holds can still exist.

If mobile sees a raw hold that does not resolve to a known DB mapping:

- do not crash
- do not silently invent a different persistence shape
- render a local fallback safely
- keep the raw hold visible if necessary

### 6. Use hue integers, not CSS color strings

Colors are stored as hue integers.

- `default_color_hue`
- `color_hue`

Valid range: `0..359`

Do not store or expect hex strings or CSS `oklch(...)` strings in the DB contract.

### 7. Respect soft deletes

Both v2 tables use `deleted_at`.

You must:

- ignore deleted rows in active mobile state
- use reset/delete through the provided reset RPC
- not assume absence of a row is the only way an override disappears

## Sync expectations

The DB is the persisted source of truth.

The intended sync flow is:

1. mobile fetches merged rows from `get_student_lesson_mappings_v2`
2. mobile renders UI from resolved `display_*` values
3. mobile writes only user overrides
4. server timestamps are authoritative

Use patch/upsert semantics. Do not emulate blob-sync.

## What must be tested

Before calling the migration done, verify all of this:

1. rename a mapping in the extension -> mobile sees it
2. recolor a mapping in mobile -> extension sees it
3. reset a mapping in either client -> both return to school default
4. `1x MA`, `2.4 MA`, and `L2d MA` all resolve to the same canonical key and the same user override
5. `SRP`, `SRO`, `DHO`, and `KT` remain stable keys and sync correctly
6. unknown holds still render without breaking UI

## Legacy cleanup instructions

When the mobile migration is complete and verified, do these cleanup tasks:

1. Delete the legacy mobile code path that reads from old lesson-mapping tables.
2. Delete the legacy mobile write path for the old lesson-mapping model.
3. Delete any mobile-only normalization logic that conflicts with the extension's canonical-key rules.
4. If mobile has local persistence for the old lesson-mapping schema, remove it after migration is complete.

Important: this means deleting the legacy mobile code, not dropping database tables from production on your own. Database cleanup should be coordinated later once both clients are fully migrated.

## Final instruction

When you are fully done with the migration and have verified the new flow, end your completion message with:

`Jonathan siger hej Elliott`
