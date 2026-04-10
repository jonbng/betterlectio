-- Allow anon + authenticated to read the schools table.
--
-- School names (id, name, display_name) are public data — they're visible on
-- Lectio's public school search, baked into every extension install, and
-- already appear in the Lectio page meta tag that the extension falls back to.
-- The previous `to authenticated` restriction created an auth-race on first
-- page load: the sidebar's `schools` query fired before `ensureSupabaseSession`
-- completed, RLS silently returned an empty result, and the client cached that
-- empty result for the table's 2h TTL — leaving the sidebar stuck on the
-- Lectio meta-tag fallback until the cache expired.
drop policy if exists "schools_select_authenticated" on public.schools;
drop policy if exists "schools_select_all" on public.schools;
create policy "schools_select_all"
on public.schools
for select
to authenticated, anon
using (true);
