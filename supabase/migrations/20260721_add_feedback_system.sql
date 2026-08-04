-- First-party feedback system (replaces UserJot + PostHog feedback sink).
-- Private: only the author (authenticated student) and admin (service role)
-- can read submissions. Clients submit via security-definer RPCs.

-- ── feedback_items ───────────────────────────────────────────────────

create table if not exists public.feedback_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  student_id text not null references public.students(id) on delete cascade,
  school_id int not null references public.schools(id),
  supabase_uid uuid not null,

  category text not null
    check (category in ('bug', 'idea', 'other')),
  status text not null default 'pending'
    check (status in (
      'pending', 'review', 'planned', 'in_progress',
      'completed', 'declined', 'duplicate'
    )),
  title text,
  message text not null,
  platform text not null
    check (platform in ('extension', 'android', 'ios', 'web')),

  -- Client / environment context
  app_version text,
  app_version_code int,
  build_type text,
  os_version text,
  device_model text,
  device_manufacturer text,
  locale text,
  browser_info text,
  lectio_version text,

  -- Analytics bridge (ids only — not the feedback payload)
  posthog_distinct_id text,
  posthog_session_id text,

  -- Diagnostics (optional Android log buffer)
  logs text,
  include_logs boolean not null default false,

  -- Admin fields
  admin_notes text,
  duplicate_of uuid references public.feedback_items(id) on delete set null,
  tags text[] not null default '{}',
  priority int check (priority is null or (priority >= 0 and priority <= 3)),
  last_status_changed_at timestamptz,
  last_status_changed_by text
);

create index if not exists feedback_items_status_created_idx
  on public.feedback_items (status, created_at desc);

create index if not exists feedback_items_student_created_idx
  on public.feedback_items (student_id, created_at desc);

create index if not exists feedback_items_school_created_idx
  on public.feedback_items (school_id, created_at desc);

create index if not exists feedback_items_platform_created_idx
  on public.feedback_items (platform, created_at desc);

create index if not exists feedback_items_supabase_uid_idx
  on public.feedback_items (supabase_uid);

create index if not exists feedback_items_tags_gin_idx
  on public.feedback_items using gin (tags);

drop trigger if exists set_feedback_items_updated_at on public.feedback_items;
create trigger set_feedback_items_updated_at
before update on public.feedback_items
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.feedback_items enable row level security;

-- Authors can read their own items (phase 2 "my feedback"; also harmless for submit-only).
drop policy if exists "feedback_items_select_own" on public.feedback_items;
create policy "feedback_items_select_own"
  on public.feedback_items for select
  to authenticated
  using (supabase_uid = auth.uid());

-- No direct insert/update/delete for authenticated — use RPCs.
-- Service role bypasses RLS for admin.

-- ── feedback_comments (schema ready for phase 2 replies) ─────────────

create table if not exists public.feedback_comments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  feedback_id uuid not null references public.feedback_items(id) on delete cascade,
  author_kind text not null check (author_kind in ('user', 'admin')),
  author_student_id text references public.students(id) on delete set null,
  author_admin text,
  body text not null,
  is_internal boolean not null default false
);

create index if not exists feedback_comments_feedback_created_idx
  on public.feedback_comments (feedback_id, created_at asc);

alter table public.feedback_comments enable row level security;

-- Authors can read non-internal comments on their own feedback.
drop policy if exists "feedback_comments_select_own" on public.feedback_comments;
create policy "feedback_comments_select_own"
  on public.feedback_comments for select
  to authenticated
  using (
    is_internal = false
    and exists (
      select 1
      from public.feedback_items fi
      where fi.id = feedback_comments.feedback_id
        and fi.supabase_uid = auth.uid()
    )
  );

-- ── feedback_attachments ─────────────────────────────────────────────

create table if not exists public.feedback_attachments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  feedback_id uuid not null references public.feedback_items(id) on delete cascade,
  kind text not null check (kind in ('screenshot', 'log', 'other')),
  storage_path text not null,
  mime_type text,
  byte_size int,
  width int,
  height int
);

create index if not exists feedback_attachments_feedback_idx
  on public.feedback_attachments (feedback_id);

alter table public.feedback_attachments enable row level security;

