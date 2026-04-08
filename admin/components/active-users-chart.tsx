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

type DataPoint = { date: string; dau: number; wau: number; mau: number };

export function ActiveUsersChart({ data }: { data: DataPoint[] }) {
  return (
    <div className="h-[300px] w-full min-w-0">
      <ResponsiveContainer width="100%" height={300}>
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
          <Legend />
          <Area
            type="monotone"
            dataKey="mau"
            name="MAU"
            stroke="var(--color-chart-5)"
            fill="var(--color-chart-5)"
            fillOpacity={0.05}
            strokeWidth={1.5}
          />
          <Area
            type="monotone"
            dataKey="wau"
            name="WAU"
            stroke="var(--color-chart-3)"
            fill="var(--color-chart-3)"
            fillOpacity={0.08}
            strokeWidth={1.5}
          />
          <Area
            type="monotone"
            dataKey="dau"
            name="DAU"
            stroke="var(--color-primary)"
            fill="var(--color-primary)"
            fillOpacity={0.15}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
