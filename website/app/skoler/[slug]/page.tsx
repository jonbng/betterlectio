import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import {
  benefits,
  closingVariants,
  faqPool,
  headingPools,
  introVariants,
} from "@/lib/schools-content"
import {
  getAllSchoolsForSeo,
  getSchoolBySlug,
  pickByKey,
  pickManyByKey,
} from "@/lib/schools"

export const dynamic = "force-static"
export const dynamicParams = false

export async function generateStaticParams() {
  const schools = await getAllSchoolsForSeo()
  return schools.map((s) => ({ slug: s.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const school = await getSchoolBySlug(slug)
  if (!school) return {}

  const title = `${school.displayName} Lectio`
  const description = `Brug Lectio på ${school.displayName} med BetterLectio — en moderne, hurtigere version af Lectio, lavet til elever på ${school.displayName}. Gratis og uden ny konto.`
  const url = `/skoler/${school.slug}`

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "da_DK",
      siteName: "BetterLectio",
      title,
      description,
      url,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  }
}

export default async function SchoolPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const school = await getSchoolBySlug(slug)
  if (!school) notFound()

  const { id, displayName } = school
  const intro = pickByKey(introVariants, id, "intro")(displayName)
  const orderedBenefits = pickManyByKey(benefits, benefits.length, id, "benefits")
  const closing = pickByKey(closingVariants, id, "closing")(displayName)
  const faqs = pickManyByKey(faqPool, 4, id, "faq")
  const whyHeading = pickByKey(headingPools.why, id, "h2-why")(displayName)
  const startHeading = pickByKey(headingPools.start, id, "h2-start")(displayName)
  const faqHeading = pickByKey(headingPools.faq, id, "h2-faq")(displayName)

  return (
    <div className="brand-root brand-root--text">
      <div className="bg-grid" />

      <div className="metadata meta-tl">
        <Link href="/download" className="back-link">
          ← HENT BETTERLECTIO
        </Link>
      </div>

      <main className="text-page">
        <h1 className="text-page-title">
          <span className="title-top">{displayName}</span>
          <span className="title-bottom">Lectio</span>
        </h1>

        <p className="text-page-lead">{intro}</p>

        <section className="mt-12 w-full max-w-[60ch]">
          <h2 className="mb-4 text-2xl font-bold tracking-tight">
            {whyHeading}
          </h2>
          <ul className="grid gap-5 sm:grid-cols-2">
            {orderedBenefits.map((b) => (
              <li key={b.title}>
                <h3 className="text-base font-semibold">{b.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  {b.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12 w-full max-w-[60ch]">
          <h2 className="mb-3 text-2xl font-bold tracking-tight">
            {startHeading}
          </h2>
          <p className="mb-5 text-base leading-relaxed">{closing}</p>
          <Link
            href="/download"
            className="inline-flex items-center justify-center rounded-md bg-foreground px-6 py-3 text-base font-semibold text-background transition-opacity hover:opacity-90"
          >
            Hent BetterLectio gratis →
          </Link>
        </section>

        <section className="mt-12 w-full max-w-[60ch]">
          <h2 className="mb-4 text-2xl font-bold tracking-tight">
            {faqHeading}
          </h2>
          <dl className="space-y-5">
            {faqs.map((item) => (
              <div key={item.q}>
                <dt className="text-base font-semibold">{item.q}</dt>
                <dd className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  {item.a(displayName)}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="mt-16 text-xs text-muted-foreground">
          BetterLectio er ikke tilknyttet eller godkendt af Lectio eller MaCom A/S.
          Lectio er et registreret varemærke tilhørende MaCom A/S.
        </p>
      </main>
    </div>
  )
}
