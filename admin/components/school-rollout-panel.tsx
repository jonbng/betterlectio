"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setAppEligibilityForSchoolClasses } from "@/app/(dashboard)/students/actions";

type ClassRow = { name: string; count: number };

export function SchoolRolloutPanel({
  schoolId,
  classes,
}: {
  schoolId: number;
  classes: ClassRow[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const totalSelected = classes
    .filter((c) => selected.has(c.name))
    .reduce((a, b) => a + b.count, 0);

  const apply = (eligible: boolean) => {
    if (selected.size === 0) return;
    start(async () => {
      setMessage(null);
      const res = await setAppEligibilityForSchoolClasses(
        schoolId,
        Array.from(selected),
        eligible,
      );
      setMessage(
        `Updated ${res.updated} student${res.updated === 1 ? "" : "s"} (${
          eligible ? "eligible" : "not eligible"
        }).`,
      );
      setSelected(new Set());
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Roll out iOS invite
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Pick classes to mark <span className="font-mono">app_eligible</span>.
          Logged in audit.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {classes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No classes</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {classes.map((c) => {
              const active = selected.has(c.name);
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => toggle(c.name)}
                  className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  {c.name}
                  <span
                    className={`ml-1.5 ${
                      active
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground"
                    }`}
                  >
                    {c.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {selected.size} class{selected.size === 1 ? "" : "es"} ·{" "}
            {totalSelected} student{totalSelected === 1 ? "" : "s"}
          </Badge>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <Button
              size="sm"
              disabled={pending || selected.size === 0}
              onClick={() => apply(true)}
            >
              {pending ? "Working…" : "Mark eligible"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending || selected.size === 0}
              onClick={() => apply(false)}
            >
              Mark not eligible
            </Button>
          </div>
        </div>

        {message && (
          <p className="text-xs text-muted-foreground">{message}</p>
        )}
      </CardContent>
    </Card>
  );
}
