-- One-time, short-lived handoffs from the authenticated admin dashboard to the
-- separately-built admin browser extension. Raw tokens are returned once and
-- never stored; only their SHA-256 hashes reach the database.

create table public.lectio_session_handoffs (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  grant_id uuid not null references public.lectio_session_grants(id) on delete cascade,
  created_by text not null check (length(created_by) between 1 and 100),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint lectio_session_handoffs_expiry_check check (
    expires_at > created_at and expires_at <= created_at + interval '5 minutes'
  )
);

create index lectio_session_handoffs_grant_idx
  on public.lectio_session_handoffs (grant_id);

create index lectio_session_handoffs_expiry_idx
  on public.lectio_session_handoffs (expires_at)
  where consumed_at is null;

alter table public.lectio_session_handoffs enable row level security;
revoke all on public.lectio_session_handoffs from public, anon, authenticated;
grant select, insert, update, delete on public.lectio_session_handoffs to service_role;

create or replace function public.issue_lectio_session_handoff(
  p_grant_id uuid,
  p_actor text default 'admin-dashboard'
)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at timestamptz := clock_timestamp() + interval '60 seconds';
begin
  if not exists (
    select 1
    from public.lectio_session_grants g
    join public.lectio_session_credentials c on c.grant_id = g.id
    where g.id = p_grant_id
      and g.enabled
      and g.revoked_at is null
      and c.disabled_at is null
  ) then
    raise exception 'No active consented session exists for this grant';
  end if;

  delete from public.lectio_session_handoffs h
  where h.expires_at < clock_timestamp() - interval '1 day';

  insert into public.lectio_session_handoffs (
    token_hash, grant_id, created_by, expires_at
  ) values (
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    p_grant_id,
    left(coalesce(nullif(trim(p_actor), ''), 'admin-dashboard'), 100),
    v_expires_at
  );

  return query select v_token, v_expires_at;
end;
$$;

create or replace function public.consume_lectio_session_handoff(p_token text)
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
  v_actor text;
begin
  update public.lectio_session_handoffs h
  set consumed_at = clock_timestamp()
  from public.lectio_session_grants g,
       public.lectio_session_credentials c
  where h.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and h.consumed_at is null
    and h.expires_at > clock_timestamp()
    and g.id = h.grant_id
    and g.enabled
    and g.revoked_at is null
    and c.grant_id = g.id
    and c.disabled_at is null
  returning h.grant_id, h.created_by
  into v_grant_id, v_actor;

  if v_grant_id is null then return; end if;

  insert into public.lectio_session_access_audit (grant_id, accessor)
  values (v_grant_id, left('admin-extension:' || v_actor, 100));

  return query
  select g.student_id, g.school_id, c.key_version, c.ciphertext, c.iv,
         c.wrapped_dek, c.wrap_iv, c.captured_at, c.last_success_at
  from public.lectio_session_grants g
  join public.lectio_session_credentials c on c.grant_id = g.id
  where g.id = v_grant_id;
end;
$$;

revoke all on function public.issue_lectio_session_handoff(uuid, text) from public, anon, authenticated;
revoke all on function public.consume_lectio_session_handoff(text) from public, anon, authenticated;
grant execute on function public.issue_lectio_session_handoff(uuid, text) to service_role;
grant execute on function public.consume_lectio_session_handoff(text) to service_role;
