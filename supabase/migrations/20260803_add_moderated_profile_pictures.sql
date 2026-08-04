-- Referral reward: moderated custom profile pictures.
-- Custom pictures stay private until an admin approves them. An approval
-- starts a three-calendar-month cooldown; a rejection does not.

alter table public.students
  add column if not exists custom_pfp_approved_at timestamptz null;

comment on column public.students.custom_pfp_approved_at is
  'Last time a moderated custom profile picture was approved. Drives the three-calendar-month cooldown.';

create table if not exists public.profile_picture_submissions (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  school_id int not null references public.schools(id) on delete cascade,
  supabase_uid uuid not null,
  platform text not null check (platform in ('extension', 'android')),
  status text not null default 'uploading'
    check (status in ('uploading', 'pending', 'approved', 'rejected', 'failed')),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size int not null check (byte_size > 0 and byte_size <= 5242880),
  submitted_at timestamptz null,
  reviewed_at timestamptz null,
  reviewed_by text null,
  rejection_reason text null check (
    rejection_reason is null or rejection_reason in (
      'inappropriate',
      'privacy_or_impersonation',
      'unsuitable',
      'other'
    )
  ),
  review_note text null check (review_note is null or char_length(review_note) <= 500),
  approved_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profile_picture_submissions_student_created_idx
  on public.profile_picture_submissions (student_id, created_at desc);

create unique index if not exists profile_picture_submissions_one_active_idx
  on public.profile_picture_submissions (student_id)
  where status in ('uploading', 'pending');

alter table public.profile_picture_submissions enable row level security;

drop policy if exists "profile_picture_submissions_select_own" on public.profile_picture_submissions;
create policy "profile_picture_submissions_select_own"
  on public.profile_picture_submissions for select
  to authenticated
  using (supabase_uid = (select auth.uid()));

-- No client INSERT/UPDATE/DELETE grants: the submission Edge Function and
-- admin review path use service_role. Students can only read their own state.
revoke all on public.profile_picture_submissions from public, anon, authenticated;
grant select on public.profile_picture_submissions to authenticated;
grant all on public.profile_picture_submissions to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-picture-submissions',
  'profile-picture-submissions',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The Edge Function owns writes through service_role. This explicit policy is
-- intentionally read-only so an authenticated student cannot bypass review.
drop policy if exists "profile_picture_submission_storage_select_own" on storage.objects;
create policy "profile_picture_submission_storage_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'profile-picture-submissions'
    and exists (
      select 1
      from public.profile_picture_submissions pps
      where pps.storage_path = storage.objects.name
        and pps.supabase_uid = (select auth.uid())
    )
  );

create or replace function public.get_my_profile_picture_state(
  p_student_id text
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_student public.students%rowtype;
  v_active public.profile_picture_submissions%rowtype;
  v_latest public.profile_picture_submissions%rowtype;
  v_conversions bigint := 0;
  v_next_eligible timestamptz;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  select * into v_student
  from public.students s
  where s.id = p_student_id
    and s.supabase_id = v_uid;

  if not found then
    raise exception 'Unauthorized';
  end if;

  select count(*) into v_conversions
  from public.students s
  where s.referred_by = p_student_id;

  select * into v_active
  from public.profile_picture_submissions pps
  where pps.student_id = p_student_id
    and pps.status in ('uploading', 'pending')
  order by pps.created_at desc
  limit 1;

  select * into v_latest
  from public.profile_picture_submissions pps
  where pps.student_id = p_student_id
    and pps.status <> 'failed'
  order by pps.created_at desc
  limit 1;

  if v_student.custom_pfp_approved_at is not null then
    v_next_eligible := v_student.custom_pfp_approved_at + interval '3 months';
  end if;

  return jsonb_build_object(
    'unlocked', v_student.referral_reward_unlocked_at is not null,
    'referralConversions', v_conversions,
    'unlockThreshold', 3,
    'currentUrl', v_student.custom_pfp_url,
    'approvedAt', v_student.custom_pfp_approved_at,
    'nextEligibleAt', v_next_eligible,
    'canSubmit',
      v_student.referral_reward_unlocked_at is not null
      and (v_next_eligible is null or v_next_eligible <= now())
      and v_active.id is null,
    'submission', case
      when v_latest.id is null then null
      else jsonb_build_object(
        'id', v_latest.id,
        'status', v_latest.status,
        'createdAt', v_latest.created_at,
        'submittedAt', v_latest.submitted_at,
        'reviewedAt', v_latest.reviewed_at,
        'rejectionReason', v_latest.rejection_reason,
        'reviewNote', v_latest.review_note,
        'approvedUrl', v_latest.approved_url
      )
    end
  );
end;
$$;

revoke all on function public.get_my_profile_picture_state(text) from public, anon;
grant execute on function public.get_my_profile_picture_state(text) to authenticated, service_role;

create or replace function public.review_profile_picture_submission(
  p_submission_id uuid,
  p_decision text,
  p_public_url text default null,
  p_rejection_reason text default null,
  p_review_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.profile_picture_submissions%rowtype;
  v_student public.students%rowtype;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_reason text := nullif(lower(trim(coalesce(p_rejection_reason, ''))), '');
  v_note text := nullif(trim(coalesce(p_review_note, '')), '');
  v_old_url text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Unauthorized';
  end if;

  select * into v_submission
  from public.profile_picture_submissions
  where id = p_submission_id
  for update;

  if not found or v_submission.status <> 'pending' then
    raise exception 'Submission is no longer pending';
  end if;

  select * into v_student
  from public.students
  where id = v_submission.student_id
  for update;

  if not found then
    raise exception 'Student not found';
  end if;

  v_old_url := v_student.custom_pfp_url;

  if v_decision = 'approve' then
    if nullif(trim(coalesce(p_public_url, '')), '') is null then
      raise exception 'Public URL required';
    end if;
    if v_student.custom_pfp_approved_at is not null
       and v_student.custom_pfp_approved_at + interval '3 months' > now() then
      raise exception 'Cooldown active';
    end if;

    update public.students
    set custom_pfp_url = trim(p_public_url),
        custom_pfp_approved_at = now()
    where id = v_submission.student_id;

    update public.profile_picture_submissions
    set status = 'approved',
        approved_url = trim(p_public_url),
        reviewed_at = now(),
        reviewed_by = 'pin',
        rejection_reason = null,
        review_note = null,
        updated_at = now()
    where id = p_submission_id;
  elsif v_decision = 'reject' then
    if v_reason not in ('inappropriate', 'privacy_or_impersonation', 'unsuitable', 'other') then
      raise exception 'Valid rejection reason required';
    end if;
    if v_reason = 'other' and v_note is null then
      raise exception 'A note is required for other';
    end if;
    if v_note is not null and char_length(v_note) > 500 then
      raise exception 'Review note too long';
    end if;

    update public.profile_picture_submissions
    set status = 'rejected',
        reviewed_at = now(),
        reviewed_by = 'pin',
        rejection_reason = v_reason,
        review_note = v_note,
        updated_at = now()
    where id = p_submission_id;
  else
    raise exception 'Invalid decision';
  end if;

  return jsonb_build_object(
    'id', v_submission.id,
    'studentId', v_submission.student_id,
    'schoolId', v_submission.school_id,
    'storagePath', v_submission.storage_path,
    'oldCustomUrl', v_old_url,
    'decision', v_decision
  );
end;
$$;

revoke all on function public.review_profile_picture_submission(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.review_profile_picture_submission(uuid, text, text, text, text)
  to service_role;

