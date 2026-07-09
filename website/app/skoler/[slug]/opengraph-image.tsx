import { getSchoolBySlug } from "@/lib/schools"
import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/lib/og-image"

export const alt = "BetterLectio"
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

// Match the page: fully static, only the pre-generated school slugs.
export const dynamic = "force-static"
export const dynamicParams = false

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const school = await getSchoolBySlug(slug)
  const name = school?.displayName ?? "din skole"

  return renderOgImage({
    eyebrow: name,
    title: `${name} Lectio — bare bedre.`,
    subtitle: `En moderne, hurtigere version af Lectio til elever på ${name}. Gratis og uden ny konto.`,
  })
}
