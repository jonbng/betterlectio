import { useEffect, useMemo, useState } from "preact/hooks";
import { createPortal } from "preact/compat";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  GraduationCap,
  Link2,
  List,
  MapPin,
  User,
  X,
} from "lucide-react";
import {
  fetchActivityDetail,
  getCachedActivityDetail,
  postbackNavigateActivity,
  type ActivityDetail,
  type ActivityHomeworkItem,
} from "@/lib/activity-detail";
import { getHoldDisplayName, getHoldHue } from "@/lib/hold-mapping";
import { getTeacherName, loadTeacherNames, type TeacherCache } from "@/lib/teacher-cache";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { cn } from "@/lib/utils";

interface ActivityClassModalProps {
  open: boolean;
  url: string | null;
  onOpenChange: (open: boolean) => void;
}

export function ActivityClassModal({ open, url, onOpenChange }: ActivityClassModalProps) {
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [navError, setNavError] = useState<string | null>(null);
  const [lastNavTarget, setLastNavTarget] = useState<string | null>(null);
  const [teacherCache, setTeacherCache] = useState<TeacherCache | null>(null);

  useEffect(() => {
    if (!open || !url) return;

    const cached = getCachedActivityDetail(url);
    if (cached) {
      setDetail(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setDetail(null);
    setNavigating(false);
    setNavError(null);
    setLastNavTarget(null);
    setLoading(true);

    fetchActivityDetail(url)
      .then((next) => {
        if (cancelled) return;
        setDetail(next);
      })
      .catch(() => {
        if (cancelled) return;
        onOpenChange(false);
        window.location.href = new URL(url, window.location.origin).href;
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, url, onOpenChange]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open || !url) return;
    const schoolId = new URL(url, window.location.origin).pathname.match(/\/lectio\/(\d+)\//)?.[1];
    if (!schoolId) return;

    let cancelled = false;
    loadTeacherNames(schoolId).then((cache) => {
      if (cancelled) return;
      setTeacherCache(cache);
    });
    return () => {
      cancelled = true;
    };
  }, [open, url]);

  const teacherName = useMemo(() => {
    const rawTeacher = detail?.meta.teacher?.trim() || "";
    if (!rawTeacher) return "";

    // Handle comma-separated multiple teachers (e.g. "BRO, ED")
    const parts = rawTeacher.split(",").map((s) => s.trim()).filter(Boolean);
    const resolved = parts.map((part) => {
      const fullNameMatch = part.match(/^(.+?)\s*\(([^)]+)\)$/);
      if (fullNameMatch) {
        return fullNameMatch[1].trim() || part;
      }

      const initialsMatch = part.match(/^[A-ZÆØÅ]{1,5}$/);
      if (initialsMatch && teacherCache) {
        return getTeacherName(teacherCache, part) || part;
      }

      return part;
    });

    return resolved.join(", ");
  }, [detail?.meta.teacher, teacherCache]);

  if (!open || !url) return null;

  const holdHue = detail?.meta.hold ? getHoldHue(detail.meta.hold) : 265;
  const holdDisplayName = detail?.meta.hold ? getHoldDisplayName(detail.meta.hold) : "";
  const resolvedTitle = (() => {
    if (!detail) return "";
    const rawTitle = detail.meta.title?.trim() || "";
    const holdCode = detail.meta.hold?.trim() || "";
    if (!rawTitle) return holdDisplayName || "Aktivitet";
    if (holdCode && rawTitle === holdCode && holdDisplayName && holdDisplayName !== holdCode) {
      return holdDisplayName;
    }
    return rawTitle;
  })();

  const navigateByPostback = async (eventTarget: string | null) => {
    if (!detail || !eventTarget || navigating) return;
    setLastNavTarget(eventTarget);
    setNavError(null);
    setNavigating(true);
    try {
      const next = await postbackNavigateActivity(detail, eventTarget);
      setDetail(next);
      setNavError(null);
    } catch {
      setNavError("Kunne ikke hente næste aktivitet.");
    } finally {
      setNavigating(false);
    }
  };

  const hasContent = !!detail?.note || (detail?.homework.length ?? 0) > 0 || (detail?.otherContent?.length ?? 0) > 0 || (detail?.related.length ?? 0) > 0;
  const metaLine = [detail?.meta.dateText, detail?.meta.timeText, detail?.meta.moduleText]
    .filter(Boolean)
    .join(" \u00b7 ");

  const iconButtonClass =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30";
  const holdNavControlClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30";

  const sheet = (
    <div className="fixed inset-0 z-150 flex justify-end pointer-events-auto" role="dialog" aria-modal="true" aria-label="Aktivitetsdetaljer">
      <div
        className="absolute inset-0 bg-[oklch(0_0_0/0.42)] backdrop-blur-[6px] animate-[act-sheet-fade-in_0.2s_ease]"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      <aside
        className="relative flex h-screen w-[560px] max-w-screen flex-col overflow-hidden border-l border-border bg-background shadow-[-12px_0_48px_oklch(0_0_0/0.12)] animate-[act-sheet-slide-in_0.3s_cubic-bezier(0.16,1,0.3,1)] dark:shadow-[-12px_0_48px_oklch(0_0_0/0.45)] max-[600px]:absolute max-[600px]:bottom-0 max-[600px]:right-0 max-[600px]:h-auto max-[600px]:max-h-[92vh] max-[600px]:w-screen max-[600px]:rounded-t-2xl max-[600px]:border-l-0 max-[600px]:border-t max-[600px]:animate-[act-sheet-mobile-in_0.3s_cubic-bezier(0.16,1,0.3,1)]"
        style={{ "--accent-hue": holdHue } as any}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute left-0 right-0 top-0 z-2 h-[3px] bg-[oklch(0.58_0.18_var(--accent-hue,265))] max-[600px]:rounded-t-2xl dark:bg-[oklch(0.6_0.13_var(--accent-hue,265))]" />
        {loading || !detail ? (
          <div className="flex flex-col gap-4 px-7 py-7">
            <div className="h-7 w-[65%] rounded-lg bg-[linear-gradient(90deg,var(--muted),color-mix(in_oklch,var(--muted)_55%,var(--background)),var(--muted))] bg-size-[200%_100%] animate-[act-sheet-shimmer_1.3s_linear_infinite]" />
            <div className="h-4 w-[45%] rounded-lg bg-[linear-gradient(90deg,var(--muted),color-mix(in_oklch,var(--muted)_55%,var(--background)),var(--muted))] bg-size-[200%_100%] animate-[act-sheet-shimmer_1.3s_linear_infinite]" />
            <div className="mt-2 h-32 w-full rounded-lg bg-[linear-gradient(90deg,var(--muted),color-mix(in_oklch,var(--muted)_55%,var(--background)),var(--muted))] bg-size-[200%_100%] animate-[act-sheet-shimmer_1.3s_linear_infinite]" />
            <div className="h-18 w-full rounded-lg bg-[linear-gradient(90deg,var(--muted),color-mix(in_oklch,var(--muted)_55%,var(--background)),var(--muted))] bg-size-[200%_100%] animate-[act-sheet-shimmer_1.3s_linear_infinite]" />
          </div>
        ) : (
          <>
            {navigating && (
              <div className="absolute left-0 right-0 top-[3px] z-3 h-0.5 overflow-hidden">
                <div className="h-full w-[35%] rounded-sm bg-[oklch(0.58_0.18_var(--accent-hue,265))] animate-[act-sheet-progress-slide_1.4s_ease-in-out_infinite]" />
              </div>
            )}

            <header className="border-b border-border px-7 pb-5 pt-6 max-[600px]:px-5 max-[600px]:pb-4 max-[600px]:pt-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className={iconButtonClass}
                    onClick={() => navigateByPostback(detail.navigation.schedule.prevEventTarget)}
                    disabled={!detail.navigation.schedule.prevEventTarget || navigating}
                    aria-label="Forrige aktivitet"
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <button
                    type="button"
                    className={iconButtonClass}
                    onClick={() => navigateByPostback(detail.navigation.schedule.nextEventTarget)}
                    disabled={!detail.navigation.schedule.nextEventTarget || navigating}
                    aria-label="Næste aktivitet"
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
                <button
                  type="button"
                  className={iconButtonClass}
                  onClick={() => onOpenChange(false)}
                  aria-label="Luk"
                >
                  <X size={17} />
                </button>
              </div>

              <h2 className="m-0 text-2xl font-bold leading-tight tracking-tight text-foreground">{resolvedTitle}</h2>

              {metaLine ? <p className="m-0 mt-2 text-base leading-snug text-muted-foreground">{metaLine}</p> : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {detail.meta.hold ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-base font-semibold text-[oklch(0.4_0.14_var(--accent-hue,265))] bg-[oklch(0.95_0.055_var(--accent-hue,265))] dark:text-[oklch(0.75_0.12_var(--accent-hue,265))] dark:bg-[oklch(0.24_0.06_var(--accent-hue,265))]">
                    <GraduationCap size={14} />
                    {holdDisplayName}
                  </span>
                ) : null}
                {teacherName ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-base text-muted-foreground">
                    <User size={15} />
                    {teacherName}
                  </span>
                ) : null}
                {detail.meta.room ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-base text-muted-foreground">
                    <MapPin size={15} />
                    {detail.meta.room}
                  </span>
                ) : null}
                {detail.phase ? (
                  <a
                    href={detail.phase.url}
                    data-no-activity-modal="true"
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-base text-muted-foreground no-underline transition-colors hover:border-[color-mix(in_oklch,var(--border)_120%,var(--foreground)_10%)] hover:bg-muted hover:text-foreground"
                  >
                    <BookOpen size={15} />
                    {detail.phase.title}
                  </a>
                ) : null}
                {detail.tabs
                  .filter((tab) => !tab.active && tab.url)
                  .map((tab) => (
                    <a
                      key={tab.label}
                      href={tab.url}
                      data-no-activity-modal="true"
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-base text-muted-foreground no-underline transition-colors hover:border-[color-mix(in_oklch,var(--border)_120%,var(--foreground)_10%)] hover:bg-muted hover:text-foreground"
                    >
                      <Link2 size={15} />
                      {tab.label}
                    </a>
                  ))}
              </div>
            </header>

            {navError ? (
              <div
                className="mx-7 mt-3 flex items-center justify-between gap-2.5 rounded-[0.625rem] border border-[oklch(0.83_0.07_65)] bg-[oklch(0.97_0.03_65)] px-3.5 py-2.5 text-sm text-[oklch(0.38_0.08_65)] dark:border-[oklch(0.45_0.06_65)] dark:bg-[oklch(0.22_0.03_65)] dark:text-[oklch(0.82_0.07_65)]"
                role="status"
                aria-live="polite"
              >
                <span>{navError}</span>
                <div className="inline-flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    className="cursor-pointer rounded-lg border border-[oklch(0.78_0.06_65)] bg-[oklch(0.94_0.04_65)] px-2.5 py-1 text-sm font-semibold text-[oklch(0.36_0.08_65)] transition-colors hover:bg-[oklch(0.91_0.05_65)] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[oklch(0.42_0.05_65)] dark:bg-[oklch(0.26_0.03_65)] dark:text-[oklch(0.82_0.06_65)] dark:hover:bg-[oklch(0.3_0.04_65)]"
                    onClick={() => navigateByPostback(lastNavTarget)}
                    disabled={!lastNavTarget || navigating}
                  >
                    Prøv igen
                  </button>
                  <button
                    type="button"
                    className="cursor-pointer rounded-lg border border-border bg-background px-2.5 py-1 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => setNavError(null)}
                  >
                    Luk
                  </button>
                </div>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6 max-[600px]:px-5 max-[600px]:py-[1.15rem]">
              {!hasContent ? (
                <div className="flex flex-col items-center justify-center gap-3.5 px-6 py-16 text-center text-muted-foreground">
                  <FileText size={32} strokeWidth={1.2} />
                  <p className="m-0 text-base leading-relaxed">Ingen yderligere information for denne aktivitet.</p>
                </div>
              ) : null}

              {detail.note ? (
                <section className="mb-8 last:mb-0">
                  <h3 className="mb-3.5 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.08em] text-muted-foreground">Note</h3>
                  <div className="rounded-r-[0.625rem] border-l-[3px] px-[1.15rem] py-4 text-base leading-[1.65] text-foreground whitespace-pre-wrap bg-[color-mix(in_oklch,var(--muted)_45%,transparent)] border-l-[oklch(0.58_0.12_var(--accent-hue,265))] dark:border-l-[oklch(0.5_0.08_var(--accent-hue,265))]">
                    {detail.note}
                  </div>
                </section>
              ) : null}

              {detail.homework.length > 0 ? (
                <section className="mb-8 last:mb-0">
                  <h3 className="mb-3.5 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Lektier
                    <span className="inline-flex h-[1.35rem] min-w-[1.35rem] items-center justify-center rounded-full bg-muted px-1 text-xs font-semibold normal-case tracking-normal text-muted-foreground">
                      {detail.homework.length}
                    </span>
                  </h3>
                  <div className="flex flex-col gap-3">
                    {detail.homework.map((item) => (
                      <HomeworkCard key={item.id} item={item} />
                    ))}
                  </div>
                </section>
              ) : null}

              {(detail.otherContent?.length ?? 0) > 0 ? (
                <section className="mb-8 last:mb-0">
                  <h3 className="mb-3.5 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Øvrigt indhold
                    <span className="inline-flex h-[1.35rem] min-w-[1.35rem] items-center justify-center rounded-full bg-muted px-1 text-xs font-semibold normal-case tracking-normal text-muted-foreground">
                      {detail.otherContent.length}
                    </span>
                  </h3>
                  <div className="flex flex-col gap-3">
                    {detail.otherContent.map((item) => (
                      <HomeworkCard key={item.id} item={item} />
                    ))}
                  </div>
                </section>
              ) : null}

              {detail.related.length > 0 ? (
                <section className="mb-8 last:mb-0">
                  <h3 className="mb-3.5 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.08em] text-muted-foreground">Relateret</h3>
                  <div className="flex flex-col gap-2">
                    {detail.related.map((item, index) => (
                      <div key={`${item.label}-${index}`} className="flex items-center justify-between gap-3 rounded-[0.625rem] border border-border px-3.5 py-2.5 text-base leading-[1.35] text-foreground">
                        <span>{item.label}</span>
                        {item.url ? (
                          <a
                            href={item.url}
                            data-no-activity-modal="true"
                            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[oklch(0.5_0.13_255)] no-underline hover:underline hover:underline-offset-2 dark:text-[oklch(0.75_0.06_265)]"
                          >
                            Åbn
                            <ExternalLink size={13} />
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground">&mdash;</span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>

            <footer className="flex items-center justify-start border-t border-border bg-[color-mix(in_oklch,var(--muted)_30%,transparent)] px-7 py-3 max-[600px]:px-5 max-[600px]:py-[0.65rem]">
              <div className="inline-flex items-center gap-2.5">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className={holdNavControlClass}
                    onClick={() => navigateByPostback(detail.navigation.hold.prevEventTarget)}
                    disabled={!detail.navigation.hold.prevEventTarget || navigating}
                    title="Forrige holdaktivitet"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  {detail.navigation.hold.listUrl ? (
                    <a
                      href={detail.navigation.hold.listUrl}
                      data-no-activity-modal="true"
                      className={holdNavControlClass}
                      title="Holdaktivitetsliste"
                    >
                      <List size={15} />
                    </a>
                  ) : (
                    <span className={cn(holdNavControlClass, "pointer-events-none opacity-30")}>
                      <List size={15} />
                    </span>
                  )}
                  <button
                    type="button"
                    className={holdNavControlClass}
                    onClick={() => navigateByPostback(detail.navigation.hold.nextEventTarget)}
                    disabled={!detail.navigation.hold.nextEventTarget || navigating}
                    title="Næste holdaktivitet"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
                <a
                  href={detail.url}
                  data-no-activity-modal="true"
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ExternalLink size={15} />
                  Åbn i Lectio
                </a>
              </div>
            </footer>
          </>
        )}
      </aside>
    </div>
  );

  const portalTarget = document.getElementById("il-root") || document.body;
  return createPortal(sheet, portalTarget);
}

function isEmptyHtml(html: string): boolean {
  // Check if HTML is effectively empty (whitespace, empty tags, &nbsp;)
  const stripped = html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
  return stripped.length === 0;
}

function HomeworkCard({ item }: { item: ActivityHomeworkItem }) {
  const hasContent = item.contentHtml && !isEmptyHtml(item.contentHtml);
  const hasLinks = item.links.length > 0;

  return (
    <article className="overflow-hidden rounded-xl border border-border">
      <h4 className={cn(
        "m-0 border-b border-border/70 bg-[color-mix(in_oklch,var(--muted)_50%,transparent)] px-[1.1rem] py-[0.85rem] text-[1.025rem] font-semibold leading-[1.35] text-foreground",
        !hasContent && !hasLinks && "border-b-0",
      )}>
        {item.title}
      </h4>

      {hasContent ? (
        <div
          className="overflow-wrap-anywhere px-[1.1rem] py-[0.9rem] text-base leading-[1.6] text-foreground [&_a]:text-[oklch(0.5_0.15_255)] [&_a]:underline [&_a]:underline-offset-2 [&_img]:mt-2 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-border [&_p]:mb-2.5 [&_p:last-child]:mb-0 dark:[&_a]:text-[oklch(0.75_0.06_265)]"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.contentHtml) }}
        />
      ) : null}

      {hasLinks ? (
        <div className={cn("flex flex-wrap gap-2 px-[1.1rem] pb-[0.85rem] pt-[0.6rem]", !hasContent && "pt-[0.85rem]")}>
          {item.links.map((link, index) => (
            <a
              key={`${link.url}-${index}`}
              href={link.url}
              data-no-activity-modal="true"
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-sm text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-foreground"
            >
              <FileText size={14} />
              {link.label}
            </a>
          ))}
        </div>
      ) : null}
    </article>
  );
}
