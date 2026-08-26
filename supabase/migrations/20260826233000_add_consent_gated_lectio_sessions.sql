-- Explicitly-consented Lectio sessions for server-side development access.
-- No donor is enrolled by this migration. Grants are service-role-only and
-- credentials are encrypted by Edge Functions before they reach Postgres.

create table public.lectio_session_grants (
  id uuid primary key default gen_random_uuid(),
  student_id text not null check (student_id ~ '^[0-9]+$'),
  school_id bigint not null check (school_id > 0),
  enabled boolean not null default true,
  consented_at timestamptz not null default now(),
  revoked_at timestamptz,
  consent_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lectio_session_grants_identity_key unique (student_id, school_id),
  constraint lectio_session_grants_revocation_check check (
    (enabled and revoked_at is null) or (not enabled and revoked_at is not null)
  )
);

create table public.lectio_session_credentials (
  grant_id uuid primary key references public.lectio_session_grants(id) on delete cascade,
  key_version integer not null check (key_version > 0),
  ciphertext text not null check (length(ciphertext) > 0),
  iv text not null check (length(iv) > 0),
  wrapped_dek text not null check (length(wrapped_dek) > 0),
  wrap_iv text not null check (length(wrap_iv) > 0),
  jar_version integer not null default 1 check (jar_version = 1),
  captured_at timestamptz not null default now(),
  last_success_at timestamptz,
  next_keepalive_at timestamptz not null default now(),
  claimed_until timestamptz,
  claim_token uuid,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  disabled_at timestamptz,
  last_error_code text,
  updated_at timestamptz not null default now()
);

create index lectio_session_credentials_due_idx
  on public.lectio_session_credentials (next_keepalive_at)
  where disabled_at is null;

create table public.lectio_session_access_audit (
  id bigint generated always as identity primary key,
  grant_id uuid not null references public.lectio_session_grants(id) on delete cascade,
  accessed_at timestamptz not null default now(),
  accessor text not null check (length(accessor) between 1 and 100)
);

create index lectio_session_access_audit_grant_idx
  on public.lectio_session_access_audit (grant_id, accessed_at desc);

alter table public.lectio_session_grants enable row level security;
alter table public.lectio_session_credentials enable row level security;
alter table public.lectio_session_access_audit enable row level security;

revoke all on public.lectio_session_grants from public, anon, authenticated;
revoke all on public.lectio_session_credentials from public, anon, authenticated;
revoke all on public.lectio_session_access_audit from public, anon, authenticated;
revoke all on sequence public.lectio_session_access_audit_id_seq from public, anon, authenticated;

grant select, insert, update, delete on public.lectio_session_grants to service_role;
grant select, insert, update, delete on public.lectio_session_credentials to service_role;
grant select, insert on public.lectio_session_access_audit to service_role;
grant usage, select on sequence public.lectio_session_access_audit_id_seq to service_role;

create or replace function public.touch_lectio_session_grant_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_lectio_session_grant_updated_at
before update on public.lectio_session_grants
for each row execute function public.touch_lectio_session_grant_updated_at();

create or replace function public.delete_revoked_lectio_session_credential()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.enabled or new.revoked_at is not null then
    delete from public.lectio_session_credentials where grant_id = new.id;
  end if;
  return new;
end;
$$;

create trigger delete_revoked_lectio_session_credential
after insert or update of enabled, revoked_at on public.lectio_session_grants
for each row execute function public.delete_revoked_lectio_session_credential();

create or replace function public.store_lectio_session_credential(
  p_student_id text,
  p_school_id bigint,
  p_key_version integer,
  p_ciphertext text,
  p_iv text,
  p_wrapped_dek text,
  p_wrap_iv text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grant_id uuid;
begin
  select id into v_grant_id
  from public.lectio_session_grants
  where student_id = p_student_id
    and school_id = p_school_id
    and enabled
    and revoked_at is null
  for update;

  if v_grant_id is null then
    return false;
  end if;

  insert into public.lectio_session_credentials (
    grant_id, key_version, ciphertext, iv, wrapped_dek, wrap_iv,
    captured_at, next_keepalive_at, claimed_until, claim_token,
    consecutive_failures, disabled_at, last_error_code, updated_at
  ) values (
    v_grant_id, p_key_version, p_ciphertext, p_iv, p_wrapped_dek, p_wrap_iv,
    now(), now(), null, null, 0, null, null, now()
  )
  on conflict (grant_id) do update set
    key_version = excluded.key_version,
    ciphertext = excluded.ciphertext,
    iv = excluded.iv,
    wrapped_dek = excluded.wrapped_dek,
    wrap_iv = excluded.wrap_iv,
    jar_version = 1,
    captured_at = now(),
    next_keepalive_at = now(),
    claimed_until = null,
    claim_token = null,
    consecutive_failures = 0,
    disabled_at = null,
    last_error_code = null,
    updated_at = now();

  return true;
end;
$$;

create or replace function public.claim_due_lectio_sessions(
  p_batch_size integer default 20,
  p_lease_seconds integer default 120
)
returns table (
  grant_id uuid,
  student_id text,
  school_id bigint,
  key_version integer,
  ciphertext text,
  iv text,
  wrapped_dek text,
  wrap_iv text,
  claim_token uuid
)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select c.grant_id
    from public.lectio_session_credentials c
    join public.lectio_session_grants g on g.id = c.grant_id
    where g.enabled
      and g.revoked_at is null
      and c.disabled_at is null
      and c.next_keepalive_at <= now()
      and (c.claimed_until is null or c.claimed_until < now())
    order by c.next_keepalive_at
    limit greatest(1, least(p_batch_size, 100))
    for update of c skip locked
  ), claimed as (
    update public.lectio_session_credentials c
    set claimed_until = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 600))),
        claim_token = gen_random_uuid(),
        updated_at = now()
    from due
    where c.grant_id = due.grant_id
    returning c.*
  )
  select c.grant_id, g.student_id, g.school_id, c.key_version,
         c.ciphertext, c.iv, c.wrapped_dek, c.wrap_iv, c.claim_token
  from claimed c
  join public.lectio_session_grants g on g.id = c.grant_id;
