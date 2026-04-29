"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/supabase/audit";

const EDITABLE_KEYS = [
  "lectio_first_name",
  "lectio_last_name",
  "class_name",
  "description",
  "instagram",
  "show_birthday",
  "app_eligible",
] as const;

const TIMESTAMP_TOGGLES = [
  "marked_android_at",
  "dismissed_app_prompt_at",
] as const;

type EditablePatch = Partial<{
  lectio_first_name: string | null;
  lectio_last_name: string | null;
  class_name: string | null;
  description: string | null;
  instagram: string | null;
  show_birthday: boolean;
  app_eligible: boolean;
  marked_android_at: string | null;
  dismissed_app_prompt_at: string | null;
}>;

export async function updateStudent(id: string, patch: EditablePatch) {
  const safe: EditablePatch = {};
  for (const key of EDITABLE_KEYS) {
    if (key in patch) {
      const v = patch[key];
      // Coerce empty strings to null for nullable text fields
      if (
        typeof v === "string" &&
        v.trim() === "" &&
        key !== "lectio_first_name" &&
        key !== "lectio_last_name"
      ) {
        (safe as Record<string, unknown>)[key] = null;
      } else if (typeof v === "string") {
        (safe as Record<string, unknown>)[key] = v.trim();
      } else {
        (safe as Record<string, unknown>)[key] = v;
      }
    }
  }
  for (const key of TIMESTAMP_TOGGLES) {
    if (key in patch) {
      // Caller passes either ISO string or null to clear
      (safe as Record<string, unknown>)[key] = patch[key];
    }
  }

  if (Object.keys(safe).length === 0) return { ok: true, changed: false };

  const { data: before } = await supabaseAdmin
    .from("students")
    .select(
      "id, lectio_first_name, lectio_last_name, class_name, description, instagram, show_birthday, app_eligible, marked_android_at, dismissed_app_prompt_at",
    )
    .eq("id", id)
    .single();

  const { data: after } = await supabaseAdmin
    .from("students")
    .update(safe)
    .eq("id", id)
    .select(
      "id, lectio_first_name, lectio_last_name, class_name, description, instagram, show_birthday, app_eligible, marked_android_at, dismissed_app_prompt_at",
    )
    .single();

  // Diff for audit
  const changedKeys: string[] = [];
  if (before && after) {
    for (const k of Object.keys(safe)) {
      const b = (before as Record<string, unknown>)[k];
      const a = (after as Record<string, unknown>)[k];
      if (b !== a) changedKeys.push(k);
    }
  }

  await logAudit({
    action: "student.update",
    targetTable: "students",
    targetId: id,
    before,
    after,
    metadata: { changed_keys: changedKeys },
  });

  revalidatePath(`/students/${id}`);
  revalidatePath("/students");
  return { ok: true, changed: changedKeys.length > 0 };
}
