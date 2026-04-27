-- Track when a student uninstalls the browser extension and why.
-- Mirrors the pattern used for app_qr_scanned_at / app_installed_at: a nullable
-- timestamp captured server-side from the betterlectio.dk redirect, plus
-- optional structured + freeform feedback collected on the uninstall page.
alter table public.students
  add column if not exists extension_uninstalled_at timestamptz null,
  add column if not exists extension_uninstall_reason text null,
  add column if not exists extension_uninstall_feedback text null;
