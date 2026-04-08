import {
  Users,
  School,
  Monitor,
  Smartphone,
  UserPlus,
} from "lucide-react";

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
import { SignupChart } from "@/components/signup-chart";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [stats, signups, topSchools] = await Promise.all([
    getOverviewStats(),
    getSignupsByDay(30),
    getTopSchools(10),
  ]);

  const metrics = [
    {
      title: "Total Students",
      value: stats.totalStudents,
      icon: Users,
    },
    {
      title: "Schools",
      value: stats.totalSchools,
      icon: School,
    },
    {
      title: "Extension Users",
      value: stats.extensionUsers,
      icon: Monitor,
    },
    {
      title: "App Users",
      value: stats.appUsers,
      icon: Smartphone,
    },
    {
      title: "New (7d)",
      value: stats.recentSignups,
      icon: UserPlus,
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {metrics.map((m) => (
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

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Top Schools</CardTitle>
        </CardHeader>
        <CardContent>
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
