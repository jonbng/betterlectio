import { useEffect, useMemo, useState } from "preact/hooks";
import { createPortal } from "preact/compat";
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  GraduationCap,
  Link2,
  List,
  MapPin,
  Sparkles,
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

interface ActivityClassModalProps {
  open: boolean;
  url: string | null;
  onOpenChange: (open: boolean) => void;
}

type SectionKey = "overview" | "homework" | "related";

export function ActivityClassModal({ open, url, onOpenChange }: ActivityClassModalProps) {
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [navError, setNavError] = useState<string | null>(null);
  const [lastNavTarget, setLastNavTarget] = useState<string | null>(null);
  const [teacherCache, setTeacherCache] = useState<TeacherCache | null>(null);
  const [teacherName, setTeacherName] = useState<string>("");
  const [activeSection, setActiveSection] = useState<SectionKey>("overview");

  useEffect(() => {
    if (!open || !url) return;

    setActiveSection("overview");

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
    setTeacherName("");
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

  useEffect(() => {
    const rawTeacher = detail?.meta.teacher?.trim() || "";
    if (!rawTeacher) {
      setTeacherName("");
      return;
    }

    const fullNameMatch = rawTeacher.match(/^(.+?)\s*\(([^)]+)\)$/);
    if (fullNameMatch) {
      const fullName = fullNameMatch[1].trim();
      setTeacherName(fullName || rawTeacher);
      return;
    }

    const initialsMatch = rawTeacher.match(/^[A-ZÆØÅ]{1,5}$/);
    if (initialsMatch && teacherCache) {
      const resolved = getTeacherName(teacherCache, rawTeacher);
      setTeacherName(resolved || rawTeacher);
      return;
    }

    setTeacherName(rawTeacher);
  }, [detail?.meta.teacher, teacherCache]);

  const sections = useMemo(() => {
    const hasHomework = (detail?.homework.length ?? 0) > 0;
    const hasRelated = (detail?.related.length ?? 0) > 0;

    return [
      { id: "overview" as const, label: "Overblik" },
      { id: "homework" as const, label: "Lektier", hidden: !hasHomework },
      { id: "related" as const, label: "Relateret", hidden: !hasRelated },
    ].filter((item) => !item.hidden);
  }, [detail]);

  useEffect(() => {
    if (!sections.some((section) => section.id === activeSection)) {
      setActiveSection("overview");
    }
  }, [sections, activeSection]);

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
      setActiveSection("overview");
      setNavError(null);
    } catch {
      setNavError("Kunne ikke hente næste aktivitet. Du er stadig på den nuværende aktivitet.");
    } finally {
      setNavigating(false);
    }
  };

  const modal = (
    <div className="il-activity-modal-wrapper" role="dialog" aria-modal="true" aria-label="Aktivitetsdetaljer">
      <div className="il-activity-modal-backdrop" onClick={() => onOpenChange(false)} aria-hidden="true" />

      <div className="il-activity-modal-panel" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="il-activity-modal-close"
          onClick={() => onOpenChange(false)}
          aria-label="Luk"
        >
          <X size={16} />
        </button>

        {loading || !detail ? (
          <div className="il-activity-modal-loading">
            <div className="il-activity-modal-skeleton il-activity-modal-skeleton-title" />
            <div className="il-activity-modal-skeleton il-activity-modal-skeleton-chip" />
            <div className="il-activity-modal-skeleton il-activity-modal-skeleton-body" />
          </div>
        ) : (
          <>
            <header className="il-activity-modal-header">
              <div className="il-activity-modal-topline">
                <span className="il-activity-modal-kicker">
                  <Sparkles size={13} />
                  Aktivitet
                </span>
              </div>

              <h2 className="il-activity-modal-title">{resolvedTitle}</h2>

              <div className="il-activity-modal-meta-grid">
                {detail.meta.dateText ? (
                  <MetaItem icon={CalendarDays} label="Dato" value={detail.meta.dateText} />
                ) : null}
                {detail.meta.timeText ? <MetaItem icon={Clock} label="Tid" value={detail.meta.timeText} /> : null}
                {detail.meta.moduleText ? (
                  <MetaItem icon={Clock} label="Modul" value={detail.meta.moduleText} />
                ) : null}
                {teacherName ? <MetaItem icon={User} label="Lærer" value={teacherName} /> : null}
                {detail.meta.room ? <MetaItem icon={MapPin} label="Lokale" value={detail.meta.room} /> : null}
              </div>

              <div className="il-activity-modal-chip-row">
                {detail.meta.hold ? (
                    <span className="il-activity-modal-hold-pill" style={{ "--hold-hue": holdHue } as any}>
                      <GraduationCap size={12} />
                    {holdDisplayName}
                  </span>
                ) : null}

                {detail.phase ? (
                  <a
                    href={detail.phase.url}
                    data-no-activity-modal="true"
                    className="il-activity-modal-chip-link"
                  >
                    <BookOpen size={12} />
                    Forløb: {detail.phase.title}
                  </a>
                ) : null}

                {detail.tabs
                  .filter((tab) => !tab.active && tab.url)
                  .map((tab) => (
                    <a
                      key={tab.label}
                      href={tab.url}
                      data-no-activity-modal="true"
                      className="il-activity-modal-chip-link"
                    >
                      <Link2 size={12} />
                      {tab.label}
                    </a>
                  ))}
              </div>
            </header>

            <nav className="il-activity-modal-sections" aria-label="Sektioner">
              {sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className={`il-activity-modal-section-btn${activeSection === section.id ? " is-active" : ""}`}
                  onClick={() => setActiveSection(section.id)}
                >
                  {section.label}
                </button>
              ))}
            </nav>

            <div className="il-activity-modal-navbars">
              <div className="il-activity-modal-navblock">
                <span className="il-activity-modal-navlabel">{detail.navigation.schedule.label}</span>
                <div className="il-activity-modal-navactions">
                  <button
                    type="button"
                    className="il-activity-modal-navbtn"
                    onClick={() => navigateByPostback(detail.navigation.schedule.prevEventTarget)}
                    disabled={!detail.navigation.schedule.prevEventTarget || navigating}
                  >
                    <ChevronLeft size={13} />
                    Forrige
                  </button>
                  <button
                    type="button"
                    className="il-activity-modal-navbtn"
                    onClick={() => navigateByPostback(detail.navigation.schedule.nextEventTarget)}
                    disabled={!detail.navigation.schedule.nextEventTarget || navigating}
                  >
                    Næste
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>

              <div className="il-activity-modal-navblock">
                <span className="il-activity-modal-navlabel">Holdets aktiviteter</span>
                <div className="il-activity-modal-navactions">
                  <button
                    type="button"
                    className="il-activity-modal-navbtn"
                    onClick={() => navigateByPostback(detail.navigation.hold.prevEventTarget)}
                    disabled={!detail.navigation.hold.prevEventTarget || navigating}
                  >
                    <ChevronLeft size={13} />
                    Forrige
                  </button>
                  {detail.navigation.hold.listUrl ? (
                    <a
                      href={detail.navigation.hold.listUrl}
                      data-no-activity-modal="true"
                      className="il-activity-modal-navlink"
                    >
                      <List size={13} />
                      Liste
                    </a>
                  ) : (
                    <span className="il-activity-modal-navlink is-disabled">
                      <List size={13} />
                      Liste
                    </span>
                  )}
                  <button
                    type="button"
                    className="il-activity-modal-navbtn"
                    onClick={() => navigateByPostback(detail.navigation.hold.nextEventTarget)}
                    disabled={!detail.navigation.hold.nextEventTarget || navigating}
                  >
                    Næste
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            </div>

            {navError ? (
              <div className="il-activity-modal-nav-error" role="status" aria-live="polite">
                <span>{navError}</span>
                <div className="il-activity-modal-nav-error-actions">
                  <button
                    type="button"
                    className="il-activity-modal-nav-error-btn"
                    onClick={() => navigateByPostback(lastNavTarget)}
                    disabled={!lastNavTarget || navigating}
                  >
                    Prøv igen
                  </button>
                  <button
                    type="button"
                    className="il-activity-modal-nav-error-btn is-ghost"
                    onClick={() => setNavError(null)}
                  >
                    Luk
                  </button>
                </div>
              </div>
            ) : null}

            <div className="il-activity-modal-body">
              {activeSection === "overview" ? (
                <section className="il-activity-modal-overview">
                  {detail.note ? (
                    <article className="il-activity-modal-note-card">
                      <h3>Note</h3>
                      <p>{detail.note}</p>
                    </article>
                  ) : (
                    <article className="il-activity-modal-note-card is-empty">
                      <h3>Note</h3>
                      <p>Ingen note tilknyttet denne aktivitet.</p>
                    </article>
                  )}

                  {detail.homework.length > 0 ? (
                    <article className="il-activity-modal-note-card">
                      <h3>Lektier</h3>
                      <p>
                        {detail.homework.length} lektiepunkt
                        {detail.homework.length === 1 ? "" : "er"} tilgængelig
                        {detail.homework.length === 1 ? "" : "e"}.
                      </p>
                    </article>
                  ) : null}
                </section>
              ) : null}

              {activeSection === "homework" ? (
                <section className="il-activity-modal-homework-list">
                  {detail.homework.map((item) => (
                    <HomeworkCard key={item.id} item={item} />
                  ))}
                </section>
              ) : null}

              {activeSection === "related" ? (
                <section className="il-activity-modal-related-list">
                  {detail.related.map((item, index) => (
                    <div key={`${item.label}-${index}`} className="il-activity-modal-related-item">
                      <div className="il-activity-modal-related-text">
                        <span>{item.label}</span>
                      </div>
                      {item.url ? (
                        <a href={item.url} data-no-activity-modal="true" className="il-activity-modal-related-link">
                          Åbn
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span className="il-activity-modal-related-muted">Ingen side</span>
                      )}
                    </div>
                  ))}
                </section>
              ) : null}
            </div>

            <footer className="il-activity-modal-footer">
              <a href={detail.url} data-no-activity-modal="true" className="il-activity-modal-open-link">
                Åbn i Lectio
                <ExternalLink size={13} />
              </a>
            </footer>
          </>
        )}
      </div>
    </div>
  );

  const portalTarget = document.getElementById("il-root") || document.body;
  return createPortal(modal, portalTarget);
}

function MetaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="il-activity-modal-meta-item">
      <span className="il-activity-modal-meta-label">
        <Icon size={12} />
        {label}
      </span>
      <span className="il-activity-modal-meta-value">{value}</span>
    </div>
  );
}

function HomeworkCard({ item }: { item: ActivityHomeworkItem }) {
  return (
    <article className="il-activity-modal-homework-card">
      <header className="il-activity-modal-homework-head">
        <h3>{item.title}</h3>
      </header>

      {item.contentHtml ? (
        <div className="il-activity-modal-homework-content" dangerouslySetInnerHTML={{ __html: item.contentHtml }} />
      ) : (
        <p className="il-activity-modal-homework-empty">Intet ekstra indhold.</p>
      )}

      {item.links.length > 0 ? (
        <div className="il-activity-modal-homework-links">
          {item.links.map((link, index) => (
            <a key={`${link.url}-${index}`} href={link.url} data-no-activity-modal="true" className="il-activity-modal-homework-link">
              <FileText size={12} />
              {link.label}
            </a>
          ))}
        </div>
      ) : null}
    </article>
  );
}
