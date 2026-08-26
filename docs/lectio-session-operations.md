# Consented Lectio session operations

This system is only for people who have explicitly allowed BetterLectio to use
their authenticated Lectio session. Never add a grant based on a client request,
and never put student IDs, cookie values, service-role keys, or encryption keys in
source control, logs, issue trackers, or chat.

## Deployment order

1. Reconcile Supabase migration history before pushing if local and remote history differ.
2. Apply `20260826233000_add_consent_gated_lectio_sessions.sql`.
3. Generate two independent random secrets and keep them in a password manager:
   - a 32-byte base64 master key;
   - a high-entropy cron bearer secret.
4. Set Edge Function secrets:
   - `LECTIO_SESSION_MASTER_KEY_V1`
   - `LECTIO_SESSION_MASTER_KEY_VERSION=1`
   - `LECTIO_KEEPALIVE_CRON_SECRET`
   - optionally `LECTIO_SESSION_CAPTURE_ENABLED=false` or
     `LECTIO_SESSION_KEEPALIVE_ENABLED=false` as kill switches.
5. Deploy `lectio-auth` and `lectio-session-keepalive`.
6. Apply `20260826233100_schedule_lectio_session_keepalive.sql`.
7. Store `lectio_keepalive_project_url` and the same cron secret in Supabase Vault,
   then run `select public.schedule_lectio_session_keepalive();` in the SQL editor.

The scheduled command reads both values from Vault at run time; decrypted secrets
are not copied into `cron.job`.

## Grant and enrollment

After independently recording consent, insert the allowlist row from a protected
admin session. Do not add real identifiers to a migration:

```sql
insert into public.lectio_session_grants (student_id, school_id, consent_note)
values ('<student-id>', <school-id>, '<where and when consent was recorded>')
on conflict (student_id, school_id) do update
set enabled = true, revoked_at = null, consented_at = now(),
    consent_note = excluded.consent_note;
```

The donor must log in once through the unified `lectio-auth` flow after the grant
exists. The server resolves the student ID from authenticated Lectio HTML; it does
not trust a client-supplied donor ID. Capture failure never blocks normal login.

Confirm enrollment without selecting encrypted fields:

```sql
select g.student_id, g.school_id, g.enabled, c.captured_at,
       c.last_success_at, c.next_keepalive_at, c.consecutive_failures,
       c.disabled_at, c.last_error_code
from public.lectio_session_grants g
left join public.lectio_session_credentials c on c.grant_id = g.id
where g.student_id = '<student-id>' and g.school_id = <school-id>;
```

## Revocation

Revocation deletes the encrypted credential immediately through a database trigger:

```sql
update public.lectio_session_grants
set enabled = false, revoked_at = now()
where student_id = '<student-id>' and school_id = <school-id>;
```

Delete the grant itself if the consent record does not need to be retained. Its
credential and metadata-only access audit cascade-delete.

## Keepalive and recovery

Supabase Cron invokes the Edge Function every 30 minutes. Workers atomically lease
due rows, GET Lectio `/ping.aspx`, follow only HTTPS redirects on `www.lectio.dk`,
persist every rotated cookie, and schedule the next ping. Transient errors back off;
five consecutive failures disable the credential. Login redirects, decryption
failures, and revoked grants stop processing immediately. A fresh unified login by
an enabled donor replaces the jar and clears its failure state.

Inspect health:

```sql
select jobid, jobname, schedule, active from cron.job
where jobname = 'lectio-session-keepalive';

select status, count(*) from net._http_response
where created > now() - interval '24 hours'
group by status order by status;
```

For a manual invocation, send a POST to the deployed function with
`Authorization: Bearer $LECTIO_KEEPALIVE_CRON_SECRET`. Never paste the secret into
shell history. The response reports counts only and never returns identifiers or
cookies.

## Key rotation and CLI access

Add the next `LECTIO_SESSION_MASTER_KEY_V<N>` secret, set
`LECTIO_SESSION_MASTER_KEY_VERSION=N`, and redeploy. Existing rows retain their key
version and are re-encrypted under the current version on their next successful
keepalive. Keep older keys available until no rows reference them.

Local import requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the matching
versioned master key in environment variables:

```bash
bun run lectio session import --student <student-id> --school <school-id>
```

The service-role key has broad project access. Use it only on a trusted developer
machine, keep it out of shell history and repo files, and rotate it after suspected
exposure. Imported cookies are written to `~/.lectio-cli/cookies.json` with mode
`0600`; output includes only a cookie count.
