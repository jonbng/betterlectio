-- Turns changes on public.lessons into notification_outbox rows.
--
-- Design spec: mobile/docs/superpowers/specs/2026-08-04-schedule-change-notifications-design.md
--
-- WHY THIS LIVES IN THE DATABASE, NOT THE POLLER
-- ----------------------------------------------
-- Two independent writers touch public.lessons: the schedule-poller edge
-- function, and every student's phone syncing a week through
-- SupabaseScheduleService. If the diff lived in the poller, client-initiated
-- syncs would silently produce no notifications, and we would eventually grow
-- a second diff implementation that drifts from this one.
--
-- Putting it in a trigger means whoever writes the row is irrelevant: a student
-- who opens the app and pulls a cancellation automatically becomes the source
-- of the push to their 27 classmates.
--
-- SAFETY POSTURE
-- --------------
-- Notifications are irreversible — you cannot un-ring a lock screen. Every
-- inference here fails CLOSED: when in doubt, stay silent. In particular
-- cancellation is only ever taken from Lectio's explicit "Aflyst!" status
-- (status = 'cancelled'), never from a lesson disappearing from a fetch. See
-- presence_state on public.lessons.

-- ── helpers ─────────────────────────────────────────────────────────

-- lesson_date is a date and start_time/end_time are free text from Lectio
-- ("09:00"). Bad input must not raise inside the trigger — a parse failure
-- would abort the student's whole sync transaction. Return null instead and
-- let callers treat "unknown time" as "do not notify".
create or replace function public.lesson_moment(
  p_date date,
  p_time text
) returns timestamptz
language plpgsql
stable
as $$
begin
  if p_date is null or p_time is null or btrim(p_time) = '' then
    return null;
  end if;
  return (p_date + p_time::time) at time zone 'Europe/Copenhagen';
exception when others then
  return null;
end;
$$;

comment on function public.lesson_moment is
  'Combines a lesson date and a free-text Lectio time into a timestamptz in '
  'Europe/Copenhagen. Returns null rather than raising on unparseable input, so '
  'a malformed time can never abort a student''s sync transaction.';

-- ── the trigger ─────────────────────────────────────────────────────

create or replace function public.enqueue_lesson_change_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_starts_at   timestamptz;
  v_old_starts  timestamptz;
  v_when        text;
  v_kind        text;
  v_title       text;
  v_body        text;
  v_state       text;
  r             record;
