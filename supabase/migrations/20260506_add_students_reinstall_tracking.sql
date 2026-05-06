-- Track when a student reinstalls the extension after a prior uninstall.
-- Stamped server-side by `verify-lectio-auth` the first time it sees an
-- existing student row whose `extension_uninstalled_at` is set. Lets the
-- admin dashboard distinguish "still gone" from "came back".
alter table public.students
  add column if not exists extension_reinstalled_at timestamptz null;
