-- User-visible feedback threads: cross-platform inbox, replies and unread state.
-- The product/roadmap status remains separate from the conversation state.

alter table public.feedback_items
  add column if not exists conversation_state text not null default 'awaiting_staff',
  add column if not exists last_public_activity_at timestamptz not null default now(),
  add column if not exists last_staff_activity_at timestamptz,
  add column if not exists last_user_reply_at timestamptz,
  add column if not exists last_admin_reply_at timestamptz,
  add column if not exists user_last_read_at timestamptz;

alter table public.feedback_items
  alter column last_user_reply_at set default now(),
  alter column user_last_read_at set default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'feedback_items_conversation_state_check'
  ) then
    alter table public.feedback_items
      add constraint feedback_items_conversation_state_check
      check (conversation_state in ('awaiting_staff', 'awaiting_user', 'resolved'));
  end if;
end $$;

update public.feedback_items
set last_public_activity_at = created_at,
    last_user_reply_at = created_at,
    user_last_read_at = created_at
where last_user_reply_at is null;

create index if not exists feedback_items_owner_activity_idx
  on public.feedback_items (supabase_uid, last_public_activity_at desc);

create index if not exists feedback_items_conversation_activity_idx
  on public.feedback_items (conversation_state, last_public_activity_at desc);

create or replace function public.sync_feedback_conversation_from_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    new.last_public_activity_at := now();
    new.last_staff_activity_at := now();
    if new.status in ('completed', 'declined', 'duplicate') then
      new.conversation_state := 'resolved';
    elsif old.status in ('completed', 'declined', 'duplicate')
      and new.conversation_state = 'resolved' then
      new.conversation_state := 'awaiting_staff';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_feedback_conversation_status on public.feedback_items;
create trigger sync_feedback_conversation_status
before update of status on public.feedback_items
for each row execute function public.sync_feedback_conversation_from_status();

alter table public.feedback_comments
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists set_feedback_comments_updated_at on public.feedback_comments;
create trigger set_feedback_comments_updated_at
before update on public.feedback_comments
for each row execute function public.set_current_timestamp_updated_at();

-- Compact inbox payload. Returning jsonb keeps all clients on one stable contract.
create or replace function public.list_my_feedback()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', fi.id,
    'created_at', fi.created_at,
    'updated_at', fi.updated_at,
    'last_public_activity_at', fi.last_public_activity_at,
    'category', fi.category,
    'status', fi.status,
    'conversation_state', fi.conversation_state,
    'title', fi.title,
    'message', fi.message,
    'platform', fi.platform,
    'is_unread', fi.last_staff_activity_at is not null
      and (fi.user_last_read_at is null or fi.last_staff_activity_at > fi.user_last_read_at),
    'last_reply', (
      select fc.body
      from public.feedback_comments fc
      where fc.feedback_id = fi.id and fc.is_internal = false
      order by fc.created_at desc
      limit 1
    )
  ) order by fi.last_public_activity_at desc), '[]'::jsonb)
  from public.feedback_items fi
  where fi.supabase_uid = auth.uid();
$$;

revoke all on function public.list_my_feedback() from public;
grant execute on function public.list_my_feedback() to authenticated;

create or replace function public.get_my_feedback_thread(p_feedback_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Unauthorized'; end if;

  select jsonb_build_object(
    'item', jsonb_build_object(
      'id', fi.id,
      'created_at', fi.created_at,
      'updated_at', fi.updated_at,
      'last_public_activity_at', fi.last_public_activity_at,
      'category', fi.category,
      'status', fi.status,
      'conversation_state', fi.conversation_state,
      'title', fi.title,
      'message', fi.message,
      'platform', fi.platform,
      'duplicate_of', fi.duplicate_of,
      'is_unread', fi.last_staff_activity_at is not null
        and (fi.user_last_read_at is null or fi.last_staff_activity_at > fi.user_last_read_at),
      'last_reply', (
        select fc.body from public.feedback_comments fc
        where fc.feedback_id = fi.id and fc.is_internal = false
        order by fc.created_at desc limit 1
      )
    ),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fc.id,
        'created_at', fc.created_at,
        'updated_at', fc.updated_at,
        'author_kind', fc.author_kind,
        'body', fc.body
      ) order by fc.created_at asc)
      from public.feedback_comments fc
      where fc.feedback_id = fi.id and fc.is_internal = false
    ), '[]'::jsonb),
    'status_events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', se.id,
        'created_at', se.created_at,
        'from_status', se.from_status,
        'to_status', se.to_status,
        'note', se.note
      ) order by se.created_at asc)
      from public.feedback_status_events se
      where se.feedback_id = fi.id
    ), '[]'::jsonb)
  ) into v_result
  from public.feedback_items fi
  where fi.id = p_feedback_id and fi.supabase_uid = v_uid;

  if v_result is null then raise exception 'Not found'; end if;

  update public.feedback_items
  set user_last_read_at = now()
  where id = p_feedback_id and supabase_uid = v_uid;

  return v_result;
