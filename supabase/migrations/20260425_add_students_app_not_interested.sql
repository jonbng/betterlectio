-- Persistent "not interested" dismissal for the iOS app prompt.
-- Set when the student picks the "Ikke interesseret" CTA in MobileAppDrawer.
alter table public.students
  add column if not exists app_not_interested boolean not null default false;
