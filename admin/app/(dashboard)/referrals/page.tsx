import Link from "next/link";
import {
  Share2,
  TrendingUp,
  CheckCheck,
  Timer,
  School,
  GraduationCap,
  Users,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReferralChart } from "@/components/referral-chart";
import {
  getReferralOverview,
  getReferralTimeSeries,
  getTopReferrers,
  getRecentAttributions,
  getReferralRejectionBreakdown,
  getReferralBreakdowns,
} from "@/lib/supabase/queries";
import type { ReferralBreakdown } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function ReferralsPage() {
  const [overview, series, topRefs, recent, rejections, breakdowns] =
    await Promise.all([
      getReferralOverview(),
      getReferralTimeSeries(30),
      getTopReferrers(20),
      getRecentAttributions(50),
      getReferralRejectionBreakdown(),
      getReferralBreakdowns(10),
    ]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Referrals</h1>
        <p className="text-sm text-muted-foreground">
          Tracking{" "}
          <span className="font-mono">betterlectio.dk/r/&#123;elevid&#125;</span>{" "}
          links — click → install attribution lives in{" "}
          <span className="font-mono">referral_clicks</span> and{" "}
          <span className="font-mono">students.referred_by</span>.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Stat icon={Share2} title="Total clicks" value={overview.totalClicks} />
        <Stat
          icon={CheckCheck}
          title="Conversions"
          value={overview.totalConversions}
        />
        <Stat
          icon={TrendingUp}
          title="Conversion rate"
          value={
            overview.totalClicks > 0
              ? `${(overview.conversionRate * 100).toFixed(1)}%`
              : "—"
          }
        />
        <Stat
          icon={Timer}
          title="Median lag"
          value={overview.medianLagHours > 0 ? `${overview.medianLagHours}h` : "—"}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <Stat
          icon={Share2}
          title="Clicks (7d / 30d)"
          value={`${overview.clicksLast7} / ${overview.clicksLast30}`}
        />
        <Stat
          icon={CheckCheck}
          title="Conversions (7d / 30d)"
          value={`${overview.conversionsLast7} / ${overview.conversionsLast30}`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Last 30 days — clicks vs conversions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ReferralChart data={series} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Top referrers ({topRefs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topRefs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No referrals yet
              </p>
            ) : (
              <ul className="space-y-2.5">
                {topRefs.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                  >
                    <Link
                      href={`/students/${r.id}`}
                      className="font-medium hover:underline"
                    >
                      {r.name}
                    </Link>
                    {r.className && (
                      <Badge variant="outline" className="text-xs">
                        {r.className}
                      </Badge>
                    )}
                    {r.schoolName && (
                      <span className="text-xs text-muted-foreground">
                        {r.schoolName}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {r.clicks} clicks · <span className="font-semibold text-foreground">{r.conversions}</span> joined
                      {r.clicks > 0 &&
                        ` · ${(r.conversionRate * 100).toFixed(0)}%`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <XCircle className="size-4 text-muted-foreground" />
              Rejected attempts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rejections.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                None rejected
              </p>
            ) : (
              <div className="space-y-3">
                {rejections.map((r) => {
                  const max = rejections[0].count;
                  const pct = max > 0 ? (r.count / max) * 100 : 0;
                  return (
                    <div key={r.reason} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <Badge variant="outline" className="text-xs">
                          {r.reason}
                        </Badge>
                        <span className="text-muted-foreground tabular-nums">
                          {r.count}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-destructive/70"
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
      </div>

      <BreakdownSection
        heading="Invitees — who's joining via referrals"
        subtitle="Each converted student counted once. Weight by attribution."
        breakdown={breakdowns.invitees}
      />

      <BreakdownSection
        heading="Referrers — who's sending invites that convert"
        subtitle="Each referrer weighted by # of classmates they've onboarded."
        breakdown={breakdowns.referrers}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Recent attributions ({recent.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No attributions yet
            </p>
          ) : (
            <ul className="space-y-3">
              {recent.map((r) => (
                <li
                  key={r.id}
                  className="rounded-md border bg-muted/30 px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {r.invitee.id ? (
                      <Link
                        href={`/students/${r.invitee.id}`}
                        className="font-medium hover:underline"
                      >
                        {r.invitee.name ?? r.invitee.id}
                      </Link>
                    ) : (
                      <span className="font-medium">Unknown</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      invited by
                    </span>
                    {r.referrer.id ? (
                      <Link
                        href={`/students/${r.referrer.id}`}
                        className="font-medium hover:underline"
                      >
                        {r.referrer.name ?? r.referrer.id}
                      </Link>
                    ) : (
                      <span className="font-medium">Unknown</span>
                    )}
                    {r.country && (
                      <Badge variant="outline" className="text-xs">
                        {r.country.toUpperCase()}
                      </Badge>
                    )}
                    {r.referer_host && (
                      <span className="text-xs text-muted-foreground font-mono">
                        {r.referer_host}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {r.lag_seconds != null && (
                        <>{formatLag(r.lag_seconds)} · </>
                      )}
                      {r.converted_at
                        ? new Date(r.converted_at).toLocaleString("da-DK")
                        : "—"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatLag(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

function BreakdownSection({
  heading,
  subtitle,
  breakdown,
}: {
  heading: string;
  subtitle: string;
  breakdown: ReferralBreakdown;
}) {
  if (breakdown.total === 0) return null;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{heading}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <BreakdownCard
          icon={School}
          title="By school"
          empty="—"
          total={breakdown.total}
          rows={breakdown.schools.map((s) => ({
            key: `${s.schoolId}`,
            label: s.name,
            href: `/schools/${s.schoolId}`,
            count: s.count,
          }))}
        />
        <BreakdownCard
          icon={Users}
          title="By class"
          empty="—"
          total={breakdown.total}
          rows={breakdown.classes.map((c) => ({
            key: c.className,
            label: c.className,
            count: c.count,
          }))}
        />
        <BreakdownCard
          icon={GraduationCap}
          title="By school year"
          empty="—"
          total={breakdown.total}
          rows={breakdown.years.map((y) => ({
            key: y.year,
            label: y.year,
            count: y.count,
          }))}
        />
      </div>
    </section>
  );
}

function BreakdownCard({
  icon: Icon,
  title,
  empty,
  total,
  rows,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  empty: string;
  total: number;
  rows: { key: string; label: string; href?: string; count: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const pct = total > 0 ? (r.count / total) * 100 : 0;
              return (
                <li key={r.key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    {r.href ? (
                      <Link
                        href={r.href}
                        className="truncate font-medium hover:underline"
                      >
                        {r.label}
                      </Link>
                    ) : (
                      <span className="truncate font-medium">{r.label}</span>
                    )}
                    <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {r.count} · {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-primary/70"
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
  );
}

function Stat({
  icon: Icon,
  title,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: number | string;
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
        <div className="text-2xl font-bold tabular-nums">
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
      </CardContent>
    </Card>
  );
}