end;
$$;

revoke all on function public.get_my_feedback_thread(uuid) from public;
grant execute on function public.get_my_feedback_thread(uuid) to authenticated;

create or replace function public.reply_to_feedback(
  p_feedback_id uuid,
  p_body text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_student_id text;
  v_body text := trim(p_body);
  v_comment_id uuid;
  v_recent int;
begin
  if v_uid is null then raise exception 'Unauthorized'; end if;
  if v_body is null or length(v_body) = 0 then raise exception 'Message required'; end if;
  if length(v_body) > 4000 then raise exception 'Message too long'; end if;

  select fi.student_id into v_student_id
  from public.feedback_items fi
  where fi.id = p_feedback_id and fi.supabase_uid = v_uid
  for update;
  if not found then raise exception 'Not found'; end if;

  select count(*)::int into v_recent
  from public.feedback_comments fc
  where fc.author_kind = 'user'
    and fc.author_student_id = v_student_id
    and fc.created_at > now() - interval '1 hour';
  if v_recent >= 30 then raise exception 'Rate limit exceeded'; end if;

  insert into public.feedback_comments (
    feedback_id, author_kind, author_student_id, body, is_internal
  ) values (
    p_feedback_id, 'user', v_student_id, v_body, false
  ) returning id into v_comment_id;

  update public.feedback_items
  set conversation_state = 'awaiting_staff',
      last_public_activity_at = now(),
      last_user_reply_at = now(),
      user_last_read_at = now()
  where id = p_feedback_id;

  return v_comment_id;
end;
$$;

revoke all on function public.reply_to_feedback(uuid, text) from public;
grant execute on function public.reply_to_feedback(uuid, text) to authenticated;

create or replace function public.mark_feedback_read(p_feedback_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.feedback_items
  set user_last_read_at = now()
  where id = p_feedback_id and supabase_uid = auth.uid();
  if not found then raise exception 'Not found'; end if;
end;
$$;

revoke all on function public.mark_feedback_read(uuid) from public;
grant execute on function public.mark_feedback_read(uuid) to authenticated;

-- Service-role-only helper used by the admin app. It makes the public reply and
-- conversation transition atomic and deliberately does not expose internal notes.
create or replace function public.admin_reply_to_feedback(
  p_feedback_id uuid,
  p_body text,
  p_author_admin text,
  p_resolve boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text := trim(p_body);
  v_comment_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'Unauthorized'; end if;
  if v_body is null or length(v_body) = 0 then raise exception 'Message required'; end if;
  if length(v_body) > 4000 then raise exception 'Message too long'; end if;
  if not exists (select 1 from public.feedback_items where id = p_feedback_id) then
    raise exception 'Not found';
  end if;

  insert into public.feedback_comments (
    feedback_id, author_kind, author_admin, body, is_internal
  ) values (
    p_feedback_id, 'admin', nullif(trim(p_author_admin), ''), v_body, false
  ) returning id into v_comment_id;

  update public.feedback_items
  set conversation_state = case when p_resolve then 'resolved' else 'awaiting_user' end,
      last_public_activity_at = now(),
      last_staff_activity_at = now(),
      last_admin_reply_at = now()
  where id = p_feedback_id;

  return v_comment_id;
end;
$$;

revoke all on function public.admin_reply_to_feedback(uuid, text, text, boolean) from public;
grant execute on function public.admin_reply_to_feedback(uuid, text, text, boolean) to service_role;
