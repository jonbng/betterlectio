"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

const DA_MONTH_DAY = new Intl.DateTimeFormat("da-DK", {
  day: "numeric",
  month: "long",
});
const DA_MONTH_DAY_YEAR = new Intl.DateTimeFormat("da-DK", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const DA_FULL = new Intl.DateTimeFormat("da-DK", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatJoined(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const ms = Date.now() - date.getTime();
  if (Number.isNaN(ms)) return "—";
  if (ms < 0) return DA_MONTH_DAY.format(date);

  const sec = Math.floor(ms / 1000);
  if (sec < 45) return "just now";

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} ${min === 1 ? "minute" : "minutes"} ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${hr === 1 ? "hour" : "hours"} ago`;

  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} ${day === 1 ? "day" : "days"} ago`;

  const week = Math.floor(day / 7);
  if (day < 28) return `${week} ${week === 1 ? "week" : "weeks"} ago`;

  if (day < 45) return "last month";

  const now = new Date();
  if (date.getFullYear() === now.getFullYear()) {
    return DA_MONTH_DAY.format(date);
  }
  return DA_MONTH_DAY_YEAR.format(date);
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

type PlatformFilter = "all" | "extension" | "app" | "both" | "none" | "eligible";

const PLATFORM_FILTERS: { value: PlatformFilter; label: string }[] = [
  { value: "all", label: "Any" },
  { value: "extension", label: "Extension" },
  { value: "app", label: "App" },
  { value: "both", label: "Both" },
  { value: "eligible", label: "App eligible" },
  { value: "none", label: "Neither" },
];

type JoinedFilter = "all" | "7d" | "30d" | "90d";

const JOINED_FILTERS: { value: JoinedFilter; label: string; days: number | null }[] = [
  { value: "all", label: "Any time", days: null },
  { value: "7d", label: "Last 7d", days: 7 },
  { value: "30d", label: "Last 30d", days: 30 },
  { value: "90d", label: "Last 90d", days: 90 },
];

function platformMatches(s: Student, f: PlatformFilter): boolean {
  const ext = !!s.extension_installed_at;
  const app = !!s.app_installed_at;
  switch (f) {
    case "all":
      return true;
    case "extension":
      return ext;
    case "app":
      return app;
    case "both":
      return ext && app;
    case "none":
      return !ext && !app;
    case "eligible":
      return !!s.app_eligible && !app;
  }
}

export function StudentsTable({ students }: { students: Student[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [joinedFilter, setJoinedFilter] = useState<JoinedFilter>("all");
  const [schoolIds, setSchoolIds] = useState<Set<number>>(new Set());
  const [requireBio, setRequireBio] = useState(false);
  const [requireInstagram, setRequireInstagram] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const schoolOptions = useMemo(() => {
    const map = new Map<number, { id: number; name: string; count: number }>();
    for (const s of students) {
      const entry = map.get(s.school_id);
      const name = s.schools?.name ?? `School ${s.school_id}`;
      if (entry) entry.count++;
      else map.set(s.school_id, { id: s.school_id, name, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  const joinedCutoff = useMemo(() => {
    const days = JOINED_FILTERS.find((f) => f.value === joinedFilter)?.days;
    return days != null ? Date.now() - days * 86_400_000 : null;
  }, [joinedFilter]);

  const filtered = useMemo(
    () =>
      students.filter((s) => {
        if (activityFilter !== "all" && activityState(s) !== activityFilter) {
          return false;
        }
        if (!platformMatches(s, platformFilter)) return false;
        if (schoolIds.size > 0 && !schoolIds.has(s.school_id)) return false;
        if (requireBio && !s.description) return false;
        if (requireInstagram && !s.instagram) return false;
        if (joinedCutoff != null) {
          const t = new Date(s.created_at).getTime();
          if (Number.isNaN(t) || t < joinedCutoff) return false;
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
    [
      students,
      search,
      activityFilter,
      platformFilter,
      joinedCutoff,
      schoolIds,
      requireBio,
      requireInstagram,
    ],
  );

  const filtersActive =
    activityFilter !== "all" ||
    platformFilter !== "all" ||
    joinedFilter !== "all" ||
    schoolIds.size > 0 ||
    requireBio ||
    requireInstagram ||
    search.length > 0;

  const clearFilters = () => {
    setSearch("");
    setActivityFilter("all");
    setPlatformFilter("all");
    setJoinedFilter("all");
    setSchoolIds(new Set());
    setRequireBio(false);
    setRequireInstagram(false);
  };

  const toggleSchool = (id: number) =>
    setSchoolIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search by name, class, school, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                School
                {schoolIds.size > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                    {schoolIds.size}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-80 w-64 overflow-y-auto"
            >
              <DropdownMenuLabel className="flex items-center justify-between">
                <span>Schools</span>
                {schoolIds.size > 0 && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setSchoolIds(new Set())}
                  >
                    Clear
                  </button>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {schoolOptions.map((opt) => (
                <DropdownMenuCheckboxItem
                  key={opt.id}
                  checked={schoolIds.has(opt.id)}
                  onCheckedChange={() => toggleSchool(opt.id)}
                  onSelect={(e) => e.preventDefault()}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="truncate">{opt.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {opt.count}
                    </span>
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
              {schoolOptions.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  No schools
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {filtersActive && (
            <Button
              size="sm"
              variant="ghost"
              onClick={clearFilters}
              className="ml-auto text-muted-foreground"
            >
              Clear filters
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <FilterGroup label="Status">
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
          </FilterGroup>
          <FilterGroup label="Platform">
            {PLATFORM_FILTERS.map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={platformFilter === f.value ? "default" : "outline"}
                onClick={() => setPlatformFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </FilterGroup>
          <FilterGroup label="Joined">
            {JOINED_FILTERS.map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={joinedFilter === f.value ? "default" : "outline"}
                onClick={() => setJoinedFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </FilterGroup>
          <FilterGroup label="Profile">
            <Button
              size="sm"
              variant={requireBio ? "default" : "outline"}
              onClick={() => setRequireBio((v) => !v)}
            >
              Has bio
            </Button>
            <Button
              size="sm"
              variant={requireInstagram ? "default" : "outline"}
              onClick={() => setRequireInstagram((v) => !v)}
            >
              Has IG
            </Button>
          </FilterGroup>
        </div>

        <div className="text-xs text-muted-foreground">
          Showing {filtered.length} of {students.length}
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
                  <TableCell
                    className="text-right text-sm text-muted-foreground whitespace-nowrap"
                    title={DA_FULL.format(new Date(s.created_at))}
                  >
                    {formatJoined(s.created_at)}
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

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
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
