create or replace function public.upsert_student_homework_status(
  p_school_id bigint,
  p_student_id text,
  p_entry_id text,
  p_is_done boolean,
  p_client_updated_at timestamptz default null,
  p_last_modified_by text default null,
  p_lesson_date date default null,
  p_display_date text default null,
  p_hold text default null,
  p_title text default null,
  p_teacher text default null,
  p_room text default null,
  p_note text default null,
  p_items_json jsonb default null
)
returns table (
  entry_id text,
  homework_id uuid,
  school_id bigint,
  student_id text,
  is_done boolean,
  client_updated_at timestamptz,
  last_modified_by text,
  done_updated_at timestamptz,
  updated_at timestamptz,
  lesson_date date
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_homework_id uuid;
  v_homework_school_id bigint;
  v_effective_client_updated_at timestamptz := coalesce(p_client_updated_at, now());
begin
  if not exists (
    select 1
    from public.students s
    where s.id = p_student_id
      and s.school_id = p_school_id
      and (
        auth.role() = 'service_role'
        or s.supabase_id = auth.uid()
      )
  ) then
    raise exception 'Unauthorized';
  end if;

  select h.id, h.school_id
    into v_homework_id, v_homework_school_id
  from public.homework_entries h
  where h.entry_id = p_entry_id
    and (h.school_id = p_school_id or h.school_id is null)
  order by case when h.school_id = p_school_id then 0 else 1 end
  limit 1
  for update;

  if v_homework_id is null then
    if p_lesson_date is null or p_display_date is null or p_hold is null then
      raise exception 'Homework entry not found';
    end if;

    insert into public.homework_entries (
      entry_id,
      school_id,
      lesson_date,
      display_date,
      hold,
      title,
      teacher,
      room,
      note,
      items_json,
      source_updated_at,
      updated_at
    ) values (
      p_entry_id,
      p_school_id,
      p_lesson_date,
      p_display_date,
      p_hold,
      p_title,
      p_teacher,
      p_room,
      p_note,
      p_items_json,
      now(),
      now()
    )
    returning id, school_id into v_homework_id, v_homework_school_id;
  elsif v_homework_school_id is null then
    update public.homework_entries h
    set school_id = p_school_id,
        lesson_date = coalesce(p_lesson_date, h.lesson_date),
        display_date = coalesce(p_display_date, h.display_date),
        hold = coalesce(p_hold, h.hold),
        title = coalesce(p_title, h.title),
        teacher = coalesce(p_teacher, h.teacher),
        room = coalesce(p_room, h.room),
        note = coalesce(p_note, h.note),
        items_json = coalesce(p_items_json, h.items_json),
        source_updated_at = now(),
        updated_at = now()
    where h.id = v_homework_id
      and h.school_id is null;
  elsif v_homework_school_id <> p_school_id then
    raise exception 'Homework entry belongs to another school';
  end if;

  insert into public.student_homework (
    student_id,
    homework_id,
    is_done,
    client_updated_at,
    last_modified_by,
    done_updated_at
  )
  values (
    p_student_id,
    v_homework_id,
    p_is_done,
    v_effective_client_updated_at,
    p_last_modified_by,
    now()
  )
  on conflict (student_id, homework_id) do update
    set is_done = excluded.is_done,
        client_updated_at = excluded.client_updated_at,
        last_modified_by = excluded.last_modified_by,
        done_updated_at = now()
    where student_homework.client_updated_at is null
       or student_homework.client_updated_at <= excluded.client_updated_at;

  return query
  select *
  from public.get_student_homework_statuses(p_school_id, p_student_id) sh
  where sh.entry_id = p_entry_id;
end;
$$;

revoke all on function public.upsert_student_homework_status(bigint, text, text, boolean, timestamptz, text, date, text, text, text, text, text, text, jsonb) from public;
grant execute on function public.upsert_student_homework_status(bigint, text, text, boolean, timestamptz, text, date, text, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.upsert_student_homework_status(bigint, text, text, boolean, timestamptz, text, date, text, text, text, text, text, text, jsonb) to service_role;
