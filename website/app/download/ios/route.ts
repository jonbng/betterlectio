import { redirect } from "next/navigation"
import type { NextRequest } from "next/server"

import { DOWNLOAD_LINKS } from "@/lib/download-links"
import { getSupabaseAdmin } from "@/lib/supabase"

export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get("u")?.trim()

  if (studentId) {
    // Fire-and-forget: stamp first scan time so the invite popup + drawer
    // hide on the next eligibility refresh. `is null` keeps the FIRST scan.
    try {
      await getSupabaseAdmin()
        .from("students")
        .update({ app_qr_scanned_at: new Date().toISOString() })
        .eq("id", studentId)
        .is("app_qr_scanned_at", null)
    } catch (err) {
      console.error("[download/ios] failed to stamp scan", err)
    }
  }

  redirect(DOWNLOAD_LINKS.ios)
}
