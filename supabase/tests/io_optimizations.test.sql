-- pgTAP coverage for low-risk database I/O optimizations.
--
-- Run: supabase test db

begin;
select plan(3);

select ok(
  position(
    '''* * * * *''' in pg_get_functiondef('public.schedule_feedback_ai_triage()'::regprocedure)
  ) = 0,
  'feedback AI triage is not scheduled every minute'
);

select ok(
  position(
    '''*/5 * * * *''' in pg_get_functiondef('public.schedule_feedback_ai_triage()'::regprocedure)
  ) > 0,
  'feedback AI triage is scheduled every five minutes'
);

select ok(
  to_regclass('public.week_sync_student_week_idx') is null,
  'redundant week_sync index is absent'
);

select * from finish();
rollback;
