import "server-only"

import { unstable_cache } from "next/cache"

import { getSupabaseAdmin } from "@/lib/supabase"

// Fallback shown if the DB is unreachable at (re)build/revalidate time. Keep it
// conservative and rounded so we never over-claim.
const FALLBACK_SCHOOL_COUNT = 75

// Heavy caching: the number moves slowly, so we only recompute hourly.
// `unstable_cache` memoizes the resolved value across requests/renders and the
// `revalidate` window keeps it warm without hammering Supabase.
const CACHE_REVALIDATE_SECONDS = 60 * 60 // 1h

async function fetchSchoolCount(): Promise<number> {
  try {
    const supabase = getSupabaseAdmin()
    // Count distinct schools that have at least one student who has installed
    // the extension — the honest "brugt af elever på N gymnasier" metric.
    const { data, error } = await supabase
      .from("students")
      .select("school_id")
      .not("extension_installed_at", "is", null)
    if (error) throw error
    if (!data) return FALLBACK_SCHOOL_COUNT

    const schools = new Set<number>()
    for (const row of data as Array<{ school_id: number | null }>) {
      if (row.school_id != null) schools.add(row.school_id)
    }
    return schools.size || FALLBACK_SCHOOL_COUNT
  } catch (err) {
    console.error("[lib/school-count] fetchSchoolCount failed", err)
    return FALLBACK_SCHOOL_COUNT
  }
}

export const getSchoolCount = unstable_cache(fetchSchoolCount, ["bl-school-count"], {
  revalidate: CACHE_REVALIDATE_SECONDS,
  tags: ["school-count"],
})
