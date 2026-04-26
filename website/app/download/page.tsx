import Link from "next/link"

import { DOWNLOAD_LINKS } from "@/lib/download-links"

const platforms = [
  {
    name: "iOS",
    description: "Native app til iPhone og iPad",
    href: "/download/ios",
    cta: "App Store",
  },
  {
    name: "Safari",
    description: "Bruger samme app som iOS",
    href: DOWNLOAD_LINKS.safari,
    cta: "App Store",
  },
  {
    name: "Chrome",
    description: "Browser-udvidelse til Chrome og Brave",
    href: DOWNLOAD_LINKS.chrome,
    cta: "Chrome Web Store",
  },
  {
    name: "Firefox",
    description: "Browser-udvidelse til Firefox",
    href: DOWNLOAD_LINKS.firefox,
    cta: "Add-ons",
  },
  {
    name: "Edge",
    description: "Browser-udvidelse til Microsoft Edge",
    href: DOWNLOAD_LINKS.edge,
    cta: "Edge Add-ons",
  },
]

export default function DownloadPage() {
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

        <p className="download-subtitle">Vælg din platform.</p>

        <div className="platform-grid">
          {platforms.map((platform) => {
            const inner = (
              <>
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

            const isExternal = platform.href.startsWith("http")
            if (isExternal) {
              return (
                <a
                  key={platform.name}
                  href={platform.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="platform-card"
                >
                  {inner}
                </a>
              )
            }

            return (
              <Link key={platform.name} href={platform.href} className="platform-card">
                {inner}
              </Link>
            )
          })}
        </div>
      </main>
    </div>
  )
}
