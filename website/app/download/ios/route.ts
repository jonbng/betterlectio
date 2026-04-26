import { redirect } from "next/navigation"

import { DOWNLOAD_LINKS } from "@/lib/download-links"

export function GET() {
  redirect(DOWNLOAD_LINKS.ios)
}
