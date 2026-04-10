import { useState, useRef, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Printer,
  ScanLine,
  EllipsisVertical,
  CalendarRange,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PrivatAftaleDialog } from "@/components/PrivatAftaleDialog";

// ── Data ─────────────────────────────────────────────────────────────────

export interface ScheduleToolbarData {
  prevWeekUrl: string;
  nextWeekUrl: string;
  weekNumber: string;
  dateRange: string;
  year: string;
  isCurrentWeek: boolean;
  todayUrl: string | null;
  viewModes: { label: string; url: string | null }[];
  calendarUrl: string | null;
  privatAftalUrl: string | null;
  printActions: { label: string; command: string }[];
}

// ── Parser ───────────────────────────────────────────────────────────────

export function parseScheduleToolbar(
  toolbar: Element,
): ScheduleToolbarData | null {
  // Use Lectio's specific element IDs (same pattern as ProfilePage extractWeekNav)
  const prevLink = document.getElementById(
    "s_m_Content_Content_SkemaMedNavigation_datePicker_prevLnk",
  ) as HTMLAnchorElement | null;
  const nextLink = document.getElementById(
    "s_m_Content_Content_SkemaMedNavigation_datePicker_nextLnk",
  ) as HTMLAnchorElement | null;
  const weekInput = document.getElementById(
    "s_m_Content_Content_SkemaMedNavigation_datePicker_tb",
  ) as HTMLInputElement | null;

  if (!prevLink?.href || !nextLink?.href) return null;

  // Parse "Uge 12 (16/3-22/3) 2026"
  const raw = weekInput?.value ?? "";
  const match = raw.match(/Uge\s+(\d+)\s+\(([^)]+)\)\s+(\d{4})/);
  const weekNumber = match?.[1] ?? raw;
  const dateRange = match?.[2]?.replace("-", " – ") ?? "";
  const year = match?.[3] ?? "";

  // Current week detection — same logic as ProfilePage's extractWeekNav():
  // injectTodayButton() adds .il-today-btn with <a disabled> (current week)
  // or <a href="..."> (not current week). Search from document, not toolbar,
  // to match ProfilePage's `document.querySelector('.il-today-btn a')`.
  const todayBtn = document.querySelector('.il-today-btn a') as HTMLAnchorElement | null;
  const hasHref = todayBtn?.hasAttribute('href') === true;
  const isCurrentWeek = !hasHref;
  const todayUrl = isCurrentWeek ? null : (todayBtn?.getAttribute('href') ?? null);

  // View modes — target by specific IDs to avoid picking up injected elements
  const viewModes: ScheduleToolbarData["viewModes"] = [];
  const viewBtnIds = [
    "s_m_Content_Content_SkemaMedNavigation_skemaugeVisningOneWeekBtn",
    "s_m_Content_Content_SkemaMedNavigation_skemaugeVisningFourWeeksBtn",
    "s_m_Content_Content_SkemaMedNavigation_skemaugeVisningSixteenWeeksBtn",
  ];
  const viewLabels = ["1 uge", "4 uger", "16 uger"];

  viewBtnIds.forEach((id, i) => {
    const a = document.getElementById(id) as HTMLAnchorElement | null;
    if (!a) return;
    const isDisabled = a.getAttribute("disabled") !== null;
    viewModes.push({
      label: viewLabels[i],
      url: isDisabled ? null : a.href,
    });
  });

  // Calendar link
  const calendarBtn = document.getElementById(
    "s_m_Content_Content_SkemaMedNavigation_MonthCalendarBtn",
  ) as HTMLAnchorElement | null;
  const calendarUrl = calendarBtn?.href ?? null;

  // Privat aftale
  const paLink = document.getElementById(
    "s_m_Content_Content_SkemaMedNavigation_newPA",
  ) as HTMLAnchorElement | null;
  const privatAftalUrl = paLink?.href ?? null;

  // Print actions from context menu
  const printActions: ScheduleToolbarData["printActions"] = [];
  toolbar
    .querySelectorAll<HTMLAnchorElement>(".lec-context-menu a[data-command]")
    .forEach((a) => {
      const command = a.getAttribute("data-command") ?? "";
      const textNode = Array.from(a.childNodes).find(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
      );
      printActions.push({
        label: textNode?.textContent?.trim() ?? command,
        command,
      });
    });

  return {
    prevWeekUrl: prevLink.href,
    nextWeekUrl: nextLink.href,
    weekNumber,
    dateRange,
    year,
    isCurrentWeek,
    todayUrl,
    viewModes,
    calendarUrl,
    privatAftalUrl,
    printActions,
  };
}

