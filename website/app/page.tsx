import { HeroCta } from "@/components/site/hero-cta"
import { ParallaxController } from "@/components/site/parallax-controller"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteNav } from "@/components/site/site-nav"
import {
  siteContainerClass,
  siteEyebrow,
  siteMainClass,
} from "@/components/site/styles"
import { JsonLd, siteJsonLd } from "@/components/site/structured-data"
import { getSchoolCount } from "@/lib/school-count"
import { cn } from "@/lib/utils"

type RailItem = { label: string; d: string; active?: boolean; badge?: string }
type Brick = {
  subject: string
  teacher: string
  badge: string
  color: "blue" | "orange" | "teal" | "green" | "red" | "purple"
  amber?: boolean
}
type Day = { day: string; today?: boolean; bricks: Brick[] }

// Mirrors the real AppSidebar sections + the week schedule with hold colours.
const RAIL_NAV: RailItem[] = [
  { label: "Forside", d: "M4 11 12 4l8 7M6 9v10h12V9" },
  { label: "Skema", d: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4", active: true },
  { label: "Opgaver", d: "M8 4h8v3H8zM6 5H5v15h14V5h-1M9 13l2 2 4-4" },
  { label: "Lektier", d: "M5 4h13v16H7a2 2 0 0 1-2-2zM9 4v16" },
  { label: "Beskeder", d: "M4 5h16v11H8l-4 4z", badge: "4" },
  { label: "Karakterer", d: "M12 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10M9 12l-1 8 3-2 3 2-1-8" },
]

const SCHEDULE: Day[] = [
  {
    day: "Ons 8/4",
    bricks: [
      { subject: "Fysik", teacher: "Ida Hansen", badge: "VC", color: "blue" },
      { subject: "Tysk", teacher: "Sebastian N.", badge: "23", color: "orange" },
      { subject: "Matematik", teacher: "Peter R.", badge: "25", color: "teal" },
    ],
  },
  {
    day: "I dag",
    today: true,
    bricks: [
      { subject: "Kemi", teacher: "Oliver A.", badge: "1.1", color: "green" },
      { subject: "Dansk", teacher: "Sebastian L.", badge: "Ændret", amber: true, color: "red" },
      { subject: "Mediefag", teacher: "Olivia N.", badge: "SH1", color: "purple" },
    ],
  },
  {
    day: "Fre 10/4",
    bricks: [
      { subject: "Engelsk", teacher: "Victor N.", badge: "25", color: "teal" },
      { subject: "Samfundsfag", teacher: "Mathias H.", badge: "25", color: "teal" },
      { subject: "Idræt", teacher: "Peter R.", badge: "Hal", color: "green" },
    ],
  },
]

function RailIcon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

const FEATURE_TITLE_CLASS =
  "mt-3 mb-3.5 text-[clamp(24px,2.6vw,32px)] font-extrabold tracking-[-1px]"
const FEATURE_BODY_CLASS = "text-[17px] leading-[1.5] text-ink-muted"
const FEATURE_BASE =
  "col-span-1 overflow-hidden rounded-[30px] p-[30px] transition-[background,color,transform] duration-[400ms] hover:-translate-y-1 motion-reduce:transition-none min-[720px]:p-[38px]"

export default async function HomePage() {
  const schoolCount = await getSchoolCount()

  return (
    <div className="site">
      <JsonLd data={siteJsonLd()} />
      <div className="site-diagonal" aria-hidden="true" />
      <ParallaxController />

      <SiteNav />

      <main className={siteMainClass}>
        {/* Hero ------------------------------------------------------------ */}
        <section
          className={cn(
            siteContainerClass,
            "grid min-h-[68vh] grid-cols-1 items-center gap-14 pt-10 pb-[60px] lg:grid-cols-[1.15fr_1fr] lg:gap-12",
          )}
          id="skema"
        >
          <div>
            <span className={siteEyebrow()}>Lectio, men det virker</span>
            <h1 className="mt-[18px] mb-[22px] text-[clamp(48px,6.2vw,82px)] font-extrabold leading-[0.98] tracking-[-0.04em]">
              Lectio, <mark className="bg-transparent text-ink-muted">bare bedre.</mark>
            </h1>
            <p className="max-w-[460px] text-[clamp(18px,2.2vw,22px)] font-medium leading-[1.4] text-ink-muted">
              Samme skema, samme karakterer, samme beskeder — bare uden at det
              føles som at bruge en hjemmeside fra 2008. Hurtigere, pænere og
              faktisk til at finde rundt i.
            </p>

            <HeroCta />

            <div className="mt-11 flex items-center gap-3.5">
              <div className="site-avatars" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <p className="text-sm font-medium text-ink-muted">
                Allerede skiftet: elever på {schoolCount} gymnasier.
              </p>
            </div>
          </div>

          {/* Signature: the phone-shaped schedule mockup ------------------- */}
          <div className="site-visual">
            <div className="site-float site-float--gpa">
              <span className={siteEyebrow("ink")}>Gennemsnit</span>
              <span className="site-float__val">11,4</span>
            </div>

            <div className="site-float site-float--dark">
              <span className={siteEyebrow()}>Mørk tilstand</span>
              <div className="site-float__row">
                <span className="site-toggle" aria-hidden="true">
                  <span className="site-knob" />
                </span>
                <span className="site-float__hint">Til / fra</span>
              </div>
            </div>

            <div
              className="site-mockup"
              role="img"
              aria-label="BetterLectios skema — en uge med farvekodede moduler"
            >
              <div className="site-app">
                <aside className="site-app__rail">
                  <div className="site-app__brand">
                    <span className="site-app__logo" aria-hidden="true" />
                    <span className="site-app__brandname">BetterLectio</span>
                  </div>

                  <nav className="site-app__nav">
                    {RAIL_NAV.map((item) => (
                      <span
                        key={item.label}
                        className={`site-app__navitem${item.active ? " is-active" : ""}`}
                      >
                        <RailIcon d={item.d} />
                        {item.label}
                        {item.badge ? <span className="site-app__badge">{item.badge}</span> : null}
                      </span>
                    ))}
                  </nav>

                  <div className="site-app__me">
                    <span className="site-app__avatar" aria-hidden="true" />
                    <div>
                      <div className="site-app__mename">Mads Nielsen</div>
                      <div className="site-app__meta">3.g · Gefion</div>
                    </div>
                  </div>
                </aside>

                <div className="site-app__main">
                  <div className="site-app__bar">
                    <span className="site-app__week">Uge 15 · 6.–12. apr</span>
                    <span className="site-app__today">I dag</span>
                  </div>

                  <div className="site-app__grid">
                    {SCHEDULE.map((col) => (
                      <div
                        key={col.day}
                        className={`site-app__col${col.today ? " is-today" : ""}`}
                      >
                        <div className="site-app__day">{col.day}</div>
                        {col.bricks.map((bk) => (
                          <div
                            key={bk.subject}
                            className={`site-brick site-brick--${bk.color}`}
                          >
                            <span
                              className={`site-brick__badge${bk.amber ? " site-brick__badge--amber" : ""}`}
                            >
                              {bk.badge}
                            </span>
                            <b>{bk.subject}</b>
                            <span className="site-brick__teacher">{bk.teacher}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features -------------------------------------------------------- */}
        <section
          className={cn(
            siteContainerClass,
            "grid grid-cols-1 gap-[22px] py-[70px] pb-[60px] min-[720px]:grid-cols-12 min-[720px]:py-[110px] min-[720px]:pb-[90px]",
          )}
          id="funktioner"
        >
          <div
            className={cn(
              FEATURE_BASE,
              "bg-brand text-white min-[720px]:col-span-12 lg:col-span-8",
            )}
          >
            <span className={siteEyebrow("volt")}>Karakterer</span>
            <h3 className={FEATURE_TITLE_CLASS}>Slut med at regne gennemsnit i hånden.</h3>
            <p className="text-[17px] leading-[1.5] text-white/80">
              Alle karakterer samlet, farvekodet og vægtet automatisk. Du kan se
              præcis hvor du står — uden et regneark åbent ved siden af.
            </p>
            <div className="mt-8 flex h-40 items-end gap-2.5" aria-hidden="true">
              <i className="block w-10 rounded-t-md bg-volt" style={{ height: "60%" }} />
              <i className="block w-10 rounded-t-md bg-volt" style={{ height: "85%", opacity: 0.8 }} />
              <i className="block w-10 rounded-t-md bg-volt" style={{ height: "72%", opacity: 0.6 }} />
              <i className="block w-10 rounded-t-md bg-volt" style={{ height: "100%", opacity: 0.45 }} />
            </div>
          </div>

          <div
            className={cn(
              FEATURE_BASE,
              "group bg-grey hover:bg-ink hover:text-white min-[720px]:col-span-6 lg:col-span-4",
            )}
          >
            <span className={cn(siteEyebrow(), "group-hover:text-white/[0.72]")}>
              Mørk tilstand
            </span>
            <h3 className={FEATURE_TITLE_CLASS}>Endelig ordentlig dark mode.</h3>
            <p className={cn(FEATURE_BODY_CLASS, "group-hover:text-white/[0.72]")}>
              Rigtig sort — ikke Lectios triste grå. Perfekt til aftenlektier.
            </p>
          </div>

          <div
            className={cn(
              FEATURE_BASE,
              "group bg-grey hover:bg-ink hover:text-white min-[720px]:col-span-6 lg:col-span-4",
            )}
          >
            <span className={cn(siteEyebrow(), "group-hover:text-white/[0.72]")}>
              Lektier
            </span>
            <h3 className={FEATURE_TITLE_CLASS}>Alt du skylder, ét sted.</h3>
            <p className={cn(FEATURE_BODY_CLASS, "group-hover:text-white/[0.72]")}>
              Alle afleveringer fra alle hold i én tjekliste. Ikke tre klik pr.
              hold for at finde ud af hvad der er for.
            </p>
          </div>

          <div
            className={cn(
              FEATURE_BASE,
              "bg-[oklch(0.955_0.018_265)] min-[720px]:col-span-12 lg:col-span-8",
            )}
          >
            <span className={siteEyebrow("ink")}>Mobil</span>
            <h3 className={FEATURE_TITLE_CLASS}>Nu også i lommen.</h3>
            <p className={FEATURE_BODY_CLASS}>
              En rigtig app til iPhone — ikke Lectios mobilside, der ser ud som
              om den giver op. Skema, beskeder og lektier åbner med det samme.
            </p>
          </div>
        </section>
      </main>

      {/* Ticker ------------------------------------------------------------ */}
      <div className="site-ticker" aria-hidden="true">
        <div className="site-ticker__track">
          <TickerRun />
          <TickerRun />
        </div>
      </div>

      <SiteFooter />
    </div>
  )
}

function TickerRun() {
  return (
    <>
      <span className="site-ticker__item">
        Skema <b>Opdateret</b>
      </span>
      <span className="site-ticker__item">
        Ny besked <b>Ida H.</b>
      </span>
      <span className="site-ticker__item">
        Aflevering <b>Afleveret</b>
      </span>
      <span className="site-ticker__item">
        Lokaleændring <b>Bio-lab</b>
      </span>
      <span className="site-ticker__item">
        Karakter <b>10</b>
      </span>
      <span className="site-ticker__item">
        Lektier <b>3 i dag</b>
      </span>
    </>
  )
}
