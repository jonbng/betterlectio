begin;

alter table public.auth_attempts
  drop constraint if exists auth_attempts_platform_check;

alter table public.auth_attempts
  add constraint auth_attempts_platform_check
  check (
    platform in (
      'ios',
      'android',
      'extension',
      'admin-ios',
      'admin-android',
      'unknown'
    )
  );

commit;
