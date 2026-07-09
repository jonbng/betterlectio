"use client"

import { useEffect, useState, useTransition } from "react"

import { siteButton } from "@/components/site/styles"
import { capture } from "@/lib/posthog"
import { cn } from "@/lib/utils"

import { submitUninstallFeedback } from "./actions"

type ReasonKey =
  | "too_complicated"
  | "missing_feature"
  | "broken"
  | "switched_browser"
  | "performance"
  | "switched_to_app"
  | "graduated"
  | "other"

const REASONS: { key: ReasonKey; label: string }[] = [
  { key: "too_complicated", label: "For kompliceret" },
  { key: "broken", label: "Noget virkede ikke" },
  { key: "missing_feature", label: "Manglede en funktion" },
  { key: "performance", label: "For langsom / tung" },
  { key: "switched_browser", label: "Skiftede browser" },
  { key: "switched_to_app", label: "Bruger app'en i stedet" },
  { key: "graduated", label: "Færdig med gymnasiet" },
  { key: "other", label: "Andet" },
]

export function UninstallForm({ studentId }: { studentId: string }) {
  const [reason, setReason] = useState<ReasonKey | null>(null)
  const [feedback, setFeedback] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    capture("uninstall page viewed", {
      has_student_id: Boolean(studentId),
    })
  }, [studentId])

  const isTooComplicated = reason === "too_complicated"
  const feedbackTrimmed = feedback.trim()
  const feedbackRequired = isTooComplicated
  const canSubmit = Boolean(reason) && (!feedbackRequired || feedbackTrimmed.length > 0)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reason || isPending || submitted) return
    if (feedbackRequired && feedbackTrimmed.length === 0) {
      setError("Skriv kort hvad der var for kompliceret — det er det vi prøver at fikse.")
      return
    }

    setError(null)

    capture("uninstall reason submitted", {
      reason,
      has_feedback: feedback.trim().length > 0,
      feedback_length: feedback.trim().length,
      has_student_id: Boolean(studentId),
    })

    if (!studentId) {
      // No DB write possible without a student id — still treat as submitted
      // so the user gets their thank-you state. PostHog already has the event.
      setSubmitted(true)
      return
    }

    startTransition(async () => {
      const result = await submitUninstallFeedback({
        studentId,
        reason,
        feedback,
      })
      if (result.ok) {
        setSubmitted(true)
      } else {
        setError("Kunne ikke gemme feedback. Prøv igen om lidt.")
      }
    })
  }

  if (submitted) {
    return (
      <div
        className="mt-3 rounded-[22px] border border-line bg-white p-7 shadow-[0_14px_34px_-20px_rgba(0,0,0,0.3)]"
        role="status"
        aria-live="polite"
      >
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-volt">
          TAK
        </div>
        <p className="my-1.5 text-[26px] font-extrabold tracking-[-0.02em]">
          Det betyder meget.
        </p>
        <p className="max-w-[50ch] text-ink-muted">
          Vi læser alt — og bruger det til at gøre BetterLectio bedre.
        </p>
      </div>
    )
  }

  return (
    <form className="mt-9 flex flex-col gap-[26px]" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-3">
        <div className="text-[15px] font-bold text-ink">
          Hvorfor afinstallerede du?
        </div>
        <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Årsag">
          {REASONS.map((r) => {
            const active = reason === r.key
            return (
              <button
                key={r.key}
                type="button"
                role="radio"
                aria-checked={active}
                className={cn(
                  "rounded-full border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-[border-color,color,background] hover:border-brand hover:text-brand",
                  active &&
                    "border-brand bg-brand text-white hover:border-brand hover:text-white",
                )}
                onClick={() => {
                  setReason(r.key)
                  setError(null)
                }}
              >
                {r.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <label htmlFor="uninstall-feedback" className="text-[15px] font-bold text-ink">
          {isTooComplicated ? (
            <>Hvad var for kompliceret?</>
          ) : (
            <>
              Noget mere på hjerte?{" "}
              <span className="font-medium text-ink-muted">(valgfrit)</span>
            </>
          )}
        </label>
        <textarea
          id="uninstall-feedback"
          className="min-h-[120px] w-full resize-y rounded-2xl border border-line bg-white px-4 py-3.5 text-[15px] leading-[1.5] text-ink transition-[border-color,box-shadow] focus:border-brand focus:shadow-[0_0_0_3px_color-mix(in_oklch,var(--blue)_22%,transparent)] focus:outline-none"
          rows={4}
          maxLength={2000}
          required={feedbackRequired}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder={
            isTooComplicated
              ? "F.eks. en bestemt side, en knap der var svær at finde, eller noget der virkede anderledes end Lectio."
              : "Hvad savnede du? Hvad gik galt? Skriv løs."
          }
        />
      </div>

      {error && <p className="text-[13px] font-medium text-[#d70015]">{error}</p>}

      <button
        type="submit"
        className={siteButton("primary", "self-start")}
        disabled={!canSubmit || isPending}
      >
        {isPending ? "Sender…" : "Send feedback"}
      </button>
    </form>
  )
}
