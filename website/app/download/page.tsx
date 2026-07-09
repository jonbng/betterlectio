"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"

import { SiteFooter } from "@/components/site/site-footer"
import { SiteNav } from "@/components/site/site-nav"
import {
  siteContainerClass,
  siteEyebrow,
  siteMainClass,
  sitePageClass,
} from "@/components/site/styles"
import { DOWNLOAD_LINKS } from "@/lib/download-links"
import { captureDownloadClicked } from "@/lib/posthog"
import { cn } from "@/lib/utils"

type PlatformKey = "chrome" | "ios" | "firefox" | "edge"
type DetectedPlatform = PlatformKey | "safari-desktop" | "android" | "unknown"

type Platform = {
  key: PlatformKey
  name: string
  description: string
  href: string
  cta: string
}

const platforms: Platform[] = [
  {
    key: "chrome",
    name: "Chrome",
    description: "Browser-udvidelse til Chrome og Brave",
    href: DOWNLOAD_LINKS.chrome,
    cta: "Chrome Web Store",
  },
  {
    key: "ios",
    name: "iOS",
    description: "Native app til iPhone og iPad",
    href: "/download/ios",
    cta: "App Store",
  },
  {
    key: "firefox",
    name: "Firefox",
    description: "Browser-udvidelse til Firefox",
    href: DOWNLOAD_LINKS.firefox,
    cta: "Add-ons",
  },
  {
    key: "edge",
    name: "Edge",
    description: "Browser-udvidelse til Microsoft Edge",
    href: DOWNLOAD_LINKS.edge,
    cta: "Edge Add-ons",
  },
]

const UNSUPPORTED_LABEL: Record<"safari-desktop" | "android", string> = {
  "safari-desktop": "Safari",
  android: "Android",
}

function detectPlatform(): DetectedPlatform {
  if (typeof navigator === "undefined") return "unknown"
  const ua = navigator.userAgent
  const platform = navigator.platform || ""
  const maxTouchPoints = navigator.maxTouchPoints || 0

  const isIOS =
    /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1)
  if (isIOS) return "ios"

  if (/Android/i.test(ua)) return "android"
  if (/Edg\//.test(ua)) return "edge"
  if (/Firefox\//.test(ua)) return "firefox"
  if (/Chrome\//.test(ua) || /Chromium\//.test(ua)) return "chrome"
  if (/Safari\//.test(ua)) return "safari-desktop"

  return "unknown"
}

export default function DownloadPage() {
  return (
    <Suspense fallback={null}>
      <DownloadPageInner />
    </Suspense>
  )
}

function DownloadPageInner() {
  const [detected, setDetected] = useState<DetectedPlatform | null>(null)
  const searchParams = useSearchParams()
  const wasReferred = searchParams.get("ref") === "1"

  useEffect(() => {
    setDetected(detectPlatform())
  }, [])

  const sortedPlatforms =
    detected && detected !== "safari-desktop" && detected !== "android" && detected !== "unknown"
      ? [
          ...platforms.filter((p) => p.key === detected),
          ...platforms.filter((p) => p.key !== detected),
        ]
      : platforms

  const unsupported =
    detected === "safari-desktop" || detected === "android" ? detected : null

  return (
    <div className="site">
      <SiteNav />

      <main className={cn(siteMainClass, siteContainerClass, sitePageClass)}>
        <div className="mx-auto max-w-[1000px]">
          {wasReferred && (
            <div
              className="mx-auto mb-7 flex max-w-[760px] flex-col gap-1.5 rounded-[20px] border border-line bg-white px-6 py-[22px] shadow-[0_14px_34px_-20px_rgba(0,0,0,0.3)]"
              role="status"
              aria-live="polite"
            >
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-brand">
                Personlig invitation
              </span>
              <span className="text-[19px] font-extrabold tracking-[-0.01em]">
                Du blev inviteret af en klassekammerat.
              </span>
              <span className="max-w-[60ch] text-sm text-ink-muted">
                Installér udvidelsen nedenfor — så bliver invitationen automatisk
                knyttet til den, der inviterede dig.
              </span>
            </div>
          )}

          <div className="text-center">
            <span className={siteEyebrow()}>Gratis · ingen ny konto</span>
            <h1 className="mt-3.5 mb-4 text-[clamp(44px,7vw,80px)] font-extrabold leading-none tracking-[-0.04em]">
              Hent BetterLectio
            </h1>
            <p className="text-[19px] font-medium text-ink-muted">
              {unsupported
                ? `BetterLectio er endnu ikke tilgængelig på ${UNSUPPORTED_LABEL[unsupported]} — men kommer snart.`
                : "Vi har fundet din platform. Vælg hvor du vil starte."}
            </p>
          </div>

          <div className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-[18px]">
            {sortedPlatforms.map((platform, i) => {
              const isPrimary =
                i === 0 && detected !== null && !unsupported && detected !== "unknown"

              const inner = (
                <>
                  {isPrimary && (
                    <div className="absolute right-5 top-5 rounded-full bg-white/[0.22] px-2.5 py-[5px] font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-white">
                      Anbefalet
                    </div>
                  )}
                  <div
                    className={cn(
                      "font-extrabold tracking-[-0.02em]",
                      isPrimary ? "text-[34px]" : "text-[26px]",
                    )}
                  >
                    {platform.name}
                  </div>
                  <div
                    className={cn(
                      "flex-1",
                      isPrimary ? "text-base text-white/85" : "text-sm text-ink-muted",
                    )}
                  >
                    {platform.description}
                  </div>
                  <div
                    className={cn(
                      "mt-1.5 inline-flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.06em] [&_svg]:size-3.5",
                      isPrimary ? "text-white" : "text-brand",
                    )}
                  >
                    {platform.cta}
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M5 12h14M13 6l6 6-6 6"
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </>
              )

              const className = cn(
                "relative flex flex-col gap-2 rounded-[24px] border border-line bg-white p-7 text-ink no-underline shadow-[0_10px_30px_-18px_rgba(0,0,0,0.25)] transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_24px_44px_-22px_rgba(0,0,0,0.32)]",
                isPrimary &&
                  "col-span-full border-transparent bg-brand text-white shadow-[0_30px_60px_-26px_color-mix(in_oklch,var(--blue)_48%,transparent)] hover:shadow-[0_40px_70px_-28px_color-mix(in_oklch,var(--blue)_52%,transparent)]",
              )
              const isExternal = platform.href.startsWith("http")
              const onClick = () =>
                captureDownloadClicked(platform.key, {
                  detected_platform: detected ?? "unknown",
                  is_recommended: isPrimary,
                  destination: platform.href,
                })

              if (isExternal) {
                return (
                  <a
                    key={platform.key}
                    href={platform.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={className}
                    onClick={onClick}
                  >
                    {inner}
                  </a>
                )
              }

              return (
                <Link
                  key={platform.key}
                  href={platform.href}
                  className={className}
                  onClick={onClick}
                >
                  {inner}
                </Link>
              )
            })}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
