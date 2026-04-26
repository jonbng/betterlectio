import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Privatlivspolitik",
  description: "BetterLectios privatlivspolitik.",
}

export default function PrivatlivPage() {
  return (
    <div className="brand-root brand-root--text">
      <div className="bg-grid" />

      <div className="metadata meta-tl">
        <Link href="/" className="back-link">
          ← TILBAGE
        </Link>
      </div>

      <main className="text-page">
        <h1 className="text-page-title">
          <span className="title-top">Privat</span>
          <span className="title-bottom">livspolitik</span>
        </h1>

        <p className="text-page-lead">
          Den fulde privatlivspolitik er på vej. I mellemtiden — hvis du har spørgsmål om hvordan
          BetterLectio håndterer dine data, så skriv til{" "}
          <a href="mailto:hello@betterlectio.dk">hello@betterlectio.dk</a>.
        </p>
      </main>
    </div>
  )
}
