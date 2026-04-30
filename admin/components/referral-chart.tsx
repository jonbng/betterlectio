"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function ReferralChart({
  data,
}: {
  data: { date: string; count: number; conversions: number }[];
}) {
  return (
    <div className="h-[240px] w-full min-w-0 sm:h-[280px]">
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
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            iconType="circle"
          />
          <Area
            type="monotone"
            dataKey="count"
            name="Clicks"
            stroke="var(--color-muted-foreground)"
            fill="var(--color-muted-foreground)"
            fillOpacity={0.08}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="conversions"
            name="Conversions"
            stroke="var(--color-primary)"
            fill="var(--color-primary)"
            fillOpacity={0.18}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
