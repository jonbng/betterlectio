-- Schedule refreshes send a newly generated source_updated_at even when the
-- lesson itself did not change. Avoid turning those refreshes into heap, index,
-- trigger, WAL, and vacuum work. The RPC response remains backward-compatible:
-- `upserted` continues to report the accepted payload size.

create or replace function public.sync_student_week(
  p_student_id text,
  p_week_key text,
  p_lessons jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id bigint;
  v_lesson_keys text[] := array[]::text[];
  v_payload_count integer := 0;
  v_removed integer := 0;
  v_linked integer := 0;
begin
  select s.school_id
  into v_school_id
  from public.students s
  where s.id = p_student_id
    and (
      (select auth.role()) = 'service_role'
      or s.supabase_id = (select auth.uid())
    );

  if v_school_id is null then
    raise exception 'Unauthorized';
  end if;

  if p_week_key is null or p_week_key !~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$' then
    raise exception 'Invalid week key';
  end if;

  if p_lessons is null or jsonb_typeof(p_lessons) <> 'array' then
    raise exception 'Lessons must be a JSON array';
  end if;

  v_payload_count := jsonb_array_length(p_lessons);
  if v_payload_count > 250 then
    raise exception 'Too many lessons';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_lessons) as x(
      lesson_key text,
      lesson_date date,
      start_time text,
      end_time text,
      title text,
      teacher text,
      room text,
      status text,
      notes text,
      homework text,
      source_updated_at timestamptz,
      content jsonb
    )
    where x.lesson_key is null
      or btrim(x.lesson_key) = ''
      or length(x.lesson_key) > 256
      or x.lesson_date is null
      or x.start_time is null
      or x.end_time is null
      or x.title is null
      or btrim(x.title) = ''
      or length(x.title) > 1000
      or coalesce(x.status, 'normal') not in ('normal', 'cancelled', 'moved', 'changed')
      or (x.content is not null and jsonb_typeof(x.content) <> 'object')
  ) then
    raise exception 'Invalid lesson payload';
  end if;

  select coalesce(array_agg(k.lesson_key order by k.lesson_key), array[]::text[])
  into v_lesson_keys
  from (
    select distinct btrim(x.lesson_key) as lesson_key
    from jsonb_to_recordset(p_lessons) as x(lesson_key text)
  ) k;

  if cardinality(v_lesson_keys) <> v_payload_count then
    raise exception 'Duplicate lesson keys';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('sync_student_week:' || p_student_id || ':' || p_week_key, 0)
  );

  insert into public.lessons (
    school_id,
    lesson_key,
    week_key,
    lesson_date,
    start_time,
    end_time,
    title,
    teacher,
    room,
    status,
    notes,
    homework,
    source_updated_at,
    updated_at,
    content
  )
  select
    v_school_id,
    btrim(x.lesson_key),
    p_week_key,
    x.lesson_date,
    x.start_time,
    x.end_time,
    x.title,
    x.teacher,
    x.room,
    coalesce(x.status, 'normal'),
    x.notes,
    x.homework,
    coalesce(x.source_updated_at, now()),
    now(),
    x.content
  from jsonb_to_recordset(p_lessons) as x(
    lesson_key text,
    lesson_date date,
    start_time text,
    end_time text,
    title text,
    teacher text,
    room text,
    status text,
    notes text,
    homework text,
    source_updated_at timestamptz,
    content jsonb
  )
  on conflict (school_id, lesson_key) do update
  set week_key = excluded.week_key,
      lesson_date = excluded.lesson_date,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      title = excluded.title,
      teacher = excluded.teacher,
      room = excluded.room,
      status = excluded.status,
      notes = excluded.notes,
      homework = excluded.homework,
      source_updated_at = excluded.source_updated_at,
      updated_at = now(),
      content = coalesce(excluded.content, public.lessons.content)
  where row(
    public.lessons.week_key,
    public.lessons.lesson_date,
    public.lessons.start_time,
    public.lessons.end_time,
    public.lessons.title,
    public.lessons.teacher,
    public.lessons.room,
    public.lessons.status,
    public.lessons.notes,
    public.lessons.homework,
    public.lessons.content
  ) is distinct from row(
    excluded.week_key,
    excluded.lesson_date,
    excluded.start_time,
    excluded.end_time,
    excluded.title,
    excluded.teacher,
    excluded.room,
    excluded.status,
    excluded.notes,
    excluded.homework,
    coalesce(excluded.content, public.lessons.content)
  );

  insert into public.student_lessons (student_id, lesson_id)
  select p_student_id, l.id
  from public.lessons l
  where l.school_id = v_school_id
    and l.lesson_key = any(v_lesson_keys)
  on conflict (student_id, lesson_id) do nothing;

  delete from public.student_lessons sl
  using public.lessons l
  where sl.lesson_id = l.id
    and sl.student_id = p_student_id
    and l.school_id = v_school_id
    and l.week_key = p_week_key
    and not (l.lesson_key = any(v_lesson_keys));
  get diagnostics v_removed = row_count;

  delete from public.lessons l
  where l.school_id = v_school_id
    and l.week_key = p_week_key
    and not exists (
      select 1 from public.student_lessons sl where sl.lesson_id = l.id
    );

  insert into public.week_sync (student_id, week_key, last_synced_at, updated_at)
  values (p_student_id, p_week_key, now(), now())
  on conflict (student_id, week_key) do update
  set last_synced_at = excluded.last_synced_at,
      updated_at = now();

  select count(*)::integer
  into v_linked
  from public.student_lessons sl
  join public.lessons l on l.id = sl.lesson_id
  where sl.student_id = p_student_id
    and l.school_id = v_school_id
    and l.week_key = p_week_key;

  return jsonb_build_object(
    'upserted', v_payload_count,
    'linked', v_linked,
    'removed', v_removed
  );
end;
$$;

revoke all on function public.sync_student_week(text, text, jsonb) from public, anon;
grant execute on function public.sync_student_week(text, text, jsonb) to authenticated, service_role;

comment on function public.sync_student_week(text, text, jsonb) is
  'Atomically synchronizes one student week and skips unchanged lesson-row updates.';
