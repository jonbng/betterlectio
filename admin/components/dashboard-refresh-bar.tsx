"use client";

import { useEffect, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { refreshDashboard } from "@/app/(dashboard)/actions";

function formatRelative(ms: number) {
  if (ms < 5_000) return "just now";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}

function formatAbsolute(date: Date) {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function DashboardRefreshBar({
  fetchedAt,
  cacheSeconds = 300,
}: {
  fetchedAt: number;
  cacheSeconds?: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  const age = Math.max(0, now - fetchedAt);
  const date = new Date(fetchedAt);

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
      <div className="flex flex-col gap-0.5 leading-tight">
        <span className="text-muted-foreground">
          Last updated{" "}
          <span className="font-medium text-foreground" title={date.toLocaleString()}>
            {formatRelative(age)}
          </span>
          <span className="text-muted-foreground/70"> · {formatAbsolute(date)}</span>
        </span>
        <span className="text-xs text-muted-foreground/70">
          Cached for {Math.round(cacheSeconds / 60)} min. PostHog also caches insights server-side —
          Refresh recalculates them (like the "Refresh" button on a PostHog insight).
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await refreshDashboard();
          })
        }
      >
        <RefreshCw className={isPending ? "animate-spin" : undefined} />
        {isPending ? "Refreshing…" : "Refresh"}
      </Button>
    </div>
  );
}
