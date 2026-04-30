alter table public.schools
  add column if not exists student_count int,
  add column if not exists student_count_updated_at timestamptz;

create or replace function public.update_school_student_count(
  p_school_id int,
  p_count int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_count int;
  v_existing_updated_at timestamptz;
begin
  if p_count is null or p_count < 1 or p_count > 50000 then
    return false;
  end if;

  select student_count, student_count_updated_at
    into v_existing_count, v_existing_updated_at
    from public.schools
    where id = p_school_id;

  if not found then
    return false;
  end if;

  if v_existing_count is not null
     and v_existing_updated_at is not null
     and v_existing_updated_at > now() - interval '14 days'
     and abs(v_existing_count - p_count) <= 20 then
    return false;
  end if;

  update public.schools
    set student_count = p_count,
        student_count_updated_at = now()
    where id = p_school_id;

  return true;
end;
$$;

revoke all on function public.update_school_student_count(int, int) from public;
grant execute on function public.update_school_student_count(int, int) to authenticated;
