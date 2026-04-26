import { LandingHero } from "@/components/landing-hero"
import { fetchSchoolCount } from "@/lib/stats"

export const revalidate = 3600

export default async function Page() {
  const schoolCount = await fetchSchoolCount()

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

      {schoolCount && schoolCount > 0 && (
        <div className="metadata meta-br">
          BRUGES PÅ
          <br />
          <span className="meta-count">{schoolCount}</span> SKOLER
        </div>
      )}

      <LandingHero />

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
