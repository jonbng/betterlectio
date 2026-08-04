-- Enable the iOS client after the moderated profile-picture schema has landed.
alter table public.profile_picture_submissions
  drop constraint if exists profile_picture_submissions_platform_check;

alter table public.profile_picture_submissions
  add constraint profile_picture_submissions_platform_check
  check (platform in ('extension', 'android', 'ios'));