// ── Component ────────────────────────────────────────────────────────────

export function ScheduleToolbar({ data }: { data: ScheduleToolbarData }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [paDialogOpen, setPaDialogOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeMenu(); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, closeMenu]);

  return (
    <div className="flex items-center justify-between gap-3 px-2 pt-3 pb-2 mb-2">
      {/* Left: week nav + view controls */}
      <div className="flex items-center gap-3">
        {/* Week navigator */}
        <div className="flex items-center gap-0.5">
          <a
            href={data.prevWeekUrl}
            className="inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-[color,background-color] duration-150"
            title="Forrige uge (Alt+B)"
          >
            <ChevronLeft className="size-4" />
          </a>

          <div className="flex items-baseline gap-2 px-1.5 select-none min-w-0">
            <span className="text-lg font-semibold tabular-nums text-foreground leading-none whitespace-nowrap">
              Uge {data.weekNumber}
            </span>
            {data.dateRange && (
              <span className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">
                {data.dateRange}
              </span>
            )}
          </div>

          <a
            href={data.nextWeekUrl}
            className="inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-[color,background-color] duration-150"
            title="Næste uge (Alt+N)"
          >
            <ChevronRight className="size-4" />
          </a>
        </div>

        {/* Today indicator / button */}
        {data.isCurrentWeek ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-sm font-medium select-none">
            <span className="size-1.5 rounded-full bg-primary" />
            Denne uge
          </span>
        ) : data.todayUrl ? (
          <a
            href={data.todayUrl}
            className="inline-flex items-center px-2.5 py-1 rounded-md border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-[color,background-color] duration-150 no-underline"
          >
            I dag
          </a>
        ) : null}

        {/* Divider */}
        <div className="w-px h-5 bg-border" />

        {/* View mode segmented control */}
        <div className="flex items-center rounded-lg bg-muted p-0.5 gap-0.5">
          {data.viewModes.map((mode) => {
            const isActive = mode.url === null;
            const cls = cn(
              "inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium transition-[color,background-color] duration-150 whitespace-nowrap",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            );
            return isActive ? (
              <span key={mode.label} className={cls}>{mode.label}</span>
            ) : (
              <a key={mode.label} href={mode.url!} className={cn(cls, "no-underline")}>{mode.label}</a>
            );
          })}
        </div>

        {/* Calendar link */}
        {data.calendarUrl && (
          <a
            href={data.calendarUrl}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-[color,background-color] duration-150 no-underline"
          >
            <CalendarRange className="size-3.5" />
            Måned
          </a>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1">
        {data.privatAftalUrl && (
          <>
            <button
              type="button"
              onClick={() => setPaDialogOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-[color,background-color] duration-150 active:scale-[0.97]"
            >
              <Plus className="size-3.5" />
              Privat aftale
            </button>
            <PrivatAftaleDialog
              open={paDialogOpen}
              onOpenChange={setPaDialogOpen}
              formUrl={data.privatAftalUrl}
            />
          </>
        )}

        {data.printActions.length > 0 && (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className={cn(
                "inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-[color,background-color] duration-150",
                menuOpen && "bg-muted text-foreground",
              )}
              title="Flere handlinger"
            >
              <EllipsisVertical className="size-4" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[220px] rounded-xl border border-border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95 duration-100 origin-top-right">
                {data.printActions.map((action) => (
                  <button
                    key={action.command}
                    type="button"
                    className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-sm text-popover-foreground hover:bg-accent transition-[color,background-color] duration-150 text-left"
                    onClick={() => {
                      setMenuOpen(false);
                      document
                        .querySelector<HTMLAnchorElement>(
                          `.lec-context-menu a[data-command="${action.command}"]`,
                        )
                        ?.click();
                    }}
                  >
                    {action.command === "PrintPreview" ? (
                      <ScanLine className="size-4 text-muted-foreground" />
                    ) : (
                      <Printer className="size-4 text-muted-foreground" />
                    )}
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
