import Link from "next/link";
import { Settings as SettingsIcon, Palette, FileJson, Users } from "lucide-react";

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

import { getSettingsOverview } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const overview = await getSettingsOverview();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Synced settings
          </h1>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            Beta
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Cross-device settings (<span className="font-mono">user_settings</span>
          ) and per-school themes (
          <span className="font-mono">user_school_themes</span>) — still being
          rolled out, so the schema may shift.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Stat
          icon={FileJson}
          title="Settings rows"
          value={overview.totalSettings}
        />
        <Stat
          icon={Palette}
          title="Theme rows"
          value={overview.totalThemes}
        />
        <Stat
          icon={Users}
          title="Users with theme"
          value={overview.distinctThemeUsers}
        />
        <Stat
          icon={SettingsIcon}
          title="Sampled"
          value={overview.sampledRows}
          subtitle="for distribution"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Theme usage</CardTitle>
          </CardHeader>
          <CardContent>
            {overview.themeUsage.length === 0 ? (
              <p className="text-sm text-muted-foreground">No themes yet.</p>
            ) : (
              <ul className="space-y-2">
                {overview.themeUsage.map((t) => {
                  const max = overview.themeUsage[0].count;
                  const pct = max > 0 ? (t.count / max) * 100 : 0;
                  return (
                    <li key={t.theme_id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <Badge variant="outline" className="text-xs">
                          {t.theme_id}
                        </Badge>
                        <span className="text-muted-foreground">{t.count}</span>
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

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Schema versions</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(overview.versions).length === 0 ? (
              <p className="text-sm text-muted-foreground">No data</p>
            ) : (
              <ul className="space-y-2">
                {Object.entries(overview.versions)
                  .sort((a, b) => Number(b[0]) - Number(a[0]))
                  .map(([v, count]) => (
                    <li key={v} className="flex items-center justify-between text-sm">
                      <Badge variant="secondary" className="font-mono text-xs">
                        v{v}
                      </Badge>
                      <span className="text-muted-foreground">
                        {count.toLocaleString()}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Setting key distributions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Setting distributions ({overview.keyDistributions.length} keys)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Walked from the raw jsonb — keys appear here as they are pushed by
            clients. Schema-agnostic, so new keys auto-show up.
          </p>
        </CardHeader>
        <CardContent>
          {overview.keyDistributions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No settings rows sampled yet.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {overview.keyDistributions.map((k) => (
                <div
                  key={k.key}
                  className="rounded-md border bg-muted/30 px-3 py-2"
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-mono text-xs">{k.key}</span>
                    <span className="text-xs text-muted-foreground">
                      n={k.total}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {k.values.slice(0, 4).map((v) => (
                      <li
                        key={v.value}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
                          {Math.round(v.share * 100)}%
                        </span>
                        <div className="h-1 flex-1 rounded-full bg-muted">
                          <div
                            className="h-1 rounded-full bg-primary"
                            style={{ width: `${v.share * 100}%` }}
                          />
                        </div>
                        <span className="w-20 shrink-0 truncate font-mono">
                          {v.value}
                        </span>
                      </li>
                    ))}
                    {k.values.length > 4 && (
                      <li className="text-[10px] text-muted-foreground">
                        +{k.values.length - 4} more
                      </li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent updates */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent updates</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto px-3 sm:px-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead>Schema</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.recent.map((r) => (
                  <TableRow key={r.supabase_id}>
                    <TableCell>
                      {r.student ? (
                        <Link
                          href={`/students/${r.student.id}`}
                          className="hover:underline"
                        >
                          {r.student.name}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">
                          {r.supabase_id.slice(0, 8)}…
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.student?.schoolName ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-xs">
                        v{r.schema_version}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {new Date(r.updated_at).toLocaleString("da-DK")}
                    </TableCell>
                  </TableRow>
                ))}
                {overview.recent.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-6 text-center text-sm text-muted-foreground"
                    >
                      No settings synced yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
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
