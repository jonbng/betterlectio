"use client"

import { useEffect, useRef } from "react"

export default function Page() {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    const h1 = headingRef.current
    const root = rootRef.current
    const btn = btnRef.current
    if (!h1 || !root || !btn) return

    const handleMouseMove = (e: MouseEvent) => {
      const xShift = (e.clientX / window.innerWidth - 0.5) * 10
      const yShift = (e.clientY / window.innerHeight - 0.5) * 10
      h1.style.transform = `translate(${xShift}px, ${yShift}px) rotate(-1.5deg)`
    }

    const handleMouseDown = () => {
      root.style.backgroundColor = "var(--brand-text)"
      root.style.color = "var(--brand-bg)"
    }

    const handleMouseUp = () => {
      root.style.backgroundColor = ""
      root.style.color = ""
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
    btn.addEventListener("mousedown", handleMouseDown)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      btn.removeEventListener("mousedown", handleMouseDown)
    }
  }, [])

  return (
    <div ref={rootRef} className="brand-root">
      <div className="bg-grid" />

      <div className="metadata meta-tl">
        <div className="badge">BUILD_ID: 2025.A1</div>
        <br />
        DANISH STUDENT PROJECT
        <br />
        COPENHAGEN / DK
      </div>

      <div className="metadata meta-tr">
        FOR CHROME / FIREFOX / IOS
        <br />
        <span style={{ color: "var(--brand-accent)" }}>● LIVE SYSTEM STATUS</span>
      </div>

      <div className="metadata meta-bl">
        (C) BETTERLECTIO 2025
        <br />
        DESIGNED FOR SPEED
      </div>

      <div className="metadata meta-br">
        4,129 ACTIVE USERS
        <br />
        V.2.0.4 [STABLE]
      </div>

      <main className="hero-container">
        <h1 ref={headingRef} style={{ transform: "rotate(-1.5deg)" }}>
          <span className="title-top">Better</span>
          <span className="title-bottom">Lectio</span>
        </h1>

        <p className="sub-tagline">Lectio, bare uden alt det lort.</p>

        <div className="download-wrapper">
          <a ref={btnRef} href="#" className="btn-main">
            Hent Nu
            <svg viewBox="0 0 24 24">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
            </svg>
          </a>
          <div className="free-tag">FREE TO USE — ALWAYS</div>
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
