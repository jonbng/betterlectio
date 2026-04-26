import type { MetadataRoute } from "next"

const SITE_URL = "https://betterlectio.dk"

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/download`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/privatliv`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ]
}
