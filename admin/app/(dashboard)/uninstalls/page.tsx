import Link from "next/link";
import {
  TrendingDown,
  CalendarRange,
  Calendar,
  School,
  Undo2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUninstallStats } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

function fullName(s: {
  lectio_first_name: string | null;
  lectio_last_name: string | null;
}) {
  return (
    [s.lectio_first_name, s.lectio_last_name].filter(Boolean).join(" ") ||
    "Unknown"
  );
}

export default async function UninstallsPage() {
  const stats = await getUninstallStats();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Uninstalls</h1>
        <p className="text-sm text-muted-foreground">
          Tracking <span className="font-mono">extension_uninstalled_at</span>{" "}
          and the optional reason / feedback collected on{" "}
          <span className="font-mono">/uninstall</span>.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:gap-4">
        <Stat icon={TrendingDown} title="Total" value={stats.total} />
        <Stat icon={Calendar} title="Last 7d" value={stats.last7} />
        <Stat icon={CalendarRange} title="Last 30d" value={stats.last30} />
        <Stat
          icon={Undo2}
          title="Reinstalled"
          value={stats.reinstalled}
          hint={
            stats.total > 0
              ? `${Math.round((stats.reinstalled / stats.total) * 100)}% recovered`
              : undefined
          }
        />
        <Stat icon={School} title="Schools" value={stats.distinctSchools} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Reason chips</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.reasonChips.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reasons recorded</p>
          ) : (
            <div className="space-y-3">
              {stats.reasonChips.map((c) => {
                const max = stats.reasonChips[0].count;
                const pct = max > 0 ? (c.count / max) * 100 : 0;
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

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Recent uninstalls ({stats.recent.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No uninstalls recorded
            </p>
          ) : (
            <ul className="space-y-3">
              {stats.recent.map((u) => {
                const school = u.schools as
                  | { name: string; display_name: string | null }
                  | null;
                return (
                  <li
                    key={u.id}
                    className="rounded-md border bg-muted/30 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Link
                        href={`/students/${u.id}`}
                        className="font-medium hover:underline"
                      >
                        {fullName(u)}
                      </Link>
                      {u.class_name && (
                        <Badge variant="outline" className="text-xs">
                          {u.class_name}
                        </Badge>
                      )}
                      {school && (
                        <span className="text-xs text-muted-foreground">
                          {school.display_name ?? school.name}
                        </span>
                      )}
                      {u.extension_reinstalled_at && (
                        <Badge
                          variant="default"
                          className="gap-1 bg-emerald-600 text-xs hover:bg-emerald-600"
                        >
                          <Undo2 className="size-3" />
                          Reinstalled{" "}
                          {new Date(
                            u.extension_reinstalled_at,
                          ).toLocaleDateString("da-DK")}
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
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: number;
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
        <div className="text-2xl font-bold">{value.toLocaleString()}</div>
        {hint && (
          <div className="text-xs text-muted-foreground">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}
