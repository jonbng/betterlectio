"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/supabase/audit";

export async function setAppEligibility(
  studentIds: string[],
  eligible: boolean,
  scope: { schoolId?: number; className?: string } = {},
) {
  if (!studentIds.length) return { ok: true, updated: 0 };

  const { data: before } = await supabaseAdmin
    .from("students")
    .select("id, school_id, class_name, app_eligible")
    .in("id", studentIds);

  await supabaseAdmin
    .from("students")
    .update({ app_eligible: eligible })
    .in("id", studentIds);

  await logAudit({
    action: "student.bulk_app_eligibility",
    targetTable: "students",
    targetId: studentIds.length === 1 ? studentIds[0] : null,
    metadata: {
      count: studentIds.length,
      eligible,
      scope,
      sample_ids: studentIds.slice(0, 25),
    },
    before,
    after: { app_eligible: eligible, ids: studentIds.slice(0, 25) },
  });

  revalidatePath("/students");
  if (scope.schoolId != null) revalidatePath(`/schools/${scope.schoolId}`);
  revalidatePath("/mobile-app");

  return { ok: true, updated: studentIds.length };
}

export async function setAppEligibilityForSchoolClasses(
  schoolId: number,
  classNames: string[],
  eligible: boolean,
) {
  if (!classNames.length) return { ok: true, updated: 0 };

  const { data: rows } = await supabaseAdmin
    .from("students")
    .select("id")
    .eq("school_id", schoolId)
    .in("class_name", classNames);

  const ids = (rows ?? []).map((r) => r.id);
  return setAppEligibility(ids, eligible, {
    schoolId,
    className: classNames.join(","),
  });
}
