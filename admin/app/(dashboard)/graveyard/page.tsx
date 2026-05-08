import Link from "next/link";
import {
  Skull,
  TrendingDown,
  EyeOff,
  Undo2,
  Users,
  Percent,
  Clock,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SignupChart } from "@/components/signup-chart";
import { GraveyardChurnChart } from "@/components/graveyard-churn-chart";
import { getGraveyardStats } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default async function GraveyardPage() {
  const stats = await getGraveyardStats();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Graveyard</h1>
        <p className="text-sm text-muted-foreground">
          Users who once had BetterLectio but are no longer active — explicit
          uninstalls plus silent drop-off (no heartbeat in {stats.windowDays}+
          days).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
        <Stat icon={Skull} title="Graveyard" value={stats.totals.total} />
        <Stat
          icon={TrendingDown}
          title="Uninstalled"
          value={stats.totals.uninstalled}
        />
        <Stat
          icon={EyeOff}
          title="Silent inactive"
          value={stats.totals.silentInactive}
        />
        <Stat
          icon={Undo2}
          title="Reinstalled"
          value={stats.totals.reinstalled}
        />
        <Stat
          icon={Percent}
          title="Churn rate"
          valueText={pct(stats.totals.churnRate)}
        />
        <Stat
          icon={Users}
          title="Ever onboarded"
          value={stats.totals.everInstalled}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Churn vs. growth ({stats.trendDays}d)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <GraveyardChurnChart data={stats.churnTrend} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Uninstalls per day ({stats.trendDays}d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SignupChart
              data={stats.uninstallsByDay}
              seriesName="Uninstalls"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Clock className="size-4 text-muted-foreground" />
              Time to churn
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              rows={stats.timeToChurn.map((b) => ({
                label: b.bucket,
                count: b.count,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Churn by year/grade
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.byYear.length === 0 ? (
              <p className="text-sm text-muted-foreground">No grade data</p>
            ) : (
              <div className="space-y-3">
                {stats.byYear.map((row) => {
                  const max = Math.max(
                    ...stats.byYear.map((r) => r.churnRate),
                    0.01,
                  );
                  const w = max > 0 ? (row.churnRate / max) * 100 : 0;
                  return (
                    <div key={row.year} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <Badge variant="outline" className="text-xs">
                          {row.year}
                        </Badge>
                        <span className="text-muted-foreground">
                          {row.graveyard} / {row.everInstalled} (
                          {pct(row.churnRate)})
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-destructive"
                          style={{ width: `${w}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Reason chips (uninstall feedback)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.reasonChips.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No reasons recorded
              </p>
            ) : (
              <div className="space-y-3">
                {stats.reasonChips.map((c) => {
                  const max = stats.reasonChips[0].count;
                  const w = max > 0 ? (c.count / max) * 100 : 0;
                  return (
                    <div key={c.reason} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <Badge variant="outline" className="text-xs">
                          {c.reason}
                        </Badge>
                        <span className="text-muted-foreground">{c.count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{ width: `${w}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Schools by churn rate (≥10 ever-installed)
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {stats.bySchool.length === 0 ? (
            <p className="text-sm text-muted-foreground">No schools yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead className="text-right">Ever</TableHead>
                  <TableHead className="text-right">Graveyard</TableHead>
                  <TableHead className="text-right">Uninstall</TableHead>
                  <TableHead className="text-right">Silent</TableHead>
                  <TableHead className="text-right">Churn</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.bySchool.map((s) => (
                  <TableRow key={s.schoolId}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/schools/${s.schoolId}`}
                        className="hover:underline"
                      >
                        {s.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      {s.everInstalled}
                    </TableCell>
                    <TableCell className="text-right">{s.graveyard}</TableCell>
                    <TableCell className="text-right">
                      {s.uninstalled}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.silentInactive}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {pct(s.churnRate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Recent leavers ({stats.recent.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leavers recorded</p>
          ) : (
            <ul className="space-y-3">
              {stats.recent.map((u) => (
                <li
                  key={u.id}
                  className="rounded-md border bg-muted/30 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Link
                      href={`/students/${u.id}`}
                      className="font-medium hover:underline"
                    >
                      {u.fullName}
                    </Link>
                    {u.className && (
                      <Badge variant="outline" className="text-xs">
                        {u.className}
                      </Badge>
                    )}
                    {u.schoolName && (
                      <span className="text-xs text-muted-foreground">
                        {u.schoolName}
                      </span>
                    )}
                    <Badge
                      variant={
                        u.cohort === "uninstalled" ? "destructive" : "secondary"
                      }
                      className="text-xs"
                    >
                      {u.cohort === "uninstalled" ? "Uninstalled" : "Silent"}
                    </Badge>
                    {u.reinstalledAt && (
                      <Badge
                        variant="default"
                        className="gap-1 bg-emerald-600 text-xs hover:bg-emerald-600"
                      >
                        <Undo2 className="size-3" />
                        Reinstalled
                      </Badge>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {u.leftAt
                        ? new Date(u.leftAt).toLocaleString("da-DK")
                        : "—"}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {u.daysWithExtension != null && (
                      <span>Had it {u.daysWithExtension} dage</span>
                    )}
                  </div>
                  {u.reason && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {String(u.reason)
                        .split(",")
                        .map((r) => r.trim())
                        .filter(Boolean)
                        .map((r) => (
                          <Badge
                            key={r}
                            variant="secondary"
                            className="text-xs"
                          >
                            {r}
                          </Badge>
                        ))}
                    </div>
                  )}
                  {u.feedback && (
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      “{u.feedback}”
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  icon: Icon,
  title,
  value,
  valueText,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value?: number;
  valueText?: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {valueText ?? (value ?? 0).toLocaleString()}
        </div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function BarList({ rows }: { rows: { label: string; count: number }[] }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  if (rows.every((r) => r.count === 0)) {
    return <p className="text-sm text-muted-foreground">No data</p>;
  }
  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const w = (r.count / max) * 100;
        return (
          <div key={r.label} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <Badge variant="outline" className="text-xs">
                {r.label}
              </Badge>
              <span className="text-muted-foreground">{r.count}</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary"
                style={{ width: `${w}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
