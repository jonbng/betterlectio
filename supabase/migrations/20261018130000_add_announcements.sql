-- Authenticated, targeted, at-most-once extension announcements.
-- Additive only: no existing rows are rewritten.

begin;

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  internal_name text not null check (length(trim(internal_name)) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'published', 'paused', 'archived')),
  kind text not null default 'news' check (kind in ('feature', 'tip', 'news', 'maintenance', 'survey', 'important')),
  presentation text not null default 'card' check (presentation in ('card', 'modal')),
  priority smallint not null default 50 check (priority between 0 and 100),
  starts_at timestamptz, ends_at timestamptz,
  cover_path text, cover_url text,
  cta_kind text not null default 'none' check (cta_kind in ('none', 'url', 'event')),
  cta_target text,
  audience_all boolean not null default false,
  browsers text[] not null default array['chrome', 'edge', 'firefox', 'safari']::text[],
  min_extension_version text, max_extension_version text,
  app_state text not null default 'any' check (app_state in ('any', 'installed', 'not_installed')),
  min_install_age_days integer check (min_install_age_days between 0 and 3650),
  active_within_days integer check (active_within_days between 1 and 3650),
  rollout_percent smallint not null default 100 check (rollout_percent between 1 and 100),
  allowed_pages text[] not null default '{}',
  avoid_quiet_hours boolean not null default true,
  avoid_class_time boolean not null default true,
  revision integer not null default 1 check (revision > 0),
  created_by text, updated_by text,
  published_at timestamptz, paused_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint announcements_dates_check check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint announcements_browsers_check check (cardinality(browsers) > 0 and browsers <@ array['chrome', 'edge', 'firefox', 'safari']::text[]),
  constraint announcements_versions_check check (
    (min_extension_version is null or public.extension_version_parts(min_extension_version) is not null)
    and (max_extension_version is null or public.extension_version_parts(max_extension_version) is not null)
    and (min_extension_version is null or max_extension_version is null or public.extension_version_parts(min_extension_version) <= public.extension_version_parts(max_extension_version))
  ),
  constraint announcements_cta_check check (
    (cta_kind = 'none' and cta_target is null)
    or (cta_kind <> 'none' and length(trim(coalesce(cta_target, ''))) between 1 and 2048)
  ),
  constraint announcements_modal_check check (presentation <> 'modal' or kind = 'important')
);

create table public.announcement_contents (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  locale text not null check (locale in ('da', 'en')),
  eyebrow text check (eyebrow is null or length(trim(eyebrow)) <= 40),
  title text not null check (length(trim(title)) between 1 and 120),
  body jsonb not null,
  cta_label text check (cta_label is null or length(trim(cta_label)) between 1 and 40),
  cover_alt text check (cover_alt is null or length(trim(cover_alt)) <= 200),
  primary key (announcement_id, locale),
  constraint announcement_contents_body_check check (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 16000)
);

create table public.announcement_targets (
  id bigint generated always as identity primary key,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  is_exclusion boolean not null default false,
  kind text not null check (kind in ('school', 'class', 'student')),
  school_id integer references public.schools(id) on update cascade on delete cascade,
  class_name text,
  student_id text references public.students(id) on update cascade on delete cascade,
  constraint announcement_targets_shape_check check (
    (kind = 'school' and school_id is not null and class_name is null and student_id is null)
    or (kind = 'class' and school_id is not null and length(trim(coalesce(class_name, ''))) between 1 and 80 and student_id is null)
    or (kind = 'student' and student_id is not null and school_id is null and class_name is null)
  )
);
create unique index announcement_targets_school_unique on public.announcement_targets (announcement_id, is_exclusion, school_id) where kind = 'school';
create unique index announcement_targets_class_unique on public.announcement_targets (announcement_id, is_exclusion, school_id, lower(class_name)) where kind = 'class';
create unique index announcement_targets_student_unique on public.announcement_targets (announcement_id, is_exclusion, student_id) where kind = 'student';
create index announcement_targets_school_id_idx on public.announcement_targets (school_id) where school_id is not null;
create index announcement_targets_student_id_idx on public.announcement_targets (student_id) where student_id is not null;

