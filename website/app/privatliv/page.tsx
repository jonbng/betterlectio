import type { Metadata } from "next"

import { SiteFooter } from "@/components/site/site-footer"
import { SiteNav } from "@/components/site/site-nav"
import {
  siteButton,
  siteContainerClass,
  siteEyebrow,
  siteMainClass,
} from "@/components/site/styles"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Privatliv",
  description:
    "Dine data er dine. Sådan behandler BetterLectio dine oplysninger — på almindeligt dansk, uden juristsnak.",
  alternates: { canonical: "/privatliv" },
}

const LAST_UPDATED = "24. marts 2026"

/* --- tiny inline icon set (matches the site's inline-SVG style) ---------- */

function Icon({ children }: { children: React.ReactNode }) {
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
      {children}
    </svg>
  )
}

const NoSale = () => (
  <Icon>
    <path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6z" />
    <path d="M4.5 4.5 19.5 19.5" />
  </Icon>
)
const Minimal = () => (
  <Icon>
    <path d="M12 3 3 8l9 5 9-5z" />
    <path d="M3 13l9 5 9-5" />
  </Icon>
)
const OpenCode = () => (
  <Icon>
    <path d="M8 8 4 12l4 4M16 8l4 4-4 4M13.5 6l-3 12" />
  </Icon>
)
const Check = () => (
  <Icon>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
)
const Cross = () => (
  <Icon>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
)
const Lock = () => (
  <Icon>
    <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    <path d="M12 14v2.5" />
  </Icon>
)
const ArrowRight = () => (
  <Icon>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
)
const GitHub = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49l-.01-1.9c-2.78.62-3.37-1.2-3.37-1.2-.46-1.18-1.11-1.5-1.11-1.5-.9-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.9 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.36-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.34 9.34 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.94.68 1.9l-.01 2.82c0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2z" />
  </svg>
)

/* -------------------------------------------------------------------------- */

const PROMISES = [
  {
    icon: <NoSale />,
    title: "Vi sælger aldrig dine data",
    body: "Ingen annoncer. Ingen datamæglere. Ingen profilering. Vores forretning bygger ikke på dine oplysninger — så der er intet at sælge.",
  },
  {
    icon: <Minimal />,
    title: "Kun det, der skal til",
    body: "Vi gemmer kun data, når en funktion faktisk kræver det. Alt andet bliver i din browser og forlader aldrig din enhed.",
  },
  {
    icon: <OpenCode />,
    title: "Alt er åbent",
    body: "Hele kildekoden ligger offentligt på GitHub. Du behøver ikke tro os — du kan tjekke hver eneste linje selv.",
  },
]

const DO = [
  "Viser dit skema, dine lektier og karakterer pænere og hurtigere",
  "Husker dine indstillinger, så de følger med på tværs af dine enheder",
  "Opretter en profil og klassechat — men kun hvis du selv slår det til",
  "Sender en fejlrapport, når noget crasher, så vi kan nå at fikse det",
]

const DONT = [
  "Sælger eller udlejer dine data",
  "Deler data med annoncører eller datamæglere",
  "Sporer, hvad du laver ude på resten af nettet",
  "Rører ved dit Lectio-brugernavn eller kodeord",
  "Bruger cookies til at spore dig",
]

const SERVICES = [
  {
    name: "Supabase",
    desc: "Gemmer det, du selv laver — profilsider, klassechats og et login, der forbinder din BetterLectio-konto med din Lectio-profil (elev-id, skole og basale profiloplysninger).",
    tag: "Kun ved valgfrie funktioner",
  },
  {
    name: "PostHog",
    desc: "Fortæller os, når noget går i stykker. Ren fejl- og stabilitetsovervågning for elever, der er logget ind — så bugs bliver fundet og rettet.",
    tag: "Kun til fejlfinding",
  },
  {
    name: "UserJot",
    desc: "Tager imod din feedback og dine fejlrapporter. Der bliver kun sendt noget, hvis du selv åbner feedback-vinduet og skriver til os.",
    tag: "Kun hvis du selv skriver",
  },
]

