-- pgTAP regression coverage for skipping unchanged lesson updates.
--
-- Run: supabase test db

begin;
select plan(6);

insert into public.schools (id, name)
values (9902, 'Sync write test')
on conflict (id) do nothing;

insert into auth.users (id, instance_id, aud, role, email)
values (
  '00000000-0000-0000-0000-000000009902',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'sync-write@test.invalid'
)
on conflict (id) do nothing;

insert into public.students (id, school_id, name, supabase_id)
values (
  'sync-write-student',
  9902,
  'Sync Write Student',
  '00000000-0000-0000-0000-000000009902'
)
on conflict (id) do nothing;

select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok($$
  select public.sync_student_week(
    'sync-write-student',
    '2026-W40',
    '[{"lesson_key":"sync-write-lesson","lesson_date":"2026-10-01","start_time":"08:00","end_time":"09:00","title":"Matematik","teacher":"AB","room":"1","status":"normal","notes":null,"homework":null,"source_updated_at":"2026-10-01T07:00:00Z","content":{"kind":"original"}}]'::jsonb
  );
$$, 'initial week sync succeeds');

create temporary table sync_write_snapshot as
select updated_at, source_updated_at, content
from public.lessons
where school_id = 9902 and lesson_key = 'sync-write-lesson';

select lives_ok($$
  select public.sync_student_week(
    'sync-write-student',
    '2026-W40',
    '[{"lesson_key":"sync-write-lesson","lesson_date":"2026-10-01","start_time":"08:00","end_time":"09:00","title":"Matematik","teacher":"AB","room":"1","status":"normal","notes":null,"homework":null,"source_updated_at":"2026-10-01T08:00:00Z","content":null}]'::jsonb
  );
$$, 'equivalent week sync succeeds');

select is(
  (select l.updated_at from public.lessons l where l.school_id = 9902 and l.lesson_key = 'sync-write-lesson'),
  (select s.updated_at from sync_write_snapshot s),
  'equivalent sync does not update the lesson row'
);

select is(
  (select l.source_updated_at from public.lessons l where l.school_id = 9902 and l.lesson_key = 'sync-write-lesson'),
  (select s.source_updated_at from sync_write_snapshot s),
  'generated source timestamp alone does not update the lesson row'
);

select is(
  (select l.content from public.lessons l where l.school_id = 9902 and l.lesson_key = 'sync-write-lesson'),
  '{"kind":"original"}'::jsonb,
  'a null payload preserves existing lesson content'
);

select lives_ok($$
  select public.sync_student_week(
    'sync-write-student',
    '2026-W40',
    '[{"lesson_key":"sync-write-lesson","lesson_date":"2026-10-01","start_time":"08:00","end_time":"09:00","title":"Matematik ændret","teacher":"AB","room":"1","status":"normal","notes":null,"homework":null,"source_updated_at":"2026-10-01T09:00:00Z","content":null}]'::jsonb
  );
$$, 'changed week sync succeeds');

select is(
  (
    select jsonb_build_object(
      'title', l.title,
      'source_updated_at', to_char(l.source_updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'content', l.content
    )
    from public.lessons l
    where l.school_id = 9902 and l.lesson_key = 'sync-write-lesson'
  ),
  '{"title":"Matematik ændret","source_updated_at":"2026-10-01T09:00:00Z","content":{"kind":"original"}}'::jsonb,
  'a business-field change updates the row while preserving omitted content'
);

select * from finish();
rollback;