create table public.announcement_deliveries (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  student_id text not null references public.students(id) on update cascade on delete cascade,
  claim_token uuid not null default gen_random_uuid(), claim_context uuid not null,
  claimed_at timestamptz not null default now(), claimed_until timestamptz not null,
  seen_at timestamptz, dismissed_at timestamptz, clicked_at timestamptz,
  browser text not null check (browser in ('chrome', 'edge', 'firefox', 'safari')),
  extension_version text not null,
  locale text not null check (locale in ('da', 'en')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (announcement_id, student_id)
);
create index announcements_live_idx on public.announcements (priority desc, starts_at, ends_at) where status = 'published';
create index announcement_deliveries_student_idx on public.announcement_deliveries (student_id, seen_at, claimed_until);

create trigger set_announcements_updated_at before update on public.announcements for each row execute function public.set_current_timestamp_updated_at();
create trigger set_announcement_deliveries_updated_at before update on public.announcement_deliveries for each row execute function public.set_current_timestamp_updated_at();
alter table public.announcements enable row level security;
alter table public.announcement_contents enable row level security;
alter table public.announcement_targets enable row level security;
alter table public.announcement_deliveries enable row level security;
revoke all on table public.announcements, public.announcement_contents, public.announcement_targets, public.announcement_deliveries from public, anon, authenticated;
revoke all on sequence public.announcement_targets_id_seq from public, anon, authenticated;

create function public.claim_next_announcement(p_browser text, p_extension_version text, p_locale text, p_page text, p_context_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_student public.students%rowtype; v_announcement public.announcements%rowtype;
  v_content public.announcement_contents%rowtype; v_delivery public.announcement_deliveries%rowtype;
  v_version int[] := public.extension_version_parts(p_extension_version);
begin
  if (select auth.uid()) is null then raise exception 'Unauthorized'; end if;
  if p_browser not in ('chrome', 'edge', 'firefox', 'safari') or v_version is null then return null; end if;
  if p_locale not in ('da', 'en') then p_locale := 'da'; end if;
  select s.* into v_student from public.students s where s.supabase_id = (select auth.uid());
  if not found then raise exception 'Unauthorized'; end if;

  for v_announcement in
    select a.* from public.announcements a
    where a.status = 'published'
      and (a.starts_at is null or a.starts_at <= now()) and (a.ends_at is null or a.ends_at > now())
      and p_browser = any(a.browsers)
      and (a.min_extension_version is null or v_version >= public.extension_version_parts(a.min_extension_version))
      and (a.max_extension_version is null or v_version <= public.extension_version_parts(a.max_extension_version))
      and (cardinality(a.allowed_pages) = 0 or lower(coalesce(p_page, '')) = any(a.allowed_pages))
      and (a.app_state = 'any' or (a.app_state = 'installed') = (v_student.app_installed_at is not null))
      and (a.min_install_age_days is null or v_student.extension_installed_at <= now() - make_interval(days => a.min_install_age_days))
      and (a.active_within_days is null or v_student.last_seen_at >= now() - make_interval(days => a.active_within_days))
      and (a.rollout_percent = 100 or ((('x' || substr(md5(a.id::text || ':' || v_student.id), 1, 8))::bit(32)::bigint % 100) < a.rollout_percent))
      and (a.audience_all or exists (
        select 1 from public.announcement_targets t where t.announcement_id = a.id and not t.is_exclusion and (
          (t.kind = 'school' and t.school_id = v_student.school_id)
          or (t.kind = 'class' and t.school_id = v_student.school_id and lower(trim(t.class_name)) = lower(trim(v_student.class_name)))
          or (t.kind = 'student' and t.student_id = v_student.id))))
      and not exists (
        select 1 from public.announcement_targets t where t.announcement_id = a.id and t.is_exclusion and (
          (t.kind = 'school' and t.school_id = v_student.school_id)
          or (t.kind = 'class' and t.school_id = v_student.school_id and lower(trim(t.class_name)) = lower(trim(v_student.class_name)))
          or (t.kind = 'student' and t.student_id = v_student.id)))
    order by a.priority desc, a.starts_at nulls first, a.created_at
  loop
    select c.* into v_content from public.announcement_contents c where c.announcement_id = v_announcement.id
    order by case c.locale when p_locale then 0 when 'da' then 1 else 2 end limit 1;
    if not found then continue; end if;

    insert into public.announcement_deliveries as delivery (
      announcement_id, student_id, claim_token, claim_context, claimed_at, claimed_until, browser, extension_version, locale
    ) values (
      v_announcement.id, v_student.id, gen_random_uuid(), p_context_id, now(), now() + interval '5 minutes', p_browser, p_extension_version, p_locale
    ) on conflict (announcement_id, student_id) do update set
      claim_token = case when delivery.claim_context = excluded.claim_context then delivery.claim_token else excluded.claim_token end,
      claim_context = excluded.claim_context, claimed_at = now(), claimed_until = now() + interval '5 minutes',
      browser = excluded.browser, extension_version = excluded.extension_version, locale = excluded.locale
    where delivery.seen_at is null and (delivery.claim_context = excluded.claim_context or delivery.claimed_until < now())
    returning delivery.* into v_delivery;

    if found then return jsonb_build_object(
      'id', v_announcement.id, 'claimToken', v_delivery.claim_token, 'kind', v_announcement.kind,
      'presentation', v_announcement.presentation, 'eyebrow', v_content.eyebrow, 'title', v_content.title,
      'body', v_content.body, 'coverUrl', v_announcement.cover_url, 'coverAlt', v_content.cover_alt,
      'ctaKind', v_announcement.cta_kind, 'ctaTarget', v_announcement.cta_target, 'ctaLabel', v_content.cta_label,
      'avoidQuietHours', v_announcement.avoid_quiet_hours, 'avoidClassTime', v_announcement.avoid_class_time
    ); end if;
  end loop;
  return null;
end; $$;

create function public.record_announcement_event(p_announcement_id uuid, p_claim_token uuid, p_event text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_student_id text;
begin
  if p_event not in ('seen', 'dismissed', 'clicked') then return false; end if;
  select s.id into v_student_id from public.students s where s.supabase_id = (select auth.uid());
  if not found then raise exception 'Unauthorized'; end if;
  update public.announcement_deliveries d set
    seen_at = coalesce(d.seen_at, now()),
    dismissed_at = case when p_event = 'dismissed' then coalesce(d.dismissed_at, now()) else d.dismissed_at end,
    clicked_at = case when p_event = 'clicked' then coalesce(d.clicked_at, now()) else d.clicked_at end
  where d.announcement_id = p_announcement_id and d.student_id = v_student_id and d.claim_token = p_claim_token;
  return found;
end; $$;

create function public.admin_set_announcement_status(p_announcement_id uuid, p_status text, p_actor text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_before jsonb; v_after public.announcements%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role required'; end if;
  if p_status not in ('published', 'paused', 'archived') then raise exception 'invalid status'; end if;
  if length(trim(coalesce(p_actor, ''))) not between 1 and 120 then raise exception 'invalid actor'; end if;
  select to_jsonb(a) into v_before from public.announcements a where a.id = p_announcement_id for update;
  if v_before is null then raise exception 'announcement not found'; end if;
  if p_status = 'published' and not exists (select 1 from public.announcement_contents c where c.announcement_id = p_announcement_id)
    then raise exception 'announcement content is required'; end if;
  if p_status = 'published' and not (v_before->>'audience_all')::boolean and not exists (
    select 1 from public.announcement_targets t where t.announcement_id = p_announcement_id and not t.is_exclusion
  ) then raise exception 'announcement audience is required'; end if;
  update public.announcements set status = p_status,
    published_at = case when p_status = 'published' then coalesce(published_at, now()) else published_at end,
    paused_at = case when p_status = 'paused' then now() else paused_at end,
    updated_by = p_actor, revision = revision + 1
  where id = p_announcement_id returning * into v_after;
  insert into public.admin_audit_log (action, target_table, target_id, before, after, metadata)
  values ('announcement.' || p_status, 'announcements', p_announcement_id::text, v_before, to_jsonb(v_after), jsonb_build_object('actor', p_actor));
  return to_jsonb(v_after);
end; $$;

revoke all on function public.claim_next_announcement(text, text, text, text, uuid) from public, anon;
grant execute on function public.claim_next_announcement(text, text, text, text, uuid) to authenticated;
revoke all on function public.record_announcement_event(uuid, uuid, text) from public, anon;
grant execute on function public.record_announcement_event(uuid, uuid, text) to authenticated;
revoke all on function public.admin_set_announcement_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_announcement_status(uuid, text, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('announcement-assets', 'announcement-assets', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

commit;
