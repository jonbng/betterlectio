import Link from "next/link"

const platforms = [
  {
    name: "iOS",
    description: "Native app for iPhone og iPad",
    href: "/download/ios",
    cta: "App Store",
    available: true,
  },
  {
    name: "Chrome",
    description: "Browser-udvidelse til Chrome, Edge og Brave",
    href: "https://chromewebstore.google.com/detail/betterlectio/odhojknbcfdmaohnjbnejjdiajnhdcnf",
    cta: "Chrome Web Store",
    available: true,
  },
  {
    name: "Firefox",
    description: "Browser-udvidelse til Firefox",
    href: "https://addons.mozilla.org/en-US/firefox/addon/betterlectio/",
    cta: "Add-ons",
    available: true,
  },
  {
    name: "Android",
    description: "Native app — kommer snart",
    href: "#",
    cta: "Coming soon",
    available: false,
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

      <div className="metadata meta-tr">
        FREE TO USE — ALWAYS
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
                  {platform.available && (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M5 12h14M13 6l6 6-6 6"
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="none"
                        strokeLinecap="square"
                      />
                    </svg>
                  )}
                </div>
              </>
            )

            if (!platform.available) {
              return (
                <div key={platform.name} className="platform-card platform-card--disabled" aria-disabled>
                  {inner}
                </div>
              )
            }

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
