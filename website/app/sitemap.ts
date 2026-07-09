import type { MetadataRoute } from "next"

import { getAllSchoolsForSeo } from "@/lib/schools"

const SITE_URL = "https://betterlectio.dk"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date()

  const baseEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/download`, lastModified, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/privatliv`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ]

  const schools = await getAllSchoolsForSeo()
  const schoolEntries: MetadataRoute.Sitemap = schools.map((s) => ({
    url: `${SITE_URL}/skoler/${s.slug}`,
    lastModified,
    changeFrequency: "monthly",
    priority: 0.6,
  }))

  return [...baseEntries, ...schoolEntries]
}
