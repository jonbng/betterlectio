import Link from "next/link";
import { CheckCircle2, ListTodo, Users, Activity } from "lucide-react";

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

import { getHomeworkOverview } from "@/lib/supabase/queries";
import { getHomeworkToggleSeries } from "@/lib/posthog/queries";
import { SignupChart } from "@/components/signup-chart";

export const dynamic = "force-dynamic";

export default async function HomeworkPage() {
  const [overview, toggleSeries] = await Promise.all([
    getHomeworkOverview(),
    getHomeworkToggleSeries(),
  ]);

  const doneShare =
    overview.totalRows > 0
      ? Math.round((overview.doneRows / overview.totalRows) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Homework engagement
        </h1>
        <p className="text-sm text-muted-foreground">
          Per-student lektier completion stored in{" "}
          <span className="font-mono">student_homework</span>. Toggles in the
          last 30 days.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Stat icon={ListTodo} title="Tracked entries" value={overview.totalRows} />
        <Stat icon={CheckCircle2} title="Marked done" value={overview.doneRows} />
        <Stat icon={Activity} title="% done" value={doneShare} suffix="%" />
        <Stat
          icon={Users}
          title="Active students (7d)"
          value={overview.distinctActive7}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Toggles per day (Supabase)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SignupChart data={overview.chart} />
        </CardContent>
      </Card>

      {toggleSeries && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Toggles per day (PostHog{" "}
              <span className="font-mono">feature used / homework_toggle</span>)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SignupChart data={toggleSeries} />
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            By school (last 30 days)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto px-3 sm:px-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-card">School</TableHead>
                  <TableHead className="text-right">Toggles</TableHead>
                  <TableHead className="text-right">Done %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.bySchool.map((s) => (
                  <TableRow key={s.schoolId}>
                    <TableCell className="sticky left-0 bg-card">
                      <Link
                        href={`/schools/${s.schoolId}`}
                        className="font-medium hover:underline"
                      >
                        {s.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">{s.toggles}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {Math.round(s.doneShare * 100)}%
                    </TableCell>
                  </TableRow>
                ))}
                {overview.bySchool.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="py-6 text-center text-sm text-muted-foreground"
                    >
                      No data
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Most active classes (last 30 days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {overview.topClasses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data</p>
          ) : (
            <ul className="space-y-2">
              {overview.topClasses.map((c) => {
                const max = overview.topClasses[0].count;
                const pct = max > 0 ? (c.count / max) * 100 : 0;
                return (
                  <li key={c.key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <Link
                        href={`/schools/${c.schoolId}`}
                        className="hover:underline"
                      >
                        <Badge variant="outline" className="text-xs">
                          {c.className}
                        </Badge>
                      </Link>
                      <span className="text-muted-foreground">{c.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
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
  suffix,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: number;
  suffix?: string;
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
          {value.toLocaleString()}
          {suffix ?? ""}
        </div>
      </CardContent>
    </Card>
  );
}
