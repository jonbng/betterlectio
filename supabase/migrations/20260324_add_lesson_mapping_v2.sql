create extension if not exists pgcrypto;

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.school_lesson_mappings (
  id uuid primary key default gen_random_uuid(),
  school_id integer not null references public.schools(id) on delete cascade,
  canonical_key text not null,
  default_name text not null,
  default_color_hue smallint null,
  icon text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint school_lesson_mappings_canonical_key_check
    check (canonical_key = lower(trim(canonical_key))),
  constraint school_lesson_mappings_default_name_check
    check (length(trim(default_name)) > 0),
  constraint school_lesson_mappings_hue_check
    check (default_color_hue is null or (default_color_hue >= 0 and default_color_hue <= 359)),
  constraint school_lesson_mappings_unique unique (school_id, canonical_key)
);

create index if not exists school_lesson_mappings_school_updated_idx
  on public.school_lesson_mappings (school_id, updated_at desc);

create index if not exists school_lesson_mappings_active_idx
  on public.school_lesson_mappings (school_id, canonical_key)
  where deleted_at is null;

create table if not exists public.user_lesson_overrides (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  mapping_id uuid not null references public.school_lesson_mappings(id) on delete cascade,
  display_name text null,
  color_hue smallint null,
  icon text null,
  client_updated_at timestamptz null,
  last_modified_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint user_lesson_overrides_display_name_check
    check (display_name is null or length(trim(display_name)) > 0),
  constraint user_lesson_overrides_hue_check
    check (color_hue is null or (color_hue >= 0 and color_hue <= 359)),
  constraint user_lesson_overrides_unique unique (student_id, mapping_id)
);

create index if not exists user_lesson_overrides_student_updated_idx
  on public.user_lesson_overrides (student_id, updated_at desc);

create index if not exists user_lesson_overrides_mapping_idx
  on public.user_lesson_overrides (mapping_id);

create index if not exists user_lesson_overrides_active_idx
  on public.user_lesson_overrides (student_id, mapping_id)
  where deleted_at is null;

drop trigger if exists set_school_lesson_mappings_updated_at on public.school_lesson_mappings;
create trigger set_school_lesson_mappings_updated_at
before update on public.school_lesson_mappings
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_user_lesson_overrides_updated_at on public.user_lesson_overrides;
create trigger set_user_lesson_overrides_updated_at
before update on public.user_lesson_overrides
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.school_lesson_mappings enable row level security;
alter table public.user_lesson_overrides enable row level security;

drop policy if exists "school_lesson_mappings_select_same_school" on public.school_lesson_mappings;
create policy "school_lesson_mappings_select_same_school"
on public.school_lesson_mappings
for select
to authenticated
using (
  exists (
    select 1
    from public.students s
    where s.supabase_id = auth.uid()
      and s.school_id = school_lesson_mappings.school_id
  )
);

drop policy if exists "school_lesson_mappings_write_service_role" on public.school_lesson_mappings;
create policy "school_lesson_mappings_write_service_role"
on public.school_lesson_mappings
for all
to service_role
using (true)
with check (true);

drop policy if exists "user_lesson_overrides_select_own" on public.user_lesson_overrides;
create policy "user_lesson_overrides_select_own"
on public.user_lesson_overrides
for select
to authenticated
using (
  exists (
    select 1
    from public.students s
    where s.id = user_lesson_overrides.student_id
      and s.supabase_id = auth.uid()
  )
);

drop policy if exists "user_lesson_overrides_insert_own" on public.user_lesson_overrides;
create policy "user_lesson_overrides_insert_own"
on public.user_lesson_overrides
for insert
to authenticated
with check (
  exists (
    select 1
    from public.students s
    join public.school_lesson_mappings m on m.id = user_lesson_overrides.mapping_id
    where s.id = user_lesson_overrides.student_id
      and s.supabase_id = auth.uid()
      and s.school_id = m.school_id
  )
);

drop policy if exists "user_lesson_overrides_update_own" on public.user_lesson_overrides;
create policy "user_lesson_overrides_update_own"
on public.user_lesson_overrides
for update
to authenticated
using (
  exists (
    select 1
    from public.students s
    where s.id = user_lesson_overrides.student_id
      and s.supabase_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.students s
    join public.school_lesson_mappings m on m.id = user_lesson_overrides.mapping_id
    where s.id = user_lesson_overrides.student_id
      and s.supabase_id = auth.uid()
      and s.school_id = m.school_id
  )
);

drop policy if exists "user_lesson_overrides_delete_own" on public.user_lesson_overrides;
create policy "user_lesson_overrides_delete_own"
on public.user_lesson_overrides
for delete
to authenticated
using (
  exists (
    select 1
    from public.students s
    where s.id = user_lesson_overrides.student_id
      and s.supabase_id = auth.uid()
  )
);

