-- Supabase-native scheduler for the keepalive Edge Function. Store these first:
--   vault.create_secret('https://<project-ref>.supabase.co', 'lectio_keepalive_project_url');
--   vault.create_secret('<same value as Edge secret>', 'lectio_keepalive_cron_secret');

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.schedule_lectio_session_keepalive()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_url text;
  v_cron_secret text;
  v_job_id bigint;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets
  where name = 'lectio_keepalive_project_url'
  order by created_at desc limit 1;

  select decrypted_secret into v_cron_secret
  from vault.decrypted_secrets
  where name = 'lectio_keepalive_cron_secret'
  order by created_at desc limit 1;

  if nullif(v_project_url, '') is null or nullif(v_cron_secret, '') is null then
    raise exception 'Missing lectio_keepalive_project_url or lectio_keepalive_cron_secret in Vault';
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'lectio-session-keepalive';

  select cron.schedule(
    'lectio-session-keepalive',
    '*/30 * * * *',
    $cron$select net.http_post(
        url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'lectio_keepalive_project_url' order by created_at desc limit 1), '/') || '/functions/v1/lectio-session-keepalive',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'lectio_keepalive_cron_secret' order by created_at desc limit 1)
        ),
        body := '{"source":"supabase-cron"}'::jsonb,
        timeout_milliseconds := 120000
      );$cron$
  ) into v_job_id;
  return v_job_id;
end;
$$;

revoke all on function public.schedule_lectio_session_keepalive() from public, anon, authenticated;
grant execute on function public.schedule_lectio_session_keepalive() to service_role;

do $$
begin
  if exists (
    select 1 from vault.decrypted_secrets
    where name = 'lectio_keepalive_project_url' and nullif(decrypted_secret, '') is not null
  ) and exists (
    select 1 from vault.decrypted_secrets
    where name = 'lectio_keepalive_cron_secret' and nullif(decrypted_secret, '') is not null
  ) then
    perform public.schedule_lectio_session_keepalive();
  else
    raise notice 'Lectio keepalive cron not scheduled: add both Vault secrets, then call public.schedule_lectio_session_keepalive()';
  end if;
end;
$$;
