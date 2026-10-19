-- Additive presentation options for richer announcement cards.

begin;

alter table public.announcements
  add column design text not null default 'standard'
    check (design in ('standard', 'editorial', 'compact', 'professional')),
  add column theme text not null default 'brand'
    check (theme in ('brand', 'blue', 'violet', 'amber', 'neutral'));

alter table public.announcement_contents
  add column author_name text
    check (author_name is null or length(trim(author_name)) between 1 and 80),
  add column author_role text
    check (author_role is null or length(trim(author_role)) between 1 and 120),
  add column author_avatar_url text
    check (
      author_avatar_url is null
      or (
        length(author_avatar_url) <= 2048
        and author_avatar_url ~ '^https://'
      )
    );

create or replace function public.claim_next_announcement(p_browser text, p_extension_version text, p_locale text, p_page text, p_context_id uuid)
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
      'presentation', v_announcement.presentation, 'design', v_announcement.design, 'theme', v_announcement.theme,
      'eyebrow', v_content.eyebrow, 'title', v_content.title, 'body', v_content.body,
      'coverUrl', v_announcement.cover_url, 'coverAlt', v_content.cover_alt,
      'authorName', v_content.author_name, 'authorRole', v_content.author_role, 'authorAvatarUrl', v_content.author_avatar_url,
      'ctaKind', v_announcement.cta_kind, 'ctaTarget', v_announcement.cta_target, 'ctaLabel', v_content.cta_label,
      'avoidQuietHours', v_announcement.avoid_quiet_hours, 'avoidClassTime', v_announcement.avoid_class_time
    ); end if;
  end loop;
  return null;
end; $$;

revoke all on function public.claim_next_announcement(text, text, text, text, uuid) from public, anon;
grant execute on function public.claim_next_announcement(text, text, text, text, uuid) to authenticated;

commit;
