import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Personal referral links carry student elevids in the URL —
        // keep them out of search results.
        disallow: ["/r/"],
      },
    ],
    sitemap: "https://betterlectio.dk/sitemap.xml",
    host: "https://betterlectio.dk",
  }
}
