const POSTHOG_HOST = "https://eu.posthog.com";
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY!;
const PROJECT_ID = "145688";

async function queryPostHog(query: Record<string, unknown>) {
  const res = await fetch(`${POSTHOG_HOST}/api/projects/${PROJECT_ID}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${POSTHOG_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
    next: { revalidate: 300 }, // cache 5 min
  });

  console.log(`PostHog query: ${res.status} ${res.statusText} (${query.kind})`);

  if (!res.ok) {
    const body = await res.text();
    console.error(`PostHog query failed: ${res.status} ${res.statusText}`, body.slice(0, 500));
    return null;
  }

  const data = await res.json();
  if (!data?.results) {
    console.error("PostHog query returned no results:", JSON.stringify(data).slice(0, 500));
  }
  return data;
}

// ── Active users (DAU / WAU / MAU) ─────────────────────────────────

export async function getActiveUsers() {
  const result = await queryPostHog({
    kind: "TrendsQuery",
    series: [
      { kind: "EventsNode", event: "extension loaded", math: "dau", custom_name: "DAU" },
      { kind: "EventsNode", event: "extension loaded", math: "weekly_active", custom_name: "WAU" },
      { kind: "EventsNode", event: "extension loaded", math: "monthly_active", custom_name: "MAU" },
    ],
    dateRange: { date_from: "-30d" },
    interval: "day",
  });

  if (!result?.results) return null;

  const series = result.results as {
    label: string;
    data: number[];
    days: string[];
  }[];

  console.log("Active users series labels:", series.map((s) => s.label));

  // Match by index since labels may not match custom_name
  const dau = series[0];
  const wau = series[1];
  const mau = series[2];

  // Latest values
  const latest = {
    dau: dau?.data?.at(-1) ?? 0,
    wau: wau?.data?.at(-1) ?? 0,
    mau: mau?.data?.at(-1) ?? 0,
  };

  // Time series for chart
  const chart = (dau?.days ?? []).map((day, i) => ({
    date: day,
    dau: dau?.data?.[i] ?? 0,
    wau: wau?.data?.[i] ?? 0,
    mau: mau?.data?.[i] ?? 0,
  }));

  return { latest, chart };
}

// ── Extension version distribution ──────────────────────────────────

export async function getVersionDistribution() {
  const result = await queryPostHog({
    kind: "TrendsQuery",
    series: [
      { kind: "EventsNode", event: "extension loaded", math: "dau" },
    ],
    dateRange: { date_from: "-7d" },
    interval: "day",
    breakdownFilter: {
      breakdowns: [{ property: "extension_version", type: "event" }],
      breakdown_limit: 10,
    },
  });

  if (!result?.results) return null;

  const series = result.results as {
    label: string;
    data: number[];
    breakdown_value: string;
  }[];

  // Sum up users per version over the last 7 days (use max daily as proxy)
  return series
    .map((s) => ({
      version: s.breakdown_value || "unknown",
      users: Math.max(...s.data),
    }))
    .sort((a, b) => b.users - a.users);
}

// ── Feature usage leaderboard ───────────────────────────────────────

export async function getFeatureUsage() {
  const result = await queryPostHog({
    kind: "TrendsQuery",
    series: [
      { kind: "EventsNode", event: "feature used", math: "total", custom_name: "Total" },
      { kind: "EventsNode", event: "feature used", math: "dau", custom_name: "Users" },
    ],
    dateRange: { date_from: "-30d" },
    interval: "day",
    breakdownFilter: {
      breakdowns: [{ property: "feature", type: "event" }],
      breakdown_limit: 20,
    },
  });

  if (!result?.results) return null;

  const series = result.results as {
    label: string;
    data: number[];
    breakdown_value: string;
    custom_name?: string;
  }[];

  // Group by feature, aggregate total events and peak unique users
  const features: Record<string, { total: number; peakUsers: number }> = {};
  for (const s of series) {
    const feature = s.breakdown_value || "unknown";
    const entry = (features[feature] ??= { total: 0, peakUsers: 0 });
    const sum = s.data.reduce((a, b) => a + b, 0);
    const peak = Math.max(...s.data);
    // The label contains the custom_name; "Total" series adds to total, "Users" to peakUsers
    if (s.label.includes("Total")) {
      entry.total = sum;
    } else {
      entry.peakUsers = peak;
    }
  }

  return Object.entries(features)
    .map(([feature, stats]) => ({ feature, ...stats }))
    .sort((a, b) => b.total - a.total);
}

// ── Weekly retention ────────────────────────────────────────────────

export async function getRetention() {
  const result = await queryPostHog({
    kind: "RetentionQuery",
    retentionFilter: {
      retentionType: "retention_first_time",
      totalIntervals: 8,
      period: "Week",
      targetEntity: {
        id: "extension loaded",
        type: "events",
      },
      returningEntity: {
        id: "extension loaded",
        type: "events",
      },
      retentionReference: "total",
    },
    dateRange: { date_from: "-8w" },
  });

  if (!result?.results) return null;

  const results = result.results as {
    label: string;
    date: string;
    values: { count: number }[];
  }[];

  return results.map((r) => ({
    cohort: r.label,
    date: r.date,
    values: r.values.map((v) => v.count),
  }));
}
