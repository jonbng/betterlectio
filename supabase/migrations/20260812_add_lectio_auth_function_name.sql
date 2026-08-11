-- Allow the universal lectio-auth edge function in auth_attempts.
-- Legacy token-for-auth / verify-lectio-auth remain valid during client soak.

begin;

alter table public.auth_attempts
  drop constraint if exists auth_attempts_function_name_check;

alter table public.auth_attempts
  add constraint auth_attempts_function_name_check
  check (function_name in ('token-for-auth', 'verify-lectio-auth', 'lectio-auth'));

commit;
