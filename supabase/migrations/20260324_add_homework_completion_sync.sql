alter table public.homework_entries
  add column if not exists school_id bigint references public.schools(id) on delete cascade;

alter table public.student_homework
  add column if not exists client_updated_at timestamptz null,
  add column if not exists last_modified_by text null;

create index if not exists homework_entries_school_lesson_idx
  on public.homework_entries (school_id, lesson_date asc);

create index if not exists homework_entries_school_entry_idx
  on public.homework_entries (school_id, entry_id);

create index if not exists student_homework_student_done_updated_idx
  on public.student_homework (student_id, done_updated_at desc);

drop trigger if exists set_student_homework_updated_at on public.student_homework;
create trigger set_student_homework_updated_at
before update on public.student_homework
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.homework_entries enable row level security;
alter table public.student_homework enable row level security;

drop policy if exists "homework_select_all" on public.homework_entries;
drop policy if exists "homework_insert_all" on public.homework_entries;
drop policy if exists "homework_update_all" on public.homework_entries;
drop policy if exists "homework_delete_all" on public.homework_entries;

drop policy if exists "homework_entries_select_same_school" on public.homework_entries;
create policy "homework_entries_select_same_school"
on public.homework_entries
for select
to authenticated
using (
  school_id is not null
  and exists (
    select 1
    from public.students s
    where s.supabase_id = auth.uid()
      and s.school_id = homework_entries.school_id
  )
);

drop policy if exists "homework_entries_write_service_role" on public.homework_entries;
create policy "homework_entries_write_service_role"
on public.homework_entries
for all
to service_role
using (true)
with check (true);

drop policy if exists "student_homework_select_own" on public.student_homework;
create policy "student_homework_select_own"
on public.student_homework
for select
to authenticated
using (
  exists (
    select 1
    from public.students s
    where s.id = student_homework.student_id
      and s.supabase_id = auth.uid()
  )
);

drop policy if exists "student_homework_insert_own" on public.student_homework;
create policy "student_homework_insert_own"
on public.student_homework
for insert
to authenticated
with check (
  exists (
    select 1
    from public.students s
    join public.homework_entries h on h.id = student_homework.homework_id
    where s.id = student_homework.student_id
      and s.supabase_id = auth.uid()
      and h.school_id is not null
      and s.school_id = h.school_id
  )
);

drop policy if exists "student_homework_update_own" on public.student_homework;
create policy "student_homework_update_own"
on public.student_homework
for update
to authenticated
using (
  exists (
    select 1
    from public.students s
    where s.id = student_homework.student_id
      and s.supabase_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.students s
    join public.homework_entries h on h.id = student_homework.homework_id
    where s.id = student_homework.student_id
      and s.supabase_id = auth.uid()
      and h.school_id is not null
      and s.school_id = h.school_id
  )
);

drop policy if exists "student_homework_delete_own" on public.student_homework;
create policy "student_homework_delete_own"
on public.student_homework
for delete
to authenticated
using (
  exists (
    select 1
    from public.students s
    where s.id = student_homework.student_id
      and s.supabase_id = auth.uid()
  )
);

drop policy if exists "student_homework_write_service_role" on public.student_homework;
create policy "student_homework_write_service_role"
on public.student_homework
for all
to service_role
using (true)
with check (true);

create or replace function public.get_student_homework_statuses(
  p_school_id bigint,
  p_student_id text
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
language sql
stable
security definer
set search_path = public
as $$
  select
    h.entry_id,
    sh.homework_id,
    h.school_id,
    sh.student_id,
    sh.is_done,
    sh.client_updated_at,
    sh.last_modified_by,
    sh.done_updated_at,
    sh.updated_at,
    h.lesson_date
  from public.student_homework sh
  join public.homework_entries h on h.id = sh.homework_id
  where h.school_id = p_school_id
    and sh.student_id = p_student_id
    and (
      auth.role() = 'service_role'
      or exists (
        select 1
        from public.students s
        where s.id = p_student_id
          and s.school_id = p_school_id
          and s.supabase_id = auth.uid()
      )
    )
  order by h.lesson_date asc, h.entry_id asc;
$$;

revoke all on function public.get_student_homework_statuses(bigint, text) from public;
grant execute on function public.get_student_homework_statuses(bigint, text) to authenticated;
grant execute on function public.get_student_homework_statuses(bigint, text) to service_role;

create or replace function public.upsert_student_homework_status(
  p_school_id bigint,
  p_student_id text,
  p_entry_id text,
  p_is_done boolean,
  p_client_updated_at timestamptz default null,
  p_last_modified_by text default null
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
    raise exception 'Homework entry not found';
  end if;

  if v_homework_school_id is null then
    update public.homework_entries h
    set school_id = p_school_id
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

revoke all on function public.upsert_student_homework_status(bigint, text, text, boolean, timestamptz, text) from public;
grant execute on function public.upsert_student_homework_status(bigint, text, text, boolean, timestamptz, text) to authenticated;
grant execute on function public.upsert_student_homework_status(bigint, text, text, boolean, timestamptz, text) to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'student_homework'
    ) then
      execute 'alter publication supabase_realtime add table public.student_homework';
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'homework_entries'
    ) then
      execute 'alter publication supabase_realtime add table public.homework_entries';
    end if;
  end if;
end $$;
