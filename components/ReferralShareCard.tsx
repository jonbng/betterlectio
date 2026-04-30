import { useEffect, useState } from "preact/hooks";
import { Check, Copy, Loader2, Share2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { capture, captureFeatureUsedOncePerSession, getDistinctId } from "@/lib/posthog";
import { getCachedProfile } from "@/lib/profile-cache";
import { buildReferralUrl, getReferralStats, type ReferralStats } from "@/lib/supabase/resources/referrals";
import {
  getPreferredStudentDisplayName,
  getPreferredStudentPictureUrl,
  useSchoolStudents,
} from "@/lib/supabase/student-lookup";
import { toast } from "sonner";

const MILESTONES = [1, 3, 5, 10, 20, 50] as const;

function nextMilestone(n: number): number {
  for (const m of MILESTONES) {
    if (m > n) return m;
  }
  return Math.ceil((n + 1) / 25) * 25;
}

export function ReferralShareCard() {
  const profile = getCachedProfile();
  const studentId = profile?.studentId ?? null;
  const schoolId = profile?.schoolId ?? null;
  const shareUrl = studentId ? buildReferralUrl(studentId) : null;

  const { studentsMap } = useSchoolStudents(schoolId ?? "");

  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [copied, setCopied] = useState(false);
  const [animateProgress, setAnimateProgress] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!studentId) {
      setLoadingStats(false);
      return;
    }
    setLoadingStats(true);
    getReferralStats(studentId)
      .then((s) => {
        if (cancelled) return;
        setStats(s);
      })
      .finally(() => {
        if (!cancelled) setLoadingStats(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  useEffect(() => {
    if (loadingStats) return;
    const id = window.setTimeout(() => setAnimateProgress(true), 120);
    return () => window.clearTimeout(id);
  }, [loadingStats]);

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link kopieret");
      setTimeout(() => setCopied(false), 2000);
      if (studentId) {
        const distinctId = getDistinctId(studentId);
        captureFeatureUsedOncePerSession("referral_share", distinctId);
        capture("referral share link copied", distinctId, { method: "copy" });
      }
    } catch {
      toast.error("Kunne ikke kopiere link");
    }
  };

  const handleNativeShare = async () => {
    if (!shareUrl || typeof navigator.share !== "function") return;
    try {
      await navigator.share({
        title: "BetterLectio",
        text: "Prøv BetterLectio — gør Lectio suverent bedre.",
        url: shareUrl,
      });
      if (studentId) {
        capture("referral share link copied", getDistinctId(studentId), {
          method: "native_share",
        });
      }
    } catch {
      // User cancelled
    }
  };

  if (!studentId || !shareUrl) {
    return (
      <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
        Log ind på Lectio for at få dit invitationslink.
      </div>
    );
  }

  const conversions = stats?.conversions ?? 0;
  const clicks = stats?.totalClicks ?? 0;
  const recents = stats?.recentReferrals ?? [];
  const goal = nextMilestone(conversions);
  const progressPct = Math.min(100, Math.round((conversions / goal) * 100));
  const remaining = Math.max(0, goal - conversions);
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="space-y-4">
      {/* Hero card */}
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-border bg-card p-6",
          "shadow-[0_1px_2px_oklch(0_0_0/0.04),0_12px_32px_-18px_oklch(0_0_0/0.18)]",
          "opacity-0 animate-[bl-rise_400ms_var(--ease-out)_forwards]",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-20 size-60 rounded-full bg-primary/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent"
        />

        <div className="relative flex items-center gap-2 text-[0.65rem] font-mono font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" />
          Del · Inviter
        </div>

        <h3 className="relative mt-3 text-2xl font-bold tracking-tight text-foreground text-balance">
          Inviter din klasse til BetterLectio
        </h3>
        <p className="relative mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground text-pretty">
          Send dit personlige link til en klassekammerat — vi husker hvem der
          har inviteret hvem, og du kan følge med her.
        </p>

        <div className="relative mt-5 flex flex-col gap-2 sm:flex-row">
          <div
            className={cn(
              "group relative flex-1 min-w-0 overflow-hidden rounded-xl",
              "border border-primary/25 bg-background",
              "before:pointer-events-none before:absolute before:inset-0 before:rounded-xl",
              "before:bg-gradient-to-r before:from-primary/[0.06] before:via-transparent before:to-primary/[0.06]",
            )}
          >
            <div className="relative flex items-center gap-1.5 px-3.5 py-2.5">
              <span className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-primary/75 shrink-0">
                betterlectio.dk/r/
              </span>
              <span className="font-mono text-sm font-semibold text-foreground select-all truncate tabular-nums">
                {studentId}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleCopy}
              variant="default"
              className={cn(
                "relative overflow-hidden min-w-[7rem] gap-2",
                "transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.97]",
              )}
            >
              <span
                className={cn(
                  "inline-flex items-center gap-2 transition-all duration-200 ease-[var(--ease-out)]",
                  copied
                    ? "opacity-0 -translate-y-3 blur-[2px]"
                    : "opacity-100 translate-y-0 blur-0",
                )}
              >
                <Copy className="size-4" />
                Kopiér
              </span>
              <span
                aria-hidden={!copied}
                className={cn(
                  "absolute inset-0 inline-flex items-center justify-center gap-2 transition-all duration-200 ease-[var(--ease-out)]",
                  copied
                    ? "opacity-100 translate-y-0 blur-0"
                    : "opacity-0 translate-y-3 blur-[2px]",
                )}
              >
                <Check className="size-4" />
                Kopieret
              </span>
            </Button>
            {canNativeShare && (
              <Button
                type="button"
                onClick={handleNativeShare}
                variant="outline"
                className="gap-2 transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.97]"
                title="Del via systemet"
                aria-label="Del via systemet"
              >
                <Share2 className="size-4" />
                <span className="sr-only sm:not-sr-only">Del</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Goal-gradient progress */}
      <div
        className={cn(
          "relative rounded-2xl border border-border bg-card p-5",
          "opacity-0 animate-[bl-rise_400ms_var(--ease-out)_60ms_forwards]",
        )}
      >
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[0.65rem] font-mono font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Inviterede
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              {loadingStats ? (
                <Loader2 className="size-7 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <span className="text-4xl font-bold leading-none tabular-nums text-foreground">
                    {conversions}
                  </span>
                  <span className="text-sm font-medium tabular-nums text-muted-foreground">
                    af {goal}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="text-right text-xs tabular-nums text-muted-foreground">
            <div className="font-mono font-semibold uppercase tracking-[0.12em]">
              {clicks} klik
            </div>
            <div className="mt-0.5 opacity-70">på dit link</div>
          </div>
        </div>

        <div
          className="relative mt-4 h-2.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={goal}
          aria-valuenow={conversions}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary transition-[width] duration-[700ms] ease-[var(--ease-out)]"
            style={{ width: animateProgress ? `${progressPct}%` : "0%" }}
          />
          {goal > 1 &&
            MILESTONES.filter((m) => m < goal).map((m) => (
              <div
                key={m}
                aria-hidden
                className="absolute top-0 bottom-0 w-px bg-background/60"
                style={{ left: `${(m / goal) * 100}%` }}
              />
            ))}
        </div>

        <div className="mt-2 flex items-center justify-between text-[0.7rem] tabular-nums text-muted-foreground">
          <span>Næste milepæl: {goal}</span>
          {conversions > 0 ? (
            <span className="font-semibold text-primary">
              {remaining} {remaining === 1 ? "tilbage" : "tilbage"}
            </span>
          ) : (
            <span className="opacity-70">Inviter din første klassekammerat</span>
          )}
        </div>
      </div>

      {/* Recent invitees */}
      {recents.length > 0 && (
        <div
          className={cn(
            "rounded-2xl border border-border bg-card p-4",
            "opacity-0 animate-[bl-rise_400ms_var(--ease-out)_120ms_forwards]",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-[0.65rem] font-mono font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Senest inviterede
            </div>
            <div className="text-[0.65rem] font-mono tabular-nums text-muted-foreground">
              {recents.length} {recents.length === 1 ? "person" : "personer"}
            </div>
          </div>

          <ul className="mt-3 divide-y divide-border/60">
            {recents.map((r, i) => {
              const supabaseStudent = studentsMap?.get(r.studentId) ?? null;
              const display = getPreferredStudentDisplayName(
                supabaseStudent,
                r.name ?? "Anonym",
              );
              const pic = getPreferredStudentPictureUrl(supabaseStudent);
              const initial = display.trim().slice(0, 1).toUpperCase() || "·";
              return (
                <li
                  key={r.studentId}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 opacity-0 animate-[bl-rise_360ms_var(--ease-out)_forwards]"
                  style={{ animationDelay: `${160 + i * 40}ms` }}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative size-8 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border">
                      {pic ? (
                        <img
                          src={pic}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover object-top"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-xs font-semibold text-muted-foreground">
                          {initial}
                        </div>
                      )}
                    </div>
                    <span className="truncate text-sm font-medium text-foreground">
                      {display}
                    </span>
                  </div>
                  {r.attributedAt && (
                    <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                      {formatRelative(r.attributedAt)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function formatRelative(iso: string): string {
  try {
    const ts = new Date(iso).getTime();
    if (!Number.isFinite(ts)) return "";
    const diffMs = Date.now() - ts;
    const min = Math.round(diffMs / 60000);
    if (min < 1) return "lige nu";
    if (min < 60) return `${min} min siden`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr} t siden`;
    const days = Math.round(hr / 24);
    if (days < 7) return `${days} d siden`;
    return new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}
