-- Ordinary school portraits are authenticated Lectio assets and must not be
-- copied into public BetterLectio storage. Keep these columns temporarily so
-- deployed clients and the existing profile RPC return shape remain compatible.

update public.students
set lectio_pfp_url = null,
    pfp_hash = null
where lectio_pfp_url is not null
   or pfp_hash is not null;

comment on column public.students.lectio_pfp_url is
  'Deprecated compatibility field. Ordinary portraits are loaded directly from Lectio; keep null.';

comment on column public.students.pfp_hash is
  'Deprecated compatibility field from the removed Lectio portrait mirror; keep null.';
