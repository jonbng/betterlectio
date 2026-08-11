import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.8"

export type AuthPlatform = "ios" | "android" | "extension" | "unknown"
export type AuthOutcome = "success" | "degraded" | "failed"

interface ClientMetadata {
  platform: AuthPlatform
  appVersion: string | null
  appBuild: string | null
  clientInfo: string | null
}

function bounded(value: unknown, max: number): string | null {
  const text = typeof value === "string" ? value.trim() : ""
  return text ? text.slice(0, max) : null
}

export function clientMetadata(
  req: Request,
  body: Record<string, unknown>,
  fallback: AuthPlatform,
): ClientMetadata {
  const supplied = body.client && typeof body.client === "object"
    ? body.client as Record<string, unknown>
    : {}
  const clientInfo = bounded(req.headers.get("x-client-info"), 200)
  const requested = bounded(supplied.platform, 20)
  let platform: AuthPlatform = requested === "ios" || requested === "android" || requested === "extension"
    ? requested
    : fallback
  const normalized = clientInfo?.toLowerCase() ?? ""
  if (platform === "unknown") {
    if (normalized.includes("swift")) platform = "ios"
    else if (normalized.includes("kotlin") || normalized.includes("ktor") || normalized.includes("supabase-kt")) platform = "android"
  }
  return {
    platform,
    appVersion: bounded(supplied.app_version, 40),
    appBuild: bounded(supplied.app_build, 40),
    clientInfo,
  }
}

export class AuthAttemptRecorder {
  private startedAt = Date.now()
  private started = false

  constructor(
    private admin: SupabaseClient,
    readonly requestId: string,
    private functionName: "token-for-auth" | "verify-lectio-auth" | "lectio-auth",
    private metadata: ClientMetadata,
    private schoolId: number | null,
  ) {}

  async start(): Promise<void> {
    try {
      const { error } = await this.admin.from("auth_attempts").insert({
        request_id: this.requestId,
        function_name: this.functionName,
        platform: this.metadata.platform,
        app_version: this.metadata.appVersion,
        app_build: this.metadata.appBuild,
        client_info: this.metadata.clientInfo,
        school_id: this.schoolId,
      })
      if (error) console.warn("Failed to start auth attempt", { requestId: this.requestId, code: error.code })
      else this.started = true
    } catch (error) {
      console.warn("Failed to start auth attempt", { requestId: this.requestId, error })
    }
  }

  async finish(values: {
    outcome: AuthOutcome
    failureStage?: string | null
    httpStatus: number
    schoolId?: number | null
    studentId?: string | null
    authUserId?: string | null
    profileSource?: string | null
    scheduleOk?: boolean
    studentCardStatus?: number | null
    hasName?: boolean
    hasClass?: boolean
    hasBirthdate?: boolean
    hasPicture?: boolean
  }): Promise<void> {
    if (!this.started) return
    try {
      const { error } = await this.admin.from("auth_attempts").update({
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - this.startedAt,
        outcome: values.outcome,
        failure_stage: values.failureStage ?? null,
        http_status: values.httpStatus,
        school_id: values.schoolId ?? this.schoolId,
        student_id: values.studentId ?? null,
        auth_user_id: values.authUserId ?? null,
        profile_source: values.profileSource ?? null,
        schedule_ok: values.scheduleOk ?? false,
        student_card_status: values.studentCardStatus ?? null,
        has_name: values.hasName ?? false,
        has_class: values.hasClass ?? false,
        has_birthdate: values.hasBirthdate ?? false,
        has_picture: values.hasPicture ?? false,
      }).eq("request_id", this.requestId)
      if (error) console.warn("Failed to finish auth attempt", { requestId: this.requestId, code: error.code })
    } catch (error) {
      console.warn("Failed to finish auth attempt", { requestId: this.requestId, error })
    }
  }
}
