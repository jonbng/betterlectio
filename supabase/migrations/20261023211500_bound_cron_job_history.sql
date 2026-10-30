-- pg_cron keeps run history forever unless the project prunes it explicitly.
-- Seven days is enough for operational debugging while preventing the
-- per-minute workers from consuming the Free-plan database allowance.

delete from cron.job_run_details
where end_time < now() - interval '7 days';

do $migration$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'cleanup-cron-job-run-details-daily';

  perform cron.schedule(
    'cleanup-cron-job-run-details-daily',
    '11 4 * * *',
    $cron$
      delete from cron.job_run_details
      where end_time < now() - interval '7 days'
    $cron$
  );
end;
$migration$;
