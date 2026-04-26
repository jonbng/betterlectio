-- Mobile app rollout: per-student flags
-- has_android: user is on an Android device, suppress the iOS install prompt forever
-- app_eligible: operator-controlled gate for the gradual rollout of the iOS app
alter table public.students
  add column if not exists has_android boolean not null default false,
  add column if not exists app_eligible boolean not null default false;
