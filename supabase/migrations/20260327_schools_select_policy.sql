-- Allow all authenticated users to read the schools table.
-- School names are public data shared across all users.
drop policy if exists "schools_select_authenticated" on public.schools;
create policy "schools_select_authenticated"
on public.schools
for select
to authenticated
using (true);

-- Populate display_name for Sorø Akademis Skole to remove the hardcoded special case
update public.schools
set display_name = 'Sorø Akademi'
where id = 94;
