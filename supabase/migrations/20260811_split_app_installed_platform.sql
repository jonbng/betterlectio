-- Split native app install tracking by platform while keeping app_installed_at
-- as the backwards-compatible "any native app" stamp used by promotion, badges,
-- referrals, and existing clients.

alter table public.students
  add column if not exists android_installed_at timestamptz null,
  add column if not exists iphone_installed_at timestamptz null;

comment on column public.students.app_installed_at is
  'First time any native BetterLectio app (Android or iPhone) authenticated. Kept for backwards compatibility; prefer android_installed_at / iphone_installed_at for platform-specific analytics.';
comment on column public.students.android_installed_at is
  'First successful Android app auth for this student.';
comment on column public.students.iphone_installed_at is
  'First successful iPhone app auth for this student.';

-- Column-level SELECT grants (see 20260806) require an explicit grant for new cols.
grant select (android_installed_at, iphone_installed_at) on table public.students to authenticated;
