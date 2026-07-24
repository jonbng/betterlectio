import { useEffect, useState } from "preact/hooks";
import { Check, Copy, Loader2, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { capture, captureFeatureUsedOncePerSession, getDistinctId } from "@/lib/posthog";
import { getCachedProfile } from "@/lib/profile-cache";
import { buildReferralUrl, getReferralStats, referralUnlockProgress, type ReferralStats } from "@/lib/supabase/resources/referrals";
import {
  getPreferredStudentDisplayName,
  getPreferredStudentPictureUrl,
  useSchoolStudents,
} from "@/lib/supabase/student-lookup";
import { toast } from "sonner";

export function ReferralShareCard() {
  const profile = getCachedProfile();
  const studentId = profile?.studentId ?? null;
  const schoolId = profile?.schoolId ?? null;
  const shareUrl = studentId ? buildReferralUrl(studentId) : null;

  const { studentsMap } = useSchoolStudents(schoolId ?? "");

  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [copied, setCopied] = useState(false);

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
        text: "Prøv BetterLectio. Lectio der faktisk virker. Del med din klasse.",
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
      <div className="px-4 py-3 text-sm text-muted-foreground">
        Log ind på Lectio for at få dit invitationslink.
      </div>
    );
  }

  const conversions = stats?.conversions ?? 0;
  const clicks = stats?.totalClicks ?? 0;
  const recents = stats?.recentReferrals ?? [];
  const unlock = referralUnlockProgress(conversions);
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <>
      <div className="mx-4 mt-4 rounded-lg border border-border bg-muted/40 px-3 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[0.65rem] font-mono font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {unlock.unlocked ? "Tilpasning låst op" : "Lås tilpasning op"}
          </div>
          <div className="text-sm font-semibold tabular-nums text-foreground">
            {loadingStats ? "…" : `${Math.min(conversions, unlock.target)}/${unlock.target}`}
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-[var(--ease-out)]"
            style={{
              width: `${loadingStats ? 0 : (Math.min(conversions, unlock.target) / unlock.target) * 100}%`,
            }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {unlock.unlocked
            ? "Du har inviteret nok klassekammerater. Tilpasning kommer snart."
            : `Inviter ${unlock.remaining} klassekammerat${unlock.remaining === 1 ? "" : "er"} mere for at låse tilpasning op.`}
        </p>
      </div>

      <div className="flex flex-col gap-2 p-4 sm:flex-row">
        <div className="flex-1 min-w-0 rounded-md border border-border bg-background px-3 py-2">
          <div className="text-[0.65rem] font-mono font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Dit invitationslink
          </div>
          <div className="mt-0.5 truncate font-mono text-sm text-foreground select-all">
            betterlectio.dk/r/<span className="font-semibold">{studentId}</span>
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
                "inline-flex items-center gap-2 transition-opacity duration-150",
                copied ? "opacity-0" : "opacity-100",
              )}
            >
              <Copy className="size-4" />
              Kopiér
            </span>
            <span
              aria-hidden={!copied}
              className={cn(
                "absolute inset-0 inline-flex items-center justify-center gap-2 transition-opacity duration-150",
                copied ? "opacity-100" : "opacity-0",
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

      <div className="flex items-center gap-6 px-4 py-3 text-sm">
        <Stat
          label="Inviterede"
          value={loadingStats ? null : conversions}
          accent
        />
        <Stat label="Klik" value={loadingStats ? null : clicks} />
      </div>

      {recents.length > 0 && (
        <div className="px-4 py-3">
          <div className="text-[0.65rem] font-mono font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Senest inviterede
          </div>
          <ul className="mt-2 space-y-1.5">
            {recents.map((r) => {
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
                  className="flex items-center justify-between gap-3"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="relative size-7 shrink-0 overflow-hidden rounded-full bg-muted">
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
                    <span className="truncate text-sm text-foreground">
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
    </>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | null;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className={cn(
          "text-2xl font-semibold tabular-nums leading-none",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {value === null ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : (
          value.toLocaleString("da-DK")
        )}
      </span>
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
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
