import {
  UserCheck,
  QrCode,
  Smartphone,
  XCircle,
  CircleSlash,
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

import { getMobileFunnel } from "@/lib/supabase/queries";
import { getMobileAppInviteSeries } from "@/lib/posthog/queries";
import { EventBarChart } from "@/components/event-bar-chart";

export const dynamic = "force-dynamic";

const FUNNEL_EVENTS = [
  "mobile_app_invite_shown",
  "mobile_app_invite_dismissed",
  "mobile_app_invite_success_shown",
  "mobile_app_invite_opened_from_drawer",
  "mobile_app_marked_android",
];

export default async function MobileAppPage() {
  const [funnel, series] = await Promise.all([
    getMobileFunnel(),
    getMobileAppInviteSeries(),
  ]);

  const { totals, schools } = funnel;
  const conv = (n: number, d: number) =>
    d > 0 ? `${Math.round((n / d) * 100)}%` : "–";

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Mobile app funnel
        </h1>
        <p className="text-sm text-muted-foreground">
          Eligibility &rarr; QR scan &rarr; install. Sources:{" "}
          <span className="font-mono">students.*</span> + PostHog{" "}
          <span className="font-mono">mobile_app_invite_*</span> events.
        </p>
      </div>

      {/* Funnel cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-5">
        <FunnelStat
          icon={UserCheck}
          title="Eligible"
          value={totals.eligible}
          subtitle={`${conv(totals.eligible, totals.total)} of all`}
        />
        <FunnelStat
          icon={QrCode}
          title="QR scanned"
          value={totals.scanned}
          subtitle={conv(totals.scanned, totals.eligible) + " of eligible"}
        />
        <FunnelStat
          icon={Smartphone}
          title="Installed"
          value={totals.installed}
          subtitle={conv(totals.installed, totals.scanned) + " of scanned"}
        />
        <FunnelStat
          icon={CircleSlash}
          title="Marked Android"
          value={totals.markedAndroid}
        />
        <FunnelStat
          icon={XCircle}
          title="Dismissed"
          value={totals.dismissed}
        />
      </div>

      {/* Funnel timeseries */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Invite events (last 30 days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!series ? (
            <p className="text-sm text-muted-foreground">
              PostHog data unavailable.
            </p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                {series.totals.map((t) => (
                  <Badge key={t.event} variant="outline" className="font-mono text-xs">
                    {t.event}: {t.total.toLocaleString()}
                  </Badge>
                ))}
              </div>
              <EventBarChart data={series.chart} events={FUNNEL_EVENTS} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Per-school table */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Per-school conversion ({schools.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto px-3 sm:px-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-card">School</TableHead>
                  <TableHead className="text-right">Eligible</TableHead>
                  <TableHead className="text-right">QR</TableHead>
                  <TableHead className="text-right">Installed</TableHead>
                  <TableHead className="text-right">Android</TableHead>
                  <TableHead className="text-right">QR&rarr;Install</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schools.map((s) => (
                  <TableRow key={s.schoolId}>
                    <TableCell className="sticky left-0 bg-card font-medium">
                      {s.name}
                    </TableCell>
                    <TableCell className="text-right">{s.eligible}</TableCell>
                    <TableCell className="text-right">{s.scanned}</TableCell>
                    <TableCell className="text-right">{s.installed}</TableCell>
                    <TableCell className="text-right">
                      {s.markedAndroid}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {conv(s.installed, s.scanned)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FunnelStat({
  icon: Icon,
  title,
  value,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: number;
  subtitle?: string;
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
        {subtitle && (
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}
