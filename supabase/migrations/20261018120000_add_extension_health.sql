-- Browser-extension release health and version-targeted known issues.
-- This migration is additive: it creates new objects and does not rewrite
-- existing user or feedback data.

create or replace function public.extension_version_parts(p_version text)
returns int[]
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $$
declare
  v_raw text[];
  v_parts int[] := array[0, 0, 0, 0];
  v_part bigint;
  i int;
begin
  if p_version !~ '^[0-9]+(\.[0-9]+){0,3}$' then
    return null;
  end if;

  v_raw := string_to_array(p_version, '.');
  if cardinality(v_raw) > 4 then return null; end if;

  for i in 1..cardinality(v_raw) loop
    v_part := v_raw[i]::bigint;
    if v_part < 0 or v_part > 65535 then return null; end if;
    v_parts[i] := v_part::int;
  end loop;

  return v_parts;
exception when others then
  return null;
end;
$$;

create or replace function public.extension_versions_valid(p_versions text[])
returns boolean
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select coalesce(bool_and(public.extension_version_parts(v) is not null), true)
  from unnest(p_versions) as v;
$$;

create table if not exists public.extension_release_channels (
  browser text primary key
    check (browser in ('chrome', 'edge', 'firefox', 'safari')),
  latest_submitted_version text,
  latest_available_version text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint extension_release_channels_submitted_version_check
    check (
      latest_submitted_version is null
      or public.extension_version_parts(latest_submitted_version) is not null
    ),
  constraint extension_release_channels_available_version_check
    check (
      latest_available_version is null
      or public.extension_version_parts(latest_available_version) is not null
    )
);

insert into public.extension_release_channels (browser)
values ('chrome'), ('edge'), ('firefox'), ('safari')
on conflict (browser) do nothing;

drop trigger if exists set_extension_release_channels_updated_at
  on public.extension_release_channels;
create trigger set_extension_release_channels_updated_at
before update on public.extension_release_channels
for each row execute function public.set_current_timestamp_updated_at();

create table if not exists public.extension_known_issues (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null check (length(trim(title)) between 1 and 120),
  message text not null check (length(trim(message)) between 1 and 1000),
  workaround text check (workaround is null or length(trim(workaround)) <= 1000),
  severity text not null default 'warning'
    check (severity in ('info', 'warning', 'critical')),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'resolved')),
  affected_browsers text[] not null default '{}',
  affected_versions text[] not null default '{}',
  affected_before_version text,
  fixed_in_version text,
  show_announcement boolean not null default false,
  snooze_hours int not null default 24 check (snooze_hours between 1 and 168),
  starts_at timestamptz,
  ends_at timestamptz,
  constraint extension_known_issues_browsers_check
    check (
      cardinality(affected_browsers) > 0
      and affected_browsers <@ array['chrome', 'edge', 'firefox', 'safari']::text[]
    ),
  constraint extension_known_issues_versions_check
    check (
      public.extension_versions_valid(affected_versions)
      and (
        affected_before_version is null
        or public.extension_version_parts(affected_before_version) is not null
      )
      and (
        fixed_in_version is null
        or public.extension_version_parts(fixed_in_version) is not null
      )
      and (
        cardinality(affected_versions) > 0
        or affected_before_version is not null
      )
    ),
  constraint extension_known_issues_announcement_check
    check (show_announcement = false or severity = 'critical'),
  constraint extension_known_issues_dates_check
    check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists extension_known_issues_published_idx
  on public.extension_known_issues (severity, starts_at, ends_at)
  where status = 'published';

drop trigger if exists set_extension_known_issues_updated_at
  on public.extension_known_issues;
create trigger set_extension_known_issues_updated_at
before update on public.extension_known_issues
for each row execute function public.set_current_timestamp_updated_at();

alter table public.extension_release_channels enable row level security;
alter table public.extension_known_issues enable row level security;

-- Clients receive only the evaluated public payload through the RPC below.
-- Drafts, resolved issues and release-operation metadata remain service-role only.
revoke all on table public.extension_release_channels from public, anon, authenticated;
revoke all on table public.extension_known_issues from public, anon, authenticated;
revoke all on sequence public.extension_known_issues_id_seq from public, anon, authenticated;

create or replace function public.get_extension_health(
  p_browser text,
  p_installed_version text
) returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_installed int[] := public.extension_version_parts(p_installed_version);
  v_available_version text;
  v_available int[];
  v_update_available boolean := false;
  v_issues jsonb := '[]'::jsonb;
begin
  if p_browser not in ('chrome', 'edge', 'firefox', 'safari')
    or v_installed is null then
    return jsonb_build_object(
      'browser', p_browser,
      'installedVersion', p_installed_version,
      'latestAvailableVersion', null,
      'updateAvailable', false,
      'issues', '[]'::jsonb
    );
  end if;

  select latest_available_version
  into v_available_version
  from public.extension_release_channels
  where browser = p_browser;

  v_available := public.extension_version_parts(v_available_version);
  v_update_available := v_available is not null and v_installed < v_available;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', issue.id::text,
    'title', issue.title,
    'message', issue.message,
    'workaround', issue.workaround,
    'severity', issue.severity,
    'fixedInVersion', issue.fixed_in_version,
    'showAnnouncement', issue.show_announcement,
    'snoozeHours', issue.snooze_hours,
    'canUpdateToFix',
      v_update_available
      and issue.fixed_in_version is not null
      and v_available >= public.extension_version_parts(issue.fixed_in_version)
  ) order by
    case issue.severity when 'critical' then 0 when 'warning' then 1 else 2 end,
    issue.created_at desc), '[]'::jsonb)
  into v_issues
  from public.extension_known_issues as issue
  where issue.status = 'published'
    and (issue.starts_at is null or issue.starts_at <= now())
    and (issue.ends_at is null or issue.ends_at > now())
    and p_browser = any(issue.affected_browsers)
    and (
      p_installed_version = any(issue.affected_versions)
      or (
        issue.affected_before_version is not null
        and v_installed < public.extension_version_parts(issue.affected_before_version)
      )
    );

  return jsonb_build_object(
    'browser', p_browser,
    'installedVersion', p_installed_version,
    'latestAvailableVersion', v_available_version,
    'updateAvailable', v_update_available,
    'issues', v_issues
  );
end;
$$;

revoke all on function public.extension_version_parts(text) from public, anon, authenticated;
revoke all on function public.extension_versions_valid(text[]) from public, anon, authenticated;
revoke all on function public.get_extension_health(text, text) from public;
grant execute on function public.get_extension_health(text, text) to anon, authenticated;

