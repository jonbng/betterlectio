import { DOWNLOAD_LINKS } from "@/lib/download-links"

const SITE_URL = "https://betterlectio.dk"

/**
 * Renders a `<script type="application/ld+json">` block. Schema.org structured
 * data helps Google show rich results (org logo, sitelinks, FAQ accordions).
 * JSON is serialized server-side; no client JS is shipped.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      // Content is our own static data — safe to inline.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

/** Organization + WebSite + SoftwareApplication graph for the landing page. */
export function siteJsonLd(): object {
  const organization = {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: "BetterLectio",
    url: SITE_URL,
    logo: `${SITE_URL}/icon.png`,
  }

  const website = {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: "BetterLectio",
    inLanguage: "da-DK",
    publisher: { "@id": `${SITE_URL}/#organization` },
  }

  const application = {
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#app`,
    name: "BetterLectio",
    description:
      "En moderne brugerflade til Lectio. Hurtigere, pænere og uden alt det rod. Tilgængelig som app og browser-udvidelse.",
    url: SITE_URL,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Chrome, Firefox, Edge, iOS",
    inLanguage: "da-DK",
    publisher: { "@id": `${SITE_URL}/#organization` },
    downloadUrl: [
      DOWNLOAD_LINKS.chrome,
      DOWNLOAD_LINKS.firefox,
      DOWNLOAD_LINKS.edge,
      DOWNLOAD_LINKS.ios,
    ],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "DKK",
    },
  }

  return {
    "@context": "https://schema.org",
    "@graph": [organization, website, application],
  }
}

/** FAQPage + BreadcrumbList graph for a per-school SEO page. */
export function schoolJsonLd({
  displayName,
  slug,
  faqs,
}: {
  displayName: string
  slug: string
  faqs: Array<{ question: string; answer: string }>
}): object {
  const pageUrl = `${SITE_URL}/skoler/${slug}`

  const faqPage = {
    "@type": "FAQPage",
    "@id": `${pageUrl}#faq`,
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  }

  const breadcrumb = {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "BetterLectio", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: `${displayName} Lectio`,
        item: pageUrl,
      },
    ],
  }

  return {
    "@context": "https://schema.org",
    "@graph": [faqPage, breadcrumb],
  }
}
