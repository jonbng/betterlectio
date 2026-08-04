-- Fix feedback-attachments storage RLS.
--
-- Inside the EXISTS subquery that joins public.students s, bare `name` was
-- resolved to students.name (display name), not storage.objects.name (the
-- object path). That made every client upload fail with 400 / RLS denial,
-- while service-role imports (UserJot) still worked.
--
-- Qualify as storage.objects.name so the path checks use the object key:
--   {school_id}/{student_id}/{feedback_id}/{filename}

drop policy if exists "feedback_storage_insert_own" on storage.objects;
create policy "feedback_storage_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'feedback-attachments'
    and (storage.foldername(storage.objects.name))[1] is not null
    and (storage.foldername(storage.objects.name))[2] is not null
    and (storage.foldername(storage.objects.name))[3] is not null
    and exists (
      select 1
      from public.students s
      join public.feedback_items fi
        on fi.student_id = s.id
       and fi.school_id = s.school_id
      where s.supabase_id = auth.uid()
        and s.school_id::text = (storage.foldername(storage.objects.name))[1]
        and s.id = (storage.foldername(storage.objects.name))[2]
        and fi.id::text = (storage.foldername(storage.objects.name))[3]
        and fi.supabase_uid = auth.uid()
    )
  );

drop policy if exists "feedback_storage_select_own" on storage.objects;
create policy "feedback_storage_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'feedback-attachments'
    and exists (
      select 1
      from public.students s
      where s.supabase_id = auth.uid()
        and s.school_id::text = (storage.foldername(storage.objects.name))[1]
        and s.id = (storage.foldername(storage.objects.name))[2]
    )
  );
