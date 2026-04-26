"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { DOWNLOAD_LINKS } from "@/lib/download-links"

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
  const [detected, setDetected] = useState<DetectedPlatform | null>(null)

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
    <div className="brand-root brand-root--download">
      <div className="bg-grid" />

      <div className="metadata meta-tl">
        <Link href="/" className="back-link">
          ← TILBAGE
        </Link>
      </div>

      <main className="download-page">
        <h1 className="download-title">
          <span className="title-top">Hent</span>
          <span className="title-bottom">BetterLectio</span>
        </h1>

        <p className="download-subtitle">
          {unsupported
            ? `BetterLectio er endnu ikke tilgængelig på ${UNSUPPORTED_LABEL[unsupported]} — men kommer snart.`
            : "Vælg din platform."}
        </p>

        <div className="platform-grid">
          {sortedPlatforms.map((platform, i) => {
            const isPrimary =
              i === 0 && detected !== null && !unsupported && detected !== "unknown"

            const inner = (
              <>
                {isPrimary && <div className="platform-badge">Anbefalet</div>}
                <div className="platform-name">{platform.name}</div>
                <div className="platform-description">{platform.description}</div>
                <div className="platform-cta">
                  {platform.cta}
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M5 12h14M13 6l6 6-6 6"
                      stroke="currentColor"
                      strokeWidth="3"
                      fill="none"
                      strokeLinecap="square"
                    />
                  </svg>
                </div>
              </>
            )

            const className = `platform-card ${isPrimary ? "platform-card--primary" : ""}`
            const isExternal = platform.href.startsWith("http")

            if (isExternal) {
              return (
                <a
                  key={platform.key}
                  href={platform.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={className}
                >
                  {inner}
                </a>
              )
            }

            return (
              <Link key={platform.key} href={platform.href} className={className}>
                {inner}
              </Link>
            )
          })}
        </div>
      </main>
    </div>
  )
}
