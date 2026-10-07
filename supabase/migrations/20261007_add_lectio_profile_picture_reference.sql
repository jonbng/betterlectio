-- Keep a private snapshot of the student's Lectio portrait with each custom
-- profile-picture submission so moderators can compare identity reliably.

alter table public.profile_picture_submissions
  add column if not exists lectio_storage_path text null unique;

comment on column public.profile_picture_submissions.lectio_storage_path is
  'Private Lectio portrait snapshot supplied with the submission for identity comparison; deleted after review.';

drop policy if exists "profile_picture_submission_storage_select_own" on storage.objects;
create policy "profile_picture_submission_storage_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'profile-picture-submissions'
    and exists (
      select 1
      from public.profile_picture_submissions pps
      where (pps.storage_path = storage.objects.name
          or pps.lectio_storage_path = storage.objects.name)
        and pps.supabase_uid = (select auth.uid())
    )
  );
