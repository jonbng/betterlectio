-- Retire the unused generic row-change audit log. It was receiving tens of
-- thousands of rows per week from schedule syncs, but no application reads it.
-- This intentionally does not touch admin_audit_log or notification triggers.

begin;

-- Prefer a failed migration over waiting indefinitely for active sync traffic.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Fail closed if the table has started serving a purpose we did not audit.
do $$
declare
  v_unexpected_tables text;
begin
  if to_regclass('public.updates') is null then
    raise notice 'public.updates is already absent; continuing with trigger cleanup';
    return;
  end if;

  select string_agg(distinct coalesce(table_name, '<null>'), ', ' order by coalesce(table_name, '<null>'))
    into v_unexpected_tables
    from public.updates
   where table_name is null
      or table_name not in ('lessons', 'homework_entries');

  if v_unexpected_tables is not null then
    raise exception
      'Refusing to remove public.updates: unexpected source table(s): %',
      v_unexpected_tables;
  end if;
end;
$$;

-- Discover the audit machinery from the trigger catalog and function bodies.
-- Do not rely on names: the original trigger/function names are not represented
-- in this repository's migrations.
create temporary table updates_audit_triggers on commit drop as
select
  t.oid as trigger_oid,
  t.tgname as trigger_name,
  c.oid as source_table_oid,
  table_ns.nspname as source_schema,
  c.relname as source_table,
  p.oid as function_oid,
  function_ns.nspname as function_schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as function_arguments
from pg_trigger t
join pg_class c
  on c.oid = t.tgrelid
join pg_namespace table_ns
  on table_ns.oid = c.relnamespace
join pg_proc p
  on p.oid = t.tgfoid
join pg_namespace function_ns
  on function_ns.oid = p.pronamespace
where not t.tgisinternal
  and pg_get_functiondef(p.oid) ~*
      'insert[[:space:]]+into[[:space:]]+(("public"|public)[[:space:]]*[.][[:space:]]*)?("updates"|updates)([[:space:](]|$)';

do $$
declare
  v_unexpected_triggers text;
begin
  select string_agg(
           format('%I.%I (%I)', source_schema, source_table, trigger_name),
           ', '
           order by source_schema, source_table, trigger_name
         )
    into v_unexpected_triggers
    from updates_audit_triggers
   where source_schema <> 'public'
      or source_table not in ('lessons', 'homework_entries');

  if v_unexpected_triggers is not null then
    raise exception
      'Refusing to remove updates audit triggers attached to unexpected tables: %',
      v_unexpected_triggers;
  end if;

  -- This trigger writes notification_outbox, not updates. Guard its name too,
  -- so a future combined trigger can never be removed by this migration.
  if exists (
    select 1
      from updates_audit_triggers
     where source_schema = 'public'
       and source_table = 'lessons'
       and trigger_name = 'lessons_enqueue_change_notifications'
  ) then
    raise exception
      'Refusing to remove the lessons_enqueue_change_notifications trigger';
  end if;
end;
$$;

create temporary table updates_audit_functions on commit drop as
select distinct
  function_oid,
  function_schema,
  function_name,
  function_arguments
from updates_audit_triggers;

do $$
declare
  r record;
begin
  for r in
    select *
      from updates_audit_triggers
     order by source_schema, source_table, trigger_name
  loop
    execute format(
      'drop trigger %I on %I.%I',
      r.trigger_name,
      r.source_schema,
      r.source_table
    );
  end loop;
end;
$$;

-- Remove only now-unreferenced audit functions. Any remaining trigger or other
-- dependent object is unexpected, so abort and roll the whole migration back.
do $$
declare
  r record;
  v_dependents text;
begin
  for r in
    select *
      from updates_audit_functions
     order by function_schema, function_name, function_arguments
  loop
    select string_agg(description, ', ' order by description)
      into v_dependents
      from (
        select format('trigger %I on %I.%I', t.tgname, n.nspname, c.relname) as description
          from pg_trigger t
          join pg_class c on c.oid = t.tgrelid
          join pg_namespace n on n.oid = c.relnamespace
         where t.tgfoid = r.function_oid
        union all
        select pg_describe_object(d.classid, d.objid, d.objsubid)
          from pg_depend d
         where d.refclassid = 'pg_proc'::regclass
           and d.refobjid = r.function_oid
           and d.deptype in ('n', 'a')
      ) dependents;

    if v_dependents is not null then
      raise exception
        'Refusing to remove audit function %.%(%); remaining dependents: %',
        r.function_schema,
        r.function_name,
        r.function_arguments,
        v_dependents;
    end if;

    execute format(
      'drop function %I.%I(%s) restrict',
      r.function_schema,
      r.function_name,
      r.function_arguments
    );
  end loop;
end;
$$;

-- RESTRICT is deliberate: a new view, foreign key, or other dependency must
-- stop this migration instead of being silently destroyed.
drop table if exists public.updates restrict;

commit;
