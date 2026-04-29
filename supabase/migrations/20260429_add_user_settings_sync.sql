-- Sync user-chosen settings (and per-school theme) to the database so they
-- follow the user across devices/browsers/reinstalls.
--
-- Two tables, both keyed on auth.uid():
--   * user_settings        — single jsonb blob holding bl-feature-settings
--   * user_school_themes   — per-school themeId (one row per school the user
--                            has touched)
--
-- Writes go through security-definer RPCs that enforce a last-writer-wins
-- contract using the client clock. RLS policies allow each user to read
-- only their own rows. There are no direct write policies — clients must
-- use the RPCs so the LWW resolution can run server-side.

-- ── user_settings ────────────────────────────────────────────────────

create table if not exists public.user_settings (
  supabase_id uuid primary key
    references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  schema_version int not null default 1,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "user_settings_select_own" on public.user_settings;
create policy "user_settings_select_own"
  on public.user_settings for select
  using (auth.uid() = supabase_id);

create or replace function public.upsert_user_settings(
  p_settings jsonb,
  p_client_updated_at timestamptz,
  p_schema_version int default 1
) returns table (
  settings jsonb,
  schema_version int,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing_updated_at timestamptz;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  select us.updated_at into v_existing_updated_at
    from public.user_settings us
   where us.supabase_id = v_uid;

  if v_existing_updated_at is not null
     and v_existing_updated_at > p_client_updated_at then
    return query
      select us.settings, us.schema_version, us.updated_at
        from public.user_settings us
       where us.supabase_id = v_uid;
    return;
  end if;

  insert into public.user_settings as us
    (supabase_id, settings, schema_version, updated_at)
    values (v_uid, p_settings, p_schema_version, p_client_updated_at)
  on conflict (supabase_id) do update
    set settings = excluded.settings,
        schema_version = excluded.schema_version,
        updated_at = excluded.updated_at;

  return query
    select us.settings, us.schema_version, us.updated_at
      from public.user_settings us
     where us.supabase_id = v_uid;
end;
$$;

revoke all on function public.upsert_user_settings(jsonb, timestamptz, int) from public;
grant execute on function public.upsert_user_settings(jsonb, timestamptz, int) to authenticated;

-- ── user_school_themes ───────────────────────────────────────────────

create table if not exists public.user_school_themes (
  supabase_id uuid not null
    references auth.users(id) on delete cascade,
  school_id text not null,
  theme_id text not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (supabase_id, school_id)
);

create index if not exists user_school_themes_supabase_id_idx
  on public.user_school_themes (supabase_id);

alter table public.user_school_themes enable row level security;

drop policy if exists "user_school_themes_select_own" on public.user_school_themes;
create policy "user_school_themes_select_own"
  on public.user_school_themes for select
  using (auth.uid() = supabase_id);

create or replace function public.upsert_user_school_theme(
  p_school_id text,
  p_theme_id text,
  p_client_updated_at timestamptz
) returns table (
  school_id text,
  theme_id text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing_updated_at timestamptz;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  select t.updated_at into v_existing_updated_at
    from public.user_school_themes t
   where t.supabase_id = v_uid and t.school_id = p_school_id;

  if v_existing_updated_at is not null
     and v_existing_updated_at > p_client_updated_at then
    return query
      select t.school_id, t.theme_id, t.updated_at
        from public.user_school_themes t
       where t.supabase_id = v_uid and t.school_id = p_school_id;
    return;
  end if;

  insert into public.user_school_themes as t
    (supabase_id, school_id, theme_id, updated_at)
    values (v_uid, p_school_id, p_theme_id, p_client_updated_at)
  on conflict (supabase_id, school_id) do update
    set theme_id = excluded.theme_id,
        updated_at = excluded.updated_at;

  return query
    select t.school_id, t.theme_id, t.updated_at
      from public.user_school_themes t
     where t.supabase_id = v_uid and t.school_id = p_school_id;
end;
$$;

create or replace function public.list_user_school_themes()
returns table (school_id text, theme_id text, updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select t.school_id, t.theme_id, t.updated_at
    from public.user_school_themes t
   where t.supabase_id = auth.uid();
$$;

revoke all on function public.upsert_user_school_theme(text, text, timestamptz) from public;
revoke all on function public.list_user_school_themes() from public;
grant execute on function public.upsert_user_school_theme(text, text, timestamptz) to authenticated;
grant execute on function public.list_user_school_themes() to authenticated;
