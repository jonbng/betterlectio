import { AlertTriangle, EyeOff, Unplug, Bug } from "lucide-react";

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

import {
  getErrorSeries,
  getErrorBreakdownBySchool,
  getErrorBreakdownByPath,
} from "@/lib/posthog/queries";
import { EventBarChart } from "@/components/event-bar-chart";

export const dynamic = "force-dynamic";

const ERROR_EVENTS = [
  "lectio native error",
  "betterlectio bypass engaged",
  "lectio session lost",
  "$exception",
];

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "lectio native error": AlertTriangle,
  "betterlectio bypass engaged": EyeOff,
  "lectio session lost": Unplug,
  $exception: Bug,
};

export default async function ErrorsPage() {
  const [series, bySchool, byPath] = await Promise.all([
    getErrorSeries(),
    getErrorBreakdownBySchool(),
    getErrorBreakdownByPath(),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Errors &amp; session loss
        </h1>
        <p className="text-sm text-muted-foreground">
          PostHog signal for{" "}
          <span className="font-mono">lectio native error</span>,{" "}
          <span className="font-mono">betterlectio bypass engaged</span>,{" "}
          <span className="font-mono">lectio session lost</span>, and{" "}
          <span className="font-mono">$exception</span>.
        </p>
      </div>

      {!series ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            PostHog data unavailable — check API key.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Totals row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {ERROR_EVENTS.map((evt) => {
              const total =
                series.totals.find((t) => t.event === evt)?.total ?? 0;
              const Icon = ICONS[evt] ?? Bug;
              return (
                <Card key={evt}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground">
                      {evt}
                    </CardTitle>
                    <Icon className="size-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {total.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Timeseries */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Last 30 days
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EventBarChart data={series.chart} events={ERROR_EVENTS} />
            </CardContent>
          </Card>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Top schools ($exception)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!bySchool || bySchool.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data</p>
            ) : (
              <ul className="space-y-2">
                {bySchool.map((row) => {
                  const max = bySchool[0].total;
                  const pct = max > 0 ? (row.total / max) * 100 : 0;
                  return (
                    <li key={row.school} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <Badge variant="outline" className="text-xs">
                          {row.school}
                        </Badge>
                        <span className="text-muted-foreground">
                          {row.total}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted">
                        <div
                          className="h-1.5 rounded-full bg-destructive"
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

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Top pages ($exception)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto px-3 sm:px-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Path</TableHead>
                    <TableHead className="text-right">Errors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(byPath ?? []).map((p) => (
                    <TableRow key={p.path}>
                      <TableCell className="font-mono text-xs">
                        {p.path}
                      </TableCell>
                      <TableCell className="text-right">{p.total}</TableCell>
                    </TableRow>
                  ))}
                  {(!byPath || byPath.length === 0) && (
                    <TableRow>
                      <TableCell
                        colSpan={2}
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
      </div>
    </div>
  );
}
