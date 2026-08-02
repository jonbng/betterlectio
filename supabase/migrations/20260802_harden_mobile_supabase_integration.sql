-- Harden the mobile Supabase integration and replace direct schedule-table writes
-- with authenticated, atomic RPCs.

begin;

-- Serialize the one-time cleanup against legacy clients while this migration runs.
lock table public.lessons, public.student_lessons, public.week_sync in access exclusive mode;

insert into public.admin_audit_log (
  actor,
  action,
  target_table,
  before,
  metadata
)
values (
  'migration',
  'mobile_schedule_cleanup_snapshot',
  'lessons,student_lessons,week_sync',
  jsonb_build_object(
    'unlinked_lesson_ids', coalesce(
      (
        select jsonb_agg(l.id order by l.id)
        from public.lessons l
        where not exists (
          select 1 from public.student_lessons sl where sl.lesson_id = l.id
        )
      ),
      '[]'::jsonb
    ),
    'week_sync_rows', coalesce(
      (
        select jsonb_agg(to_jsonb(ws) order by ws.created_at, ws.id)
        from public.week_sync ws
      ),
      '[]'::jsonb
    )
  ),
  jsonb_build_object(
    'unlinked_lessons', (
      select count(*)
      from public.lessons l
      where not exists (
        select 1 from public.student_lessons sl where sl.lesson_id = l.id
      )
    ),
    'student_lesson_links', (select count(*) from public.student_lessons),
    'week_sync_rows', (select count(*) from public.week_sync)
  )
);

-- Preserve any links that may have appeared after the original audit. Derive the
-- owning school for linked lessons, then remove only rows with no recoverable owner.
alter table public.lessons add column if not exists school_id bigint;

update public.lessons l
set school_id = owners.school_id
from (
  select sl.lesson_id, min(s.school_id)::bigint as school_id
  from public.student_lessons sl
  join public.students s on s.id = sl.student_id
  group by sl.lesson_id
  having count(distinct s.school_id) = 1
) owners
where owners.lesson_id = l.id
  and l.school_id is null;

delete from public.lessons l
where l.school_id is null
  and not exists (
    select 1 from public.student_lessons sl where sl.lesson_id = l.id
  );

do $$
begin
  if exists (select 1 from public.lessons where school_id is null) then
    raise exception 'Cannot harden lessons: linked rows span schools or lack an owner';
  end if;
end;
$$;

delete from public.week_sync;

alter table public.lessons
  alter column school_id set not null;

alter table public.lessons
  drop constraint if exists lessons_lesson_key_unique;

alter table public.lessons
  add constraint lessons_school_id_fkey
  foreign key (school_id) references public.schools(id) on update cascade on delete cascade;

alter table public.lessons
  add constraint lessons_school_lesson_key_unique unique (school_id, lesson_key);

create unique index if not exists students_supabase_id_unique_idx
  on public.students (supabase_id)
  where supabase_id is not null;
create index if not exists lessons_school_week_idx
  on public.lessons (school_id, week_key);
create index if not exists student_lessons_lesson_id_idx
  on public.student_lessons (lesson_id);
create index if not exists feedback_comments_author_student_id_idx
  on public.feedback_comments (author_student_id);
create index if not exists feedback_items_duplicate_of_idx
  on public.feedback_items (duplicate_of);
create index if not exists student_lessoncontrols_mapping_id_idx
  on public.student_lessoncontrols (mapping_id);
create index if not exists students_referral_click_id_idx
  on public.students (referral_click_id);

drop policy if exists lessons_delete_all on public.lessons;
drop policy if exists lessons_insert_all on public.lessons;
drop policy if exists lessons_select_all on public.lessons;
drop policy if exists lessons_update_all on public.lessons;
drop policy if exists student_lessons_select_own on public.student_lessons;
drop policy if exists week_sync_delete_all on public.week_sync;
drop policy if exists week_sync_insert_all on public.week_sync;
drop policy if exists week_sync_select_all on public.week_sync;
drop policy if exists week_sync_update_all on public.week_sync;

create policy lessons_select_linked
on public.lessons
for select
to authenticated
using (
  exists (
    select 1
    from public.student_lessons sl
    join public.students s on s.id = sl.student_id
    where sl.lesson_id = lessons.id
      and s.supabase_id = (select auth.uid())
  )
);

create policy student_lessons_select_own
on public.student_lessons
for select
to authenticated
using (
  exists (
    select 1
    from public.students s
    where s.id = student_lessons.student_id
      and s.supabase_id = (select auth.uid())
  )
);

create policy week_sync_select_own
on public.week_sync
for select
to authenticated
using (
  exists (
    select 1
    from public.students s
    where s.id = week_sync.student_id
      and s.supabase_id = (select auth.uid())
  )
);

