import "server-only"

import { getSupabaseAdmin } from "@/lib/supabase"

export type SchoolSeo = {
  id: number
  displayName: string
  slug: string
}

export function slugify(input: string): string {
  return input
    .replace(/ø/gi, "oe")
    .replace(/æ/gi, "ae")
    .replace(/å/gi, "aa")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

let cached: Promise<SchoolSeo[]> | null = null

export function getAllSchoolsForSeo(): Promise<SchoolSeo[]> {
  if (cached) return cached
  cached = (async () => {
    try {
      const supabase = getSupabaseAdmin()
      const { data, error } = await supabase
        .from("schools")
        .select("id, name, display_name")
      if (error) throw error
      if (!data) return []

      const seenSlugs = new Map<string, number>()
      const results: SchoolSeo[] = []

      for (const row of data as Array<{
        id: number
        name: string | null
        display_name: string | null
      }>) {
        const displayName = row.display_name ?? row.name
        if (!displayName) continue
        const baseSlug = slugify(displayName)
        if (!baseSlug) continue
        const prev = seenSlugs.get(baseSlug)
        const slug = prev != null ? `${baseSlug}-${row.id}` : baseSlug
        seenSlugs.set(baseSlug, row.id)
        results.push({ id: row.id, displayName, slug })
      }

      return results
    } catch (err) {
      console.error("[lib/schools] getAllSchoolsForSeo failed", err)
      return []
    }
  })()
  return cached
}

export async function getSchoolBySlug(slug: string): Promise<SchoolSeo | null> {
  const all = await getAllSchoolsForSeo()
  return all.find((s) => s.slug === slug) ?? null
}

function fnv1a(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function seededRng(seed: number): () => number {
  let state = seed || 1
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507)
    state = Math.imul(state ^ (state >>> 13), 3266489909)
    state ^= state >>> 16
    return (state >>> 0) / 0x100000000
  }
}

export function pickByKey<T>(
  items: readonly T[],
  schoolId: number,
  slot: string,
): T {
  if (items.length === 0) throw new Error("pickByKey: empty array")
  const idx = fnv1a(`${schoolId}:${slot}`) % items.length
  return items[idx]
}

export function pickManyByKey<T>(
  items: readonly T[],
  n: number,
  schoolId: number,
  slot: string,
): T[] {
  const arr = items.slice()
  const rng = seededRng(fnv1a(`${schoolId}:${slot}`))
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, Math.min(n, arr.length))
}
