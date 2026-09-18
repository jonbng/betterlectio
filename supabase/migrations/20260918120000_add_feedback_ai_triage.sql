-- Asynchronous AI triage for feedback. New submissions are queued in the
-- same transaction, then processed by the feedback-ai-triage Edge Function.

create extension if not exists vector with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

alter table public.feedback_items
  add column if not exists ai_triage_status text not null default 'pending',
  add column if not exists ai_title text,
  add column if not exists ai_summary text,
  add column if not exists ai_severity text,
  add column if not exists ai_severity_reason text,
  add column if not exists ai_relevance text,
  add column if not exists ai_relevance_reason text,
  add column if not exists ai_tags text[] not null default '{}',
  add column if not exists ai_model text,
  add column if not exists ai_processed_at timestamptz,
  add column if not exists ai_error text,
  add column if not exists ai_embedding extensions.vector(768);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'feedback_items_ai_triage_status_check'
  ) then
    alter table public.feedback_items add constraint feedback_items_ai_triage_status_check
      check (ai_triage_status in ('pending', 'processing', 'completed', 'failed'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'feedback_items_ai_severity_check'
  ) then
    alter table public.feedback_items add constraint feedback_items_ai_severity_check
      check (ai_severity is null or ai_severity in ('low', 'medium', 'high', 'critical'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'feedback_items_ai_relevance_check'
  ) then
    alter table public.feedback_items add constraint feedback_items_ai_relevance_check
      check (ai_relevance is null or ai_relevance in ('relevant', 'unclear', 'off_topic', 'nonsense'));
  end if;
end;
$$;

create index if not exists feedback_items_ai_triage_status_idx
  on public.feedback_items (ai_triage_status, created_at desc);
create index if not exists feedback_items_ai_flagged_idx
  on public.feedback_items (ai_relevance, created_at desc)
  where ai_relevance in ('off_topic', 'nonsense');
create index if not exists feedback_items_ai_embedding_hnsw_idx
  on public.feedback_items using hnsw (ai_embedding extensions.vector_cosine_ops)
  where ai_embedding is not null;

create table if not exists public.feedback_ai_jobs (
  feedback_id uuid primary key references public.feedback_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  claim_token uuid,
  attempts int not null default 0,
  last_error text,
  completed_at timestamptz
);

create index if not exists feedback_ai_jobs_due_idx
  on public.feedback_ai_jobs (created_at desc)
  where completed_at is null;

alter table public.feedback_ai_jobs enable row level security;

create table if not exists public.feedback_similarity_suggestions (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.feedback_items(id) on delete cascade,
  similar_feedback_id uuid not null references public.feedback_items(id) on delete cascade,
  score real not null check (score >= 0 and score <= 1),
  rationale text,
  review_state text not null default 'pending'
    check (review_state in ('pending', 'accepted', 'rejected')),
  model text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  unique (feedback_id, similar_feedback_id),
  check (feedback_id <> similar_feedback_id)
);

create index if not exists feedback_similarity_suggestions_feedback_idx
  on public.feedback_similarity_suggestions (feedback_id, review_state, score desc);

alter table public.feedback_similarity_suggestions enable row level security;

create or replace function public.enqueue_feedback_ai()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    insert into public.feedback_ai_jobs (feedback_id, available_at, completed_at, last_error)
    values (new.id, now(), null, null)
    on conflict (feedback_id) do update set
      created_at = now(), available_at = now(), completed_at = null, claimed_at = null,
      claim_token = null, attempts = 0, last_error = null;
  end if;

  new.ai_triage_status := 'pending';
  new.ai_error := null;
  return new;
end;
$$;

create or replace function public.enqueue_new_feedback_ai()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.feedback_ai_jobs (feedback_id)
  values (new.id)
  on conflict (feedback_id) do nothing;
  return null;
end;
$$;

drop trigger if exists queue_feedback_ai_on_insert on public.feedback_items;
create trigger queue_feedback_ai_on_insert
after insert on public.feedback_items
for each row execute function public.enqueue_new_feedback_ai();

-- Re-triage when the substance of a ticket changes, but never for an AI's own
-- title/priority write because those columns are deliberately not watched.
drop trigger if exists queue_feedback_ai_on_content_change on public.feedback_items;
create trigger queue_feedback_ai_on_content_change
before update of message, category, platform, app_version, os_version, device_model, browser_info
on public.feedback_items
for each row
when (
  old.message is distinct from new.message
  or old.category is distinct from new.category
  or old.platform is distinct from new.platform
  or old.app_version is distinct from new.app_version
  or old.os_version is distinct from new.os_version
  or old.device_model is distinct from new.device_model
  or old.browser_info is distinct from new.browser_info
)
execute function public.enqueue_feedback_ai();

create or replace function public.claim_feedback_ai_jobs(p_batch_size int default 10)
returns table (feedback_id uuid, claim_token uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required';
  end if;

  return query
  with due as (
    select j.feedback_id
    from public.feedback_ai_jobs j
    where j.completed_at is null
      and j.available_at <= now()
      and (j.claimed_at is null or j.claimed_at < now() - interval '5 minutes')
      and j.attempts < 6
    order by j.created_at desc
    for update skip locked
    limit greatest(1, least(coalesce(p_batch_size, 10), 25))
  ), claimed as (
    update public.feedback_ai_jobs j
    set claimed_at = now(), claim_token = gen_random_uuid(), attempts = attempts + 1
    from due
    where j.feedback_id = due.feedback_id
    returning j.feedback_id, j.claim_token
  )
  update public.feedback_items fi
  set ai_triage_status = 'processing', ai_error = null
  from claimed c
  where fi.id = c.feedback_id
  returning c.feedback_id, c.claim_token;
end;
$$;

create or replace function public.complete_feedback_ai_job(
  p_feedback_id uuid,
  p_claim_token uuid,
  p_title text,
  p_summary text,
  p_severity text,
  p_severity_reason text,
  p_relevance text,
  p_relevance_reason text,
  p_tags text[],
  p_model text,
  p_embedding text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_priority int;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role required'; end if;
  if not exists (
    select 1 from public.feedback_ai_jobs
    where feedback_id = p_feedback_id and claim_token = p_claim_token and completed_at is null
  ) then return false; end if;

  v_priority := case p_severity
    when 'critical' then 3 when 'high' then 2 when 'medium' then 1 else 0 end;

  update public.feedback_items set
    ai_triage_status = 'completed',
    ai_title = nullif(left(trim(p_title), 120), ''),
    ai_summary = nullif(left(trim(p_summary), 1000), ''),
    ai_severity = p_severity,
    ai_severity_reason = nullif(left(trim(p_severity_reason), 1000), ''),
    ai_relevance = p_relevance,
    ai_relevance_reason = nullif(left(trim(p_relevance_reason), 1000), ''),
    ai_tags = coalesce(p_tags[1:8], '{}'),
    ai_model = p_model,
    ai_embedding = case when nullif(p_embedding, '') is null then null else p_embedding::extensions.vector end,
    ai_processed_at = now(),
    ai_error = null,
    title = case when nullif(trim(title), '') is null then nullif(left(trim(p_title), 120), '') else title end,
    priority = coalesce(priority, v_priority)
  where id = p_feedback_id;

  update public.feedback_ai_jobs set completed_at = now(), claimed_at = null, claim_token = null, last_error = null
  where feedback_id = p_feedback_id and claim_token = p_claim_token;
  return found;
end;
$$;

create or replace function public.fail_feedback_ai_job(
  p_feedback_id uuid, p_claim_token uuid, p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_attempts int;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role required'; end if;
  update public.feedback_ai_jobs set
    claimed_at = null,
    claim_token = null,
    last_error = left(coalesce(p_error, 'unknown_error'), 1000),
    available_at = now() + make_interval(secs => least(3600, (30 * power(2, greatest(attempts - 1, 0)))::int))
  where feedback_id = p_feedback_id and claim_token = p_claim_token and completed_at is null
  returning attempts into v_attempts;
  if not found then return false; end if;
  update public.feedback_items set
    ai_triage_status = case when v_attempts >= 6 then 'failed' else 'pending' end,
    ai_error = left(coalesce(p_error, 'unknown_error'), 1000)
  where id = p_feedback_id;
  return true;
end;
$$;

create or replace function public.match_feedback_items(
  p_feedback_id uuid, p_embedding text, p_limit int default 8, p_min_similarity real default 0.62
)
returns table (id uuid, title text, message text, status text, similarity real)
language sql
security definer
set search_path = ''
stable
as $$
  select fi.id, fi.title, fi.message, fi.status,
    (1 - (fi.ai_embedding OPERATOR(extensions.<=>) p_embedding::extensions.vector))::real as similarity
  from public.feedback_items fi
  where auth.role() = 'service_role'
    and fi.id <> p_feedback_id
    and fi.ai_embedding is not null
    and 1 - (fi.ai_embedding OPERATOR(extensions.<=>) p_embedding::extensions.vector) >= p_min_similarity
  order by fi.ai_embedding OPERATOR(extensions.<=>) p_embedding::extensions.vector
  limit greatest(1, least(coalesce(p_limit, 8), 20));
$$;

create or replace function public.retry_feedback_ai(p_feedback_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service_role required'; end if;
  insert into public.feedback_ai_jobs (feedback_id)
  values (p_feedback_id)
  on conflict (feedback_id) do update set
    created_at = now(), available_at = now(), completed_at = null, claimed_at = null, claim_token = null,
    attempts = 0, last_error = null;
  update public.feedback_items set ai_triage_status = 'pending', ai_error = null
  where id = p_feedback_id;
end;
$$;

revoke all on function public.claim_feedback_ai_jobs(int) from public, anon, authenticated;
revoke all on function public.complete_feedback_ai_job(uuid, uuid, text, text, text, text, text, text, text[], text, text) from public, anon, authenticated;
revoke all on function public.fail_feedback_ai_job(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.match_feedback_items(uuid, text, int, real) from public, anon, authenticated;
revoke all on function public.retry_feedback_ai(uuid) from public, anon, authenticated;
grant execute on function public.claim_feedback_ai_jobs(int) to service_role;
grant execute on function public.complete_feedback_ai_job(uuid, uuid, text, text, text, text, text, text, text[], text, text) to service_role;
grant execute on function public.fail_feedback_ai_job(uuid, uuid, text) to service_role;
grant execute on function public.match_feedback_items(uuid, text, int, real) to service_role;
grant execute on function public.retry_feedback_ai(uuid) to service_role;

-- Backfill existing tickets. Newer tickets are processed first.
insert into public.feedback_ai_jobs (feedback_id, created_at)
select id, created_at from public.feedback_items
where ai_processed_at is null
on conflict (feedback_id) do nothing;

-- Prefer dedicated Vault secrets. Existing keepalive scheduler secrets are a
-- safe project-local fallback so established deployments start automatically.
create or replace function public.schedule_feedback_ai_triage()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id bigint;
  v_url_secret_name text;
  v_auth_secret_name text;
begin
  v_url_secret_name := case
    when exists (select 1 from vault.decrypted_secrets where name = 'feedback_ai_project_url') then 'feedback_ai_project_url'
    else 'lectio_keepalive_project_url' end;
  v_auth_secret_name := case
    when exists (select 1 from vault.decrypted_secrets where name = 'feedback_ai_cron_secret') then 'feedback_ai_cron_secret'
    else 'lectio_keepalive_cron_secret' end;
  if not exists (select 1 from vault.decrypted_secrets where name = v_url_secret_name)
    or not exists (select 1 from vault.decrypted_secrets where name = v_auth_secret_name) then
    raise exception 'Missing feedback_ai_project_url or feedback_ai_cron_secret in Vault';
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'feedback-ai-triage';
  select cron.schedule(
    'feedback-ai-triage', '* * * * *',
    $cron$select net.http_post(
      url := rtrim((select decrypted_secret from vault.decrypted_secrets where name in ('feedback_ai_project_url', 'lectio_keepalive_project_url') order by (name = 'feedback_ai_project_url') desc, created_at desc limit 1), '/') || '/functions/v1/feedback-ai-triage',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name in ('feedback_ai_cron_secret', 'lectio_keepalive_cron_secret') order by (name = 'feedback_ai_cron_secret') desc, created_at desc limit 1)),
      body := '{"source":"supabase-cron"}'::jsonb,
      timeout_milliseconds := 120000
    );$cron$
  ) into v_job_id;
  return v_job_id;
end;
$$;

revoke all on function public.schedule_feedback_ai_triage() from public, anon, authenticated;
grant execute on function public.schedule_feedback_ai_triage() to service_role;

do $$
begin
  if (
    exists (select 1 from vault.decrypted_secrets where name = 'feedback_ai_project_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'feedback_ai_cron_secret')
  ) or (
    exists (select 1 from vault.decrypted_secrets where name = 'lectio_keepalive_project_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'lectio_keepalive_cron_secret')
  ) then
    perform public.schedule_feedback_ai_triage();
  else
    raise notice 'Feedback AI cron not scheduled: add both Vault secrets, then call public.schedule_feedback_ai_triage()';
  end if;
end;
$$;
