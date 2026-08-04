-- Support one-shot imports (UserJot → first-party feedback).
-- Dedupes on (import_source, import_external_id) so re-runs are safe.

alter table public.feedback_items
  add column if not exists import_source text,
  add column if not exists import_external_id text,
  add column if not exists import_url text;

comment on column public.feedback_items.import_source is
  'Origin system for migrated rows, e.g. userjot. Null for native submissions.';
comment on column public.feedback_items.import_external_id is
  'Stable id/slug from the origin system used for idempotent re-import.';
comment on column public.feedback_items.import_url is
  'Original public URL of the imported post, if any.';

-- Partial unique index: only imported rows are constrained.
create unique index if not exists feedback_items_import_dedupe_idx
  on public.feedback_items (import_source, import_external_id)
  where import_source is not null and import_external_id is not null;

-- UserJot screenshots are often larger than the 2 MB client upload cap.
-- Raise bucket limit so the service-role importer can land historical images.
update storage.buckets
set file_size_limit = 10485760 -- 10 MB
where id = 'feedback-attachments';
