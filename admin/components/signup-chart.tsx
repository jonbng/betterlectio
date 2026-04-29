"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export function SignupChart({
  data,
}: {
  data: { date: string; count: number }[];
}) {
  return (
    <div className="h-[200px] w-full min-w-0 sm:h-[250px]">
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
          <Area
            type="monotone"
            dataKey="count"
            name="Signups"
            stroke="var(--color-primary)"
            fill="var(--color-primary)"
            fillOpacity={0.1}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
