-- The unique constraint already provides an index on (student_id, week_key).
-- Keeping a second identical non-unique index doubles index maintenance for
-- week-sync upserts without providing a different access path.

drop index if exists public.week_sync_student_week_idx;
