import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { NotebookPen, Pencil, PenLine } from "lucide-react";
import {
  fetchElevfeedback,
  openElevfeedbackEditor,
  type ActivityElevfeedbackRef,
  type ElevfeedbackDetail,
  type ElevfeedbackSectionBlock,
} from "@/lib/elevfeedback";
import { getDisplayNameFromLookupId, type StudentsMap } from "@/lib/supabase/student-lookup";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

const PROSE_CLASS =
  "overflow-wrap-anywhere text-base leading-[1.6] text-foreground [&_a]:text-[oklch(0.5_0.15_255)] [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_h1]:mb-2 [&_h1]:text-[1.05rem] [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-[1rem] [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-[0.95rem] [&_h3]:font-semibold [&_img]:mt-2 [&_img]:h-auto [&_img]:max-h-[420px] [&_img]:max-w-full [&_img]:w-auto [&_img]:rounded-lg [&_img]:border [&_img]:border-border [&_img]:object-contain [&_li]:mb-1.5 [&_ol]:my-2.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2.5 [&_p:last-child]:mb-0 [&_section]:grid [&_section]:gap-3 [&_ul]:my-2.5 [&_ul]:list-disc [&_ul]:pl-5 dark:[&_a]:text-[oklch(0.75_0.06_265)]";

const PAPER_RULE =
  "bg-[repeating-linear-gradient(transparent_0_1.65rem,oklch(0.54_0.08_265/0.07)_1.65rem_calc(1.65rem+1px))] dark:bg-[repeating-linear-gradient(transparent_0_1.65rem,oklch(0.93_0.003_90/0.05)_1.65rem_calc(1.65rem+1px))]";

interface ElevfeedbackSectionProps {
  refInfo: ActivityElevfeedbackRef;
  studentsMap: StudentsMap | null;
  className?: string;
}

export function ElevfeedbackSection({ refInfo, studentsMap, className }: ElevfeedbackSectionProps) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<ElevfeedbackDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      setError(false);
      fetchElevfeedback(refInfo.url, signal)
        .then((next) => {
          if (signal?.aborted) return;
          setDetail(next);
        })
        .catch(() => {
          if (signal?.aborted) return;
          setError(true);
        })
        .finally(() => {
          if (!signal?.aborted) setLoading(false);
        });
    },
    [refInfo.url],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    const onUpdated = (event: Event) => {
      const url = (event as CustomEvent<{ url?: string }>).detail?.url;
      if (!url) return;
      try {
        if (new URL(url, window.location.origin).href !== new URL(refInfo.url, window.location.origin).href) {
          return;
        }
      } catch {
        if (url !== refInfo.url) return;
      }
      load();
    };
    window.addEventListener("betterlectio:elevfeedback-updated", onUpdated);
    return () => window.removeEventListener("betterlectio:elevfeedback-updated", onUpdated);
  }, [load, refInfo.url]);

  const writable = detail?.writable ?? false;
  const empty = detail ? detail.empty : refInfo.empty;
  const teacherSections = useMemo(
    () => (detail?.sections ?? []).filter((section) => section.kind === "teacher"),
    [detail?.sections],
  );
  const studentSections = useMemo(
    () => (detail?.sections ?? []).filter((section) => section.kind === "student"),
    [detail?.sections],
  );

  const openEditor = () => {
    if (!writable) return;
    openElevfeedbackEditor(refInfo.url);
  };

  return (
    <section className={cn("mb-8 last:mb-0", className)}>
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <h3 className="m-0 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.08em] text-muted-foreground">
          <NotebookPen size={14} strokeWidth={2.2} className="opacity-80" />
          {t("activityModal.elevfeedback")}
          {detail && !empty ? (
            <span className="inline-flex h-[1.35rem] min-w-[1.35rem] items-center justify-center rounded-full bg-muted px-1 text-xs font-semibold normal-case tracking-normal text-muted-foreground">
              {detail.sections.length}
            </span>
          ) : null}
        </h3>
        {writable ? (
          <button
            type="button"
            onClick={openEditor}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium text-foreground transition-[background-color,border-color] duration-150 hover:bg-muted"
          >
            {empty ? <PenLine size={14} /> : <Pencil size={14} />}
            {empty ? t("activityModal.elevfeedbackWrite") : t("activityModal.elevfeedbackEdit")}
          </button>
        ) : null}
      </div>

      {loading && !detail ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="h-24 w-full bg-[linear-gradient(90deg,var(--muted),color-mix(in_oklch,var(--muted)_55%,var(--background)),var(--muted))] bg-size-[200%_100%] animate-[act-sheet-shimmer_1.3s_linear_infinite]" />
        </div>
      ) : error && !detail ? (
        <p className="m-0 text-sm text-muted-foreground">{t("activityModal.elevfeedbackLoadError")}</p>
      ) : empty ? (
        <button
          type="button"
          onClick={writable ? openEditor : undefined}
          disabled={!writable}
          className={cn(
            "relative w-full overflow-hidden rounded-xl border border-dashed border-border px-4 py-5 text-left transition-[border-color,background-color] duration-150",
            PAPER_RULE,
            writable
              ? "cursor-pointer hover:border-[oklch(0.58_0.18_var(--accent-hue,265)/0.45)] hover:bg-[oklch(0.58_0.18_var(--accent-hue,265)/0.04)]"
              : "cursor-default",
          )}
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-3 left-0 w-[3px] rounded-full bg-[oklch(0.58_0.18_var(--accent-hue,265)/0.55)] dark:bg-[oklch(0.6_0.13_var(--accent-hue,265)/0.55)]"
          />
          <p className="m-0 pl-3 text-sm leading-relaxed text-muted-foreground">
            {t("activityModal.elevfeedbackEmpty")}
          </p>
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          {teacherSections.map((section) => (
            <PaperCard
              key={section.id}
              section={section}
              studentsMap={studentsMap}
              teacherLabel={t("activityModal.elevfeedbackTeacher")}
            />
          ))}
          {studentSections.map((section) => (
            <PaperCard
              key={section.id}
              section={section}
              studentsMap={studentsMap}
              teacherLabel={t("activityModal.elevfeedbackTeacher")}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PaperCard({
  section,
  studentsMap,
  teacherLabel,
}: {
  section: ElevfeedbackSectionBlock;
  studentsMap: StudentsMap | null;
  teacherLabel: string;
}) {
  const name =
    section.kind === "student" && section.authorLookupId
      ? getDisplayNameFromLookupId(studentsMap, section.authorLookupId, section.authorName)
      : section.kind === "teacher"
        ? teacherLabel
        : section.authorName || teacherLabel;

  return (
    <article className="relative overflow-hidden rounded-xl border border-border bg-background/70">
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-[3px]",
          section.kind === "teacher"
            ? "bg-[oklch(0.62_0.12_80)] dark:bg-[oklch(0.68_0.1_80)]"
            : "bg-[oklch(0.58_0.18_var(--accent-hue,265))] dark:bg-[oklch(0.6_0.13_var(--accent-hue,265))]",
        )}
      />
      <header className="flex items-center gap-2 border-b border-border/70 px-[1.1rem] py-[0.7rem]">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {section.kind === "teacher" ? teacherLabel : name}
        </span>
      </header>
      <div
        className={cn("px-[1.1rem] py-[0.9rem]", PROSE_CLASS, PAPER_RULE)}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.contentHtml) }}
      />
    </article>
  );
}
