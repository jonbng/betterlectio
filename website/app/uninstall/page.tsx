import type { Metadata } from "next"
import Link from "next/link"

import { SiteFooter } from "@/components/site/site-footer"
import { SiteNav } from "@/components/site/site-nav"
import {
  siteContainerClass,
  siteEyebrow,
  siteMainClass,
  sitePageClass,
} from "@/components/site/styles"
import { getSupabaseAdmin } from "@/lib/supabase"
import { cn } from "@/lib/utils"

import { UninstallForm } from "./uninstall-form"

export const metadata: Metadata = {
  title: "Afinstalleret",
  description:
    "BetterLectio er afinstalleret. Fortæl os hvorfor — det hjælper os med at gøre det bedre.",
  robots: { index: false, follow: false },
}

const STUDENT_ID_RE = /^[0-9A-Za-z_-]{1,48}$/

export default async function UninstallPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string | string[] }>
}) {
  const params = await searchParams
  const raw = Array.isArray(params.u) ? params.u[0] : params.u
  const studentId = raw?.trim() ?? ""
  const validStudentId = STUDENT_ID_RE.test(studentId) ? studentId : ""

  if (validStudentId) {
    // Fire-and-forget: stamp first uninstall time. `is null` keeps the FIRST
    // uninstall so re-installs + re-uninstalls don't clobber the original.
    try {
      await getSupabaseAdmin()
        .from("students")
        .update({ extension_uninstalled_at: new Date().toISOString() })
        .eq("id", validStudentId)
        .is("extension_uninstalled_at", null)
    } catch (err) {
      console.error("[uninstall] failed to stamp uninstall", err)
    }
  }

  return (
    <div className="site">
      <SiteNav />

      <main className={cn(siteMainClass, siteContainerClass, sitePageClass)}>
        <article className="mx-auto max-w-[760px]">
          <span className={siteEyebrow()}>Farvel for nu</span>
          <h1 className="mt-3.5 mb-5 text-[clamp(40px,6vw,68px)] font-extrabold leading-[1.02] tracking-[-0.04em]">
            Tak fordi du prøvede det.
          </h1>

          <p className="max-w-[60ch] text-xl font-medium leading-[1.5] text-ink-muted">
            BetterLectio er afinstalleret. Hvis du har lyst, så fortæl os hvorfor —
            det hjælper os med at gøre det bedre for de næste.
          </p>

          <UninstallForm studentId={validStudentId} />

          <p className="mt-10 text-sm text-ink-muted">
            Fortryder du? Du kan altid hente BetterLectio igen på{" "}
            <Link
              href="/download"
              className="text-brand underline underline-offset-[3px]"
            >
              betterlectio.dk/download
            </Link>
            .
          </p>
        </article>
      </main>

      <SiteFooter />
    </div>
  )
}
