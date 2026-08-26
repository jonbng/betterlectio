-- pgTAP regression coverage for the selective Supabase Realtime publication.
--
-- Run: supabase test db
--
-- The application only needs `students` published for the ephemeral QR-dialog
-- subscription. Settings and homework synchronize through refetch/polling, so
-- publishing their tables would create unnecessary Realtime fan-out.

begin;
select plan(5);

select ok(
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'students'
  ),
  'students is a supabase_realtime publication member'
);

select ok(
  not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'student_homework'
  ),
  'student_homework is not a supabase_realtime publication member'
);

select ok(
  not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'homework_entries'
  ),
  'homework_entries is not a supabase_realtime publication member'
);

select ok(
  not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_settings'
  ),
  'user_settings is not a supabase_realtime publication member'
);

select ok(
  not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_school_themes'
  ),
  'user_school_themes is not a supabase_realtime publication member'
);

select * from finish();
rollback;
