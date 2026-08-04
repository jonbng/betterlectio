-- Infrastructure for schedule-change push notifications.
--
-- Design spec: mobile/docs/superpowers/specs/2026-08-04-schedule-change-notifications-design.md
--
-- Four concerns live here:
--   * lessons gains a staleness clock (last_verified_at) and a low-confidence
--     presence_state, so a lesson vanishing from a fetch is recorded WITHOUT
--     being treated as a cancellation.
--   * lectio_tokens holds each student's encrypted autologinkeyV2 so a cron
--     worker can poll Lectio on their behalf. Deliberately has NO select
--     policy — only the service role may ever read a token.
--   * device_tokens / notification_outbox / notification_prefs carry delivery.
--
-- The diff trigger that populates notification_outbox lands in the companion
-- migration 20260808_lesson_change_trigger.sql.

-- ── lessons: staleness + presence ────────────────────────────────────

alter table public.lessons
  add column if not exists last_verified_at timestamptz not null default now();

alter table public.lessons
  add column if not exists presence_state text not null default 'present';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lessons_presence_state_check'
  ) then
    alter table public.lessons
      add constraint lessons_presence_state_check
      check (presence_state in ('present', 'missing'));
  end if;
end $$;

comment on column public.lessons.last_verified_at is
  'Bumped on every write (client sync or server poll), whether or not content changed. '
  'The scheduler picks the stalest lesson by this column. Contrast updated_at, which '
  'means the content actually changed.';

comment on column public.lessons.presence_state is
  'present = seen in the latest fetch. missing = previously known but absent from the '
  'latest fetch. missing is LOW CONFIDENCE (an empty parse looks identical to a fully '
  'cancelled week) and the change trigger ignores it — cancellation is only ever taken '
  'from Lectio''s explicit "Aflyst!" status.';

-- Indexes for this feature live in the companion migration
-- 20260808_add_notification_indexes.sql, which uses CREATE INDEX CONCURRENTLY.
-- Keeping them out of this file means this migration is pure metadata-only DDL
-- and can safely be dry-run against production inside BEGIN; ... ROLLBACK;.

-- ── student_lessons: link age, for the first-link suppression ────────
--
-- When a student links to a lesson for the first time, every field is "new".
-- The trigger needs the age of the LINK (not the lesson) to suppress that.

alter table public.student_lessons
  add column if not exists created_at timestamptz not null default now();

-- ── lectio_tokens ───────────────────────────────────────────────────

create table if not exists public.lectio_tokens (
  student_id text primary key
    references public.students(id) on delete cascade,
  encrypted_token bytea not null,
  last_used_at timestamptz not null default 'epoch'::timestamptz,
  consecutive_failures int not null default 0,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.lectio_tokens is
  'Envelope-encrypted autologinkeyV2 per student, used by the schedule-poller worker '
  'to mint a Lectio session. Bearer credential — no select policy exists, service role only.';

comment on column public.lectio_tokens.last_used_at is
  'Bumped on EVERY poll attempt including failures. If failures did not bump it, a '
  'student with a dead token would stay permanently at the front of the LRU queue '
  'and starve every other student behind them.';

alter table public.lectio_tokens enable row level security;

-- Insert/update own row only. Note the absence of a select policy: this is
-- intentional and load-bearing. Even a leaked anon key cannot read tokens.
drop policy if exists "lectio_tokens_insert_own" on public.lectio_tokens;
create policy "lectio_tokens_insert_own"
  on public.lectio_tokens for insert
  to authenticated
  with check (
    lectio_tokens.student_id in (
      select s.id from public.students s where s.supabase_id = auth.uid()
    )
  );

drop policy if exists "lectio_tokens_update_own" on public.lectio_tokens;
create policy "lectio_tokens_update_own"
  on public.lectio_tokens for update
  to authenticated
  using (
    lectio_tokens.student_id in (
      select s.id from public.students s where s.supabase_id = auth.uid()
    )
  );

-- Revoke must actually delete the row, so users can withdraw consent.
drop policy if exists "lectio_tokens_delete_own" on public.lectio_tokens;
create policy "lectio_tokens_delete_own"
  on public.lectio_tokens for delete
  to authenticated
  using (
    lectio_tokens.student_id in (
      select s.id from public.students s where s.supabase_id = auth.uid()
    )
  );


-- ── device_tokens ───────────────────────────────────────────────────

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  student_id text not null
    references public.students(id) on delete cascade,
  apns_token text not null unique,
  environment text not null default 'production'
    check (environment in ('production', 'sandbox')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.device_tokens enable row level security;

drop policy if exists "device_tokens_manage_own" on public.device_tokens;
create policy "device_tokens_manage_own"
  on public.device_tokens for all
  to authenticated
  using (
    device_tokens.student_id in (
      select s.id from public.students s where s.supabase_id = auth.uid()
    )
  )
  with check (
    device_tokens.student_id in (
      select s.id from public.students s where s.supabase_id = auth.uid()
    )
  );


-- ── notification_prefs ──────────────────────────────────────────────

create table if not exists public.notification_prefs (
  student_id text primary key
    references public.students(id) on delete cascade,
  enabled boolean not null default true,
  cancellations boolean not null default true,
  moved boolean not null default true,
  room boolean not null default true,
  teacher boolean not null default true,
  notes boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on column public.notification_prefs.notes is
  'Opt-in, off by default — note edits are frequent and mostly not actionable.';

alter table public.notification_prefs enable row level security;

drop policy if exists "notification_prefs_manage_own" on public.notification_prefs;
create policy "notification_prefs_manage_own"
  on public.notification_prefs for all
  to authenticated
  using (
    notification_prefs.student_id in (
      select s.id from public.students s where s.supabase_id = auth.uid()
    )
  )
  with check (
    notification_prefs.student_id in (
      select s.id from public.students s where s.supabase_id = auth.uid()
    )
  );

-- ── notification_outbox ─────────────────────────────────────────────

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  student_id text not null
    references public.students(id) on delete cascade,
  lesson_key text not null,
  kind text not null
    check (kind in ('cancelled', 'moved', 'room', 'teacher', 'notes')),
  payload jsonb not null,
  idempotency_key text not null unique,
  lesson_starts_at timestamptz,
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

comment on column public.notification_outbox.idempotency_key is
  'sha256 of (student_id, lesson_key, kind, resulting state). Two writes producing the '
  'same end state collapse to one notification.';

comment on column public.notification_outbox.send_after is
  'Set ~2 minutes ahead so Lectio''s multi-step edits collapse before delivery, and '
  'pushed to morning by quiet hours when the lesson is more than 12h away.';

-- Outbox is service-role only in both directions; clients never touch it.
alter table public.notification_outbox enable row level security;