drop policy if exists "feedback_attachments_select_own" on public.feedback_attachments;
create policy "feedback_attachments_select_own"
  on public.feedback_attachments for select
  to authenticated
  using (
    exists (
      select 1
      from public.feedback_items fi
      where fi.id = feedback_attachments.feedback_id
        and fi.supabase_uid = auth.uid()
    )
  );

-- ── feedback_status_events ───────────────────────────────────────────

create table if not exists public.feedback_status_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  feedback_id uuid not null references public.feedback_items(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor text not null,
  note text
);

create index if not exists feedback_status_events_feedback_created_idx
  on public.feedback_status_events (feedback_id, created_at desc);

alter table public.feedback_status_events enable row level security;

-- Authors can read status history on their own items (for later "my feedback" UI).
drop policy if exists "feedback_status_events_select_own" on public.feedback_status_events;
create policy "feedback_status_events_select_own"
  on public.feedback_status_events for select
  to authenticated
  using (
    exists (
      select 1
      from public.feedback_items fi
      where fi.id = feedback_status_events.feedback_id
        and fi.supabase_uid = auth.uid()
    )
  );

-- ── Storage bucket ───────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feedback-attachments',
  'feedback-attachments',
  false,
  2097152, -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp', 'text/plain']::text[]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Path layout: {school_id}/{student_id}/{feedback_id}/{filename}
-- Users may upload only under their own school/student prefix, and only
-- when the feedback_id folder belongs to a feedback item they own.

-- NOTE: always qualify as storage.objects.name inside subqueries that join
-- public.students — bare `name` binds to students.name and breaks uploads.
drop policy if exists "feedback_storage_insert_own" on storage.objects;
create policy "feedback_storage_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'feedback-attachments'
    and (storage.foldername(storage.objects.name))[1] is not null
    and (storage.foldername(storage.objects.name))[2] is not null
    and (storage.foldername(storage.objects.name))[3] is not null
    and exists (
      select 1
      from public.students s
      join public.feedback_items fi
        on fi.student_id = s.id
       and fi.school_id = s.school_id
      where s.supabase_id = auth.uid()
        and s.school_id::text = (storage.foldername(storage.objects.name))[1]
        and s.id = (storage.foldername(storage.objects.name))[2]
        and fi.id::text = (storage.foldername(storage.objects.name))[3]
        and fi.supabase_uid = auth.uid()
    )
  );

drop policy if exists "feedback_storage_select_own" on storage.objects;
create policy "feedback_storage_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'feedback-attachments'
    and exists (
      select 1
      from public.students s
      where s.supabase_id = auth.uid()
        and s.school_id::text = (storage.foldername(storage.objects.name))[1]
        and s.id = (storage.foldername(storage.objects.name))[2]
    )
  );

-- ── submit_feedback RPC ──────────────────────────────────────────────

