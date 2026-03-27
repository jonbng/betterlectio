-- Add class_name column to students for per-class adoption counting
alter table public.students add column if not exists class_name text;

-- Index for efficient school+class adoption queries
create index if not exists idx_students_school_class on public.students (school_id, class_name);
