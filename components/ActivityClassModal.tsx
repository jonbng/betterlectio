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

    const fullNameMatch = rawTeacher.match(/^(.+?)\s*\(([^)]+)\)$/);
    if (fullNameMatch) {
      return fullNameMatch[1].trim() || rawTeacher;
    }

    const initialsMatch = rawTeacher.match(/^[A-ZÆØÅ]{1,5}$/);
    if (initialsMatch && teacherCache) {
      return getTeacherName(teacherCache, rawTeacher) || rawTeacher;
    }

    return rawTeacher;
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

  const hasContent = !!detail?.note || (detail?.homework.length ?? 0) > 0 || (detail?.related.length ?? 0) > 0;
  const metaLine = [detail?.meta.dateText, detail?.meta.timeText, detail?.meta.moduleText]
    .filter(Boolean)
    .join(" \u00b7 ");

  const sheet = (
    <div className="il-act-sheet-wrapper" role="dialog" aria-modal="true" aria-label="Aktivitetsdetaljer">
      <div className="il-act-sheet-backdrop" onClick={() => onOpenChange(false)} aria-hidden="true" />

      <aside
        className="il-act-sheet"
        style={{ "--accent-hue": holdHue } as any}
        onClick={(event) => event.stopPropagation()}
      >
        {loading || !detail ? (
          <div className="il-act-sheet-loading">
            <div className="il-act-sheet-skeleton il-act-sheet-sk-title" />
            <div className="il-act-sheet-skeleton il-act-sheet-sk-meta" />
            <div className="il-act-sheet-skeleton il-act-sheet-sk-body" />
            <div className="il-act-sheet-skeleton il-act-sheet-sk-body-sm" />
          </div>
        ) : (
          <>
            {navigating && (
              <div className="il-act-sheet-progress">
                <div className="il-act-sheet-progress-bar" />
              </div>
            )}

            <header className="il-act-sheet-header">
              <div className="il-act-sheet-header-row">
                <div className="il-act-sheet-sched-nav">
                  <button
                    type="button"
                    onClick={() => navigateByPostback(detail.navigation.schedule.prevEventTarget)}
                    disabled={!detail.navigation.schedule.prevEventTarget || navigating}
                    aria-label="Forrige aktivitet"
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateByPostback(detail.navigation.schedule.nextEventTarget)}
                    disabled={!detail.navigation.schedule.nextEventTarget || navigating}
                    aria-label="Næste aktivitet"
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
                <button
                  type="button"
                  className="il-act-sheet-close"
                  onClick={() => onOpenChange(false)}
                  aria-label="Luk"
                >
                  <X size={17} />
                </button>
              </div>

              <h2 className="il-act-sheet-title">{resolvedTitle}</h2>

              {metaLine ? <p className="il-act-sheet-datetime">{metaLine}</p> : null}

              <div className="il-act-sheet-pills">
                {detail.meta.hold ? (
                  <span className="il-act-sheet-hold-pill">
                    <GraduationCap size={14} />
                    {holdDisplayName}
                  </span>
                ) : null}
                {teacherName ? (
                  <span className="il-act-sheet-pill">
                    <User size={14} />
                    {teacherName}
                  </span>
                ) : null}
                {detail.meta.room ? (
                  <span className="il-act-sheet-pill">
                    <MapPin size={14} />
                    {detail.meta.room}
                  </span>
                ) : null}
                {detail.phase ? (
                  <a
                    href={detail.phase.url}
                    data-no-activity-modal="true"
                    className="il-act-sheet-pill is-link"
                  >
                    <BookOpen size={14} />
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
                      className="il-act-sheet-pill is-link"
                    >
                      <Link2 size={14} />
                      {tab.label}
                    </a>
                  ))}
              </div>
            </header>

            {navError ? (
              <div className="il-act-sheet-error" role="status" aria-live="polite">
                <span>{navError}</span>
                <div className="il-act-sheet-error-actions">
                  <button
                    type="button"
                    onClick={() => navigateByPostback(lastNavTarget)}
                    disabled={!lastNavTarget || navigating}
                  >
                    Prøv igen
                  </button>
                  <button type="button" className="is-ghost" onClick={() => setNavError(null)}>
                    Luk
                  </button>
                </div>
              </div>
            ) : null}

            <div className="il-act-sheet-body">
              {!hasContent ? (
                <div className="il-act-sheet-empty">
                  <FileText size={32} strokeWidth={1.2} />
                  <p>Ingen yderligere information for denne aktivitet.</p>
                </div>
              ) : null}

              {detail.note ? (
                <section className="il-act-sheet-section">
                  <h3 className="il-act-sheet-label">Note</h3>
                  <div className="il-act-sheet-note">{detail.note}</div>
                </section>
              ) : null}

              {detail.homework.length > 0 ? (
                <section className="il-act-sheet-section">
                  <h3 className="il-act-sheet-label">
                    Lektier
                    <span className="il-act-sheet-label-count">{detail.homework.length}</span>
                  </h3>
                  <div className="il-act-sheet-hw-list">
                    {detail.homework.map((item) => (
                      <HomeworkCard key={item.id} item={item} />
                    ))}
                  </div>
                </section>
              ) : null}

              {detail.related.length > 0 ? (
                <section className="il-act-sheet-section">
                  <h3 className="il-act-sheet-label">Relateret</h3>
                  <div className="il-act-sheet-rel-list">
                    {detail.related.map((item, index) => (
                      <div key={`${item.label}-${index}`} className="il-act-sheet-rel-item">
                        <span>{item.label}</span>
                        {item.url ? (
                          <a href={item.url} data-no-activity-modal="true">
                            Åbn
                            <ExternalLink size={13} />
                          </a>
                        ) : (
                          <span className="is-muted">&mdash;</span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>

            <footer className="il-act-sheet-footer">
              <div className="il-act-sheet-footer-left">
                <div className="il-act-sheet-hold-nav">
                  <button
                    type="button"
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
                      title="Holdaktivitetsliste"
                    >
                      <List size={15} />
                    </a>
                  ) : (
                    <span className="is-disabled">
                      <List size={15} />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => navigateByPostback(detail.navigation.hold.nextEventTarget)}
                    disabled={!detail.navigation.hold.nextEventTarget || navigating}
                    title="Næste holdaktivitet"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
                <a href={detail.url} data-no-activity-modal="true" className="il-act-sheet-lectio-link">
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
    <article className="il-act-sheet-hw-card">
      <h4 className="il-act-sheet-hw-title">{item.title}</h4>

      {hasContent ? (
        <div className="il-act-sheet-hw-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.contentHtml) }} />
      ) : null}

      {hasLinks ? (
        <div className="il-act-sheet-hw-links">
          {item.links.map((link, index) => (
            <a
              key={`${link.url}-${index}`}
              href={link.url}
              data-no-activity-modal="true"
              className="il-act-sheet-hw-link"
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
