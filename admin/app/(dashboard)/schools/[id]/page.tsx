import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Monitor, Smartphone, Users, UserCheck, Apple } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { getSchoolDetail } from "@/lib/supabase/queries";
import {
  getActiveUsers,
  getVersionDistribution,
  getFeatureUsage,
} from "@/lib/posthog/queries";
import { ActiveUsersChart } from "@/components/active-users-chart";
import { SchoolRolloutPanel } from "@/components/school-rollout-panel";

export const dynamic = "force-dynamic";

function studentName(s: {
  lectio_first_name: string | null;
  lectio_last_name: string | null;
}) {
  return (
    [s.lectio_first_name, s.lectio_last_name].filter(Boolean).join(" ") ||
    "Unknown"
  );
}

export default async function SchoolDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const schoolId = Number(idParam);
  if (!Number.isFinite(schoolId)) notFound();

  const detail = await getSchoolDetail(schoolId);
  if (!detail) notFound();

  const [activeUsers, versions, features] = await Promise.all([
    getActiveUsers({ school: schoolId }),
    getVersionDistribution({ school: schoolId }),
    getFeatureUsage({ school: schoolId }),
  ]);

  const { school, stats, students, uninstalls, classes } = detail;
  const schoolDisplay = school.display_name ?? school.name;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/schools">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {schoolDisplay}
          </h1>
          <p className="font-mono text-xs text-muted-foreground">
            School ID {school.id}
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
        <Stat icon={Users} title="Students" value={stats.total} />
        <Stat icon={Monitor} title="Extension" value={stats.extension} />
        <Stat icon={Smartphone} title="App" value={stats.app} />
        <Stat icon={UserCheck} title="App eligible" value={stats.eligible} />
        <Stat icon={Apple} title="QR scanned" value={stats.qrScanned} />
        <Stat icon={Smartphone} title="Marked Android" value={stats.markedAndroid} />
      </div>
      <p className="text-xs text-muted-foreground">
        {stats.pctOfTotal}% of all BetterLectio students.
      </p>

      {/* PostHog scoped active users */}
      {activeUsers ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Active users (last 30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 pb-4 sm:gap-4">
              <Pill label="DAU" value={activeUsers.latest.dau} />
              <Pill label="WAU" value={activeUsers.latest.wau} />
              <Pill label="MAU" value={activeUsers.latest.mau} />
            </div>
            <ActiveUsersChart data={activeUsers.chart} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            PostHog data unavailable — check API key.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Versions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Extension versions (7d peak)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!versions || versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data</p>
            ) : (
              <div className="space-y-3">
                {versions.map((v) => {
                  const max = versions[0].users;
                  const pct = max > 0 ? (v.users / max) * 100 : 0;
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
            )}
          </CardContent>
        </Card>

        {/* Class roster */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Classes ({classes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {classes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No classes</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {classes.map((c) => (
                  <Badge key={c.name} variant="outline" className="text-xs">
                    {c.name} · {c.count}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* App rollout panel (write surface) */}
      <SchoolRolloutPanel
        schoolId={school.id}
        classes={classes}
      />

      {/* Feature usage */}
      {features && features.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Feature usage (last 30 days)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto px-3 sm:px-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Peak DAU</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {features.map((f) => (
                    <TableRow key={f.feature}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {f.feature}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {f.total.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">{f.peakUsers}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Students */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Students ({students.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto px-3 sm:px-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead className="text-right">Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.slice(0, 100).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link
                        href={`/students/${s.id}`}
                        className="flex items-center gap-3 hover:underline"
                      >
                        <Avatar className="size-8 shrink-0">
                          <AvatarImage
                            src={
                              s.custom_pfp_url ?? s.lectio_pfp_url ?? undefined
                            }
                            className="object-top"
                          />
                          <AvatarFallback className="text-xs">
                            {studentName(s).slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {studentName(s)}
                          </div>
                          <div className="truncate font-mono text-xs text-muted-foreground">
                            {s.id}
                          </div>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.class_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {s.extension_installed_at && (
                          <Badge variant="secondary" className="text-xs">
                            Ext
                          </Badge>
                        )}
                        {s.app_installed_at && (
                          <Badge variant="secondary" className="text-xs">
                            App
                          </Badge>
                        )}
                        {s.app_eligible && !s.app_installed_at && (
                          <Badge variant="outline" className="text-xs">
                            Eligible
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString("da-DK")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {students.length > 100 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                Showing the first 100 of {students.length}.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent uninstalls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Recent uninstalls ({uninstalls.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {uninstalls.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No uninstalls recorded.
            </p>
          ) : (
            <ul className="space-y-3">
              {uninstalls.map((u) => (
                <li
                  key={u.id}
                  className="rounded-md border bg-muted/30 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Link
                      href={`/students/${u.id}`}
                      className="font-medium hover:underline"
                    >
                      {studentName(u)}
                    </Link>
                    {u.class_name && (
                      <Badge variant="outline" className="text-xs">
                        {u.class_name}
                      </Badge>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {u.extension_uninstalled_at
                        ? new Date(u.extension_uninstalled_at).toLocaleString(
                            "da-DK",
                          )
                        : "—"}
                    </span>
                  </div>
                  {u.extension_uninstall_reason && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {String(u.extension_uninstall_reason)
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
                  {u.extension_uninstall_feedback && (
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      “{u.extension_uninstall_feedback}”
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
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: number;
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
        <div className="text-2xl font-bold">{value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}

function Pill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value.toLocaleString()}</div>
    </div>
  );
}
