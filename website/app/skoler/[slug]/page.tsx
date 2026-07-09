import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { SiteFooter } from "@/components/site/site-footer"
import { SiteNav } from "@/components/site/site-nav"
import {
  siteButton,
  siteContainerClass,
  siteEyebrow,
  siteMainClass,
  sitePageClass,
} from "@/components/site/styles"
import { JsonLd, schoolJsonLd } from "@/components/site/structured-data"
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
import { cn } from "@/lib/utils"

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
    <div className="site">
      <JsonLd
        data={schoolJsonLd({
          displayName,
          slug: school.slug,
          faqs: faqs.map((item) => ({ question: item.q, answer: item.a(displayName) })),
        })}
      />
      <SiteNav />

      <main className={cn(siteMainClass, siteContainerClass, sitePageClass)}>
        <article className="mx-auto max-w-[760px]">
          <span className={siteEyebrow()}>{displayName}</span>
          <h1 className="mt-3.5 mb-5 text-[clamp(40px,6vw,68px)] font-extrabold leading-[1.02] tracking-[-0.04em]">
            {displayName} <mark className="bg-transparent text-ink-muted">Lectio</mark>
          </h1>

          <p className="max-w-[60ch] text-xl font-medium leading-[1.5] text-ink-muted">
            {intro}
          </p>

          <section className="mt-14">
            <h2 className="mb-[22px] text-[28px] font-extrabold tracking-[-0.02em]">
              {whyHeading}
            </h2>
            <ul className="grid grid-cols-1 gap-5 min-[720px]:grid-cols-2">
              {orderedBenefits.map((b) => (
                <li
                  key={b.title}
                  className="rounded-[20px] border border-line bg-grey p-6"
                >
                  <h3 className="mb-1.5 text-[17px] font-bold text-ink">{b.title}</h3>
                  <p className="text-sm leading-[1.5] text-ink-muted">{b.body}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-14">
            <h2 className="mb-[22px] text-[28px] font-extrabold tracking-[-0.02em]">
              {startHeading}
            </h2>
            <p className="mb-6 max-w-[60ch] text-base font-medium leading-[1.5] text-ink">
              {closing}
            </p>
            <Link href="/download" className={siteButton("primary")}>
              Hent BetterLectio gratis
            </Link>
          </section>

          <section className="mt-14">
            <h2 className="mb-[22px] text-[28px] font-extrabold tracking-[-0.02em]">
              {faqHeading}
            </h2>
            <dl>
              {faqs.map((item) => (
                <div key={item.q}>
                  <dt className="text-[17px] font-bold text-ink">{item.q}</dt>
                  <dd className="mt-1.5 mb-5 text-[15px] leading-[1.6] text-ink-muted">
                    {item.a(displayName)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <p className="mt-[60px] text-[13px] text-ink-muted">
            BetterLectio er ikke tilknyttet eller godkendt af Lectio eller MaCom A/S.
            Lectio er et registreret varemærke tilhørende MaCom A/S.
          </p>
        </article>
      </main>

      <SiteFooter />
    </div>
  )
}
