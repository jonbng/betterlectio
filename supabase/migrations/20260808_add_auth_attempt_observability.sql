begin;

create table public.auth_attempts (
  request_id uuid primary key,
  function_name text not null check (function_name in ('token-for-auth', 'verify-lectio-auth')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  outcome text not null default 'started' check (outcome in ('started', 'success', 'degraded', 'failed')),
  failure_stage text,
  http_status integer check (http_status is null or http_status between 100 and 599),
  school_id bigint references public.schools(id) on update cascade on delete set null,
  student_id text,
  auth_user_id uuid,
  platform text not null default 'unknown' check (platform in ('ios', 'android', 'extension', 'unknown')),
  app_version text check (app_version is null or length(app_version) <= 40),
  app_build text check (app_build is null or length(app_build) <= 40),
  client_info text check (client_info is null or length(client_info) <= 200),
  profile_source text check (profile_source is null or profile_source in ('student_card', 'schedule_title', 'none')),
  schedule_ok boolean not null default false,
  student_card_status integer,
  has_name boolean not null default false,
  has_class boolean not null default false,
  has_birthdate boolean not null default false,
  has_picture boolean not null default false,
  client_completion_kind text check (client_completion_kind is null or client_completion_kind in ('session_ready', 'verify_recovered')),
  client_completed_at timestamptz
);

alter table public.auth_attempts enable row level security;
revoke all on public.auth_attempts from anon, authenticated;
grant select, insert, update, delete on public.auth_attempts to service_role;

create policy auth_attempts_deny_client_access
on public.auth_attempts
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create index auth_attempts_started_at_idx on public.auth_attempts (started_at desc);
create index auth_attempts_function_started_idx on public.auth_attempts (function_name, started_at desc);
create index auth_attempts_platform_started_idx on public.auth_attempts (platform, started_at desc);
create index auth_attempts_school_started_idx on public.auth_attempts (school_id, started_at desc)
  where school_id is not null;
create index auth_attempts_auth_user_idx on public.auth_attempts (auth_user_id, started_at desc)
  where auth_user_id is not null;

create or replace function public.confirm_auth_attempt(
  p_request_id uuid,
  p_completion_kind text default 'session_ready'
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_completion_kind not in ('session_ready', 'verify_recovered') then
    raise exception 'Invalid completion kind' using errcode = '22023';
  end if;

  update public.auth_attempts
  set client_completion_kind = p_completion_kind,
      client_completed_at = now()
  where request_id = p_request_id
    and auth_user_id = (select auth.uid())
    and started_at >= now() - interval '24 hours';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Auth attempt not found or not owned by current user' using errcode = '42501';
  end if;
  return true;
end;
$$;

revoke all on function public.confirm_auth_attempt(uuid, text) from public, anon;
grant execute on function public.confirm_auth_attempt(uuid, text) to authenticated;

create or replace function public.get_auth_health(p_since timestamptz default now() - interval '7 days')
returns table (
  request_id uuid,
  function_name text,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  outcome text,
  failure_stage text,
  http_status integer,
  school_id bigint,
  school_name text,
  student_id text,
  platform text,
  app_version text,
  app_build text,
  profile_source text,
  schedule_ok boolean,
  student_card_status integer,
  has_name boolean,
  has_class boolean,
  has_birthdate boolean,
  has_picture boolean,
  session_state text,
  client_completion_kind text,
  client_completed_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    a.request_id,
    a.function_name,
    a.started_at,
    a.finished_at,
    a.duration_ms,
    a.outcome,
    a.failure_stage,
    a.http_status,
    a.school_id,
    coalesce(s.display_name, s.name) as school_name,
    a.student_id,
    a.platform,
    a.app_version,
    a.app_build,
    a.profile_source,
    a.schedule_ok,
    a.student_card_status,
    a.has_name,
    a.has_class,
    a.has_birthdate,
    a.has_picture,
    case
      when a.client_completed_at is not null then 'confirmed'
      when a.auth_user_id is not null and exists (
        select 1
        from auth.sessions ses
        where ses.user_id = a.auth_user_id
          and ses.created_at >= a.started_at
          and ses.created_at <= coalesce(a.finished_at, a.started_at) + interval '1 hour'
      ) then 'observed'
      when a.outcome in ('success', 'degraded') and a.started_at > now() - interval '1 hour' then 'pending'
      when a.outcome in ('success', 'degraded') then 'unverified'
      else 'not_applicable'
    end as session_state,
    a.client_completion_kind,
    a.client_completed_at
  from public.auth_attempts a
  left join public.schools s on s.id = a.school_id
  where a.started_at >= greatest(p_since, now() - interval '30 days')
  order by a.started_at desc
  limit 500;
$$;

revoke all on function public.get_auth_health(timestamptz) from public, anon, authenticated;
grant execute on function public.get_auth_health(timestamptz) to service_role;

create or replace function public.get_auth_health_summary(
  p_since timestamptz default now() - interval '7 days',
  p_function_name text default null,
  p_platform text default null,
  p_version text default null,
  p_status text default null
)
returns table (
  total bigint,
  failed bigint,
  degraded bigint,
  session_ready bigint,
  unverified bigint,
  edge_success bigint,
  profile_ready bigint
)
language sql
security definer
set search_path = ''
stable
as $$
  with classified as (
    select a.*,
      case
        when a.client_completed_at is not null then 'confirmed'
        when a.auth_user_id is not null and exists (
          select 1 from auth.sessions ses
          where ses.user_id = a.auth_user_id
            and ses.created_at >= a.started_at
            and ses.created_at <= coalesce(a.finished_at, a.started_at) + interval '1 hour'
        ) then 'observed'
        when a.outcome in ('success', 'degraded') and a.started_at > now() - interval '1 hour' then 'pending'
        when a.outcome in ('success', 'degraded') then 'unverified'
        else 'not_applicable'
      end as session_state
    from public.auth_attempts a
    where a.started_at >= greatest(p_since, now() - interval '30 days')
      and (p_function_name is null or a.function_name = p_function_name)
      and (p_platform is null or a.platform = p_platform)
      and (p_version is null or a.app_version = p_version)
  ), filtered as (
    select * from classified
    where p_status is null or outcome = p_status or session_state = p_status
  )
  select
    count(*),
    count(*) filter (where outcome = 'failed'),
    count(*) filter (where outcome = 'degraded' or not has_name),
    count(*) filter (where session_state in ('confirmed', 'observed')),
    count(*) filter (where session_state = 'unverified'),
    count(*) filter (where outcome in ('success', 'degraded')),
    count(*) filter (where outcome in ('success', 'degraded') and has_name)
  from filtered;
$$;

revoke all on function public.get_auth_health_summary(timestamptz, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.get_auth_health_summary(timestamptz, text, text, text, text)
  to service_role;

create or replace function public.cleanup_auth_attempts() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.auth_attempts where started_at < now() - interval '30 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.cleanup_auth_attempts() from public, anon, authenticated;
grant execute on function public.cleanup_auth_attempts() to service_role;

create extension if not exists pg_cron;
select cron.schedule(
  'cleanup-auth-attempts-daily',
  '17 3 * * *',
  $$select public.cleanup_auth_attempts()$$
);

commit;
