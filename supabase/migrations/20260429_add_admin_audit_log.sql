-- Admin dashboard write-action audit log.
-- Inserted by the admin app's service-role client only. Anon and authenticated
-- roles have no access; admin reads happen via service role too.
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor text not null default 'pin',
  action text not null,
  target_table text,
  target_id text,
  before jsonb,
  after jsonb,
  metadata jsonb
);

create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log (created_at desc);

create index if not exists admin_audit_log_action_idx
  on public.admin_audit_log (action);

create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log (target_table, target_id);

alter table public.admin_audit_log enable row level security;

-- Deny all to anon/authenticated. Service role bypasses RLS automatically.
revoke all on public.admin_audit_log from anon, authenticated;
