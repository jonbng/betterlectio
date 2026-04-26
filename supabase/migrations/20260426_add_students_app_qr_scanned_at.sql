-- Track when a student first scans the iOS app QR code on the invite popup /
-- drawer. Set by the public /download/ios redirect handler when the URL
-- carries `?u={studentId}`. Used to permanently hide the popup + drawer
-- once we have any signal of intent to install.
alter table public.students
  add column if not exists app_qr_scanned_at timestamptz null;
