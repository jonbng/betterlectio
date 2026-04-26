import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BetterLectio",
    short_name: "BetterLectio",
    description: "Lectio, bare bedre.",
    start_url: "/",
    display: "standalone",
    background_color: "#f2f2f0",
    theme_color: "#2d5bff",
    icons: [
      { src: "/icon-48.png", sizes: "48x48", type: "image/png" },
      { src: "/icon-128.png", sizes: "128x128", type: "image/png" },
      { src: "/icon-128.png", sizes: "128x128", type: "image/png", purpose: "maskable" },
      { src: "/og-image.png", sizes: "1024x1024", type: "image/png" },
    ],
  }
}
