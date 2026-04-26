import "server-only"

import { getSupabaseAdmin } from "./supabase"

export async function fetchSchoolCount(): Promise<number | null> {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("students")
      .select("school_id")
      .not("school_id", "is", null)
      .limit(50000)
    if (error || !data) return null

    const schools = new Set<string>()
    for (const row of data) {
      if (row.school_id) schools.add(String(row.school_id))
    }
    return schools.size
  } catch {
    return null
  }
}
