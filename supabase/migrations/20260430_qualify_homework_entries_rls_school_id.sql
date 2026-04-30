-- Defensive: same as the students policy — qualify the bare `school_id IS
-- NOT NULL` reference in the source. Postgres normalizes single-table
-- references in RLS policy expressions back to bare form when stored, so
-- this is a no-op at runtime but documents the intended scope.

drop policy if exists "homework_entries_select_same_school" on public.homework_entries;
create policy "homework_entries_select_same_school"
on public.homework_entries
for select
to authenticated
using (
  homework_entries.school_id is not null
  and exists (
    select 1
    from public.students s
    where s.supabase_id = auth.uid()
      and s.school_id = homework_entries.school_id
  )
);
