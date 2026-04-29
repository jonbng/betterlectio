import { supabaseAdmin } from "./admin";
import type { Json } from "./database.types";

type LogAuditArgs = {
  action: string;
  targetTable?: string;
  targetId?: string | number | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
};

export async function logAudit({
  action,
  targetTable,
  targetId,
  before,
  after,
  metadata,
}: LogAuditArgs) {
  try {
    await supabaseAdmin.from("admin_audit_log").insert({
      action,
      target_table: targetTable ?? null,
      target_id: targetId == null ? null : String(targetId),
      before: (before ?? null) as Json | null,
      after: (after ?? null) as Json | null,
      metadata: (metadata ?? null) as Json | null,
    });
  } catch (err) {
    console.error("[audit] logAudit failed:", err);
  }
}

export async function getRecentAudit(limit = 200, actionFilter?: string) {
  let q = supabaseAdmin
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (actionFilter) q = q.ilike("action", `${actionFilter}%`);
  const { data } = await q;
  return data ?? [];
}
