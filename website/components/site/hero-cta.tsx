"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { siteButton, type SiteButtonVariant } from "@/components/site/styles"
import { DOWNLOAD_LINKS } from "@/lib/download-links"
import { captureDownloadClicked } from "@/lib/posthog"

type Detected =
  | "chrome"
  | "firefox"
  | "edge"
  | "ios"
  | "android"
  | "safari-desktop"
  | "unknown"

function detectPlatform(): Detected {
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

const BROWSER_CTA: Record<
  "chrome" | "firefox" | "edge",
  { label: string; href: string }
> = {
  chrome: { label: "Tilføj til Chrome", href: DOWNLOAD_LINKS.chrome },
  firefox: { label: "Tilføj til Firefox", href: DOWNLOAD_LINKS.firefox },
  edge: { label: "Tilføj til Edge", href: DOWNLOAD_LINKS.edge },
}

type Cta = { label: string; href: string; platform: string; external: boolean }

const GENERIC_BROWSER: Cta = {
  label: "Hent til browser",
  href: "/download",
  platform: "browser",
  external: false,
}
const APP: Cta = {
  label: "Hent app",
  href: "/download/ios",
  platform: "ios",
  external: false,
}

function CtaButton({
  cta,
  variant,
  source,
}: {
  cta: Cta
  variant: SiteButtonVariant
  source: string
}) {
  const className = siteButton(variant)
  const onClick = () =>
    captureDownloadClicked(cta.platform, { source, cta: cta.label })

  if (cta.external) {
    return (
      <a
        href={cta.href}
        className={className}
        target="_blank"
        rel="noreferrer"
        onClick={onClick}
      >
        {cta.label}
      </a>
    )
  }
  return (
    <Link href={cta.href} className={className} onClick={onClick}>
      {cta.label}
    </Link>
  )
}

export function HeroCta() {
  const [detected, setDetected] = useState<Detected | null>(null)

  useEffect(() => {
    setDetected(detectPlatform())
  }, [])

  // Before hydration (or when we can't tell) fall back to the generic pairing so
  // the CTA is always sensible and works without JS.
  let primary: Cta = GENERIC_BROWSER
  let secondary: Cta = APP

  if (detected === "ios") {
    // On iPhone/iPad the app is the obvious install.
    primary = APP
    secondary = GENERIC_BROWSER
  } else if (detected && detected in BROWSER_CTA) {
    const b = BROWSER_CTA[detected as keyof typeof BROWSER_CTA]
    primary = { label: b.label, href: b.href, platform: detected, external: true }
    secondary = APP
  }

  return (
    <>
      <div className="mt-9 flex flex-wrap gap-3.5">
        <CtaButton cta={primary} variant="primary" source="hero_primary" />
        <CtaButton cta={secondary} variant="secondary" source="hero_secondary" />
      </div>

      <a
        href={DOWNLOAD_LINKS.chrome}
        className="mt-[18px] inline-flex items-center gap-2 text-sm font-medium text-ink-muted no-underline transition-transform hover:-translate-y-px focus-visible:rounded-md focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-brand"
        target="_blank"
        rel="noreferrer"
        onClick={() =>
          captureDownloadClicked("chrome", { source: "hero_rating" })
        }
      >
        <span className="text-[13px] tracking-[1px] text-[#ff9f0a]" aria-hidden="true">
          ★★★★★
        </span>
        <span>
          <b className="font-bold text-ink">4,9</b> på Chrome Web Store · 500+ brugere
        </span>
      </a>
    </>
  )
}
