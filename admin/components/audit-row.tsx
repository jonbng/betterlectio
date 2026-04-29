"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Row = {
  id: string;
  created_at: string;
  actor: string;
  action: string;
  target_table: string | null;
  target_id: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
};

export function AuditRow({ row }: { row: Row }) {
  const [open, setOpen] = useState(false);
  const hasDetails =
    row.before != null || row.after != null || row.metadata != null;

  return (
    <li className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => hasDetails && setOpen((o) => !o)}
        className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-muted/40 sm:px-4"
      >
        <ChevronRight
          className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-90" : ""
          } ${hasDetails ? "" : "opacity-30"}`}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              {row.action}
            </Badge>
            {row.target_table && (
              <span className="text-xs text-muted-foreground">
                {row.target_table}
                {row.target_id ? `:${row.target_id}` : ""}
              </span>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {new Date(row.created_at).toLocaleString("da-DK")}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">by {row.actor}</div>
        </div>
      </button>
      {open && hasDetails && (
        <div className="grid gap-3 bg-muted/40 px-3 pb-3 pt-1 text-xs sm:grid-cols-3 sm:px-4">
          <Block label="Before" value={row.before} />
          <Block label="After" value={row.after} />
          <Block label="Metadata" value={row.metadata} />
        </div>
      )}
    </li>
  );
}

function Block({ label, value }: { label: string; value: unknown }) {
  if (value == null) return null;
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <pre className="overflow-x-auto rounded-md border bg-background px-2 py-1.5 font-mono text-[11px] leading-snug">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
