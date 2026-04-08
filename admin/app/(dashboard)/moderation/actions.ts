"use server";

import { revalidatePath } from "next/cache";
import { clearStudentField } from "@/lib/supabase/queries";

export async function clearField(studentId: string, field: "description" | "instagram") {
  await clearStudentField(studentId, field);
  revalidatePath("/moderation");
}
