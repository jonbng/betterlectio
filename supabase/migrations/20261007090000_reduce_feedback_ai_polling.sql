-- Feedback AI jobs are durable and leased by the worker, so polling every
-- minute only creates idle pg_net traffic. Five-minute polling preserves the
-- retry/overlap behavior while reducing scheduled invocations by 80%.

create or replace function public.schedule_feedback_ai_triage()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id bigint;
  v_url_secret_name text;
  v_auth_secret_name text;
begin
  v_url_secret_name := case
    when exists (select 1 from vault.decrypted_secrets where name = 'feedback_ai_project_url') then 'feedback_ai_project_url'
    else 'lectio_keepalive_project_url' end;
  v_auth_secret_name := case
    when exists (select 1 from vault.decrypted_secrets where name = 'feedback_ai_cron_secret') then 'feedback_ai_cron_secret'
    else 'lectio_keepalive_cron_secret' end;

  if not exists (select 1 from vault.decrypted_secrets where name = v_url_secret_name)
    or not exists (select 1 from vault.decrypted_secrets where name = v_auth_secret_name) then
    raise exception 'Missing feedback_ai_project_url or feedback_ai_cron_secret in Vault';
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'feedback-ai-triage';

  select cron.schedule(
    'feedback-ai-triage', '*/5 * * * *',
    $cron$select net.http_post(
      url := rtrim((select decrypted_secret from vault.decrypted_secrets where name in ('feedback_ai_project_url', 'lectio_keepalive_project_url') order by (name = 'feedback_ai_project_url') desc, created_at desc limit 1), '/') || '/functions/v1/feedback-ai-triage',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name in ('feedback_ai_cron_secret', 'lectio_keepalive_cron_secret') order by (name = 'feedback_ai_cron_secret') desc, created_at desc limit 1)),
      body := '{"source":"supabase-cron"}'::jsonb,
      timeout_milliseconds := 120000
    );$cron$
  ) into v_job_id;

  return v_job_id;
end;
$$;

revoke all on function public.schedule_feedback_ai_triage() from public, anon, authenticated;
grant execute on function public.schedule_feedback_ai_triage() to service_role;

do $$
begin
  if (
    exists (select 1 from vault.decrypted_secrets where name = 'feedback_ai_project_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'feedback_ai_cron_secret')
  ) or (
    exists (select 1 from vault.decrypted_secrets where name = 'lectio_keepalive_project_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'lectio_keepalive_cron_secret')
  ) then
    perform public.schedule_feedback_ai_triage();
  else
    raise notice 'Feedback AI cron not scheduled: add both Vault secrets, then call public.schedule_feedback_ai_triage()';
  end if;
end;
$$;

comment on function public.schedule_feedback_ai_triage() is
  'Schedules durable feedback AI triage polling every five minutes.';
