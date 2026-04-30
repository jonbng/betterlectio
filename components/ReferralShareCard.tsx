import { useEffect, useState } from "preact/hooks";
import { Check, Copy, Loader2, Share2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { capture, captureFeatureUsedOncePerSession, getDistinctId } from "@/lib/posthog";
import { getCachedProfile } from "@/lib/profile-cache";
import { buildReferralUrl, getReferralStats, type ReferralStats } from "@/lib/supabase/resources/referrals";
import { toast } from "sonner";

export function ReferralShareCard() {
  const profile = getCachedProfile();
  const studentId = profile?.studentId ?? null;
  const shareUrl = studentId ? buildReferralUrl(studentId) : null;

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
        capture("referral share link copied", distinctId, {
          method: "copy",
        });
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
      // User cancelled, ignore
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
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="space-y-5">
      {/* Share link card */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-background to-background p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground">
              Inviter dine klassekammerater
            </div>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed max-w-md">
              Del dit personlige link med en klassekammerat — vi husker hvem
              der har inviteret hvem.
            </p>
          </div>
          <div className="hidden sm:flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
            <Share2 className="size-5" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-stretch gap-2">
          <code
            className={cn(
              "flex-1 min-w-[14rem] rounded-lg border border-border bg-background px-3 py-2",
              "font-mono text-sm text-foreground select-all break-all",
            )}
          >
            {shareUrl.replace(/^https?:\/\//, "")}
          </code>
          <Button
            type="button"
            onClick={handleCopy}
            variant="default"
            className="gap-2"
          >
            {copied ? (
              <>
                <Check className="size-4" />
                Kopieret
              </>
            ) : (
              <>
                <Copy className="size-4" />
                Kopiér
              </>
            )}
          </Button>
          {canNativeShare && (
            <Button
              type="button"
              onClick={handleNativeShare}
              variant="outline"
              className="gap-2"
              title="Del via systemet"
            >
              <Share2 className="size-4" />
              Del
            </Button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <StatBlock
          label="Klik"
          value={loadingStats ? null : clicks}
          hint="Hvor mange gange dit link er blevet åbnet"
        />
        <StatBlock
          label="Inviterede"
          value={loadingStats ? null : conversions}
          hint="Klassekammerater der har installeret BetterLectio"
          highlight
        />
      </div>

      {/* Recent attributed */}
      {recents.length > 0 && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Users className="size-3.5" />
            Senest inviterede
          </div>
          <ul className="mt-3 space-y-2">
            {recents.map((r) => (
              <li
                key={r.studentId}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="font-medium text-foreground truncate">
                  {r.name ?? "Anonym"}
                </span>
                {r.attributedAt && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatRelative(r.attributedAt)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatBlock({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: number | null;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card/50 p-4",
        highlight && "border-primary/30 bg-primary/5",
      )}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1.5 text-3xl font-bold tabular-nums",
          highlight ? "text-primary" : "text-foreground",
        )}
      >
        {value === null ? (
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        ) : (
          value.toLocaleString("da-DK")
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground leading-snug">{hint}</p>
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
