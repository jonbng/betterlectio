"use client";

type RetentionRow = {
  cohort: string;
  date: string;
  values: number[];
};

export function RetentionTable({ data }: { data: RetentionRow[] }) {
  const maxWeeks = Math.max(...data.map((r) => r.values.length));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">
              Cohort
            </th>
            <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">
              Users
            </th>
            {Array.from({ length: maxWeeks - 1 }, (_, i) => (
              <th
                key={i}
                className="px-2 py-1.5 text-center font-medium text-muted-foreground"
              >
                W{i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const cohortSize = row.values[0] ?? 0;
            return (
              <tr key={row.date}>
                <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
                  {new Date(row.date).toLocaleDateString("da-DK", {
                    day: "numeric",
                    month: "short",
                  })}
                </td>
                <td className="px-2 py-1.5 text-right font-medium">
                  {cohortSize}
                </td>
                {row.values.slice(1).map((count, i) => {
                  const pct = cohortSize > 0 ? (count / cohortSize) * 100 : 0;
                  return (
                    <td key={i} className="px-2 py-1.5 text-center">
                      <span
                        className="inline-block rounded px-1.5 py-0.5"
                        style={{
                          backgroundColor: `oklch(0.6 0.15 265 / ${Math.min(pct / 100, 1) * 0.4 + 0.05})`,
                          color:
                            pct > 30
                              ? "oklch(0.98 0 0)"
                              : "var(--color-foreground)",
                        }}
                      >
                        {pct > 0 ? `${pct.toFixed(0)}%` : "0%"}
                      </span>
                    </td>
                  );
                })}
                {/* Fill empty cells for shorter rows */}
                {Array.from(
                  { length: maxWeeks - row.values.length },
                  (_, i) => (
                    <td key={`empty-${i}`} className="px-2 py-1.5" />
                  ),
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
