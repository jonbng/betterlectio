-- Defensive: explicitly qualify the column reference in the students RLS
-- policy so the intent is unambiguous in source. Postgres stores the
-- expression as bare `school_id = get_my_school_id()` either way (it
-- normalizes single-table policy column references), so this is a no-op
-- at runtime — but the qualified form documents that the reference is
-- scoped to the policy's own table and prevents future copy-paste mistakes
-- from accidentally creating a cross-table ambiguity.

drop policy if exists "Students can read own school" on public.students;
create policy "Students can read own school"
on public.students
for select
to authenticated
using (students.school_id = public.get_my_school_id());
