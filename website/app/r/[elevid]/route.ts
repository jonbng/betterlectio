import { redirect } from "next/navigation"
import type { NextRequest } from "next/server"

const ELEVID_RE = /^[0-9A-Za-z_-]{1,48}$/

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ elevid: string }> },
) {
  const { elevid } = await ctx.params
  const trimmed = elevid?.trim() ?? ""

  // Anything that isn't a valid-shaped elevid skips the cookie-setting
  // edge function and goes straight to the download page. Better than 404.
  if (!ELEVID_RE.test(trimmed)) {
    redirect("/download")
  }

  // Hand off to the Supabase edge function so the cookie lands on the
  // *.supabase.co domain (where the extension reads it during finalize).
  const supabaseUrl = process.env.SUPABASE_URL
  if (!supabaseUrl) {
    console.error("[r/[elevid]] SUPABASE_URL not set")
    redirect("/download")
  }

  const target = new URL(`${supabaseUrl}/functions/v1/referral-click`)
  target.searchParams.set("ref", trimmed)
  redirect(target.toString())
}
