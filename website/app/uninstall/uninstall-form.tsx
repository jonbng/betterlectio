"use client"

import { useEffect, useState, useTransition } from "react"

import { capture } from "@/lib/posthog"

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
      <div className="uninstall-thanks" role="status" aria-live="polite">
        <div className="uninstall-thanks-eyebrow">TAK</div>
        <p className="uninstall-thanks-title">Det betyder meget.</p>
        <p className="uninstall-thanks-body">
          Vi læser alt — og bruger det til at gøre BetterLectio bedre.
        </p>
      </div>
    )
  }

  return (
    <form className="uninstall-form" onSubmit={handleSubmit}>
      <div className="uninstall-section">
        <div className="uninstall-label">Hvorfor afinstallerede du?</div>
        <div className="uninstall-reasons" role="radiogroup" aria-label="Årsag">
          {REASONS.map((r) => {
            const active = reason === r.key
            return (
              <button
                key={r.key}
                type="button"
                role="radio"
                aria-checked={active}
                className={`uninstall-chip${active ? " uninstall-chip--active" : ""}`}
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

      <div className="uninstall-section">
        <label htmlFor="uninstall-feedback" className="uninstall-label">
          {isTooComplicated ? (
            <>Hvad var for kompliceret?</>
          ) : (
            <>
              Noget mere på hjerte? <span className="uninstall-optional">(valgfrit)</span>
            </>
          )}
        </label>
        <textarea
          id="uninstall-feedback"
          className="uninstall-textarea"
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

      {error && <p className="uninstall-error">{error}</p>}

      <button
        type="submit"
        className="uninstall-submit"
        disabled={!canSubmit || isPending}
      >
        {isPending ? "Sender…" : "Send feedback"}
      </button>
    </form>
  )
}
