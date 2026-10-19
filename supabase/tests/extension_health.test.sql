-- pgTAP coverage for extension version comparison, public payload filtering,
-- and the least-privilege boundary around operational release data.

begin;
select plan(10);

select is(
  public.extension_version_parts('1.2.3'),
  array[1, 2, 3, 0],
  'version parts are padded for deterministic comparison'
);

select is(
  public.extension_version_parts('1.2.3.4.5'),
  null,
  'invalid extension versions are rejected'
);

select ok(
  has_function_privilege('anon', 'public.get_extension_health(text,text)', 'EXECUTE'),
  'anonymous clients can execute the evaluated health RPC'
);

select ok(
  not has_table_privilege('anon', 'public.extension_known_issues', 'SELECT'),
  'anonymous clients cannot read operational issue rows directly'
);

update public.extension_release_channels
set latest_submitted_version = '0.0.44',
    latest_available_version = '0.0.43',
    confirmed_at = now()
where browser = 'chrome';

insert into public.extension_known_issues (
  title,
  message,
  severity,
  status,
  affected_browsers,
  affected_before_version,
  fixed_in_version,
  show_announcement
) values (
  'Critical test issue',
  'A public explanation',
  'critical',
  'published',
  array['chrome'],
  '0.0.43',
  '0.0.43',
  true
);

insert into public.extension_known_issues (
  title,
  message,
  severity,
  status,
  affected_browsers,
  affected_versions
) values (
  'Draft must stay private',
  'Never returned',
  'warning',
  'draft',
  array['chrome'],
  array['0.0.42']
);

select is(
  public.get_extension_health('chrome', '0.0.42')->>'latestAvailableVersion',
  '0.0.43',
  'the RPC returns the browser-specific publicly available version'
);

select is(
  public.get_extension_health('chrome', '0.0.42')->>'updateAvailable',
  'true',
  'an older installed version is marked updateable'
);

select is(
  jsonb_array_length(public.get_extension_health('chrome', '0.0.42')->'issues'),
  1,
  'only matching published issues are returned'
);

select is(
  public.get_extension_health('chrome', '0.0.42')->'issues'->0->>'canUpdateToFix',
  'true',
  'an available fixed version is offered as a resolution'
);

select is(
  public.get_extension_health('chrome', '0.0.43')->>'updateAvailable',
  'false',
  'the current public version is not marked outdated'
);

select is(
  jsonb_array_length(public.get_extension_health('chrome', '0.0.43')->'issues'),
  0,
  'an issue targeting older versions no longer matches the fixed version'
);

select * from finish();
rollback;

