"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/supabase/audit";

export async function upsertMapping(input: {
  id?: string;
  schoolId: number;
  canonicalKey: string;
  defaultName: string;
  defaultColorHue: number | null;
}) {
  const canonical = input.canonicalKey.trim().toLowerCase();
  const name = input.defaultName.trim();
  if (!canonical || !name) return { ok: false, error: "Missing fields" };

  if (input.id) {
    // Update
    const { data: before } = await supabaseAdmin
      .from("school_lesson_mappings")
      .select("*")
      .eq("id", input.id)
      .single();

    const { data: after } = await supabaseAdmin
      .from("school_lesson_mappings")
      .update({
        canonical_key: canonical,
        default_name: name,
        default_color_hue: input.defaultColorHue,
      })
      .eq("id", input.id)
      .select("*")
      .single();

    await logAudit({
      action: "lesson_mapping.update",
      targetTable: "school_lesson_mappings",
      targetId: input.id,
      before,
      after,
    });
  } else {
    const { data: after } = await supabaseAdmin
      .from("school_lesson_mappings")
      .insert({
        school_id: input.schoolId,
        canonical_key: canonical,
        default_name: name,
        default_color_hue: input.defaultColorHue,
      })
      .select("*")
      .single();

    await logAudit({
      action: "lesson_mapping.create",
      targetTable: "school_lesson_mappings",
      targetId: after?.id ?? null,
      after,
    });
  }

  revalidatePath("/lessons");
  return { ok: true };
}

export async function deleteMapping(id: string, expectedOrphans: number) {
  const { count: actualOrphans } = await supabaseAdmin
    .from("user_lesson_overrides")
    .select("*", { count: "exact", head: true })
    .eq("mapping_id", id)
    .is("deleted_at", null);

  const { data: before } = await supabaseAdmin
    .from("school_lesson_mappings")
    .select("*")
    .eq("id", id)
    .single();

  // Soft-delete via deleted_at to preserve override history.
  const { data: after } = await supabaseAdmin
    .from("school_lesson_mappings")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  await logAudit({
    action: "lesson_mapping.delete",
    targetTable: "school_lesson_mappings",
    targetId: id,
    before,
    after,
    metadata: {
      expected_orphans: expectedOrphans,
      actual_orphans: actualOrphans ?? 0,
    },
  });

  revalidatePath("/lessons");
  return { ok: true };
}
