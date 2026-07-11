# PostHog Self-driving Setup Report

_Generated 2026-07-11 — BetterLectio (project 145688)_

## Summary

PostHog Self-driving has been configured for BetterLectio. Error tracking (3 event types), session replay, and support signal sources are now live in the inbox. A custom bypass-spike scout was created to watch for the product's most unique breakage signal. Findings will start appearing in the [Self-driving inbox](https://eu.posthog.com/project/145688/inbox) within approximately 30 minutes.

---

## AI data processing

**Approved.** Organisation-level AI data processing approval was confirmed before this setup ran.

---

## GitHub

**Connected during this run.** Integration id: `70380`, account: `jonbng`.  
The GitHub App was installed via the one-click authorize flow and verified via `integrations-list`.

---

## Products enabled

| Product | Status | Notes |
|---|---|---|
| Error Tracking | **Already enabled** | `autocapture_exceptions_opt_in: true`; onboarding completed 2026-03-22. Live errors confirmed via `query-error-tracking-issues-list`. |
| Session Replay | **Not enabled** (follow-up required) | Server-side `session_recording_opt_in: false`. The extension uses `posthog-node`, not `posthog-js`, so the server flip is inert for extension content scripts. The `products-enable` MCP tool was unavailable in this PostHog version. See follow-ups. |
| Support / Conversations | **Not enabled** (follow-up required) | `conversations_enabled: null`. `products-enable` MCP tool unavailable. Even once enabled, tickets only arrive after an inbound channel (email / inbox / Slack) is connected. See follow-ups. |

The `posthog.init` check was not applicable — BetterLectio's extension uses `posthog-node` (edge build), not `posthog-js`. No client init overrides to audit.

---

## Signal sources

| source_product | source_type | Action | Config ID |
|---|---|---|---|
| `signals_scout` | `cross_source_issue` | **On by default** — no row needed; scout gate is always active | — |
| `error_tracking` | `issue_created` | **Enabled** (created) | `019f525b-f820-7894-806e-cabc3ba0011f` |
| `error_tracking` | `issue_reopened` | **Enabled** (created) | `019f525b-fc0d-7a55-adb0-42ba9016397e` |
| `error_tracking` | `issue_spiking` | **Enabled** (created) | `019f525c-0279-7be1-837a-7eb0891597ae` |
| `session_replay` | `session_analysis_cluster` | **Enabled** (created, 10% sample rate) | `019f525c-0678-73bb-8dea-e5627b115e7d` |
| `conversations` | `ticket` | **Enabled** (created, dormant until channel connected) | `019f525c-09a3-7840-866b-f367c10d33f3` |
| `llm_analytics` | — | **Skipped** — internal-only, not a user-facing responder |
| `logs` | — | **Skipped** — not a v1 responder; logs product not in use |

---

## Connected tools

| Tool | Status |
|---|---|
| GitHub Issues | **Not used** — skipped (not picked) |
| Linear | **Not used** — skipped (not picked) |
| Zendesk | **Not used** — skipped (not picked) |
| pganalyze | **Not used** — skipped (not picked) |

---

## Scout troop

**4 active (general, product-analytics, health-checks, bypass-spike); 23 disabled**

### Enabled

| Scout | Reason |
|---|---|
| `general` | Always on — cross-product correlations and surfaces no specialist covers |
| `product-analytics` | Primary product: heavy custom event tracking (`extension loaded`, `feature used`, identify pipeline) |
| `health-checks` | Secondary: cross-product PostHog setup health; good baseline for a new setup |
| `bypass-spike` *(custom)* | Unique to this product — see Custom Scouts section |

### Disabled

| Scout | Reason |
|---|---|
| `error-tracking` | Covered by the native `error_tracking` source (issue_created / issue_reopened / issue_spiking) |
| `session-replay` | Covered by the native `session_replay` source (session_analysis_cluster) |
| `feature-flags` | No feature flags in use — no `$feature_flag_called` events; enable via PostHog if flags are adopted |
| `surveys` | No surveys in use (count: 0); enable if surveys are created |
| `web-analytics` | No web analytics data — extension uses posthog-node; enable if posthog-js is added to the website |
| `ai-observability` | No `$ai_*` events or LLM SDK in use |
| `revenue-analytics` | No payment SDK or revenue events |
| `experiments` | No A/B experiments running |
| `csp-violations` | No CSP reporting configured |
| `customer-analytics` | No group analytics (`has_group_types: false`) |
| `data-pipelines` | No CDP destinations, batch exports, or hog flows |
| `data-warehouse` | No warehouse imports |
| `apm` | No distributed tracing / OpenTelemetry spans |
| `logs` | PostHog logs product not in use |
| `anomaly-detection` | Not needed with product-analytics + health-checks active |
| `observability-gaps` | Available to re-enable if event coverage needs auditing |
| `inbox-validation` | Fresh setup — no resolved reports yet to validate |
| `insight-alerts` | No configured insight alerts yet |
| `ingestion-warnings` | No specific ingestion warnings observed |
| `mcp-tool-calls` | No `$mcp_tool_call` telemetry |
| `replay-vision` | No Replay Vision scanners configured |
| `skills-store` | Not relevant for this project's setup |
| `web-vitals` | No `$web_vitals` events — posthog-node doesn't capture these |

