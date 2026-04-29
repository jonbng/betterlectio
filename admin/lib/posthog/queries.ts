const POSTHOG_HOST = "https://eu.posthog.com";
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY!;
const PROJECT_ID = "145688";

type SchoolFilter = number | string | null | undefined;

function schoolPropertyFilter(school: SchoolFilter) {
  if (school == null || school === "") return undefined;
  return [
    {
      key: "school_id",
      value: String(school),
      operator: "exact",
      type: "event",
    },
  ];
}

async function queryPostHog(query: Record<string, unknown>) {
  if (!POSTHOG_API_KEY) {
    return null;
  }
  try {
    const res = await fetch(
      `${POSTHOG_HOST}/api/projects/${PROJECT_ID}/query/`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${POSTHOG_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
        next: { revalidate: 300 },
      },
    );

    if (!res.ok) {
      const body = await res.text();
      console.error(
        `PostHog query failed: ${res.status} ${res.statusText}`,
        body.slice(0, 500),
      );
      return null;
    }

    const data = await res.json();
    if (!data?.results) {
      console.error(
        "PostHog query returned no results:",
        JSON.stringify(data).slice(0, 500),
      );
    }
    return data;
  } catch (err) {
    console.error("PostHog query error:", err);
    return null;
  }
}

// ── Active users (DAU / WAU / MAU) ─────────────────────────────────

