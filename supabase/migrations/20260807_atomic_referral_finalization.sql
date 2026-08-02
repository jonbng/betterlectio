-- Serialize referral attribution in Postgres so one click can never convert
-- more than once and the student/click/reward writes commit together.

alter table public.profile_picture_submissions
  add column if not exists source_deleted_at timestamptz null;

create index if not exists referral_clicks_ip_hash_created_idx
  on public.referral_clicks (ip_hash, created_at desc)
  where ip_hash is not null;

create or replace function public.finalize_referral_attribution(
  p_cookie_id uuid,
  p_student_id text,
  p_platform text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_click public.referral_clicks%rowtype;
  v_student public.students%rowtype;
  v_referrer public.students%rowtype;
  v_installed_at timestamptz;
  v_now timestamptz := now();
  v_count bigint;
  v_newly_unlocked boolean := false;
  v_reason text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Unauthorized';
  end if;
  if p_platform not in ('android', 'ios', 'extension') then
    raise exception 'Invalid platform';
  end if;

  select * into v_click
  from public.referral_clicks
  where cookie_id = p_cookie_id
  for update;

  if not found or v_click.converted_at is not null or v_click.expired_at is not null then
    return jsonb_build_object('attributed', false, 'reason', 'unknown_cookie');
  end if;

  select * into v_student
  from public.students
  where id = p_student_id
  for update;

  if not found then
    return jsonb_build_object('attributed', false, 'reason', 'unknown_student');
  end if;

  if v_click.referrer_student_id = p_student_id then
    v_reason := 'self_referral';
  elsif v_student.referred_by is not null then
    v_reason := 'already_referred';
  elsif v_click.created_at < v_now - interval '180 days' then
    v_reason := 'expired';
  else
    v_installed_at := case when p_platform = 'extension'
      then v_student.extension_installed_at else v_student.app_installed_at end;
    if v_installed_at is null or v_installed_at < v_now - interval '7 days' then
      v_reason := 'returning_user';
    end if;
  end if;

  if v_reason is not null then
    update public.referral_clicks
    set rejection_reason = v_reason, expired_at = v_now
    where id = v_click.id;
    return jsonb_build_object(
      'attributed', false,
      'reason', v_reason,
      'referrerStudentId', v_click.referrer_student_id
    );
  end if;

  select * into v_referrer
  from public.students
  where id = v_click.referrer_student_id;
  if not found then
    update public.referral_clicks
    set rejection_reason = 'expired', expired_at = v_now
    where id = v_click.id;
    return jsonb_build_object('attributed', false, 'reason', 'expired');
  end if;

  update public.students
  set referred_by = v_click.referrer_student_id,
      referred_at = v_now,
      referral_click_id = v_click.id
  where id = p_student_id;

  update public.referral_clicks
  set converted_at = v_now,
      converted_student_id = p_student_id,
      rejection_reason = null
  where id = v_click.id;

  select count(*) into v_count
  from public.students
  where referred_by = v_click.referrer_student_id;

  if v_count >= 3 then
    update public.students
    set referral_reward_unlocked_at = v_now
    where id = v_click.referrer_student_id
      and referral_reward_unlocked_at is null;
    v_newly_unlocked := found;
  end if;

  return jsonb_build_object(
    'attributed', true,
    'referrerStudentId', v_click.referrer_student_id,
    'referrerName', v_referrer.name,
    'referrerUnlocked', v_newly_unlocked
  );
end;
$$;

revoke all on function public.finalize_referral_attribution(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_referral_attribution(uuid, text, text)
  to service_role;

-- Remove stale attribution metadata automatically without retaining a stable
-- cross-site identifier forever. Schedule this daily with Supabase Cron.
create or replace function public.cleanup_referral_and_profile_upload_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clicks bigint;
  v_failed bigint;
begin
  if auth.role() <> 'service_role' then raise exception 'Unauthorized'; end if;
  delete from public.referral_clicks
  where created_at < now() - interval '180 days'
    and converted_at is null;
  get diagnostics v_clicks = row_count;

  delete from public.profile_picture_submissions
  where status = 'failed' and updated_at < now() - interval '7 days';
  get diagnostics v_failed = row_count;
  return jsonb_build_object('referralClicksDeleted', v_clicks, 'failedSubmissionsDeleted', v_failed);
end;
$$;

revoke all on function public.cleanup_referral_and_profile_upload_data() from public, anon, authenticated;
grant execute on function public.cleanup_referral_and_profile_upload_data() to service_role;
