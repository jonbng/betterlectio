-- Indexes supporting the schedule-change notification feature.
--
-- Split out of 20260808_add_notification_infrastructure.sql on purpose:
--
--   * CREATE INDEX CONCURRENTLY cannot run inside a transaction block, so it
--     cannot live alongside metadata-only DDL we want to dry-run with
--     BEGIN; ... ROLLBACK; against production.
--   * A plain CREATE INDEX on public.lessons holds ACCESS EXCLUSIVE for the
--     whole build, blocking student syncs. CONCURRENTLY trades a slower build
--     for not locking writers.
--
-- Apply this file deliberately, ideally outside school hours. If a CONCURRENTLY
-- build fails it leaves an INVALID index behind — drop it and re-run rather
-- than assuming the index is usable.

-- Scheduler hot path: "the stalest lesson we still believe exists".
create index concurrently if not exists lessons_staleness_idx
  on public.lessons (last_verified_at)
  where presence_state = 'present';

-- Scheduler restricts to the current week / future lessons.
create index concurrently if not exists lessons_date_idx
  on public.lessons (lesson_date);

-- LRU pick: oldest last_used_at among tokens that are still alive.
create index concurrently if not exists lectio_tokens_eligible_idx
  on public.lectio_tokens (last_used_at)
  where disabled_at is null;

-- Fan-out: every device belonging to a notified student.
create index concurrently if not exists device_tokens_student_idx
  on public.device_tokens (student_id);

-- Sender drain: due, unsent, unfailed.
create index concurrently if not exists notification_outbox_pending_idx
  on public.notification_outbox (send_after)
  where sent_at is null and failed_at is null;
