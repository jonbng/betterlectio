-- Fix: schedule lesson upserts fail with
--   "new row violates row-level security policy for table \"updates\""
--
-- Cause: audit triggers on public tables (e.g. lessons) INSERT into public.updates
-- while running as the calling role (authenticated). RLS on updates blocks that insert.
--
-- Fix: make all triggers that write to public.updates SECURITY DEFINER so they run
-- as the function owner (typically postgres / migration role) and bypass RLS.

-- 1) Ensure updates RLS does not block definer-owned audit writers.
--    Keep client INSERT closed: authenticated users should not write audit rows directly.
alter table if exists public.updates enable row level security;

drop policy if exists "updates_select_authenticated" on public.updates;
-- Optional read for authenticated (admin UIs); safe no-op if you prefer deny-all for clients.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'updates' and policyname = 'updates_select_authenticated'
  ) then
    create policy updates_select_authenticated
      on public.updates
      for select
      to authenticated
      using (true);
  end if;
exception
  when undefined_table then
    raise notice 'public.updates does not exist — skip select policy';
end $$;

-- Deny direct client inserts (drop any open insert policies).
drop policy if exists "updates_insert_authenticated" on public.updates;
drop policy if exists "Enable insert for authenticated users only" on public.updates;

-- 2) Re-mark functions that insert into public.updates as SECURITY DEFINER.
--    We discover them from pg_trigger → pg_proc rather than hard-coding names.
do $$
declare
  r record;
begin
  for r in
    select distinct p.oid, n.nspname, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and pg_get_functiondef(p.oid) ilike '%insert into%updates%'
  loop
    execute format(
      'alter function %I.%I(%s) security definer set search_path = public',
      r.nspname,
      r.proname,
      pg_get_function_identity_arguments(r.oid)
    );
    raise notice 'Set SECURITY DEFINER on %.%(%)',
      r.nspname, r.proname, pg_get_function_identity_arguments(r.oid);
  end loop;
exception
  when others then
    raise notice 'Could not auto-alter updates audit functions: %', sqlerrm;
end $$;

-- 3) Fallback: if a known audit function name exists, force DEFINER.
do $$
begin
  -- Common naming patterns; each is a no-op if missing.
  perform 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'log_table_update';
  if found then
    execute 'alter function public.log_table_update() security definer set search_path = public';
  end if;
exception when others then null;
end $$;

do $$
begin
  perform 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'audit_row_change';
  if found then
    execute 'alter function public.audit_row_change() security definer set search_path = public';
  end if;
exception when others then null;
end $$;

comment on table public.updates is
  'Audit log written by SECURITY DEFINER triggers; clients should not INSERT directly.';
