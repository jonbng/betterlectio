-- Convert presence/dismissal booleans on students to nullable timestamps.
-- Keeping "when" alongside "whether" enables cohort analysis and re-prompt
-- windows (e.g. "user dismissed > 6 months ago, try the iOS prompt again").
alter table public.students
  add column if not exists extension_installed_at timestamptz null,
  add column if not exists app_installed_at timestamptz null,
  add column if not exists marked_android_at timestamptz null,
  add column if not exists dismissed_app_prompt_at timestamptz null;

-- Backfill: where the boolean was true we need a non-null timestamp.
-- has_extension uses created_at as a reasonable proxy for first install.
-- The others have no historical timestamp, so we seed with now().
update public.students set extension_installed_at = coalesce(created_at, now())
  where has_extension = true and extension_installed_at is null;

update public.students set app_installed_at = now()
  where has_app = true and app_installed_at is null;

update public.students set marked_android_at = now()
  where has_android = true and marked_android_at is null;

update public.students set dismissed_app_prompt_at = now()
  where app_not_interested = true and dismissed_app_prompt_at is null;

alter table public.students
  drop column has_extension,
  drop column has_app,
  drop column has_android,
  drop column app_not_interested;
