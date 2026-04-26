"use client"

import { useEffect, useRef } from "react"

import { captureHentNuClicked } from "@/lib/posthog"

export default function Page() {
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
    <div className="brand-root">
      <div className="bg-grid" />

      <div className="metadata meta-tl">
        DANISH STUDENT PROJECT
        <br />
        COPENHAGEN / DK
      </div>

      <div className="metadata meta-tr">
        FOR CHROME / FIREFOX / IOS
        <br />
        <span style={{ color: "var(--brand-accent)" }}>● LIVE</span>
      </div>

      <div className="metadata meta-bl">
        (C) BETTERLECTIO 2025
        <br />
        DESIGNED FOR SPEED
      </div>

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

      <div
        className="rect-deco"
        style={{
          width: 200,
          height: 10,
          top: "15%",
          right: "5%",
          background: "var(--brand-text)",
        }}
      />
      <div
        className="rect-deco"
        style={{
          width: 4,
          height: 100,
          bottom: "20%",
          left: "8%",
          background: "var(--brand-accent)",
        }}
      />
      <div
        className="rect-deco"
        style={{
          width: 60,
          height: 60,
          top: "10%",
          left: "15%",
          borderWidth: 8,
        }}
      />
    </div>
  )
}