begin
  -- A lesson we are not confident exists must never notify. presence_state
  -- 'missing' means "absent from the latest fetch", which is indistinguishable
  -- from a parser regression or a silent login redirect.
  if new.presence_state <> 'present' or old.presence_state <> 'present' then
    return new;
  end if;

  v_starts_at := public.lesson_moment(new.lesson_date, new.start_time);
  v_old_starts := public.lesson_moment(old.lesson_date, old.start_time);

  -- Unknown time => cannot judge past-ness or quiet hours. Stay silent.
  if v_starts_at is null then
    return new;
  end if;

  -- A lesson that already started is not actionable.
  if v_starts_at <= now() then
    return new;
  end if;

  -- Classify the change. Order matters: a cancelled lesson that also moved is
  -- a cancellation, not a move.
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    v_kind := 'cancelled';
  elsif new.lesson_date is distinct from old.lesson_date
     or new.start_time is distinct from old.start_time
     or new.end_time   is distinct from old.end_time then
    v_kind := 'moved';
  elsif new.room is distinct from old.room then
    v_kind := 'room';
  elsif new.teacher is distinct from old.teacher then
    v_kind := 'teacher';
  elsif new.notes is distinct from old.notes then
    v_kind := 'notes';
  else
    -- Includes homework-only edits, which are deliberately never notified.
    return new;
  end if;

  -- Danish copy, matching the app's language.
  v_when := to_char(v_starts_at at time zone 'Europe/Copenhagen', 'HH24:MI');

  if v_kind = 'cancelled' then
    v_title := coalesce(new.title, 'Lektion') || ' er aflyst';
    v_body  := 'Timen kl. ' || v_when || ' er aflyst.';
    v_state := 'cancelled';
  elsif v_kind = 'moved' then
    v_title := coalesce(new.title, 'Lektion') || ' er flyttet';
    v_body  := 'Timen er flyttet til '
               || to_char(v_starts_at at time zone 'Europe/Copenhagen', 'DD/MM')
               || ' kl. ' || v_when || '.';
    v_state := new.lesson_date::text || '|' || new.start_time || '|' || new.end_time;
  elsif v_kind = 'room' then
    v_title := coalesce(new.title, 'Lektion') || ': nyt lokale';
    v_body  := 'Timen kl. ' || v_when || ' er flyttet til lokale '
               || coalesce(new.room, '?') || '.';
    v_state := coalesce(new.room, '');
  elsif v_kind = 'teacher' then
    v_title := coalesce(new.title, 'Lektion') || ': vikar';
    v_body  := 'Timen kl. ' || v_when || ' har nu '
               || coalesce(new.teacher, 'en anden lærer') || '.';
    v_state := coalesce(new.teacher, '');
  else
    v_title := coalesce(new.title, 'Lektion') || ': ny note';
    v_body  := coalesce(new.notes, '');
    v_state := coalesce(new.notes, '');
  end if;

  -- Fan out to every linked student who wants this kind of notification.
  for r in
    select sl.student_id
      from public.student_lessons sl
      left join public.notification_prefs np
        on np.student_id = sl.student_id
     where sl.lesson_id = new.id
       -- First-link suppression: when a student links to a lesson for the
       -- first time every field reads as "new". Gate on the age of the LINK,
       -- not the lesson, or a student's very first sync notifies them about
       -- their entire timetable.
       and sl.created_at < now() - interval '10 minutes'
       and coalesce(np.enabled, true)
       and case v_kind
             when 'cancelled' then coalesce(np.cancellations, true)
             when 'moved'     then coalesce(np.moved, true)
             when 'room'      then coalesce(np.room, true)
             when 'teacher'   then coalesce(np.teacher, true)
             when 'notes'     then coalesce(np.notes, false)
           end
  loop
    insert into public.notification_outbox (
      student_id, lesson_key, kind, payload,
      idempotency_key, lesson_starts_at, send_after
    )
    values (
      r.student_id,
      new.lesson_key,
      v_kind,
      jsonb_build_object(
        'title', v_title,
        'body', v_body,
        'lesson_key', new.lesson_key,
        'lesson_date', new.lesson_date,
        'start_time', new.start_time,
        'previous_starts_at', v_old_starts
      ),
      -- md5, not sha256-via-pgcrypto: this is a dedup key, not a security
      -- boundary, and md5() is a built-in. Using digest() would drag in
      -- pgcrypto and break under this function's `search_path = public`.
      md5(r.student_id || '|' || new.lesson_key || '|' || v_kind || '|' || v_state),
      v_starts_at,
      -- Held briefly so Lectio's multi-step edits collapse into one push.
      now() + interval '2 minutes'
    )
    -- Same student, same lesson, same resulting state => one notification.
    -- This is what makes a re-write of an unchanged value harmless.
    on conflict (idempotency_key) do nothing;
  end loop;

  return new;
end;
$$;

comment on function public.enqueue_lesson_change_notifications is
  'AFTER UPDATE trigger on public.lessons. Fans a notify-worthy change out to every '
  'linked student as a notification_outbox row. Fails closed: silent on unknown '
  'times, past lessons, low-confidence presence, and fresh links.';

-- AFTER, not BEFORE: this is a side effect, not a mutation of NEW. Running it
-- BEFORE would enqueue notifications for a row that a later BEFORE trigger or
-- a constraint could still reject.
drop trigger if exists lessons_enqueue_change_notifications on public.lessons;
create trigger lessons_enqueue_change_notifications
  after update on public.lessons
  for each row
  execute function public.enqueue_lesson_change_notifications();
