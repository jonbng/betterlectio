import type { Metadata, Viewport } from "next"
import { Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

const SITE_URL = "https://betterlectio.dk"

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "BetterLectio — Lectio, bare bedre.",
    template: "%s — BetterLectio",
  },
  description:
    "BetterLectio er en moderne brugerflade til Lectio. Hurtigere, pænere og uden alt det rod. Tilgængelig som app og browser-udvidelse.",
  applicationName: "BetterLectio",
  authors: [{ name: "BetterLectio" }],
  generator: "Next.js",
  keywords: [
    "BetterLectio",
    "Lectio",
    "Lectio app",
    "Lectio iOS",
    "Lectio Android",
    "Lectio Chrome",
    "Lectio Firefox",
    "Lectio Edge",
    "skema",
    "gymnasie",
    "Danmark",
  ],
  category: "education",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "da_DK",
    siteName: "BetterLectio",
    title: "BetterLectio — Lectio, bare bedre.",
    description: "En moderne brugerflade til Lectio. Hurtigere, pænere og uden alt det rod.",
    url: SITE_URL,
    images: [
      {
        url: "/og-image.png",
        width: 1024,
        height: 1024,
        alt: "BetterLectio",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BetterLectio — Lectio, bare bedre.",
    description: "En moderne brugerflade til Lectio. Hurtigere, pænere og uden alt det rod.",
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: "/",
  },
  appleWebApp: {
    capable: true,
    title: "BetterLectio",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f0" },
    { media: "(prefers-color-scheme: dark)", color: "#2d5bff" },
  ],
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="da"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", inter.variable)}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