create or replace function public.get_student_lesson_mappings_v2(
  p_school_id integer,
  p_student_id text
)
returns table (
  mapping_id uuid,
  school_id integer,
  canonical_key text,
  default_name text,
  default_color_hue smallint,
  default_icon text,
  override_display_name text,
  override_color_hue smallint,
  override_icon text,
  display_name text,
  display_color_hue smallint,
  display_icon text,
  is_overridden boolean,
  override_id uuid,
  student_id text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id as mapping_id,
    m.school_id,
    m.canonical_key,
    m.default_name,
    m.default_color_hue,
    m.icon as default_icon,
    u.display_name as override_display_name,
    u.color_hue as override_color_hue,
    u.icon as override_icon,
    coalesce(u.display_name, m.default_name) as display_name,
    coalesce(u.color_hue, m.default_color_hue) as display_color_hue,
    coalesce(u.icon, m.icon) as display_icon,
    (u.id is not null and u.deleted_at is null) as is_overridden,
    u.id as override_id,
    u.student_id,
    greatest(m.updated_at, coalesce(u.updated_at, m.updated_at)) as updated_at
  from public.school_lesson_mappings m
  left join public.user_lesson_overrides u
    on u.mapping_id = m.id
   and u.student_id = p_student_id
   and u.deleted_at is null
  where m.school_id = p_school_id
    and m.deleted_at is null
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
  order by m.canonical_key asc;
$$;

revoke all on function public.get_student_lesson_mappings_v2(integer, text) from public;
grant execute on function public.get_student_lesson_mappings_v2(integer, text) to authenticated;
grant execute on function public.get_student_lesson_mappings_v2(integer, text) to service_role;

create or replace function public.upsert_user_lesson_override_v2(
  p_school_id integer,
  p_student_id text,
  p_canonical_key text,
  p_default_name text,
  p_default_color_hue smallint default null,
  p_display_name text default null,
  p_color_hue smallint default null,
  p_icon text default null,
  p_client_updated_at timestamptz default null,
  p_last_modified_by text default null
)
returns table (
  mapping_id uuid,
  school_id integer,
  canonical_key text,
  default_name text,
  default_color_hue smallint,
  default_icon text,
  override_display_name text,
  override_color_hue smallint,
  override_icon text,
  display_name text,
  display_color_hue smallint,
  display_icon text,
  is_overridden boolean,
  override_id uuid,
  student_id text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_mapping_id uuid;
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

  insert into public.school_lesson_mappings (
    school_id,
    canonical_key,
    default_name,
    default_color_hue,
    icon
  )
  values (
    p_school_id,
    lower(trim(p_canonical_key)),
    trim(p_default_name),
    p_default_color_hue,
    p_icon
  )
  on conflict (school_id, canonical_key) do nothing;

  select m.id
    into v_mapping_id
  from public.school_lesson_mappings m
  where m.school_id = p_school_id
    and m.canonical_key = lower(trim(p_canonical_key))
  limit 1;

  if p_display_name is null and p_color_hue is null and p_icon is null then
    return query
    select *
    from public.get_student_lesson_mappings_v2(p_school_id, p_student_id) m
    where m.canonical_key = lower(trim(p_canonical_key));
    return;
  end if;

  insert into public.user_lesson_overrides (
    student_id,
    mapping_id,
    display_name,
    color_hue,
    icon,
    client_updated_at,
    last_modified_by,
    deleted_at
  )
  values (
    p_student_id,
    v_mapping_id,
    p_display_name,
    p_color_hue,
    p_icon,
    p_client_updated_at,
    p_last_modified_by,
    null
  )
  on conflict (student_id, mapping_id) do update
    set display_name = excluded.display_name,
        color_hue = excluded.color_hue,
        icon = excluded.icon,
        client_updated_at = excluded.client_updated_at,
        last_modified_by = excluded.last_modified_by,
        deleted_at = null;

  return query
  select *
  from public.get_student_lesson_mappings_v2(p_school_id, p_student_id) m
  where m.canonical_key = lower(trim(p_canonical_key));
end;
$$;

revoke all on function public.upsert_user_lesson_override_v2(integer, text, text, text, smallint, text, smallint, text, timestamptz, text) from public;
grant execute on function public.upsert_user_lesson_override_v2(integer, text, text, text, smallint, text, smallint, text, timestamptz, text) to authenticated;
grant execute on function public.upsert_user_lesson_override_v2(integer, text, text, text, smallint, text, smallint, text, timestamptz, text) to service_role;

create or replace function public.reset_user_lesson_override_v2(
  p_school_id integer,
  p_student_id text,
  p_canonical_key text,
  p_client_updated_at timestamptz default null,
  p_last_modified_by text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_mapping_id uuid;
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

  select m.id
    into v_mapping_id
  from public.school_lesson_mappings m
  where m.school_id = p_school_id
    and m.canonical_key = lower(trim(p_canonical_key))
  limit 1;

  if v_mapping_id is null then
    return;
  end if;

  update public.user_lesson_overrides u
    set deleted_at = now(),
        client_updated_at = p_client_updated_at,
        last_modified_by = p_last_modified_by,
        updated_at = now()
  where u.student_id = p_student_id
    and u.mapping_id = v_mapping_id
    and u.deleted_at is null;
end;
$$;

revoke all on function public.reset_user_lesson_override_v2(integer, text, text, timestamptz, text) from public;
grant execute on function public.reset_user_lesson_override_v2(integer, text, text, timestamptz, text) to authenticated;
grant execute on function public.reset_user_lesson_override_v2(integer, text, text, timestamptz, text) to service_role;
