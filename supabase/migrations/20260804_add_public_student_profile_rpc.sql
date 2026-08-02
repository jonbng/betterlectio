-- Privacy-safe rich student profile reads for native clients.
--
-- Row-level security alone cannot hide one column in an otherwise readable row.
-- Native clients use this RPC so school authorization and birthday consent are
-- enforced server-side. Migration 20260806 additionally removes direct authenticated
-- SELECT access to birthdate while preserving safe legacy extension fields.

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
