"use client"

import { useEffect, useRef } from "react"

import { captureHentNuClicked } from "@/lib/posthog"

export function LandingHero() {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const h1 = headingRef.current
    if (!h1) return

    const handleMouseMove = (e: MouseEvent) => {
      const xShift = (e.clientX / window.innerWidth - 0.5) * 10
      const yShift = (e.clientY / window.innerHeight - 0.5) * 10
      h1.style.transform = `translate(${xShift}px, ${yShift}px) rotate(-1.5deg)`
    }

    document.addEventListener("mousemove", handleMouseMove)
    return () => document.removeEventListener("mousemove", handleMouseMove)
  }, [])

  return (
    <main className="hero-container">
      <h1 ref={headingRef} style={{ transform: "rotate(-1.5deg)" }}>
        <span className="title-top">Better</span>
        <span className="title-bottom">Lectio</span>
      </h1>

      <p className="sub-tagline">Lectio, bare bedre.</p>

      <div className="download-wrapper">
        <a href="/download" className="btn-main" onClick={() => captureHentNuClicked()}>
          Hent Nu
          <svg viewBox="0 0 24 24">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
          </svg>
        </a>
      </div>
    </main>
  )
}
