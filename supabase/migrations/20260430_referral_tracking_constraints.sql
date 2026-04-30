-- Hardening pass on the referral schema:
--   • Constrain `rejection_reason` so future code can't write garbage.
--   • The set is what the edge function emits today; keep them in sync.
alter table public.referral_clicks
  drop constraint if exists referral_clicks_rejection_reason_check;

alter table public.referral_clicks
  add constraint referral_clicks_rejection_reason_check
  check (
    rejection_reason is null
    or rejection_reason in (
      'self_referral',
      'already_referred',
      'returning_user',
      'expired',
      'race_lost'
    )
  );
