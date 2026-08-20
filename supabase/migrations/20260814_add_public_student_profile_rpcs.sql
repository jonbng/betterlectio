-- Additive profile RPCs used by the extension, iOS, and Android.
-- Birthday is consent-masked in the return set. This does not revoke table-wide
-- SELECT on students (that grant list in 20260806 is stale vs later columns).

create or replace function public.get_student_profile(p_student_id text)
returns table (
  id text,
  name text,
  description text,
  instagram text,
  birthdate date,
  show_birthday boolean,
  custom_pfp_url text,
  lectio_pfp_url text,
  class_name text,
  last_seen_at timestamptz,
  extension_installed_at timestamptz,
  extension_uninstalled_at timestamptz,
  app_installed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    target.id,
    target.name,
    target.description,
    target.instagram,
    case when target.show_birthday then target.birthdate else null end,
    target.show_birthday,
    target.custom_pfp_url,
    target.lectio_pfp_url,
    target.class_name,
    target.last_seen_at,
    target.extension_installed_at,
    target.extension_uninstalled_at,
    target.app_installed_at
  from public.students as target
  where target.id = nullif(trim(p_student_id), '')
    and target.school_id = (
      select viewer.school_id
      from public.students as viewer
      where viewer.supabase_id = (select auth.uid())
      limit 1
    )
  limit 1;
$$;

revoke all on function public.get_student_profile(text) from public, anon;
grant execute on function public.get_student_profile(text) to authenticated, service_role;

comment on function public.get_student_profile(text) is
  'Returns one same-school BetterLectio profile and masks birthdate unless show_birthday is true.';

create or replace function public.get_student_profiles(p_student_ids text[])
returns table (
  id text,
  name text,
  description text,
  instagram text,
  birthdate date,
  show_birthday boolean,
  custom_pfp_url text,
  lectio_pfp_url text,
  class_name text,
  last_seen_at timestamptz,
  extension_installed_at timestamptz,
  extension_uninstalled_at timestamptz,
  app_installed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    target.id,
    target.name,
    target.description,
    target.instagram,
    case when target.show_birthday then target.birthdate else null end,
    target.show_birthday,
    target.custom_pfp_url,
    target.lectio_pfp_url,
    target.class_name,
    target.last_seen_at,
    target.extension_installed_at,
    target.extension_uninstalled_at,
    target.app_installed_at
  from public.students as target
  where target.id = any(coalesce(p_student_ids[1:200], array[]::text[]))
    and target.school_id = (
      select viewer.school_id
      from public.students as viewer
      where viewer.supabase_id = (select auth.uid())
      limit 1
    )
  limit 200;
$$;

revoke all on function public.get_student_profiles(text[]) from public, anon;
grant execute on function public.get_student_profiles(text[]) to authenticated, service_role;

comment on function public.get_student_profiles(text[]) is
  'Batch form of get_student_profile for native list avatars; same-school only and consent-masks every birthday.';
