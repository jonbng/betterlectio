import {
  Users,
  School,
  Monitor,
  Smartphone,
  UserPlus,
  Activity,
  CalendarDays,
  CalendarRange,
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
import { getOverviewStats, getSignupsByDay, getTopSchools } from "@/lib/supabase/queries";
import {
  getActiveUsers,
  getVersionDistribution,
  getFeatureUsage,
  getRetention,
} from "@/lib/posthog/queries";
import { SignupChart } from "@/components/signup-chart";
import { ActiveUsersChart } from "@/components/active-users-chart";
import { RetentionTable } from "@/components/retention-table";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [stats, signups, topSchools, activeUsers, versions, featureUsage, retention] =
    await Promise.all([
      getOverviewStats(),
      getSignupsByDay(30),
      getTopSchools(10),
      getActiveUsers(),
      getVersionDistribution(),
      getFeatureUsage(),
      getRetention(),
    ]);

  const supabaseMetrics = [
    { title: "Total Students", value: stats.totalStudents, icon: Users },
    { title: "Schools", value: stats.totalSchools, icon: School },
    { title: "Extension Users", value: stats.extensionUsers, icon: Monitor },
    { title: "App Users", value: stats.appUsers, icon: Smartphone },
    { title: "New (7d)", value: stats.recentSignups, icon: UserPlus },
  ];

  const activeMetrics = activeUsers
    ? [
        { title: "DAU", value: activeUsers.latest.dau, icon: Activity },
        { title: "WAU", value: activeUsers.latest.wau, icon: CalendarDays },
        { title: "MAU", value: activeUsers.latest.mau, icon: CalendarRange },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>

      {/* Supabase metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {supabaseMetrics.map((m) => (
          <Card key={m.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {m.title}
              </CardTitle>
              <m.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{m.value.toLocaleString()}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* PostHog active user metrics */}
      {activeMetrics.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          {activeMetrics.map((m) => (
            <Card key={m.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {m.title}
                </CardTitle>
                <m.icon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{m.value.toLocaleString()}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Active users chart */}
      {activeUsers && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Active Users (last 30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActiveUsersChart data={activeUsers.chart} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Signups chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Signups (last 30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SignupChart data={signups} />
          </CardContent>
        </Card>

        {/* Version distribution */}
        {versions && versions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Extension Versions (7d peak)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {versions.map((v) => {
                  const maxUsers = versions[0].users;
                  const pct = maxUsers > 0 ? (v.users / maxUsers) * 100 : 0;
                  return (
                    <div key={v.version} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <Badge variant="secondary" className="font-mono">
                          v{v.version}
                        </Badge>
                        <span className="text-muted-foreground">
                          {v.users} users
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Feature usage */}
      {featureUsage && featureUsage.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Feature Usage (last 30 days)
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead className="text-right">Total Events</TableHead>
                  <TableHead className="text-right">Peak DAU</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {featureUsage.map((f) => (
                  <TableRow key={f.feature}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {f.feature}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {f.total.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {f.peakUsers}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Retention */}
      {retention && retention.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Weekly Retention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RetentionTable data={retention} />
          </CardContent>
        </Card>
      )}

      {/* Top schools */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Top Schools</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>School</TableHead>
                <TableHead className="text-right">Students</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topSchools.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    {s.display_name ?? s.name}
                  </TableCell>
                  <TableCell className="text-right">
                    {s.studentCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
