-- Re-assert client RPC grants after production telemetry showed function-level
-- permission failures despite these grants existing in older migration files.
revoke all on function public.get_student_lesson_mappings_v2(integer, text)
  from public, anon;
grant execute on function public.get_student_lesson_mappings_v2(integer, text)
  to authenticated, service_role;

revoke all on function public.upsert_user_lesson_override_v2(
  integer, text, text, text, smallint, text, smallint, text, timestamptz, text
) from public, anon;
grant execute on function public.upsert_user_lesson_override_v2(
  integer, text, text, text, smallint, text, smallint, text, timestamptz, text
) to authenticated, service_role;

revoke all on function public.touch_student_last_seen(text, integer)
  from public, anon;
grant execute on function public.touch_student_last_seen(text, integer)
  to authenticated, service_role;
