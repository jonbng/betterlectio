"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type Row = Record<string, number | string>;

const CHART_COLORS = [
  "var(--color-primary)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-destructive)",
];

export function EventBarChart({
  data,
  events,
  height = 280,
}: {
  data: Row[];
  events: string[];
  height?: number;
}) {
  return (
    <div
      className="w-full min-w-0"
      style={{ height: `${Math.round(height * 0.75)}px`, minHeight: `${Math.round(height * 0.75)}px` }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="date"
            className="text-xs"
            tickFormatter={(v: string) =>
              new Date(v).toLocaleDateString("da-DK", {
                day: "numeric",
                month: "short",
              })
            }
            tick={{ fill: "var(--color-muted-foreground)" }}
            interval="preserveStartEnd"
          />
          <YAxis
            className="text-xs"
            allowDecimals={false}
            tick={{ fill: "var(--color-muted-foreground)" }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-popover)",
              borderColor: "var(--color-border)",
              borderRadius: 8,
              color: "var(--color-popover-foreground)",
            }}
            labelFormatter={(v) =>
              new Date(String(v)).toLocaleDateString("da-DK", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            }
          />
          <Legend wrapperStyle={{ fontSize: "11px" }} />
          {events.map((evt, i) => (
            <Area
              key={evt}
              type="monotone"
              dataKey={evt}
              name={evt}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              fillOpacity={0.08}
              strokeWidth={1.5}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