$$;

create or replace function public.complete_lectio_session_keepalive(
  p_grant_id uuid,
  p_claim_token uuid,
  p_key_version integer,
  p_ciphertext text,
  p_iv text,
  p_wrapped_dek text,
  p_wrap_iv text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.lectio_session_credentials c
  set key_version = p_key_version,
      ciphertext = p_ciphertext,
      iv = p_iv,
      wrapped_dek = p_wrapped_dek,
      wrap_iv = p_wrap_iv,
      last_success_at = now(),
      -- A one-minute margin ensures a worker finishing just after a half-hour
      -- boundary is due before the following 30-minute cron tick.
      next_keepalive_at = now() + interval '29 minutes',
      claimed_until = null,
      claim_token = null,
      consecutive_failures = 0,
      disabled_at = null,
      last_error_code = null,
      updated_at = now()
  from public.lectio_session_grants g
  where c.grant_id = p_grant_id
    and c.claim_token = p_claim_token
    and g.id = c.grant_id
    and g.enabled
    and g.revoked_at is null;
  return found;
end;
$$;

create or replace function public.fail_lectio_session_keepalive(
  p_grant_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_terminal boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.lectio_session_credentials
  set consecutive_failures = consecutive_failures + 1,
      next_keepalive_at = now() + least(
        interval '30 minutes',
        make_interval(secs => (60 * power(2, least(consecutive_failures, 5)))::integer)
      ),
      claimed_until = null,
      claim_token = null,
      disabled_at = case
        when p_terminal or consecutive_failures + 1 >= 5 then now()
        else null
      end,
      last_error_code = left(coalesce(p_error_code, 'unknown'), 100),
      updated_at = now()
  where grant_id = p_grant_id and claim_token = p_claim_token;
  return found;
end;
$$;

create or replace function public.export_lectio_session_credential(
  p_student_id text,
  p_school_id bigint,
  p_accessor text default 'lectio-cli'
)
returns table (
  student_id text,
  school_id bigint,
  key_version integer,
  ciphertext text,
  iv text,
  wrapped_dek text,
  wrap_iv text,
  captured_at timestamptz,
  last_success_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grant_id uuid;
begin
  select g.id into v_grant_id
  from public.lectio_session_grants g
  join public.lectio_session_credentials c on c.grant_id = g.id
  where g.student_id = p_student_id
    and g.school_id = p_school_id
    and g.enabled
    and g.revoked_at is null
    and c.disabled_at is null;

  if v_grant_id is null then return; end if;

  insert into public.lectio_session_access_audit (grant_id, accessor)
  values (v_grant_id, left(coalesce(nullif(p_accessor, ''), 'lectio-cli'), 100));

  return query
  select g.student_id, g.school_id, c.key_version, c.ciphertext, c.iv,
         c.wrapped_dek, c.wrap_iv, c.captured_at, c.last_success_at
  from public.lectio_session_grants g
  join public.lectio_session_credentials c on c.grant_id = g.id
  where g.id = v_grant_id;
end;
$$;

revoke all on function public.touch_lectio_session_grant_updated_at() from public, anon, authenticated;
revoke all on function public.delete_revoked_lectio_session_credential() from public, anon, authenticated;
revoke all on function public.store_lectio_session_credential(text, bigint, integer, text, text, text, text) from public, anon, authenticated;
revoke all on function public.claim_due_lectio_sessions(integer, integer) from public, anon, authenticated;
revoke all on function public.complete_lectio_session_keepalive(uuid, uuid, integer, text, text, text, text) from public, anon, authenticated;
revoke all on function public.fail_lectio_session_keepalive(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.export_lectio_session_credential(text, bigint, text) from public, anon, authenticated;

grant execute on function public.store_lectio_session_credential(text, bigint, integer, text, text, text, text) to service_role;
grant execute on function public.claim_due_lectio_sessions(integer, integer) to service_role;
grant execute on function public.complete_lectio_session_keepalive(uuid, uuid, integer, text, text, text, text) to service_role;
grant execute on function public.fail_lectio_session_keepalive(uuid, uuid, text, boolean) to service_role;
grant execute on function public.export_lectio_session_credential(text, bigint, text) to service_role;