export default function PrivatlivPage() {
  return (
    <div className="site">
      <SiteNav />

      <main className={cn(siteMainClass, siteContainerClass, "pt-6 pb-10")}>
        {/* Hero ---------------------------------------------------------- */}
        <section className="mx-auto max-w-[780px] pt-5 pb-2 text-center">
          <span className={siteEyebrow()}>Privatliv, på almindeligt dansk</span>
          <h1 className="mt-4 mb-5 text-[clamp(44px,6.4vw,76px)] font-extrabold leading-none tracking-[-0.045em]">
            Dine data er <mark className="bg-transparent text-brand">dine.</mark>
          </h1>
          <p className="mx-auto max-w-[58ch] text-[clamp(18px,2.2vw,21px)] font-medium leading-[1.5] text-ink-muted">
            BetterLectio er lavet af elever, der selv bruger Lectio hver dag. Vi
            bygger det, vi selv ville stole på — så her er præcis, hvad der sker
            med dine data. Uden juristsnak.
          </p>

          <div className="mt-[30px] flex flex-wrap justify-center gap-2.5">
            {[
              { icon: <NoSale />, label: "Ingen salg af data" },
              { icon: <Minimal />, label: "Ingen sporing" },
              { icon: <OpenCode />, label: "100% open source" },
            ].map((chip) => (
              <span
                key={chip.label}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-white/75 py-[9px] pr-4 pl-[13px] text-sm font-bold text-ink backdrop-blur-[10px] [&_svg]:size-4 [&_svg]:text-brand"
              >
                {chip.icon} {chip.label}
              </span>
            ))}
          </div>

          <p className="mt-[26px] font-mono text-xs uppercase tracking-[0.04em] text-ink-muted">
            Sidst opdateret {LAST_UPDATED}
          </p>
        </section>

        {/* Promises ------------------------------------------------------ */}
        <section className="mt-14 grid grid-cols-1 gap-4 min-[900px]:mt-[72px] min-[900px]:grid-cols-3 min-[900px]:gap-5">
          {PROMISES.map((p) => (
            <article
              key={p.title}
              className="rounded-[26px] border border-line bg-grey px-[30px] py-8 transition-[transform,box-shadow] duration-[350ms] hover:-translate-y-1 hover:shadow-[0_24px_44px_-28px_rgba(0,0,0,0.28)] motion-reduce:transition-none"
            >
              <div className="mb-5 flex size-[52px] items-center justify-center rounded-[15px] bg-brand-soft text-brand [&_svg]:size-[26px]">
                {p.icon}
              </div>
              <h3 className="mb-2.5 text-[21px] font-extrabold tracking-[-0.02em] text-ink">
                {p.title}
              </h3>
              <p className="text-[15px] leading-[1.55] text-ink-muted">{p.body}</p>
            </article>
          ))}
        </section>

        {/* The honest ledger — signature -------------------------------- */}
        <div className="mx-auto mt-[72px] max-w-[640px] text-center min-[900px]:mt-24">
          <span className={siteEyebrow()}>Det korte af det lange</span>
          <h2 className="my-3 text-[clamp(28px,3.6vw,42px)] font-extrabold tracking-[-0.03em] text-ink">
            Hvad vi gør — og aldrig gør
          </h2>
          <p className="text-[17px] leading-[1.5] text-ink-muted">
            To lister. Ingen forbehold på tre sider. Sådan her ser det ud.
          </p>
        </div>

        <section className="mt-[30px] grid grid-cols-1 gap-5 min-[900px]:grid-cols-2">
          <div className="rounded-[26px] border border-[oklch(0.9_0.05_150)] bg-[oklch(0.975_0.02_150)] p-8">
            <div className="mb-[22px] flex items-center gap-3">
              <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[11px] bg-[oklch(0.72_0.15_150)] text-white [&_svg]:size-5">
                <Check />
              </span>
              <h3 className="text-[19px] font-extrabold tracking-[-0.02em] text-ink">
                Det gør vi — så BetterLectio virker
              </h3>
            </div>
            <ul className="flex list-none flex-col gap-3.5">
              {DO.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-[11px] text-[15px] font-medium leading-[1.45] text-[#3a3a3c] [&_svg]:mt-px [&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:text-[oklch(0.6_0.15_150)]"
                >
                  <Check />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[26px] border border-[oklch(0.9_0.04_25)] bg-[oklch(0.975_0.014_25)] p-8">
            <div className="mb-[22px] flex items-center gap-3">
              <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[11px] bg-[oklch(0.62_0.2_25)] text-white [&_svg]:size-5">
                <Cross />
              </span>
              <h3 className="text-[19px] font-extrabold tracking-[-0.02em] text-ink">
                Det gør vi aldrig
              </h3>
            </div>
            <ul className="flex list-none flex-col gap-3.5">
              {DONT.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-[11px] text-[15px] font-medium leading-[1.45] text-[#3a3a3c] [&_svg]:mt-px [&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:text-[oklch(0.62_0.2_25)]"
                >
                  <Cross />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* The scariest question, answered up front --------------------- */}
        <section className="mt-[30px] flex flex-col items-start gap-[22px] rounded-[30px] bg-ink p-9 text-white min-[900px]:flex-row min-[900px]:items-center min-[900px]:gap-8 min-[900px]:px-[clamp(32px,5vw,64px)] min-[900px]:py-12">
          <div className="flex size-[84px] shrink-0 items-center justify-center rounded-3xl bg-white/10 text-white [&_svg]:size-11">
            <Lock />
          </div>
          <div>
            <span className={cn(siteEyebrow(), "text-[oklch(0.8_0.11_265)]")}>
              Det vigtigste først
            </span>
            <h2 className="mt-2 mb-3 text-[clamp(26px,3.4vw,38px)] font-extrabold tracking-[-0.03em]">
              Vi ser aldrig dit Lectio-login
            </h2>
            <p className="max-w-[60ch] text-[17px] leading-[1.55] text-white/[0.78]">
              Du logger ind hos Lectio, præcis som du plejer. BetterLectio får
              aldrig dit brugernavn eller kodeord at se — vi lægger os kun oven
              på den side, du allerede er logget ind på.
            </p>
          </div>
        </section>

        {/* Services in plain language ----------------------------------- */}
        <div className="mx-auto mt-[72px] max-w-[640px] text-center min-[900px]:mt-24">
          <span className={siteEyebrow()}>Bag kulisserne</span>
          <h2 className="my-3 text-[clamp(28px,3.6vw,42px)] font-extrabold tracking-[-0.03em] text-ink">
            Hvem hjælper os — og hvornår
          </h2>
          <p className="text-[17px] leading-[1.5] text-ink-muted">
            Nogle funktioner har brug for en server. Her er de tre tjenester, vi
            bruger, og præcis hvornår de kommer i spil.
          </p>
        </div>

        <section className="mt-[26px] flex flex-col gap-3.5">
          {SERVICES.map((s) => (
            <article
              key={s.name}
              className="grid grid-cols-1 items-center gap-2 rounded-[22px] border border-line bg-white px-7 py-6 shadow-[0_10px_30px_-24px_rgba(0,0,0,0.25)] min-[900px]:grid-cols-[auto_1fr_auto] min-[900px]:gap-[22px]"
            >
              <span className="min-w-[96px] text-lg font-extrabold tracking-[-0.01em] text-ink">
                {s.name}
              </span>
              <p className="text-[15px] leading-[1.5] text-ink-muted">{s.desc}</p>
              <span className="justify-self-start whitespace-nowrap rounded-full bg-brand-soft px-3 py-1.5 text-center font-mono text-[11px] font-bold uppercase tracking-[0.04em] text-brand">
                {s.tag}
              </span>
            </article>
          ))}
        </section>

        {/* Full detail, tucked away ------------------------------------- */}
        <div className="mx-auto mt-[72px] max-w-[640px] text-center min-[900px]:mt-24">
          <span className={siteEyebrow()}>For dig, der vil dybere</span>
          <h2 className="my-3 text-[clamp(28px,3.6vw,42px)] font-extrabold tracking-[-0.03em] text-ink">
            Alle detaljerne
          </h2>
          <p className="text-[17px] leading-[1.5] text-ink-muted">
            Fold ud, hvis du vil have den fulde version. Alt er her.
          </p>
        </div>

        <section className="site-details">
          <details className="site-detail">
            <summary>Hvad tilgår udvidelsen på din computer?</summary>
            <div className="site-detail__body">
              <ul>
                <li>
                  <span>
                    <strong>Lectio-sider:</strong> Udvidelsen kører på
                    lectio.dk for at forbedre brugerfladen og tilføje
                    BetterLectios funktioner.
                  </span>
                </li>
                <li>
                  <span>
                    <strong>Lokal lagring:</strong> Vi bruger din browsers lokale
                    lager til at gemme indstillinger og cachede data. Det bliver i
                    din browser, medmindre en funktion udtrykkeligt afhænger af en
                    ekstern tjeneste.
                  </span>
                </li>
              </ul>
            </div>
          </details>

          <details className="site-detail">
            <summary>Hvilke data kan blive sendt til eksterne tjenester?</summary>
            <div className="site-detail__body">
              <ul>
                <li>
                  <span>
                    <strong>Til valgfrie funktioner:</strong> Data, du selv
                    vælger at oprette eller opdatere — fx profiloplysninger og
                    indhold i private klassechats.
                  </span>
                </li>
                <li>
                  <span>
                    <strong>Til login og kontokobling:</strong> De oplysninger,
                    der skal til for at forbinde din BetterLectio-konto med din
                    Lectio-identitet — dit elev-id, din skole og basale
                    profildetaljer.
                  </span>
                </li>
                <li>
                  <span>
                    <strong>Til fejlfinding:</strong> Teknisk information om crashes
                    og fejl, plus den kontekst om konto og skole, der skal til for
                    at forstå og løse problemet.
                  </span>
                </li>
                <li>
                  <span>
                    <strong>Til feedback:</strong> Det, du selv vælger at sende via
                    feedback-vinduet.
                  </span>
                </li>
              </ul>
              <p>
                Vi bruger aldrig disse data til annoncering, datahandel eller
                sporing på tværs af sider — kun til at få funktionerne til at
                virke og holde udvidelsen stabil.
              </p>
            </div>
          </details>

          <details className="site-detail">
            <summary>Hvilke tilladelser beder udvidelsen om?</summary>
            <div className="site-detail__body">
              <ul>
                <li>
                  <span>
                    <strong>storage:</strong> Til at gemme lokale indstillinger,
                    cachede data og den tilstand, funktionerne har brug for.
                  </span>
                </li>
                <li>
                  <span>
                    <strong>Netværksadgang til BetterLectios tjenester:</strong>{" "}
                    Bruges kun, når en funktion har brug for Supabase, eller når en
                    fejlrapport sendes til PostHog.
                  </span>
                </li>
              </ul>
            </div>
          </details>

          <details className="site-detail">
            <summary>Bruger I cookies eller sporing?</summary>
            <div className="site-detail__body">
              <p>
                Nej. Vi bruger ikke sporingscookies, og vi følger dig ikke rundt
                på nettet. PostHog bruges udelukkende til fejl- og
                stabilitetsovervågning for elever, der er logget ind.
              </p>
              <p>
                UserJot bruges ikke til passiv sporing. Åbner du ikke selv
                vinduet og sender noget, bliver der ikke sendt nogen feedback
                eller fejlrapport.
              </p>
            </div>
          </details>

          <details className="site-detail">
            <summary>Hvem står bag, og hvordan ændres politikken?</summary>
            <div className="site-detail__body">
              <p>
                BetterLectio er open source. Du kan gennemgå hele kildekoden på{" "}
                <a
                  href="https://github.com/jonbng/betterlectio"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  github.com/jonbng/betterlectio
                </a>
                .
              </p>
              <p>
                Ændrer vi denne politik, opdaterer vi datoen for
                &ldquo;Sidst opdateret&rdquo; øverst på siden. BetterLectio er ikke
                tilknyttet MaCom A/S, der står bag Lectio.
              </p>
            </div>
          </details>
        </section>

        {/* Open source + contact ---------------------------------------- */}
        <section className="mt-[30px] rounded-[30px] bg-brand p-[clamp(40px,5vw,64px)] text-center text-white">
          <span className={cn(siteEyebrow(), "text-white/80")}>
            Tro os ikke på ordet
          </span>
          <h2 className="mt-2.5 mb-3 text-[clamp(28px,3.6vw,40px)] font-extrabold tracking-[-0.03em]">
            Tjek det hele selv
          </h2>
          <p className="mx-auto mb-7 max-w-[52ch] text-[17px] leading-[1.55] text-white/85">
            Alt er open source. Læs koden, åbn en sag, eller skriv til os — vi
            svarer gerne på alt om, hvordan dine data bliver behandlet.
          </p>
          <div className="flex flex-wrap justify-center gap-3.5">
            <a
              className={siteButton("secondary")}
              href="https://github.com/jonbng/betterlectio"
              target="_blank"
              rel="noreferrer noopener"
            >
              <GitHub /> Se koden på GitHub
            </a>
            <a
              className={siteButton("ghost")}
              href="https://github.com/jonbng/betterlectio/issues"
              target="_blank"
              rel="noreferrer noopener"
            >
              Stil et spørgsmål <ArrowRight />
            </a>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