export async function getActiveUsers(opts: { school?: SchoolFilter } = {}) {
  const properties = schoolPropertyFilter(opts.school);
  const eventNode = (math: string, name: string) => ({
    kind: "EventsNode",
    event: "extension loaded",
    math,
    custom_name: name,
    ...(properties ? { properties } : {}),
  });

  const result = await queryPostHog({
    kind: "TrendsQuery",
    series: [
      eventNode("dau", "DAU"),
      eventNode("weekly_active", "WAU"),
      eventNode("monthly_active", "MAU"),
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

  const dau = series[0];
  const wau = series[1];
  const mau = series[2];

  const latest = {
    dau: dau?.data?.at(-1) ?? 0,
    wau: wau?.data?.at(-1) ?? 0,
    mau: mau?.data?.at(-1) ?? 0,
  };

  const chart = (dau?.days ?? []).map((day, i) => ({
    date: day,
    dau: dau?.data?.[i] ?? 0,
    wau: wau?.data?.[i] ?? 0,
    mau: mau?.data?.[i] ?? 0,
  }));

  return { latest, chart };
}

// ── Extension version distribution ──────────────────────────────────

export async function getVersionDistribution(
  opts: { school?: SchoolFilter } = {},
) {
  const properties = schoolPropertyFilter(opts.school);
  const result = await queryPostHog({
    kind: "TrendsQuery",
    series: [
      {
        kind: "EventsNode",
        event: "extension loaded",
        math: "dau",
        ...(properties ? { properties } : {}),
      },
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

  return series
    .map((s) => ({
      version: s.breakdown_value || "unknown",
      users: Math.max(...s.data),
    }))
    .sort((a, b) => b.users - a.users);
}

// ── Feature usage leaderboard ───────────────────────────────────────

export async function getFeatureUsage(opts: { school?: SchoolFilter } = {}) {
  const properties = schoolPropertyFilter(opts.school);
  const eventNode = (math: string, name: string) => ({
    kind: "EventsNode",
    event: "feature used",
    math,
    custom_name: name,
    ...(properties ? { properties } : {}),
  });

  const result = await queryPostHog({
    kind: "TrendsQuery",
    series: [eventNode("total", "Total"), eventNode("dau", "Users")],
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

  const features: Record<string, { total: number; peakUsers: number }> = {};
  for (const s of series) {
    const feature = s.breakdown_value || "unknown";
    const entry = (features[feature] ??= { total: 0, peakUsers: 0 });
    const sum = s.data.reduce((a, b) => a + b, 0);
    const peak = Math.max(...s.data);
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
      targetEntity: { id: "extension loaded", type: "events" },
      returningEntity: { id: "extension loaded", type: "events" },
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

// ── Mobile app funnel events (PostHog side) ─────────────────────────

const MOBILE_INVITE_EVENTS = [
  "mobile_app_invite_shown",
  "mobile_app_invite_dismissed",
  "mobile_app_invite_success_shown",
  "mobile_app_invite_opened_from_drawer",
  "mobile_app_marked_android",
] as const;

export async function getMobileAppInviteSeries() {
  const result = await queryPostHog({
    kind: "TrendsQuery",
    series: MOBILE_INVITE_EVENTS.map((event) => ({
      kind: "EventsNode",
      event,
      math: "total",
      custom_name: event,
    })),
    dateRange: { date_from: "-30d" },
    interval: "day",
  });

  if (!result?.results) return null;

  const series = result.results as {
    label: string;
    data: number[];
    days: string[];
    custom_name?: string;
  }[];

  const days = series[0]?.days ?? [];
  const chart = days.map((day, i) => {
    const row: Record<string, number | string> = { date: day };
    for (const s of series) {
      const key = s.custom_name ?? s.label;
      row[key] = s.data[i] ?? 0;
    }
    return row;
  });

  const totals = series.map((s) => ({
    event: s.custom_name ?? s.label,
    total: s.data.reduce((a, b) => a + b, 0),
  }));

  return { chart, totals };
}

// ── Errors & session loss ───────────────────────────────────────────

const ERROR_EVENTS = [
  "lectio native error",
  "betterlectio bypass engaged",
  "lectio session lost",
  "$exception",
] as const;

export async function getErrorSeries() {
  const result = await queryPostHog({
    kind: "TrendsQuery",
    series: ERROR_EVENTS.map((event) => ({
      kind: "EventsNode",
      event,
      math: "total",
      custom_name: event,
    })),
    dateRange: { date_from: "-30d" },
    interval: "day",
  });

  if (!result?.results) return null;

  const series = result.results as {
    label: string;
    data: number[];
    days: string[];
    custom_name?: string;
  }[];

  const days = series[0]?.days ?? [];
  const chart = days.map((day, i) => {
    const row: Record<string, number | string> = { date: day };
    for (const s of series) {
      const key = s.custom_name ?? s.label;
      row[key] = s.data[i] ?? 0;
    }
    return row;
  });

  const totals = series.map((s) => ({
    event: s.custom_name ?? s.label,
    total: s.data.reduce((a, b) => a + b, 0),
  }));

  return { chart, totals };
}

export async function getErrorBreakdownBySchool() {
  const result = await queryPostHog({
    kind: "TrendsQuery",
    series: [
      {
        kind: "EventsNode",
        event: "$exception",
        math: "total",
      },
    ],
    dateRange: { date_from: "-30d" },
    interval: "day",
    breakdownFilter: {
      breakdowns: [{ property: "school_name", type: "event" }],
      breakdown_limit: 15,
    },
  });

  if (!result?.results) return null;

  const series = result.results as {
    label: string;
    data: number[];
    breakdown_value: string;
  }[];

  return series
    .map((s) => ({
      school: s.breakdown_value || "unknown",
      total: s.data.reduce((a, b) => a + b, 0),
    }))
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total);
}

export async function getErrorBreakdownByPath() {
  const result = await queryPostHog({
    kind: "TrendsQuery",
    series: [
      {
        kind: "EventsNode",
        event: "$exception",
        math: "total",
      },
    ],
    dateRange: { date_from: "-30d" },
    interval: "day",
    breakdownFilter: {
      breakdowns: [{ property: "$pathname", type: "event" }],
      breakdown_limit: 20,
    },
  });

  if (!result?.results) return null;

  const series = result.results as {
    label: string;
    data: number[];
    breakdown_value: string;
  }[];

  return series
    .map((s) => ({
      path: s.breakdown_value || "unknown",
      total: s.data.reduce((a, b) => a + b, 0),
    }))
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total);
}

// ── Homework toggle volume (PostHog) ────────────────────────────────

export async function getHomeworkToggleSeries() {
  const result = await queryPostHog({
    kind: "TrendsQuery",
    series: [
      {
        kind: "EventsNode",
        event: "feature used",
        math: "total",
        custom_name: "homework_toggle",
        properties: [
          {
            key: "feature",
            value: "homework_toggle",
            operator: "exact",
            type: "event",
          },
        ],
      },
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

  const s = series[0];
  if (!s) return null;
  return s.days.map((day, i) => ({ date: day, count: s.data[i] ?? 0 }));
}
