alter table public.schools
  add column if not exists lat double precision,
  add column if not exists lon double precision;
