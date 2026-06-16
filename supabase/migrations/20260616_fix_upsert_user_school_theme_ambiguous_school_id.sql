-- Fix: "column reference \"school_id\" is ambiguous" raised on every call to
-- upsert_user_school_theme (≈6k errors / 190 users in PostHog since 2026-05-07).
--
-- Root cause: this is a plpgsql function whose RETURNS TABLE(school_id text, …)
-- turns `school_id` into an OUT *variable*. With no #variable_conflict directive
-- PL/pgSQL defaults to `error`, so the bare `school_id` in the
-- `ON CONFLICT (supabase_id, school_id)` inference clause is ambiguous between
-- the table column and the OUT variable — Postgres raises on every invocation.
--
-- Sibling functions are immune for incidental reasons: upsert_user_settings'
-- conflict target is only `supabase_id` (not an OUT var), and the homework /
-- lesson-override upserts already declare `#variable_conflict use_column`.
--
-- Fix: add `#variable_conflict use_column` so bare ambiguous names resolve to
-- the column (the intended meaning everywhere in this body). The OUT column
-- names are unchanged, so the client result shape (school_id/theme_id/updated_at)
-- is preserved.

create or replace function public.upsert_user_school_theme(
  p_school_id text,
  p_theme_id text,
  p_client_updated_at timestamp with time zone
)
returns table(school_id text, theme_id text, updated_at timestamp with time zone)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
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
$function$;
