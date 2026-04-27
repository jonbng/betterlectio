"use server"

import { getSupabaseAdmin } from "@/lib/supabase"

const REASON_KEYS = new Set([
  "too_complicated",
  "missing_feature",
  "broken",
  "switched_browser",
  "performance",
  "switched_to_app",
  "graduated",
  "other",
])

const MAX_FEEDBACK_LENGTH = 2000
const MAX_STUDENT_ID_LENGTH = 48

export async function submitUninstallFeedback(input: {
  studentId: string
  reason: string
  feedback: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const studentId = input.studentId?.trim()
  if (!studentId || studentId.length > MAX_STUDENT_ID_LENGTH || !/^[0-9A-Za-z_-]+$/.test(studentId)) {
    return { ok: false, error: "invalid_student" }
  }

  const reason = REASON_KEYS.has(input.reason) ? input.reason : "other"
  const feedback = input.feedback?.slice(0, MAX_FEEDBACK_LENGTH).trim() || null

  try {
    await getSupabaseAdmin()
      .from("students")
      .update({
        extension_uninstall_reason: reason,
        extension_uninstall_feedback: feedback,
      })
      .eq("id", studentId)
  } catch (err) {
    console.error("[uninstall] failed to persist feedback", err)
    return { ok: false, error: "write_failed" }
  }

  return { ok: true }
}
