"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { setAppEligibility } from "@/app/(dashboard)/students/actions";
import {
  ACTIVE_WINDOW_DAYS,
  isActiveStudent,
} from "@/lib/active-user";

type Student = {
  id: string;
  lectio_first_name: string | null;
  lectio_last_name: string | null;
  class_name: string | null;
  school_id: number;
  extension_installed_at: string | null;
  extension_uninstalled_at: string | null;
  last_seen_at: string | null;
  app_installed_at: string | null;
  app_eligible?: boolean;
  created_at: string;
  custom_pfp_url: string | null;
  lectio_pfp_url: string | null;
  description: string | null;
  instagram: string | null;
  schools: { name: string } | null;
};

type ActivityState = "active" | "inactive" | "uninstalled" | "never";

function activityState(s: Student): ActivityState {
  if (s.extension_uninstalled_at) return "uninstalled";
  if (isActiveStudent(s)) return "active";
  if (s.last_seen_at || s.extension_installed_at) return "inactive";
  return "never";
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function studentName(s: Student) {
  return [s.lectio_first_name, s.lectio_last_name].filter(Boolean).join(" ") || "Unknown";
}

type ActivityFilter = "all" | ActivityState;

const ACTIVITY_FILTERS: { value: ActivityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "uninstalled", label: "Uninstalled" },
  { value: "never", label: "Never seen" },
];

export function StudentsTable({ students }: { students: Student[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      students.filter((s) => {
        if (activityFilter !== "all" && activityState(s) !== activityFilter) {
          return false;
        }
        if (!search) return true;
        const q = search.toLowerCase();
        const name = studentName(s).toLowerCase();
        return (
          name.includes(q) ||
          s.class_name?.toLowerCase().includes(q) ||
          s.schools?.name?.toLowerCase().includes(q) ||
          s.id.includes(q)
        );
      }),
    [students, search, activityFilter],
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((s) => selected.has(s.id));

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const s of filtered) next.delete(s.id);
      } else {
        for (const s of filtered) next.add(s.id);
      }
      return next;
    });
  };

  const apply = (eligible: boolean) => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    start(async () => {
      setMessage(null);
      const res = await setAppEligibility(ids, eligible);
      setMessage(
        `Updated ${res.updated} student${res.updated === 1 ? "" : "s"}.`,
      );
      setSelected(new Set());
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search by name, class, school, or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex flex-wrap gap-1">
          {ACTIVITY_FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={activityFilter === f.value ? "default" : "outline"}
              onClick={() => setActivityFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-y bg-background/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-md sm:border">
          <Badge variant="secondary">
            {selected.size} selected
          </Badge>
          <Button
            size="sm"
            disabled={pending}
            onClick={() => apply(true)}
          >
            Mark eligible
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => apply(false)}
          >
            Mark not eligible
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
          {message && (
            <span className="text-xs text-muted-foreground">{message}</span>
          )}
        </div>
      )}

      <div className="rounded-lg border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    className="size-4 accent-primary"
                    aria-label="Select all visible"
                  />
                </TableHead>
                <TableHead>Student</TableHead>
                <TableHead>School</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Profile</TableHead>
                <TableHead className="text-right">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer"
                  onClick={(e) => {
                    if (
                      (e.target as HTMLElement).closest(
                        "input[type='checkbox']",
                      )
                    )
                      return;
                    router.push(`/students/${s.id}`);
                  }}
                >
                  <TableCell
                    onClick={(e) => e.stopPropagation()}
                    className="w-10"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggle(s.id)}
                      className="size-4 accent-primary"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarImage
                          src={s.custom_pfp_url ?? s.lectio_pfp_url ?? undefined}
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
                        <div className="truncate text-xs text-muted-foreground font-mono">
                          {s.id}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {s.schools?.name ?? s.school_id}
                  </TableCell>
                  <TableCell className="text-sm">
                    {s.class_name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {s.extension_installed_at && (
                        <Badge variant="secondary" className="text-xs">
                          Extension
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
                  <TableCell>
                    <ActivityCell student={s} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {s.description && (
                        <Badge variant="outline" className="text-xs">
                          Bio
                        </Badge>
                      )}
                      {s.instagram && (
                        <Badge variant="outline" className="text-xs">
                          IG
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {new Date(s.created_at).toLocaleDateString("da-DK")}{" "}
                    {new Date(s.created_at).toLocaleTimeString("da-DK", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground py-8"
                  >
                    No students found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function ActivityCell({ student }: { student: Student }) {
  const state = activityState(student);
  const lastSignal = student.last_seen_at ?? student.extension_installed_at;
  const tooltip = (() => {
    const parts: string[] = [];
    if (student.last_seen_at) parts.push(`Last seen: ${formatRelative(student.last_seen_at)}`);
    if (student.extension_installed_at) parts.push(`Installed: ${formatRelative(student.extension_installed_at)}`);
    if (student.extension_uninstalled_at) parts.push(`Uninstalled: ${formatRelative(student.extension_uninstalled_at)}`);
    return parts.join("\n");
  })();

  if (state === "uninstalled") {
    return (
      <Badge variant="outline" className="text-xs" title={tooltip}>
        Uninstalled
      </Badge>
    );
  }
  if (state === "active") {
    return (
      <div className="flex items-center gap-1.5" title={tooltip}>
        <span className="size-1.5 rounded-full bg-emerald-500" />
        <span className="text-xs">{formatRelative(lastSignal)}</span>
      </div>
    );
  }
  if (state === "inactive") {
    return (
      <div className="flex items-center gap-1.5" title={tooltip}>
        <span className="size-1.5 rounded-full bg-muted-foreground/40" />
        <span className="text-xs text-muted-foreground">{formatRelative(lastSignal)}</span>
      </div>
    );
  }
  return (
    <span className="text-xs text-muted-foreground" title={`Active window: ${ACTIVE_WINDOW_DAYS}d`}>
      —
    </span>
  );
}
