import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/lib/og-image"

export const alt = "BetterLectio — Lectio, bare bedre."
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgImage({
    title: "Lectio, bare bedre.",
    subtitle: "En moderne brugerflade til Lectio. Hurtigere, pænere og uden alt det rod.",
  })
}
