-- Make birthday visibility a database-enforced rule for authenticated clients.
--
-- RLS can restrict rows, but it cannot hide one field within an otherwise
-- readable same-school row. Remove the table-wide SELECT privilege and grant
-- every existing public student column except birthdate. Visible birthdays are
-- available only through get_student_profile(), which masks the value unless
-- the target student enabled show_birthday.

revoke select on table public.students from public, anon, authenticated;

grant select (
  app_eligible,
  app_installed_at,
  app_qr_scanned_at,
  class_name,
  created_at,
  custom_pfp_approved_at,
  custom_pfp_url,
  description,
  dismissed_app_prompt_at,
  extension_installed_at,
  extension_reinstalled_at,
  extension_uninstall_feedback,
  extension_uninstall_reason,
  extension_uninstalled_at,
  id,
  instagram,
  last_seen_at,
  lectio_first_name,
  lectio_last_name,
  lectio_pfp_url,
  marked_android_at,
  name,
  pfp_hash,
  referral_click_id,
  referral_reward_unlocked_at,
  referred_at,
  referred_by,
  school_id,
  show_birthday,
  supabase_id
) on table public.students to authenticated;

comment on function public.get_student_profile(text) is
  'Returns one same-school BetterLectio profile; this is the only authenticated client read path for birthdate, which is null unless show_birthday is true.';

-- Message lists need many approved avatars at once. Keep that efficient without
-- sending native clients back to the students table or exposing birthdates.
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
