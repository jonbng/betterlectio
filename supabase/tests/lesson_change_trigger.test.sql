-- pgTAP suite for public.enqueue_lesson_change_notifications.
--
-- Run:  supabase test db
--
-- This is the highest-value test file in the notification feature. The trigger
-- decides who gets a push, and a push cannot be recalled — so every suppression
-- rule gets an explicit test, and the suppressions are tested BEFORE the happy
-- paths on purpose. A trigger that over-notifies is worse than one that
-- under-notifies.

begin;
select plan(19);

-- ── fixtures ────────────────────────────────────────────────────────

-- A school and two classmates linked to the same lesson. The link rows are
-- backdated past the 10-minute first-link grace so they are eligible by
-- default; individual tests override this where relevant.
insert into public.schools (id, name) values (9001, 'Testskole')
  on conflict (id) do nothing;

-- students.supabase_id is NOT NULL and references auth.users, so the fixture
-- has to mint auth rows first. Everything rolls back at the end of the file.
insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'a@test.invalid'),
       ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'b@test.invalid')
  on conflict (id) do nothing;

insert into public.students (id, school_id, name, supabase_id)
values ('stu-a', 9001, 'Elev A', '00000000-0000-0000-0000-00000000000a'),
       ('stu-b', 9001, 'Elev B', '00000000-0000-0000-0000-00000000000b')
  on conflict (id) do nothing;

-- Helper: create a lesson N hours in the future and link the given students.
create or replace function pg_temp.make_lesson(
  p_key text,
  p_hours_ahead int default 48,
  p_link_age interval default interval '1 day'
) returns uuid
language plpgsql as $$
declare
  v_id uuid;
  v_date date := ((now() + make_interval(hours => p_hours_ahead)) at time zone 'Europe/Copenhagen')::date;
  v_time text := to_char((now() + make_interval(hours => p_hours_ahead)) at time zone 'Europe/Copenhagen', 'HH24:MI');
begin
  insert into public.lessons (
    lesson_key, week_key, lesson_date, start_time, end_time, title, teacher, room, status
  ) values (
    p_key, '2026-W32', v_date, v_time, '23:59', 'Matematik', 'ABC', '24', 'normal'
  )
  returning id into v_id;

  insert into public.student_lessons (student_id, lesson_id, created_at)
  values ('stu-a', v_id, now() - p_link_age),
         ('stu-b', v_id, now() - p_link_age);

  return v_id;
end;
$$;

create or replace function pg_temp.outbox_count(p_key text)
returns bigint language sql as $$
  select count(*) from public.notification_outbox where lesson_key = p_key;
$$;

-- ── suppressions (tested first, deliberately) ───────────────────────

-- A fresh insert must never notify: on a student's very first sync every
-- lesson is new, and an INSERT-triggered fan-out would push their whole
-- timetable at them.
select lives_ok($$ select pg_temp.make_lesson('L-insert'); $$,
  'inserting a lesson runs cleanly');

select is(pg_temp.outbox_count('L-insert'), 0::bigint,
  'inserting a lesson notifies nobody');

-- First-link suppression: the link is younger than the grace window, so even a
-- real cancellation stays silent for that student.
select lives_ok($$
  select pg_temp.make_lesson('L-freshlink', 48, interval '1 minute');
  update public.lessons set status = 'cancelled' where lesson_key = 'L-freshlink';
$$, 'cancelling a lesson with only fresh links runs cleanly');

select is(pg_temp.outbox_count('L-freshlink'), 0::bigint,
  'a link younger than the grace window suppresses notification');

-- Past lessons are not actionable.
select lives_ok($$
  select pg_temp.make_lesson('L-past', -5);
  update public.lessons set status = 'cancelled' where lesson_key = 'L-past';
$$, 'cancelling a past lesson runs cleanly');

select is(pg_temp.outbox_count('L-past'), 0::bigint,
  'a lesson that already started notifies nobody');

-- Low-confidence presence. This is the guard that stops a parser regression
-- from blasting a whole school with false cancellations.
select lives_ok($$
  select pg_temp.make_lesson('L-missing');
  update public.lessons
     set presence_state = 'missing', status = 'cancelled'
   where lesson_key = 'L-missing';
$$, 'flipping a lesson to missing runs cleanly');

select is(pg_temp.outbox_count('L-missing'), 0::bigint,
  'presence_state=missing never notifies, even when status becomes cancelled');

-- Homework is deliberately not a notification.
select lives_ok($$
  select pg_temp.make_lesson('L-homework');
  update public.lessons set homework = 'Læs side 12-40' where lesson_key = 'L-homework';
$$, 'editing homework runs cleanly');

select is(pg_temp.outbox_count('L-homework'), 0::bigint,
  'a homework-only edit notifies nobody');

-- Per-student preferences.
select lives_ok($$
  insert into public.notification_prefs (student_id, cancellations)
  values ('stu-b', false);
  select pg_temp.make_lesson('L-prefs');
  update public.lessons set status = 'cancelled' where lesson_key = 'L-prefs';
$$, 'cancelling with one student opted out runs cleanly');

select is(pg_temp.outbox_count('L-prefs'), 1::bigint,
  'a student who opted out of cancellations is not enqueued');

-- ── idempotency ─────────────────────────────────────────────────────

-- Lectio sometimes writes a change in two steps. The same end state must
-- collapse to one push, not two.
-- Flapping back to normal and re-cancelling reaches the SAME end state, so the
-- idempotency key must collapse it. Writing `set status='cancelled'` twice in a
-- row would NOT test this: the second write is a no-op change and returns before
-- reaching the insert, so ON CONFLICT never runs.
select lives_ok($$
  select pg_temp.make_lesson('L-churn');
  update public.lessons set status = 'cancelled' where lesson_key = 'L-churn';
  update public.lessons set status = 'normal'    where lesson_key = 'L-churn';
  update public.lessons set status = 'cancelled' where lesson_key = 'L-churn';
$$, 'cancelling, un-cancelling and re-cancelling runs cleanly');

select is(pg_temp.outbox_count('L-churn'), 2::bigint,
  'the same resulting state written twice yields one row per student, not two');

-- ── happy paths ─────────────────────────────────────────────────────

select lives_ok($$
  select pg_temp.make_lesson('L-cancel');
  update public.lessons set status = 'cancelled' where lesson_key = 'L-cancel';
$$, 'cancelling a future lesson runs cleanly');

select is(pg_temp.outbox_count('L-cancel'), 2::bigint,
  'a cancellation fans out to both linked classmates');

select is(
  (select kind from public.notification_outbox
    where lesson_key = 'L-cancel' and student_id = 'stu-a'),
  'cancelled',
  'the cancellation is classified as kind=cancelled');

-- A cancelled lesson that also moved is a cancellation, not a move.
select lives_ok($$
  select pg_temp.make_lesson('L-both');
  update public.lessons
     set status = 'cancelled', start_time = '07:15'
   where lesson_key = 'L-both';
$$, 'a simultaneous cancel+move runs cleanly');

select is(
  (select distinct kind from public.notification_outbox where lesson_key = 'L-both'),
  'cancelled',
  'cancellation takes precedence over a simultaneous time change');

select * from finish();
rollback;
