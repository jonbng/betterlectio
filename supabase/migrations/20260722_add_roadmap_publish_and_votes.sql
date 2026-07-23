-- Public roadmap: curated exposure of feedback_items + anonymous upvotes.
-- Only items explicitly marked is_public (with curated public copy) are shown
-- on the marketing site. Raw user message/PII is never exposed publicly.

-- ── Roadmap columns on feedback_items ────────────────────────────────

alter table public.feedback_items
  add column if not exists is_public boolean not null default false,
  add column if not exists public_title text,
  add column if not exists public_description text,
  add column if not exists roadmap_sort int,
  add column if not exists roadmap_eta text,
  add column if not exists made_public_at timestamptz,
  add column if not exists roadmap_vote_count int not null default 0;

-- Fast public reads: only the handful of published rows, pre-ordered.
create index if not exists feedback_items_public_idx
  on public.feedback_items (status, roadmap_sort)
  where is_public = true;

-- ── roadmap_votes ────────────────────────────────────────────────────
-- Anonymous upvotes keyed by an httpOnly cookie id set by the website.
-- Writes only ever happen via the website server action (service role),
-- so RLS is enabled with no anon policies.

create table if not exists public.roadmap_votes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  feedback_id uuid not null references public.feedback_items(id) on delete cascade,
  voter_id text not null,
  unique (feedback_id, voter_id)
);

create index if not exists roadmap_votes_feedback_idx
  on public.roadmap_votes (feedback_id);

create index if not exists roadmap_votes_voter_idx
  on public.roadmap_votes (voter_id);

alter table public.roadmap_votes enable row level security;

-- No policies: authenticated/anon cannot read or write directly.
-- Service role (website server action + admin) bypasses RLS.

-- ── Vote count trigger ───────────────────────────────────────────────
-- Keep feedback_items.roadmap_vote_count in sync with roadmap_votes so
-- the public page can read a denormalized count cheaply.

create or replace function public.sync_roadmap_vote_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.feedback_items
       set roadmap_vote_count = roadmap_vote_count + 1
     where id = new.feedback_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.feedback_items
       set roadmap_vote_count = greatest(roadmap_vote_count - 1, 0)
     where id = old.feedback_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists roadmap_votes_count_ins on public.roadmap_votes;
create trigger roadmap_votes_count_ins
after insert on public.roadmap_votes
for each row
execute function public.sync_roadmap_vote_count();

drop trigger if exists roadmap_votes_count_del on public.roadmap_votes;
create trigger roadmap_votes_count_del
after delete on public.roadmap_votes
for each row
execute function public.sync_roadmap_vote_count();
