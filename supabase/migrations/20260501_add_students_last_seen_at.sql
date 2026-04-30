alter table public.students
  add column if not exists last_seen_at timestamptz;

create index if not exists students_last_seen_at_idx
  on public.students (last_seen_at desc nulls last);

create or replace function public.touch_student_last_seen(
  p_student_id text,
  p_school_id int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_existing timestamptz;
begin
  if v_auth_uid is null then
    raise exception 'Unauthorized';
  end if;
  if p_student_id is null or length(trim(p_student_id)) = 0 or p_school_id is null then
    return false;
  end if;

  select last_seen_at into v_existing
    from public.students
    where id = p_student_id and school_id = p_school_id and supabase_id = v_auth_uid;

  if not found then
    raise exception 'Unauthorized';
  end if;

  if v_existing is not null and v_existing > now() - interval '12 hours' then
    return false;
  end if;

  update public.students
    set last_seen_at = now()
    where id = p_student_id and school_id = p_school_id and supabase_id = v_auth_uid;

  return true;
end;
$$;

revoke all on function public.touch_student_last_seen(text, int) from public;
grant execute on function public.touch_student_last_seen(text, int) to authenticated;