revoke all on public.lessons, public.student_lessons, public.week_sync from anon;
revoke insert, update, delete on public.lessons, public.student_lessons, public.week_sync from authenticated;
grant select on public.lessons, public.student_lessons, public.week_sync to authenticated;

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
      content = coalesce(excluded.content, public.lessons.content);

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

create or replace function public.update_student_lesson_content(
  p_student_id text,
  p_lesson_key text,
  p_content jsonb,
  p_client_updated_at timestamptz default now()
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id bigint;
  v_updated integer := 0;
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

  if p_lesson_key is null or btrim(p_lesson_key) = '' then
    raise exception 'Invalid lesson key';
  end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    raise exception 'Content must be a JSON object';
  end if;

  update public.lessons l
  set content = p_content,
      updated_at = coalesce(p_client_updated_at, now())
  where l.school_id = v_school_id
    and l.lesson_key = p_lesson_key
    and exists (
      select 1
      from public.student_lessons sl
      where sl.lesson_id = l.id
        and sl.student_id = p_student_id
    );
  get diagnostics v_updated = row_count;

  if v_updated <> 1 then
    raise exception 'Lesson is not linked to this student';
  end if;
  return true;
end;
$$;

revoke all on function public.sync_student_week(text, text, jsonb) from public, anon;
grant execute on function public.sync_student_week(text, text, jsonb) to authenticated, service_role;
revoke all on function public.update_student_lesson_content(text, text, jsonb, timestamptz) from public, anon;
grant execute on function public.update_student_lesson_content(text, text, jsonb, timestamptz) to authenticated, service_role;

-- Keep extension profile editing working without allowing identity, school,
-- referral, or installation fields to be forged by clients.
drop policy if exists "Students can update own row" on public.students;
create policy "Students can update own row"
on public.students
for update
to authenticated
using (supabase_id = (select auth.uid()))
with check (supabase_id = (select auth.uid()));

revoke update on public.students from anon, authenticated;
grant update (
  name,
  description,
  instagram,
  show_birthday,
  class_name,
  marked_android_at,
  dismissed_app_prompt_at
) on public.students to authenticated;

create or replace function public.update_school_student_count(
  p_school_id int,
  p_count int
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_count int;
  v_existing_updated_at timestamptz;
begin
  if (select auth.role()) <> 'service_role' and not exists (
    select 1
    from public.students s
    where s.school_id = p_school_id
      and s.supabase_id = (select auth.uid())
  ) then
    raise exception 'Unauthorized';
  end if;

  if p_count is null or p_count < 1 or p_count > 50000 then
    return false;
  end if;

  select s.student_count, s.student_count_updated_at
  into v_existing_count, v_existing_updated_at
  from public.schools s
  where s.id = p_school_id;

  if not found then
    return false;
  end if;

  if v_existing_count is not null
     and v_existing_updated_at is not null
     and v_existing_updated_at > now() - interval '14 days'
     and abs(v_existing_count - p_count) <= 20 then
    return false;
  end if;

  update public.schools
  set student_count = p_count,
      student_count_updated_at = now()
  where id = p_school_id;

  return true;
end;
$$;

revoke all on function public.update_school_student_count(int, int) from public, anon;
grant execute on function public.update_school_student_count(int, int) to authenticated, service_role;

-- SECURITY DEFINER RPCs are authenticated-only. Trigger functions are never
-- directly executable by API roles.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', fn.signature);
  end loop;
end;
$$;

revoke execute on function public.rls_auto_enable() from authenticated;
revoke execute on function public.sync_roadmap_vote_count() from authenticated;
revoke execute on function public.set_current_timestamp_updated_at() from authenticated;
revoke execute on function public.log_changes() from authenticated;

alter function public.get_student_lesson_mappings(text, text) set search_path = '';
alter function public.set_current_timestamp_updated_at() set search_path = '';
alter function public.log_changes() set search_path = '';

drop policy if exists "Public read access for profile pictures" on storage.objects;
drop policy if exists "Service role can manage profile pictures" on storage.objects;

-- Optimize auth helpers in existing RLS policies without changing policy intent.
do $$
declare
  pol record;
  sql text;
  new_qual text;
  new_check text;
begin
  for pol in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') ~ 'auth\\.(uid|role)\\(\\)'
        or coalesce(with_check, '') ~ 'auth\\.(uid|role)\\(\\)'
      )
  loop
    new_qual := replace(replace(pol.qual, 'auth.uid()', '(select auth.uid())'), 'auth.role()', '(select auth.role())');
    new_check := replace(replace(pol.with_check, 'auth.uid()', '(select auth.uid())'), 'auth.role()', '(select auth.role())');
    sql := format('alter policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    if new_qual is not null then
      sql := sql || format(' using (%s)', new_qual);
    end if;
    if new_check is not null then
      sql := sql || format(' with check (%s)', new_check);
    end if;
    execute sql;
  end loop;
end;
$$;

commit;