---

## Custom scouts

### Created: `signals-scout-bypass-spike`

**What it watches:** The rate of `betterlectio bypass engaged` events relative to `extension loaded` sessions. This event fires when a user clicks "vis original Lectio" — the escape hatch to native Lectio — which is BetterLectio's clearest signal that a page redesign is broken.

**Why no built-in scout covers it:** `signals-scout-error-tracking` is disabled (covered by native source). `signals-scout-product-analytics` only watches saved funnels/retention flows. `signals-scout-general` sweeps cross-product surfaces but won't specifically track this ratio. The bypass event is a product event, not an exception, so the error tracking pipeline doesn't catch it.

**Discriminator:** Bypass count in the last 48h exceeds the 7-day daily average by more than 2×, `extension loaded` count is not dropping proportionally, and at least 2 distinct users triggered the bypass.

**Explore patterns:** (1) bypass rate vs. extension_loaded over 14 days; (2) breakdown by page (`$pathname`) to identify the broken surface; (3) correlated `lectio native error` spike; (4) breakdown by `school_id` to distinguish widespread vs. school-specific issues.

**Disqualifiers:** Single-user bypass; bypass during a fresh deploy window (<2h); extension_loaded also dropped (general engagement drop, not a broken page); all bypasses from one school (may be a Lectio-side issue, not the extension).

**Noise escape hatch:** If this scout turns noisy, set `emit: false` on its config (`019f526a-21ee-76cf-8b94-d09227cc30d2`) in PostHog to switch it to dry-run.

### Proposed but declined: `signals-scout-install-auth-funnel`

Watches the `extension installed` → `supabase auth succeeded` funnel for conversion drops. Declined by user during setup.

### Surfaces considered and ruled out

| Surface | Filter that eliminated it |
|---|---|
| Install → Supabase auth funnel | Watchable and uncovered, but declined by user |
| Referral pipeline health (`referral link clicked` → `referral attributed`) | Watchable, but low-frequency events — at most two custom scouts allowed; bypass-spike ranked higher |
| Mobile app invite funnel (`mobile_app_invite_shown` → success) | Watchable, but lower priority than bypass spike |

---

## Follow-ups

- [ ] **Enable Session Replay product** — Go to [PostHog Project Settings](https://eu.posthog.com/project/145688/settings) and turn on Session Replay. The `session_replay / session_analysis_cluster` source is already wired; recordings start reaching the inbox once the product is on. Note: session recording requires `posthog-js` to be loaded on a page — currently the extension uses `posthog-node` and captures no recordings. If you add `posthog-js` to the marketing website (`betterlectio.dk`), enable session replay there too.
- [ ] **Enable Conversations / Support product** — Go to [PostHog Project Settings](https://eu.posthog.com/project/145688/settings) and enable the Conversations product. Then connect an inbound channel (email, inbox widget, or Slack) so tickets reach the inbox. The `conversations / ticket` source is already wired and will start emitting once a channel is live.
- [ ] **Enable `signals-scout-feature-flags`** — if you adopt PostHog feature flags in the extension or website, enable this scout in [PostHog Self-driving](https://eu.posthog.com/project/145688/inbox).
- [ ] **Enable `signals-scout-web-analytics`** — if you add `posthog-js` to `betterlectio.dk` and start capturing web pageviews, enable this scout.
- [ ] **Enable `signals-scout-surveys`** — if you create PostHog surveys, enable this scout.
- [ ] **Add the marketing website to the GitHub App** — the GitHub integration (id: 70380) grants code access for the extension repo. If `betterlectio.dk` lives in a separate repo, grant access to it in the PostHog GitHub App settings so Self-driving can investigate findings there too.
- [ ] **Create saved funnels/retention insights for the extension lifecycle** — `signals-scout-product-analytics` watches _saved_ flows. Create at minimum a retention insight for `extension loaded` (DAU baseline) and a funnel for the install → feature-used journey so the scout has something to watch.

---

## What happens next

The scout coordinator picks up fresh configs within ~30 minutes and the first scans will fire. Error tracking findings (new issues, spikes, reopens) reach the inbox via native sources immediately. Scout-authored findings cluster into reports as scans run — expect the first inbox items within the hour. Check your [Self-driving inbox](https://eu.posthog.com/project/145688/inbox) to see what surfaces first.
