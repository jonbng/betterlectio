begin;
select plan(15);
insert into public.schools (id, name) values (9918, 'Announcement test school') on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email) values (
  '00000000-0000-0000-0000-000000009918', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'announcement@test.invalid'
) on conflict (id) do nothing;
insert into public.students (id, school_id, name, class_name, supabase_id, extension_installed_at, last_seen_at)
values ('announcement-test-student', 9918, 'Announcement Test', '2x', '00000000-0000-0000-0000-000000009918', now() - interval '30 days', now())
on conflict (id) do update set class_name = excluded.class_name, last_seen_at = excluded.last_seen_at;
insert into public.announcements (id, internal_name, status, kind, design, theme, starts_at, audience_all, browsers, min_extension_version, max_extension_version)
values ('00000000-0000-0000-0000-000000009918', 'Test announcement', 'published', 'feature', 'professional', 'neutral', now() - interval '1 minute', false, array['chrome'], '0.0.43', '0.0.50');
insert into public.announcement_contents (announcement_id, locale, title, body, author_name, author_role)
values ('00000000-0000-0000-0000-000000009918', 'da', 'Hej', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Test"}]}]}'::jsonb, 'BetterLectio', 'Produktteamet');
insert into public.announcement_targets (announcement_id, kind, school_id)
values ('00000000-0000-0000-0000-000000009918', 'school', 9918);

select ok(has_function_privilege('authenticated', 'public.claim_next_announcement(text,text,text,text,uuid)', 'EXECUTE'), 'authenticated may claim');
select ok(not has_function_privilege('anon', 'public.claim_next_announcement(text,text,text,text,uuid)', 'EXECUTE'), 'anonymous may not claim');
select ok(not has_table_privilege('authenticated', 'public.announcements', 'SELECT'), 'campaign rows stay private');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009918', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
create temporary table first_claim as select public.claim_next_announcement('chrome', '0.0.43', 'da', 'forside.aspx', '00000000-0000-0000-0000-000000000001') payload;
select is((select payload->>'title' from first_claim), 'Hej', 'matching content is returned');
select is((select payload->>'design' from first_claim), 'professional', 'design is returned');
select is((select payload->>'theme' from first_claim), 'neutral', 'theme is returned');
select is((select payload->>'authorName' from first_claim), 'BetterLectio', 'author is returned');
select isnt((select payload->>'claimToken' from first_claim), null, 'claim token is returned');
select is(public.claim_next_announcement('chrome', '0.0.43', 'da', 'forside.aspx', '00000000-0000-0000-0000-000000000002'), null::jsonb, 'second tab is excluded');
select ok(public.record_announcement_event('00000000-0000-0000-0000-000000009918', (select (payload->>'claimToken')::uuid from first_claim), 'seen'), 'claim may be acknowledged');
select isnt((select seen_at from public.announcement_deliveries where announcement_id = '00000000-0000-0000-0000-000000009918'), null::timestamptz, 'seen is persisted');
select is(public.claim_next_announcement('chrome', '0.0.43', 'da', 'forside.aspx', '00000000-0000-0000-0000-000000000003'), null::jsonb, 'seen campaign never returns');
update public.announcement_deliveries set seen_at = null, claimed_until = now() - interval '1 second';
select isnt(public.claim_next_announcement('chrome', '0.0.43', 'da', 'forside.aspx', '00000000-0000-0000-0000-000000000004'), null::jsonb, 'expired lease is reclaimable');
delete from public.announcement_deliveries;
select is(public.claim_next_announcement('firefox', '0.0.43', 'da', 'forside.aspx', '00000000-0000-0000-0000-000000000005'), null::jsonb, 'browser target is enforced');
select is(public.claim_next_announcement('chrome', '0.0.42', 'da', 'forside.aspx', '00000000-0000-0000-0000-000000000006'), null::jsonb, 'minimum version is enforced');
select * from finish();
rollback;
