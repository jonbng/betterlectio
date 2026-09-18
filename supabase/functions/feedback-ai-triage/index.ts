import { createClient } from "npm:@supabase/supabase-js@2.49.8"

type Job = { feedback_id: string; claim_token: string }
type Ticket = {
  id: string
  category: string
  title: string | null
  message: string
  platform: string
  app_version: string | null
  os_version: string | null
  device_model: string | null
  device_manufacturer: string | null
  browser_info: string | null
  locale: string | null
  lectio_version: string | null
}
type Triage = {
  title: string
  summary: string
  severity: "low" | "medium" | "high" | "critical"
  severityReason: string
  relevance: "relevant" | "unclear" | "off_topic" | "nonsense"
  relevanceReason: string
  tags: string[]
  semanticText: string
}
type Candidate = {
  id: string
  title: string | null
  message: string
  status: string
  similarity: number
}

const generationModel = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.6-flash"
const embeddingModel = Deno.env.get("GEMINI_EMBEDDING_MODEL") ?? "gemini-embedding-001"
const apiBase = "https://generativelanguage.googleapis.com/v1beta"

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status })
}

async function geminiRequest(path: string, body: unknown): Promise<unknown> {
  const key = Deno.env.get("GEMINI_API_KEY")
  if (!key) throw new Error("GEMINI_API_KEY is not configured")
  const response = await fetch(`${apiBase}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500)
    throw new Error(`gemini_${response.status}: ${detail}`)
  }
  return response.json()
}

function responseText(payload: unknown): string {
  const body = payload as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("")
  if (!text) throw new Error("gemini_empty_response")
  return text
}

function ticketContext(ticket: Ticket): string {
  return JSON.stringify({
    userSuppliedTitle: ticket.title,
    message: ticket.message,
    selectedCategory: ticket.category,
    platform: ticket.platform,
    appVersion: ticket.app_version,
    osVersion: ticket.os_version,
    device: [ticket.device_manufacturer, ticket.device_model].filter(Boolean).join(" ") || null,
    browser: ticket.browser_info,
    locale: ticket.locale,
    lectioVersion: ticket.lectio_version,
  })
}

async function triageTicket(ticket: Ticket): Promise<Triage> {
  const schema = {
    type: "object",
    required: ["title", "summary", "severity", "severityReason", "relevance", "relevanceReason", "tags", "semanticText"],
    properties: {
      title: { type: "string", description: "A specific, concise ticket title, max 80 characters, in the user's language." },
      summary: { type: "string", description: "One or two factual sentences, max 300 characters." },
      severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
      severityReason: { type: "string", description: "A short reason based only on evidence in the report." },
      relevance: { type: "string", enum: ["relevant", "unclear", "off_topic", "nonsense"] },
      relevanceReason: { type: "string", description: "A short reason. Be conservative with off_topic and nonsense." },
      tags: { type: "array", maxItems: 8, items: { type: "string" } },
      semanticText: { type: "string", description: "A normalized description of the underlying request/problem for semantic duplicate matching. Exclude device-specific noise unless central." },
    },
  }
  const prompt = `You triage feedback for BetterLectio, an unofficial product that improves the Danish school platform Lectio through web, browser extension, iOS, and Android apps.

Rules:
- Never invent reproduction steps or impact.
- critical: security/privacy loss, widespread data loss, or the product is unusable for most users.
- high: a core workflow is blocked or badly broken for a meaningful group.
- medium: a real defect or valuable request with a workaround.
- low: cosmetic, minor inconvenience, or narrow enhancement.
- relevant includes BetterLectio, Lectio usage, school workflows, feature ideas, support questions, and product development feedback.
- off_topic means understandable but unrelated. nonsense means genuinely unintelligible/spam, not merely short, informal, misspelled, sarcastic, or in Danish.
- Tags must be lowercase kebab-case and useful for grouping.

Ticket context:
${ticketContext(ticket)}`
  const payload = await geminiRequest(`models/${generationModel}:generateContent`, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.15,
      responseMimeType: "application/json",
      responseJsonSchema: schema,
    },
  })
  return JSON.parse(responseText(payload)) as Triage
}

async function embed(text: string): Promise<number[]> {
  const payload = await geminiRequest(`models/${embeddingModel}:embedContent`, {
    model: `models/${embeddingModel}`,
    content: { parts: [{ text }] },
    taskType: "SEMANTIC_SIMILARITY",
    outputDimensionality: 768,
  }) as { embedding?: { values?: number[] } }
  const values = payload.embedding?.values
  if (!values || values.length !== 768) throw new Error("gemini_invalid_embedding")
  return values
}

async function rerankDuplicates(ticket: Ticket, triage: Triage, candidates: Candidate[]) {
  if (!candidates.length) return []
  const schema = {
    type: "object",
    required: ["matches"],
    properties: {
      matches: {
        type: "array",
        maxItems: 5,
        items: {
          type: "object",
          required: ["id", "confidence", "rationale"],
          properties: {
            id: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            rationale: { type: "string" },
          },
        },
      },
    },
  }
  const compactCandidates = candidates.map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    message: candidate.message.slice(0, 1800),
    status: candidate.status,
    semanticSimilarity: candidate.similarity,
  }))
  const prompt = `Decide which candidate tickets describe substantially the same underlying issue or request as the new BetterLectio ticket. A shared broad topic is not enough. Return only genuine possible duplicates with confidence >= 0.65. Explain the concrete overlap briefly.

New ticket:
${JSON.stringify({ title: triage.title, message: ticket.message, summary: triage.summary })}

Candidates:
${JSON.stringify(compactCandidates)}`
  const payload = await geminiRequest(`models/${generationModel}:generateContent`, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.05, responseMimeType: "application/json", responseJsonSchema: schema },
  })
  const parsed = JSON.parse(responseText(payload)) as {
    matches?: Array<{ id: string; confidence: number; rationale: string }>
  }
  const validIds = new Set(candidates.map((candidate) => candidate.id))
  return (parsed.matches ?? []).filter((match) => validIds.has(match.id) && match.confidence >= 0.65)
}

async function processJob(admin: ReturnType<typeof createClient>, job: Job): Promise<boolean> {
  try {
    const { data, error } = await admin.from("feedback_items").select(
      "id, category, title, message, platform, app_version, os_version, device_model, device_manufacturer, browser_info, locale, lectio_version",
    ).eq("id", job.feedback_id).single()
    if (error || !data) throw new Error(error?.message ?? "ticket_not_found")
    const ticket = data as Ticket
    const triage = await triageTicket(ticket)
    const embedding = await embed(triage.semanticText)
    const embeddingText = `[${embedding.join(",")}]`

    const { data: completed, error: completeError } = await admin.rpc("complete_feedback_ai_job", {
      p_feedback_id: job.feedback_id,
      p_claim_token: job.claim_token,
      p_title: triage.title,
      p_summary: triage.summary,
      p_severity: triage.severity,
      p_severity_reason: triage.severityReason,
      p_relevance: triage.relevance,
      p_relevance_reason: triage.relevanceReason,
      p_tags: triage.tags,
      p_model: generationModel,
      p_embedding: embeddingText,
    })
    if (completeError || !completed) throw new Error(completeError?.message ?? "job_lease_lost")

    // Similarity is useful enrichment, but a reranking outage must not undo an
    // otherwise successful title/severity/relevance result.
    try {
      const { data: rawCandidates, error: matchError } = await admin.rpc("match_feedback_items", {
        p_feedback_id: job.feedback_id,
        p_embedding: embeddingText,
        p_limit: 10,
        p_min_similarity: 0.62,
      })
      if (matchError) throw new Error(matchError.message)
      const candidates = (rawCandidates ?? []) as Candidate[]
      const matches = await rerankDuplicates(ticket, triage, candidates)
      await admin.from("feedback_similarity_suggestions")
        .delete().eq("feedback_id", job.feedback_id).eq("review_state", "pending")
      if (matches.length) {
        const rows = matches.map((match) => ({
          feedback_id: job.feedback_id,
          similar_feedback_id: match.id,
          score: match.confidence,
          rationale: match.rationale.slice(0, 1000),
          model: generationModel,
          review_state: "pending",
        }))
        const { error: suggestionError } = await admin.from("feedback_similarity_suggestions")
          .upsert(rows, { onConflict: "feedback_id,similar_feedback_id", ignoreDuplicates: true })
        if (suggestionError) throw new Error(suggestionError.message)
      }
    } catch (similarityError) {
      console.warn("Feedback similarity pass failed", {
        feedbackId: job.feedback_id,
        message: similarityError instanceof Error ? similarityError.message : "unknown_error",
      })
    }
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error"
    console.error("Feedback AI triage failed", { feedbackId: job.feedback_id, message })
    await admin.rpc("fail_feedback_ai_job", {
      p_feedback_id: job.feedback_id,
      p_claim_token: job.claim_token,
      p_error: message,
    })
    return false
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)
  const auth = req.headers.get("authorization") ?? ""
  const cronSecret = Deno.env.get("FEEDBACK_AI_CRON_SECRET") ??
    Deno.env.get("LECTIO_KEEPALIVE_CRON_SECRET") ?? ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  if (!auth || (auth !== `Bearer ${cronSecret}` && auth !== `Bearer ${serviceKey}`)) {
    return json({ error: "Unauthorized" }, 401)
  }
  if (Deno.env.get("FEEDBACK_AI_ENABLED") === "false") {
    return json({ ok: true, disabled: true, claimed: 0 })
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey)
  // gemini-3.6-flash currently allows five free-tier generation requests per
  // minute. One ticket may use two (triage + duplicate rerank), so processing
  // one job per cron tick avoids burst failures while the durable queue drains.
  const { data, error } = await admin.rpc("claim_feedback_ai_jobs", { p_batch_size: 1 })
  if (error) return json({ error: "Claim failed", detail: error.message }, 500)
  const jobs = (data ?? []) as Job[]
  const results: boolean[] = []
  for (const job of jobs) results.push(await processJob(admin, job))
  return json({ ok: true, claimed: jobs.length, succeeded: results.filter(Boolean).length })
})
