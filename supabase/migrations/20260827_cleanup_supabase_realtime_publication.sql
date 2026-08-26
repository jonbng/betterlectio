-- Keep Supabase Realtime scoped to the only remaining consumer: the
-- short-lived QR-dialog subscription to public.students.
--
-- Do not create the publication here. Hosted/local Supabase owns its setup,
-- and an installation without it should remain a no-op.

do $$
declare
  v_table_name text;
  v_all_tables boolean;
begin
  select puballtables
    into v_all_tables
    from pg_publication
   where pubname = 'supabase_realtime';

  if not found then
    return;
  end if;

  if v_all_tables then
    raise exception using
      message = 'Refusing to modify supabase_realtime because it is configured FOR ALL TABLES',
      detail = 'This cleanup only manages explicit members of a selective publication.',
      hint = 'Convert the publication to an explicit table list before applying this migration.';
  end if;

  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'students'
  ) then
    alter publication supabase_realtime add table public.students;
  end if;

  foreach v_table_name in array array[
    'student_homework',
    'homework_entries',
    'user_settings',
    'user_school_themes'
  ] loop
    if exists (
      select 1
        from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = v_table_name
    ) then
      execute format(
        'alter publication supabase_realtime drop table public.%I',
        v_table_name
      );
    end if;
  end loop;
end;
$$;
