import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Hent BetterLectio",
  description:
    "Hent BetterLectio gratis til Chrome, Firefox, Edge og iOS. En moderne brugerflade til Lectio — hurtigere, pænere og uden ny konto.",
  alternates: { canonical: "/download" },
  openGraph: {
    title: "Hent BetterLectio",
    description:
      "Hent BetterLectio gratis til Chrome, Firefox, Edge og iOS. Hurtigere, pænere og uden ny konto.",
    url: "/download",
  },
  twitter: {
    title: "Hent BetterLectio",
    description:
      "Hent BetterLectio gratis til Chrome, Firefox, Edge og iOS. Hurtigere, pænere og uden ny konto.",
  },
}

export default function DownloadLayout({ children }: { children: React.ReactNode }) {
  return children
}