create or replace function public.submit_feedback(
  p_student_id text,
  p_school_id int,
  p_category text,
  p_message text,
  p_platform text,
  p_context jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_message text;
  v_category text;
  v_platform text;
  v_recent int;
  v_title text;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  if p_student_id is null or length(trim(p_student_id)) = 0 or p_school_id is null then
    raise exception 'Invalid student';
  end if;

  -- Ownership: session must own this student row
  if not exists (
    select 1
    from public.students s
    where s.id = p_student_id
      and s.school_id = p_school_id
      and s.supabase_id = v_uid
  ) then
    raise exception 'Unauthorized';
  end if;

  v_category := lower(trim(p_category));
  if v_category not in ('bug', 'idea', 'other') then
    raise exception 'Invalid category';
  end if;

  v_platform := lower(trim(p_platform));
  if v_platform not in ('extension', 'android', 'ios', 'web') then
    raise exception 'Invalid platform';
  end if;

  v_message := trim(p_message);
  if v_message is null or length(v_message) = 0 then
    raise exception 'Message required';
  end if;
  if length(v_message) > 4000 then
    v_message := left(v_message, 4000);
  end if;

  -- Soft rate limit: max 10 submissions per hour per user
  select count(*)::int into v_recent
    from public.feedback_items fi
   where fi.supabase_uid = v_uid
     and fi.created_at > now() - interval '1 hour';
  if v_recent >= 10 then
    raise exception 'Rate limit exceeded';
  end if;

  v_title := nullif(trim(coalesce(p_context->>'title', '')), '');
  if v_title is not null and length(v_title) > 200 then
    v_title := left(v_title, 200);
  end if;

  insert into public.feedback_items (
    student_id,
    school_id,
    supabase_uid,
    category,
    title,
    message,
    platform,
    app_version,
    app_version_code,
    build_type,
    os_version,
    device_model,
    device_manufacturer,
    locale,
    browser_info,
    lectio_version,
    posthog_distinct_id,
    posthog_session_id,
    logs,
    include_logs,
    last_status_changed_at,
    last_status_changed_by
  ) values (
    p_student_id,
    p_school_id,
    v_uid,
    v_category,
    v_title,
    v_message,
    v_platform,
    nullif(trim(coalesce(p_context->>'app_version', '')), ''),
    case
      when (p_context ? 'app_version_code')
        and (p_context->>'app_version_code') ~ '^-?[0-9]+$'
      then (p_context->>'app_version_code')::int
      else null
    end,
    nullif(trim(coalesce(p_context->>'build_type', '')), ''),
    nullif(trim(coalesce(p_context->>'os_version', '')), ''),
    nullif(trim(coalesce(p_context->>'device_model', '')), ''),
    nullif(trim(coalesce(p_context->>'device_manufacturer', '')), ''),
    nullif(trim(coalesce(p_context->>'locale', '')), ''),
    nullif(trim(coalesce(p_context->>'browser_info', '')), ''),
    nullif(trim(coalesce(p_context->>'lectio_version', '')), ''),
    nullif(trim(coalesce(p_context->>'posthog_distinct_id', '')), ''),
    nullif(trim(coalesce(p_context->>'posthog_session_id', '')), ''),
    case
      when coalesce((p_context->>'include_logs')::boolean, false)
      then left(coalesce(p_context->>'logs', ''), 100000)
      else null
    end,
    coalesce((p_context->>'include_logs')::boolean, false),
    now(),
    'user'
  )
  returning id into v_id;

  insert into public.feedback_status_events (
    feedback_id, from_status, to_status, actor, note
  ) values (
    v_id, null, 'pending', 'user', 'submitted'
  );

  return v_id;
end;
$$;

revoke all on function public.submit_feedback(text, int, text, text, text, jsonb) from public;
grant execute on function public.submit_feedback(text, int, text, text, text, jsonb) to authenticated;

-- ── register_feedback_attachment RPC ─────────────────────────────────

create or replace function public.register_feedback_attachment(
  p_feedback_id uuid,
  p_kind text,
  p_storage_path text,
  p_mime_type text default null,
  p_byte_size int default null,
  p_width int default null,
  p_height int default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_kind text;
  v_path text;
  v_student_id text;
  v_school_id int;
  v_expected_prefix text;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  if p_feedback_id is null then
    raise exception 'Invalid feedback';
  end if;

  select fi.student_id, fi.school_id
    into v_student_id, v_school_id
    from public.feedback_items fi
   where fi.id = p_feedback_id
     and fi.supabase_uid = v_uid;

  if not found then
    raise exception 'Unauthorized';
  end if;

  v_kind := lower(trim(p_kind));
  if v_kind not in ('screenshot', 'log', 'other') then
    raise exception 'Invalid kind';
  end if;

  v_path := trim(p_storage_path);
  if v_path is null or length(v_path) = 0 then
    raise exception 'Invalid path';
  end if;

  -- Path must match {school_id}/{student_id}/{feedback_id}/...
  v_expected_prefix := v_school_id::text || '/' || v_student_id || '/' || p_feedback_id::text || '/';
  if position(v_expected_prefix in v_path) <> 1 then
    raise exception 'Invalid path prefix';
  end if;

  -- Cap attachments per item
  if (
    select count(*)::int
    from public.feedback_attachments fa
    where fa.feedback_id = p_feedback_id
  ) >= 5 then
    raise exception 'Too many attachments';
  end if;

  insert into public.feedback_attachments (
    feedback_id, kind, storage_path, mime_type, byte_size, width, height
  ) values (
    p_feedback_id,
    v_kind,
    v_path,
    nullif(trim(coalesce(p_mime_type, '')), ''),
    p_byte_size,
    p_width,
    p_height
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.register_feedback_attachment(uuid, text, text, text, int, int, int) from public;
grant execute on function public.register_feedback_attachment(uuid, text, text, text, int, int, int) to authenticated;
