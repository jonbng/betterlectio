import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: "https://betterlectio.dk/sitemap.xml",
    host: "https://betterlectio.dk",
  }
}
