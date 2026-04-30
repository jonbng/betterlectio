-- Referral system: classmates share `betterlectio.dk/r/{elevid}` links.
--
-- Flow:
--   1. Invitee clicks → website route 302s to the `referral-click` edge fn.
--   2. Edge fn inserts a row here, sets a cookie on the supabase domain,
--      and 302s to /download.
--   3. After install, the extension calls the `referral-finalize` edge fn
--      which reads the cookie, attributes the click, and stamps the
--      invitee's students row.
--
-- Attribution rule: first-install only, never overwrite. The students
-- row's `referred_by` column is the source of truth — once set it stays.
-- The edge function uses service-role access to write here; the only
-- client-facing surface is the `get_referral_stats(student_id)` RPC
-- below, which lets a student see their own counts.

-- ── referral_clicks ────────────────────────────────────────────────────
create table if not exists public.referral_clicks (
  id uuid primary key default gen_random_uuid(),
  cookie_id uuid not null unique,
  referrer_student_id text not null
    references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),

  -- Click metadata captured by the edge function
  user_agent text,
  referer text,
  landing_url text,
  ip_hash text,        -- sha256(ip + daily_salt) — no raw IPs
  country text,
  city text,

  -- Attribution result (filled by referral-finalize)
  converted_at timestamptz,
  converted_student_id text
    references public.students(id) on delete set null,
  expired_at timestamptz,
  rejection_reason text -- 'self_referral' | 'already_referred' | 'returning_user' | 'expired'
);

create index if not exists referral_clicks_referrer_idx
  on public.referral_clicks (referrer_student_id, created_at desc);

create index if not exists referral_clicks_converted_idx
  on public.referral_clicks (converted_student_id)
  where converted_student_id is not null;

create index if not exists referral_clicks_unconverted_idx
  on public.referral_clicks (cookie_id)
  where converted_at is null and expired_at is null;

create index if not exists referral_clicks_created_at_idx
  on public.referral_clicks (created_at desc);

create index if not exists referral_clicks_converted_at_idx
  on public.referral_clicks (converted_at desc)
  where converted_at is not null;

-- Service-role only. Admin dashboard reads via service-role client; the
-- extension never reads this table directly (only via the RPC below).
alter table public.referral_clicks enable row level security;

drop policy if exists "referral_clicks_service_role" on public.referral_clicks;
create policy "referral_clicks_service_role"
  on public.referral_clicks for all
  to service_role
  using (true)
  with check (true);

-- ── students columns ───────────────────────────────────────────────────
alter table public.students
  add column if not exists referred_by text
    references public.students(id) on delete set null,
  add column if not exists referred_at timestamptz,
  add column if not exists referral_click_id uuid
    references public.referral_clicks(id) on delete set null;

create index if not exists students_referred_by_idx
  on public.students (referred_by)
  where referred_by is not null;

-- ── get_referral_stats RPC ─────────────────────────────────────────────
-- Lets a logged-in student read their own referral stats. Counts only,
-- plus the names of attributed classmates so the extension can show a
-- short "Du har inviteret …" list. Auth check matches the rest of the
-- codebase: `students.supabase_id = auth.uid()`.
create or replace function public.get_referral_stats(
  p_student_id text
) returns table (
  total_clicks bigint,
  unique_clickers bigint,
  conversions bigint,
  recent_referrals jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  if not exists (
    select 1
    from public.students s
    where s.id = p_student_id
      and s.supabase_id = v_uid
  ) then
    raise exception 'Unauthorized';
  end if;

  return query
  select
    (select count(*)::bigint
       from public.referral_clicks rc
      where rc.referrer_student_id = p_student_id) as total_clicks,
    (select count(distinct rc.ip_hash)::bigint
       from public.referral_clicks rc
      where rc.referrer_student_id = p_student_id
        and rc.ip_hash is not null) as unique_clickers,
    (select count(*)::bigint
       from public.students s
      where s.referred_by = p_student_id) as conversions,
    coalesce(
      (
        select jsonb_agg(item order by item->>'attributed_at' desc)
        from (
          select jsonb_build_object(
            'student_id', s.id,
            'name', s.name,
            'attributed_at', s.referred_at
          ) as item
          from public.students s
          where s.referred_by = p_student_id
            and s.referred_at is not null
          order by s.referred_at desc
          limit 5
        ) recent
      ),
      '[]'::jsonb
    ) as recent_referrals;
end;
$$;

revoke all on function public.get_referral_stats(text) from public;
grant execute on function public.get_referral_stats(text) to authenticated;
grant execute on function public.get_referral_stats(text) to service_role;
