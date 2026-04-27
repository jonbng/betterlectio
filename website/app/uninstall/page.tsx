import type { Metadata } from "next"
import Link from "next/link"

import { getSupabaseAdmin } from "@/lib/supabase"

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
    <div className="brand-root brand-root--text">
      <div className="bg-grid" />

      <div className="metadata meta-tl">
        <Link href="/" className="back-link">
          ← TILBAGE
        </Link>
      </div>

      <main className="text-page uninstall-page">
        <h1 className="text-page-title">
          <span className="title-top">Farvel</span>
          <span className="title-bottom">for nu</span>
        </h1>

        <p className="text-page-lead">
          BetterLectio er afinstalleret. Hvis du har lyst, så fortæl os hvorfor — det hjælper os med
          at gøre det bedre for de næste.
        </p>

        <UninstallForm studentId={validStudentId} />

        <p className="uninstall-fineprint">
          Fortryder du? Du kan altid hente BetterLectio igen på{" "}
          <Link href="/download">betterlectio.dk/download</Link>.
        </p>
      </main>
    </div>
  )
}
