import { useEffect, useMemo, useState, useCallback } from "preact/hooks";
import { createPortal } from "preact/compat";
import {
  ArrowRightLeft,
  Ban,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Layers,
  Link2,
  List,
  MapPin,
  PanelRightOpen,
  RefreshCw,
  Sparkles,
  StickyNote,
  User,
  Users,
  X,
} from "lucide-react";
import {
  fetchActivityDetail,
  postbackNavigateActivity,
  type ActivityDetail,
  type ActivityHomeworkItem,
  type ActivityRelatedItem,
  type ActivityStatus,
  type ActivityTeacherRef,
} from "@/lib/activity-detail";
import { fetchMembersFromUrls, type Member } from "@/lib/members-fetch";
import { getHoldDisplayName, getHoldHue } from "@/lib/hold-mapping";
import { getTeacherName, loadTeacherNames, type TeacherCache } from "@/lib/teacher-cache";
import { useSchoolStudents } from "@/lib/supabase/student-lookup";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { MembersPanel } from "@/components/ActivityMembersPanel";
import { ElevfeedbackSection } from "@/components/ElevfeedbackSection";
import { activityTabsExcludingElevfeedback } from "@/lib/elevfeedback";
import {
  Lightbox,
  type LightboxItem,
  extensionFromUrlOrName,
  lightboxKindForExtension,
} from "@/components/Lightbox";

interface ActivityClassFullModalProps {
  open: boolean;
  url: string | null;
  onOpenChange: (open: boolean) => void;
  onSwapViewMode?: () => void;
}

