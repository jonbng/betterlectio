import Link from "next/link"

import { SiteLogoMark } from "@/components/site/site-logo"
import { siteContainerClass } from "@/components/site/styles"
import { DOWNLOAD_LINKS } from "@/lib/download-links"
import { cn } from "@/lib/utils"

const FOOTER_LINK_CLASS =
  "font-semibold text-white no-underline opacity-80 transition-[opacity,padding-left] hover:pl-1.5 hover:opacity-100"

export function SiteFooter() {
  return (
    <footer className="site-footer shrink-0 pt-[100px] pb-10 min-[720px]:pt-[130px] min-[720px]:pb-11">
      <div className={siteContainerClass}>
        <div className="mb-12 grid grid-cols-1 gap-10 min-[720px]:mb-[70px] min-[720px]:grid-cols-[2fr_1fr_1fr] min-[720px]:gap-[60px]">
          <div>
            <h2 className="mb-4 flex items-center gap-3 text-[32px] font-extrabold tracking-[-1px] min-[720px]:text-[40px]">
              <SiteLogoMark
                size={40}
                className="block shrink-0 rounded-xl [--logo-badge:#fff] [--logo-glyph:var(--blue)]"
              />
              BetterLectio
            </h2>
            <p className="max-w-[320px] opacity-80">
              En moderne brugerflade til Lectio. Bygget af elever, for elever — så
              skema, lektier og karakterer faktisk er til at bruge.
            </p>
          </div>

          <div>
            <h4 className="mb-5 text-[13px] uppercase tracking-[2px] text-volt">
              Produkt
            </h4>
            <ul className="list-none">
              <li className="mb-3">
                <Link href="/download" className={FOOTER_LINK_CLASS}>
                  Browser-udvidelse
                </Link>
              </li>
              <li className="mb-3">
                <Link href="/download/ios" className={FOOTER_LINK_CLASS}>
                  iOS-app
                </Link>
              </li>
              <li className="mb-3">
                <a
                  href={DOWNLOAD_LINKS.chrome}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={FOOTER_LINK_CLASS}
                >
                  Chrome
                </a>
              </li>
              <li className="mb-3">
                <a
                  href={DOWNLOAD_LINKS.firefox}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={FOOTER_LINK_CLASS}
                >
                  Firefox
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-5 text-[13px] uppercase tracking-[2px] text-volt">
              Info
            </h4>
            <ul className="list-none">
              <li className="mb-3">
                <Link href="/privatliv" className={FOOTER_LINK_CLASS}>
                  Privatliv
                </Link>
              </li>
              <li className="mb-3">
                <a
                  href="https://github.com/jonbng/betterlectio"
                  target="_blank"
                  rel="noreferrer noopener"
                  className={FOOTER_LINK_CLASS}
                >
                  Kildekode
                </a>
              </li>
              <li className="mb-3">
                <a
                  href="https://github.com/jonbng/betterlectio/issues"
                  target="_blank"
                  rel="noreferrer noopener"
                  className={FOOTER_LINK_CLASS}
                >
                  Kontakt
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap justify-between gap-4 border-t border-white/15 pt-8 text-[13px] opacity-75">
          <span>© 2026 BetterLectio. Ikke tilknyttet MaCom A/S.</span>
          <span>Lavet til danske gymnasieelever.</span>
        </div>
      </div>
    </footer>
  )
}
