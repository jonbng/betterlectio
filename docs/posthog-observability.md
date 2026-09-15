# PostHog observability contract

This is the low-volume, cross-platform contract for the extension, iOS, and Android.
PostHog distinct IDs are always `lectio:<studentId>` so one student is one person across
products. Admin builds, demo users, and signed-out visitors are excluded.

Every authenticated restore and completed login identifies that canonical person. Person
properties use the same keys on every platform: `student_id`, `school_id`, `school_name`,
`class_name`, `$name`/`name`, `last_platform`, and version/build metadata. Durable membership
flags (`uses_extension`, `uses_ios`, `uses_android`) are only ever set to `true`, so
`last_platform` can change without losing the person's cross-platform history. Use the event
property `platform` for platform breakdowns; the person-level `platform` is compatibility-only.
Repeated identifies are fingerprint-deduplicated and logout clears the fingerprint before the
SDK identity is reset.

## Events

| Event | Volume policy | Purpose |
| --- | --- | --- |
| `app_active` | Once per 30-minute inactivity-defined session | Active users, platform mix, retention, uses/day |
| `app_load_completed` | Once per native process or extension session | Startup latency and startup availability |
| `load_completed` | All failures; successes for a stable 10% device cohort | Screen/API latency and failure rate without a firehose |
| `$exception` | Actionable failures, signature-deduplicated and capped | Error tracking and release regressions |
| `auth_login_started`, `auth_login_completed`, `auth_login_failed`, `auth_session_lost`, `auth_logged_out` | Outcome events only | Client auth funnel and lost-session symptoms |
| `auth_supabase_completed`, `auth_supabase_failed` | Extension auth outcomes only | Client correlation for the Supabase account-link step |
| `referral_shared` | Explicit share action only | Cross-platform referral sharing without click/view noise |

Every health event has `platform` and version/build properties. `load_completed` has
`operation`, `outcome`, `duration_ms`, and `health_sample`. For unbiased latency and failure
rates, filter `health_sample = true`; failures outside the cohort remain available for incident
detection. Supabase `auth_attempts` remains the authoritative auth-health source because it can
observe failures before PostHog identity exists.

## Dashboard

Create one “Product health” dashboard with these insights:

1. Unique users on `app_active`, daily and 7/30-day rolling, broken down by `platform`.
2. Uses per active user: total `app_active` / unique `app_active`, daily, split by platform.
3. Retention: first-time `app_active` returning to `app_active`, weekly cohorts, split by platform.
4. Platform/version adoption: unique `app_active` users by `platform` and app/extension version.
5. Startup p50/p95: `app_load_completed.duration_ms`, split by platform/version.
6. Screen load p50/p95: `load_completed.duration_ms`, filtered to `health_sample = true` and
   `outcome = success`, split by `operation` and platform.
7. Screen failure rate: `load_completed`, filtered to `health_sample = true`, formula
   `failure / all`, split by operation/platform/version.
8. Exceptions: unique users and total `$exception`, split by platform/version/source.
9. Auth symptoms: `auth_login_failed` and `auth_session_lost` per unique `app_active` user. Pair
   this with the admin Auth health view for the server-side success/degraded/failure truth.

## Alerts

Start with alerts evaluated per platform and notify the team channel:

- Any `app_active` platform drops more than 40% versus the same weekday baseline.
- Startup p95 exceeds 5 seconds for 15 minutes.
- Sampled load failure rate exceeds 5% with at least 20 cohort events in one hour.
- `$exception` affects at least 5 distinct users in 30 minutes, or a new issue affects 3.
- `auth_session_lost` exceeds 3% of active users in one hour.
- Server auth success falls below 90% with at least 20 attempts (configure from Auth health,
  not a client-only PostHog event).

The canonical snake_case auth/referral names above replaced their legacy names in September
2026. Do not combine old and new names in new dashboards unless the selected date range crosses
that deployment boundary.

Revisit thresholds after two normal school weeks. Alert on rates plus minimum sample sizes so
quiet nights, weekends, and holidays do not page the team.