export function ActivityClassFullModal({ open, url, onOpenChange, onSwapViewMode }: ActivityClassFullModalProps) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [navError, setNavError] = useState<string | null>(null);
  const [lastNavTarget, setLastNavTarget] = useState<string | null>(null);
  const [teacherCache, setTeacherCache] = useState<TeacherCache | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [lightboxItem, setLightboxItem] = useState<LightboxItem | null>(null);

  useEffect(() => {
    if (!open || !url) return;

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
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, url, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  const schoolId = useMemo(() => {
    if (!url) return null;
    return new URL(url, window.location.origin).pathname.match(/\/lectio\/(\d+)\//)?.[1] || null;
  }, [url]);

  const { studentsMap } = useSchoolStudents(schoolId || "0");

  useEffect(() => {
    setMembersOpen(false);
    setMembers(null);
    setMembersLoading(false);
    setMembersError(null);
  }, [detail?.url]);

  useEffect(() => {
    if (!open || !url || !schoolId) return;
    let cancelled = false;
    loadTeacherNames(schoolId).then((cache) => {
      if (cancelled) return;
      setTeacherCache(cache);
    });
    return () => {
      cancelled = true;
    };
  }, [open, url, schoolId]);

  const teacherName = useMemo(() => {
    const rawTeacher = detail?.meta.teacher?.trim() || "";
    if (!rawTeacher) return "";
    const parts = rawTeacher.split(",").map((s) => s.trim()).filter(Boolean);
    const resolved = parts.map((part) => {
      const fullNameMatch = part.match(/^(.+?)\s*\(([^)]+)\)$/);
      if (fullNameMatch) return fullNameMatch[1].trim() || part;
      const initialsMatch = part.match(/^[A-ZÆØÅ]{1,5}$/);
      if (initialsMatch && teacherCache) return getTeacherName(teacherCache, part) || part;
      return part;
    });
    return resolved.join(", ");
  }, [detail?.meta.teacher, teacherCache]);

  const holdHue = detail?.meta.hold ? getHoldHue(detail.meta.hold) : 265;
  const holdDisplayName = detail?.meta.hold ? getHoldDisplayName(detail.meta.hold) : "";
  const resolvedTitle = (() => {
    if (!detail) return "";
    const rawTitle = detail.meta.title?.trim() || "";
    const holdCode = detail.meta.hold?.trim() || "";
    if (!rawTitle) return holdDisplayName || t('activityModal.defaultTitle');
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
      setNavError(t('activityModal.navError'));
    } finally {
      setNavigating(false);
    }
  };

  const holdelementId = useMemo(() => {
    const listUrl = detail?.navigation.hold.listUrl;
    if (!listUrl) return null;
    try {
      const parsed = new URL(listUrl, window.location.origin);
      return parsed.searchParams.get("holdelementid");
    } catch {
      return null;
    }
  }, [detail?.navigation.hold.listUrl]);

  const toggleMembers = useCallback(async () => {
    if (membersOpen) {
      setMembersOpen(false);
      return;
    }
    setMembersOpen(true);
    if (members) return;
    if (!holdelementId || !schoolId) {
      setMembersError(t('activityModal.membersError'));
      return;
    }
    setMembersLoading(true);
    setMembersError(null);
    try {
      const membersUrl = new URL(`/lectio/${schoolId}/subnav/members.aspx`, window.location.origin);
      membersUrl.searchParams.set("holdelementid", holdelementId);
      membersUrl.searchParams.set("showteachers", "1");
      membersUrl.searchParams.set("showstudents", "1");
      membersUrl.searchParams.set("reporttype", "withpics");
      const result = await fetchMembersFromUrls([membersUrl.href]);
      setMembers(result);
    } catch {
      setMembersError(t('activityModal.fetchMembersError'));
    } finally {
      setMembersLoading(false);
    }
  }, [membersOpen, members, holdelementId, schoolId, t]);

  if (!open || !url) return null;

  const metaLine = [detail?.meta.dateText, detail?.meta.timeText].filter(Boolean).join(" · ");

  const extraTabs = activityTabsExcludingElevfeedback(detail?.tabs ?? []).filter((t) => !t.active && t.url);
  const hasPrimary =
    !!detail?.note ||
    (detail?.homework.length ?? 0) > 0 ||
    (detail?.related.length ?? 0) > 0 ||
    !!detail?.elevfeedback;
  const hasSecondary =
    (detail?.presentation?.length ?? 0) > 0 ||
    (detail?.otherContent?.length ?? 0) > 0 ||
    !!detail?.phase ||
    extraTabs.length > 0;
  const hasContent = hasPrimary || hasSecondary;

  const accentStyle = { "--accent-hue": holdHue } as Record<string, string | number>;

  const portalTarget = document.getElementById("il-root") || document.body;

  const modal = (
    <div
      className="fixed inset-0 z-200 flex items-center justify-center pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label={t('activityModal.ariaLabel')}
      style={accentStyle}
    >
      <div
        className="absolute inset-0 bg-[oklch(0_0_0/0.55)] backdrop-blur-md animate-[act-sheet-fade-in_0.18s_ease-out]"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      <div
        className="relative z-10 mx-4 flex w-full max-w-[1080px] max-h-[88vh] flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-[0_32px_72px_-24px_oklch(0_0_0/0.45),0_12px_24px_-12px_oklch(0_0_0/0.22)] animate-[bl-act-pop_0.26s_cubic-bezier(0.23,1,0.32,1)] motion-reduce:animate-[act-sheet-fade-in_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hold-hue accent rail along the top edge */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-[oklch(0.62_0.18_var(--accent-hue))] dark:bg-[oklch(0.7_0.14_var(--accent-hue))]"
        />
        {/* Soft hold-hue glow behind the hero */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 h-64 w-[640px] rounded-full opacity-50 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, oklch(0.85 0.16 var(--accent-hue) / 0.45), transparent 70%)",
          }}
        />

        {navigating && (
          <div className="absolute inset-x-0 top-[3px] z-20 h-0.5 overflow-hidden">
            <div className="h-full w-[35%] rounded-sm bg-[oklch(0.62_0.18_var(--accent-hue))] animate-[act-sheet-progress-slide_1.4s_ease-in-out_infinite]" />
          </div>
        )}

        {loading || !detail ? (
          <ModalSkeleton />
        ) : (
          <>
            <header className="relative shrink-0 border-b border-border/70 px-8 pb-7 pt-9 max-[720px]:px-6 max-[720px]:pb-5 max-[720px]:pt-7 animate-[bl-rise_0.32s_cubic-bezier(0.23,1,0.32,1)]">
              {/* Top row: eyebrow + controls */}
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {detail.meta.hold ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.7rem] font-semibold tracking-[0.06em] text-[oklch(0.4_0.14_var(--accent-hue))] bg-[oklch(0.95_0.06_var(--accent-hue))] dark:text-[oklch(0.78_0.13_var(--accent-hue))] dark:bg-[oklch(0.26_0.06_var(--accent-hue))]">
                      <Sparkles size={12} />
                      {holdDisplayName || detail.meta.hold}
                    </span>
                  ) : null}
                  {detail.meta.status !== "normal" ? (
                    <StatusBadge status={detail.meta.status} />
                  ) : null}
                  {detail.meta.moduleText ? (
                    <>
                      <span className="opacity-40">·</span>
                      <span className="normal-case tracking-normal text-muted-foreground">{detail.meta.moduleText}</span>
                    </>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <IconButton
                    onClick={() => navigateByPostback(detail.navigation.schedule.prevEventTarget)}
                    disabled={!detail.navigation.schedule.prevEventTarget || navigating}
                    aria-label={t('activityModal.prevActivity')}
                  >
                    <ChevronLeft size={16} />
                  </IconButton>
                  <IconButton
                    onClick={() => navigateByPostback(detail.navigation.schedule.nextEventTarget)}
                    disabled={!detail.navigation.schedule.nextEventTarget || navigating}
                    aria-label={t('activityModal.nextActivity')}
                  >
                    <ChevronRight size={16} />
                  </IconButton>
                  {onSwapViewMode ? (
                    <>
                      <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
                      <IconButton
                        onClick={onSwapViewMode}
                        aria-label={t('activityModal.swapToSheet')}
                        title={t('activityModal.swapToSheet')}
                      >
                        <PanelRightOpen size={16} />
                      </IconButton>
                    </>
                  ) : null}
                  <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
                  <IconButton onClick={() => onOpenChange(false)} aria-label={t('activityModal.closeLabel')}>
                    <X size={16} />
                  </IconButton>
                </div>
              </div>

              {/* Title */}
              <h2
                id="activity-modal-title"
                className="m-0 text-3xl font-semibold leading-[1.1] tracking-tight text-balance text-foreground md:text-[2.6rem]"
              >
                {resolvedTitle}
              </h2>

              {/* Meta row */}
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-base text-muted-foreground">
                {metaLine ? (
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays size={16} className="opacity-70" />
                    <span className="text-foreground/85">{detail.meta.dateText}</span>
                  </span>
                ) : null}
                {detail.meta.timeText ? (
                  <span className="inline-flex items-center gap-2">
                    <Clock size={16} className="opacity-70" />
                    <span className="text-foreground/85 [font-variant-numeric:tabular-nums]">{detail.meta.timeText}</span>
                  </span>
                ) : null}
                {detail.meta.room ? (
                  <RoomMeta room={detail.meta.room} roomId={detail.meta.roomId} schoolId={schoolId} />
                ) : null}
                {detail.meta.teachers.length > 0 ? (
                  <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                    <User size={16} className="opacity-70" />
                    {detail.meta.teachers.map((teacher, idx) => (
                      <TeacherMetaChip
                        key={teacher.id || idx}
                        teacher={teacher}
                        displayName={resolveTeacherDisplay(teacher, teacherCache)}
                        schoolId={schoolId}
                        showSeparator={idx > 0}
                      />
                    ))}
                  </span>
                ) : teacherName ? (
                  <span className="inline-flex items-center gap-2">
                    <User size={16} className="opacity-70" />
                    <span className="text-foreground/85">{teacherName}</span>
                  </span>
                ) : null}
                {holdelementId ? (
                  <button
                    type="button"
                    onClick={toggleMembers}
                    className={cn(
                      "ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-[background-color,color,border-color] duration-150 cursor-pointer active:scale-[0.97]",
                      membersOpen
                        ? "border border-[oklch(0.62_0.14_var(--accent-hue)/0.35)] bg-[oklch(0.62_0.14_var(--accent-hue)/0.12)] text-[oklch(0.4_0.14_var(--accent-hue))] dark:text-[oklch(0.78_0.13_var(--accent-hue))]"
                        : "border border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Users size={14} />
                    {t('activityModal.participants')}
                    {members ? <span className="text-xs font-semibold opacity-60">{members.length}</span> : null}
                  </button>
                ) : null}
              </div>

              {membersOpen ? (
                <MembersPanel
                  members={members}
                  loading={membersLoading}
                  error={membersError}
                  studentsMap={studentsMap}
                  schoolId={schoolId}
                  accentHue={holdHue}
                />
              ) : null}

              {navError ? (
                <div
                  className="mt-4 flex items-center justify-between gap-2.5 rounded-xl border border-[oklch(0.83_0.07_65)] bg-[oklch(0.97_0.03_65)] px-3.5 py-2.5 text-sm text-[oklch(0.38_0.08_65)] dark:border-[oklch(0.45_0.06_65)] dark:bg-[oklch(0.22_0.03_65)] dark:text-[oklch(0.82_0.07_65)]"
                  role="status"
                  aria-live="polite"
                >
                  <span>{navError}</span>
                  <div className="inline-flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      className="cursor-pointer rounded-lg border border-[oklch(0.78_0.06_65)] bg-[oklch(0.94_0.04_65)] px-2.5 py-1 text-sm font-semibold text-[oklch(0.36_0.08_65)] transition-[background-color] duration-150 hover:bg-[oklch(0.91_0.05_65)] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[oklch(0.42_0.05_65)] dark:bg-[oklch(0.26_0.03_65)] dark:text-[oklch(0.82_0.06_65)]"
                      onClick={() => navigateByPostback(lastNavTarget)}
                      disabled={!lastNavTarget || navigating}
                    >
                      {t('activityModal.retry')}
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer rounded-lg border border-border bg-background px-2.5 py-1 text-sm font-semibold text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
                      onClick={() => setNavError(null)}
                    >
                      {t('activityModal.closeLabel')}
                    </button>
                  </div>
                </div>
              ) : null}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-8 py-7 max-[720px]:px-6 max-[720px]:py-5">
              {!hasContent ? (
                <div className="flex flex-col items-center justify-center gap-3.5 py-16 text-center text-muted-foreground">
                  <FileText size={32} strokeWidth={1.2} />
                  <p className="m-0 text-base leading-relaxed text-pretty">{t('activityModal.noContent')}</p>
                </div>
              ) : (
                <div
                  className={cn(
                    "grid gap-x-10 gap-y-8",
                    hasPrimary && hasSecondary ? "md:[grid-template-columns:minmax(0,1.55fr)_minmax(0,1fr)]" : "grid-cols-1",
                  )}
                >
                  {hasPrimary ? (
                    <div className="flex min-w-0 flex-col gap-7 animate-[bl-rise_0.4s_cubic-bezier(0.23,1,0.32,1)_60ms_both]">
                      {detail.note ? (
                        <NoteSection note={detail.note} />
                      ) : null}

                      {detail.homework.length > 0 ? (
                        <Section
                          icon={<BookOpen size={14} />}
                          label={t('activityModal.homework')}
                          count={detail.homework.length}
                          accent
                        >
                          <div className="flex flex-col gap-3">
                            {detail.homework.map((item) => (
                              <ContentCard key={item.id} item={item} primary onOpenLightbox={setLightboxItem} />
                            ))}
                          </div>
                        </Section>
                      ) : null}

                      {detail.related.length > 0 ? (
                        <Section icon={<Link2 size={14} />} label={t('activityModal.related')}>
                          <div className="flex flex-col gap-2">
                            {detail.related.map((item, index) => (
                              <RelatedRow key={`${item.label}-${index}`} item={item} />
                            ))}
                          </div>
                        </Section>
                      ) : null}

                      {detail.elevfeedback ? (
                        <ElevfeedbackSection
                          refInfo={detail.elevfeedback}
                          studentsMap={studentsMap}
                          className="mb-0"
                        />
                      ) : null}
                    </div>
                  ) : null}

                  {hasSecondary ? (
                    <div className="flex min-w-0 flex-col gap-7 animate-[bl-rise_0.4s_cubic-bezier(0.23,1,0.32,1)_120ms_both]">
                      {detail.presentation.length > 0 ? (
                        <Section icon={<Layers size={14} />} label={t('activityModal.presentation')} count={detail.presentation.length}>
                          <div className="flex flex-col gap-3">
                            {detail.presentation.map((item) => (
                              <ContentCard key={item.id} item={item} onOpenLightbox={setLightboxItem} />
                            ))}
                          </div>
                        </Section>
                      ) : null}

                      {(detail.otherContent?.length ?? 0) > 0 ? (
                        <Section icon={<StickyNote size={14} />} label={t('activityModal.otherContent')} count={detail.otherContent.length}>
                          <div className="flex flex-col gap-3">
                            {detail.otherContent.map((item) => (
                              <ContentCard key={item.id} item={item} onOpenLightbox={setLightboxItem} />
                            ))}
                          </div>
                        </Section>
                      ) : null}

                      {detail.phase || extraTabs.length > 0 ? (
                        <Section icon={<Link2 size={14} />} label={t('activityModal.activityLinks')}>
                          <div className="flex flex-wrap gap-2">
                            {detail.phase ? (
                              <a
                                href={detail.phase.url}
                                data-no-activity-modal="true"
                                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1.5 text-sm text-muted-foreground no-underline transition-colors duration-150 hover:bg-muted hover:text-foreground"
                              >
                                <BookOpen size={14} />
                                {detail.phase.title}
                              </a>
                            ) : null}
                            {extraTabs.map((tab) => (
                                <a
                                  key={tab.label}
                                  href={tab.url}
                                  data-no-activity-modal="true"
                                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1.5 text-sm text-muted-foreground no-underline transition-colors duration-150 hover:bg-muted hover:text-foreground"
                                >
                                  <Link2 size={14} />
                                  {tab.label}
                                </a>
                              ))}
                          </div>
                        </Section>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-[color-mix(in_oklch,var(--muted)_30%,transparent)] px-8 py-3 max-[720px]:px-6">
              <div className="flex items-center gap-1">
                <FooterControl
                  onClick={() => navigateByPostback(detail.navigation.hold.prevEventTarget)}
                  disabled={!detail.navigation.hold.prevEventTarget || navigating}
                  title={t('activityModal.prevHoldActivity')}
                >
                  <ChevronLeft size={15} />
                </FooterControl>
                {detail.navigation.hold.listUrl ? (
                  <a
                    href={detail.navigation.hold.listUrl}
                    data-no-activity-modal="true"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground no-underline transition-colors duration-150 hover:bg-muted hover:text-foreground active:scale-[0.97]"
                    title={t('activityModal.holdActivityList')}
                  >
                    <List size={15} />
                  </a>
                ) : (
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground opacity-30">
                    <List size={15} />
                  </span>
                )}
                <FooterControl
                  onClick={() => navigateByPostback(detail.navigation.hold.nextEventTarget)}
                  disabled={!detail.navigation.hold.nextEventTarget || navigating}
                  title={t('activityModal.nextHoldActivity')}
                >
                  <ChevronRight size={15} />
                </FooterControl>
                <span className="ml-2 text-sm text-muted-foreground/80 max-[720px]:hidden">
                  {t('activityModal.holdNavLabel')}
                </span>
              </div>

              <a
                href={detail.url}
                data-no-activity-modal="true"
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground no-underline transition-colors duration-150 hover:bg-muted hover:text-foreground"
              >
                <ExternalLink size={15} />
                {t('activityModal.openInLectio')}
              </a>
            </footer>
          </>
        )}
      </div>

      <Lightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />
    </div>
  );

  return createPortal(modal, portalTarget);
}

function IconButton({
  children,
  onClick,
  disabled,
  ...rest
}: {
  children: preact.ComponentChildren;
  onClick?: () => void;
  disabled?: boolean;
  "aria-label"?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30 disabled:active:scale-100"
      {...rest}
    >
      {children}
    </button>
  );
}

function FooterControl({
  children,
  onClick,
  disabled,
  title,
}: {
  children: preact.ComponentChildren;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30 disabled:active:scale-100"
    >
      {children}
    </button>
  );
}

function Section({
  icon,
  label,
  count,
  accent,
  children,
}: {
  icon: preact.ComponentChildren;
  label: string;
  count?: number;
  accent?: boolean;
  children: preact.ComponentChildren;
}) {
  return (
    <section>
      <h3
        className={cn(
          "mb-3.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em]",
          accent
            ? "text-[oklch(0.4_0.14_var(--accent-hue))] dark:text-[oklch(0.78_0.13_var(--accent-hue))]"
            : "text-muted-foreground",
        )}
      >
        <span className="opacity-80">{icon}</span>
        {label}
        {typeof count === "number" ? (
          <span
            className={cn(
              "inline-flex h-[1.35rem] min-w-[1.35rem] items-center justify-center rounded-full px-1.5 text-[0.7rem] font-semibold normal-case tracking-normal",
              accent
                ? "bg-[oklch(0.62_0.14_var(--accent-hue)/0.15)] text-[oklch(0.4_0.14_var(--accent-hue))] dark:text-[oklch(0.82_0.12_var(--accent-hue))]"
                : "bg-muted text-muted-foreground",
            )}
          >
            {count}
          </span>
        ) : null}
      </h3>
      {children}
    </section>
  );
}

function NoteSection({ note }: { note: string }) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t('activityModal.note')}
      className="relative overflow-hidden rounded-2xl border border-border bg-[color-mix(in_oklch,var(--muted)_45%,transparent)] px-5 py-4"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px] bg-[oklch(0.62_0.18_var(--accent-hue))] dark:bg-[oklch(0.55_0.13_var(--accent-hue))]"
      />
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        <StickyNote size={13} className="opacity-80" />
        {t('activityModal.note')}
      </div>
      <p className="mt-2 m-0 whitespace-pre-wrap text-base leading-[1.65] text-foreground text-pretty">{note}</p>
    </section>
  );
}

function isEmptyHtml(html: string): boolean {
  const stripped = html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  return stripped.length === 0;
}

function buildLightboxItem(url: string, name: string): LightboxItem | null {
  const ext = extensionFromUrlOrName(name) || extensionFromUrlOrName(url);
  const kind = lightboxKindForExtension(ext);
  if (!kind) return null;
  return { url, name, ext, kind };
}

function ContentCard({
  item,
  primary,
  onOpenLightbox,
}: {
  item: ActivityHomeworkItem;
  primary?: boolean;
  onOpenLightbox: (item: LightboxItem) => void;
}) {
  const hasContent = item.contentHtml && !isEmptyHtml(item.contentHtml);
  const hasLinks = item.links.length > 0;
  const hasImage = !!item.image;
  const titleAsLink = !!item.primaryLink;
  const hasBody = hasContent || hasImage || hasLinks;

  const titleLightbox = item.primaryLink
    ? buildLightboxItem(item.primaryLink.url, item.primaryLink.label || item.title)
    : null;

  const HeadingTag: any = titleAsLink ? "a" : "h4";
  const headingProps: any = titleAsLink
    ? {
        href: item.primaryLink!.url,
        target: "_blank",
        rel: "noopener noreferrer",
        "data-no-activity-modal": "true",
        onClick: titleLightbox
          ? (e: MouseEvent) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e as any).button === 1) return;
              e.preventDefault();
              onOpenLightbox(titleLightbox);
            }
          : undefined,
      }
    : {};

  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-background/60 transition-[border-color,box-shadow] duration-200",
        primary && "shadow-[0_2px_0_oklch(0_0_0/0.02),0_1px_2px_oklch(0_0_0/0.06)]",
      )}
    >
      <HeadingTag
        {...headingProps}
        className={cn(
          "m-0 block px-[1.1rem] py-[0.85rem] text-base font-semibold leading-snug text-foreground no-underline",
          hasBody && "border-b border-border/70 bg-[color-mix(in_oklch,var(--muted)_45%,transparent)]",
          titleAsLink && "flex items-center gap-2 transition-[background-color] duration-150 hover:bg-muted",
        )}
      >
        {titleAsLink ? <FileText size={15} className="shrink-0 text-muted-foreground" /> : null}
        <span className="min-w-0 break-words">{item.title}</span>
        {titleAsLink ? <ExternalLink size={13} className="ml-auto shrink-0 text-muted-foreground" /> : null}
      </HeadingTag>

      {hasImage ? (
        <button
          type="button"
          onClick={() =>
            onOpenLightbox({
              url: item.image!.src,
              name: item.image!.alt || item.title,
              ext: extensionFromUrlOrName(item.image!.src),
              kind: "image",
            })
          }
          className="block w-full cursor-zoom-in border-0 bg-[color-mix(in_oklch,var(--muted)_30%,transparent)] p-0 text-left"
          aria-label={item.image!.alt || item.title}
        >
          <img
            src={item.image!.src}
            alt={item.image!.alt || item.title}
            loading="lazy"
            className="block max-h-[480px] w-full object-contain"
          />
        </button>
      ) : null}

      {hasContent ? (
        <div
          className="overflow-wrap-anywhere px-[1.1rem] py-[0.9rem] text-base leading-[1.6] text-foreground [&_a]:text-[oklch(0.5_0.15_255)] [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_h1]:mb-2 [&_h1]:text-[1.05rem] [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-[1rem] [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-[0.95rem] [&_h3]:font-semibold [&_img]:mt-2 [&_img]:h-auto [&_img]:max-h-[480px] [&_img]:max-w-full [&_img]:w-auto [&_img]:rounded-lg [&_img]:border [&_img]:border-border [&_img]:object-contain [&_li]:mb-1.5 [&_ol]:my-2.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2.5 [&_p:last-child]:mb-0 [&_section]:grid [&_section]:gap-3 [&_ul]:my-2.5 [&_ul]:list-disc [&_ul]:pl-5 dark:[&_a]:text-[oklch(0.75_0.06_265)]"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.contentHtml) }}
        />
      ) : null}

      {hasLinks ? (
        <div className={cn("flex flex-wrap gap-2 px-[1.1rem] pb-[0.85rem] pt-[0.6rem]", !hasContent && !hasImage && "pt-[0.85rem]")}>
          {item.links.map((link, index) => {
            const lightboxItem = buildLightboxItem(link.url, link.label);
            return (
              <a
                key={`${link.url}-${index}`}
                href={link.url}
                data-no-activity-modal="true"
                target="_blank"
                rel="noopener noreferrer"
                onClick={
                  lightboxItem
                    ? (e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e as any).button === 1) return;
                        e.preventDefault();
                        onOpenLightbox(lightboxItem);
                      }
                    : undefined
                }
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-sm text-muted-foreground no-underline transition-colors duration-150 hover:bg-muted hover:text-foreground"
              >
                <FileText size={14} />
                {link.label}
              </a>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}

function ModalSkeleton() {
  return (
    <div className="flex flex-col gap-5 px-8 py-9 max-[720px]:px-6 max-[720px]:py-7">
      <div className="h-3 w-28 rounded-full bg-[linear-gradient(90deg,var(--muted),color-mix(in_oklch,var(--muted)_55%,var(--background)),var(--muted))] bg-size-[200%_100%] animate-[act-sheet-shimmer_1.3s_linear_infinite]" />
      <div className="h-9 w-[60%] rounded-xl bg-[linear-gradient(90deg,var(--muted),color-mix(in_oklch,var(--muted)_55%,var(--background)),var(--muted))] bg-size-[200%_100%] animate-[act-sheet-shimmer_1.3s_linear_infinite]" />
      <div className="h-4 w-[45%] rounded-lg bg-[linear-gradient(90deg,var(--muted),color-mix(in_oklch,var(--muted)_55%,var(--background)),var(--muted))] bg-size-[200%_100%] animate-[act-sheet-shimmer_1.3s_linear_infinite]" />
      <div className="mt-4 grid gap-6 md:[grid-template-columns:1.5fr_1fr]">
        <div className="space-y-3">
          <div className="h-3 w-24 rounded-full bg-muted" />
          <div className="h-32 rounded-xl bg-[linear-gradient(90deg,var(--muted),color-mix(in_oklch,var(--muted)_55%,var(--background)),var(--muted))] bg-size-[200%_100%] animate-[act-sheet-shimmer_1.3s_linear_infinite]" />
          <div className="h-20 rounded-xl bg-[linear-gradient(90deg,var(--muted),color-mix(in_oklch,var(--muted)_55%,var(--background)),var(--muted))] bg-size-[200%_100%] animate-[act-sheet-shimmer_1.3s_linear_infinite]" />
        </div>
        <div className="space-y-3">
          <div className="h-3 w-20 rounded-full bg-muted" />
          <div className="h-24 rounded-xl bg-[linear-gradient(90deg,var(--muted),color-mix(in_oklch,var(--muted)_55%,var(--background)),var(--muted))] bg-size-[200%_100%] animate-[act-sheet-shimmer_1.3s_linear_infinite]" />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ActivityStatus }) {
  const { t } = useTranslation();
  if (status === "normal") return null;

  const config: Record<
    Exclude<ActivityStatus, "normal">,
    { icon: preact.ComponentChildren; labelKey: string; classes: string }
  > = {
    cancelled: {
      icon: <Ban size={12} />,
      labelKey: "activityModal.statusCancelled",
      classes:
        "text-[oklch(0.42_0.16_25)] bg-[oklch(0.95_0.05_25)] dark:text-[oklch(0.82_0.13_25)] dark:bg-[oklch(0.26_0.06_25)]",
    },
    changed: {
      icon: <RefreshCw size={12} />,
      labelKey: "activityModal.statusChanged",
      classes:
        "text-[oklch(0.45_0.13_70)] bg-[oklch(0.96_0.06_70)] dark:text-[oklch(0.82_0.12_70)] dark:bg-[oklch(0.27_0.06_70)]",
    },
    moved: {
      icon: <ArrowRightLeft size={12} />,
      labelKey: "activityModal.statusMoved",
      classes:
        "text-[oklch(0.45_0.12_220)] bg-[oklch(0.95_0.05_220)] dark:text-[oklch(0.82_0.11_220)] dark:bg-[oklch(0.26_0.06_220)]",
    },
  };

  const cfg = config[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold tracking-[0.06em]",
        cfg.classes,
      )}
    >
      {cfg.icon}
      {t(cfg.labelKey as any)}
    </span>
  );
}

function buildRoomScheduleUrl(roomId: string | null, schoolId: string | null): string | null {
  if (!roomId || !schoolId) return null;
  const numeric = roomId.replace(/^RO/i, "");
  if (!numeric) return null;
  return `/lectio/${schoolId}/SkemaNy.aspx?type=lokale&lokaleid=${numeric}`;
}

function buildTeacherScheduleUrl(teacherId: string | null, schoolId: string | null): string | null {
  if (!teacherId || !schoolId) return null;
  const numeric = teacherId.replace(/^T/i, "");
  if (!numeric) return null;
  return `/lectio/${schoolId}/SkemaNy.aspx?type=laerer&laererid=${numeric}`;
}

function RoomMeta({
  room,
  roomId,
  schoolId,
}: {
  room: string;
  roomId: string | null;
  schoolId: string | null;
}) {
  const url = buildRoomScheduleUrl(roomId, schoolId);
  const inner = (
    <>
      <MapPin size={16} className="opacity-70" />
      <span className="text-foreground/85">{room}</span>
    </>
  );
  if (url) {
    return (
      <a
        href={url}
        data-no-activity-modal="true"
        className="inline-flex items-center gap-2 rounded-md text-foreground/85 no-underline transition-colors duration-150 hover:text-foreground hover:underline hover:underline-offset-2"
      >
        {inner}
      </a>
    );
  }
  return <span className="inline-flex items-center gap-2">{inner}</span>;
}

function TeacherMetaChip({
  teacher,
  displayName,
  schoolId,
  showSeparator,
}: {
  teacher: ActivityTeacherRef;
  displayName: string;
  schoolId: string | null;
  showSeparator: boolean;
}) {
  const url = buildTeacherScheduleUrl(teacher.id, schoolId);
  const label = (
    <span className="text-foreground/85">{displayName || teacher.initials}</span>
  );
  return (
    <>
      {showSeparator ? <span className="opacity-30">·</span> : null}
      {url ? (
        <a
          href={url}
          data-no-activity-modal="true"
          className="rounded-md no-underline transition-colors duration-150 hover:underline hover:underline-offset-2 hover:text-foreground"
        >
          {label}
        </a>
      ) : (
        label
      )}
    </>
  );
}

function resolveTeacherDisplay(
  teacher: ActivityTeacherRef,
  cache: TeacherCache | null,
): string {
  if (cache) {
    const resolved = getTeacherName(cache, teacher.initials);
    if (resolved) return resolved;
  }
  return teacher.initials;
}

function classifyRelatedItem(item: ActivityRelatedItem): "activity" | "document" | "external" | "other" {
  const url = item.url || "";
  if (!url) return "other";
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) return "external";
    if (/\/lc\/.*\/res\//i.test(parsed.pathname) || /dokumenthent\.aspx/i.test(parsed.pathname)) {
      return "document";
    }
    if (/aktivitet|skema|lektie/i.test(parsed.pathname)) return "activity";
    return "other";
  } catch {
    return "other";
  }
}

function RelatedRow({ item }: { item: ActivityRelatedItem }) {
  const { t } = useTranslation();
  const kind = classifyRelatedItem(item);
  const Icon =
    kind === "document"
      ? FileText
      : kind === "external"
        ? ExternalLink
        : kind === "activity"
          ? BookOpen
          : Link2;

  const content = (
    <>
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon size={14} />
      </span>
      <span className="min-w-0 flex-1 truncate text-base leading-snug text-foreground">
        {item.label}
      </span>
      {item.url ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[oklch(0.5_0.13_255)] dark:text-[oklch(0.75_0.06_265)]">
          {t('activityModal.openLink')}
          <ExternalLink size={13} />
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">&mdash;</span>
      )}
    </>
  );

  if (item.url) {
    return (
      <a
        href={item.url}
        data-no-activity-modal="true"
        className="group flex items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2.5 no-underline transition-[background-color,border-color] duration-150 hover:bg-muted hover:border-[color-mix(in_oklch,var(--border)_120%,var(--foreground)_10%)]"
      >
        {content}
      </a>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2.5">
      {content}
    </div>
  );
}
