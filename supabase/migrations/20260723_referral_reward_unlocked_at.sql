-- Referral unlock: stamp when a student has ≥3 successful attributed invites.
-- Used later to gate Tilpasning / customization. V1 only stamps the flag.

alter table public.students
  add column if not exists referral_reward_unlocked_at timestamptz null;

comment on column public.students.referral_reward_unlocked_at is
  'Set when the student reaches the referral unlock threshold (3 attributed invites). Stable gate for future Tilpasning.';

-- Backfill anyone who already has ≥3 conversions.
update public.students s
set referral_reward_unlocked_at = coalesce(
  (
    select max(invitee.referred_at)
    from public.students invitee
    where invitee.referred_by = s.id
  ),
  now()
)
where s.referral_reward_unlocked_at is null
  and (
    select count(*)
    from public.students invitee
    where invitee.referred_by = s.id
  ) >= 3;
