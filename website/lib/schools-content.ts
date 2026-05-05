export type Variant = (name: string) => string

export const introVariants: Variant[] = [
  (name) =>
    `Går du på ${name}? Så kender du Lectio — og du kender også, hvor langsomt og rodet det kan føles. BetterLectio er en moderne brugerflade oven på det samme Lectio, du allerede bruger.`,
  (name) =>
    `Lectio er en del af hverdagen på ${name}, men brugerfladen er fra forrige årti. BetterLectio rydder op, gør tingene hurtigere og giver dig mørk tilstand, bedre skema og en rigtig lektieoversigt.`,
  (name) =>
    `Tusindvis af elever bruger Lectio dagligt på ${name}. BetterLectio er en gratis udvidelse, der gør Lectio pænere, hurtigere og nemmere at finde rundt i — uden at ændre noget i din profil.`,
  (name) =>
    `Hvis du er træt af, at Lectio på ${name} ser ud som om det er fra 2008, så er BetterLectio til dig. Samme system, samme login — bare bedre.`,
  (name) =>
    `BetterLectio gør Lectio brugbart igen på ${name}. Mørk tilstand, hurtigere skema, samlet lektie- og opgaveoversigt og beskeder uden konstant genindlæsning.`,
  (name) =>
    `Lectio er der for at blive — også på ${name}. BetterLectio er en let udvidelse, der lægger en moderne brugerflade ovenpå, så de daglige opgaver bliver markant hurtigere.`,
]

export type Benefit = {
  title: string
  body: string
}

export const benefits: Benefit[] = [
  {
    title: "Mørk tilstand",
    body: "Endelig. Lectio i mørk tilstand uden hvide blink kl. 22 om aftenen. Skifter automatisk efter dit system.",
  },
  {
    title: "Hurtigere skema",
    body: "Skemaet indlæses og navigeres øjeblikkeligt. Hover over en time og se lektier og noter uden at klikke ind.",
  },
  {
    title: "Lektieoversigt",
    body: "Alle dine lektier samlet ét sted, sorteret efter dag, med afkrydsning der synkroniseres på tværs af dine enheder.",
  },
  {
    title: "Opgaveoversigt",
    body: "Alle opgaver i én tidslinje med tydelige status-markeringer, deadline-mærker direkte i skemaet og hurtig adgang til afleveringer.",
  },
  {
    title: "Beskeder uden genindlæsning",
    body: "Send, svar, slet og marker beskeder uden at hele siden lader om. Vedhæft filer ligesom i en moderne mail-klient.",
  },
  {
    title: "Mobil-app",
    body: "BetterLectio findes også som app, så du har skema, lektier og beskeder lige ved hånden — også når du ikke sidder ved computeren.",
  },
]

export const closingVariants: Variant[] = [
  (name) =>
    `Hop på BetterLectio på ${name} — det tager under et minut at installere, og du kan altid slå det fra igen.`,
  (name) =>
    `Tag ${name} ind i 2026. Installer BetterLectio gratis og oplev forskellen i dag.`,
  (name) =>
    `Klar til at give Lectio på ${name} et løft? Hent BetterLectio gratis og prøv det selv.`,
  (name) =>
    `Bliv en del af de elever på ${name}, der bruger BetterLectio hver dag. Gratis at installere, ingen konto, intet rod.`,
]

export type FaqItem = {
  q: string
  a: (name: string) => string
}

export const faqPool: FaqItem[] = [
  {
    q: "Er BetterLectio gratis?",
    a: () =>
      "Ja. BetterLectio er helt gratis at bruge. Der er ingen reklamer, ingen abonnement og ingen skjulte gebyrer.",
  },
  {
    q: "Skal jeg lave en ny konto?",
    a: () =>
      "Nej. Du logger ind via dit eksisterende Lectio-login. BetterLectio er en udvidelse oven på Lectio og bruger din almindelige adgang.",
  },
  {
    q: "Virker det på min skole?",
    a: (name) =>
      `Ja — BetterLectio virker på alle skoler, der bruger Lectio. Det inkluderer ${name}.`,
  },
  {
    q: "Kan lærerne se, at jeg bruger BetterLectio?",
    a: () =>
      "Nej. BetterLectio kører kun lokalt i din browser eller din mobil. Lectio's servere ser ikke noget anderledes — for dem ligner du en helt almindelig elev.",
  },
  {
    q: "Hvad med privatliv og data?",
    a: () =>
      "Dine login-oplysninger og personlige data forbliver mellem dig og Lectio. BetterLectio sender ikke dit kodeord eller dine beskeder videre. Du kan se vores privatlivspolitik på /privatliv.",
  },
  {
    q: "Hvad hvis jeg ikke kan lide det?",
    a: () =>
      "Så slår du det bare fra igen — afinstaller udvidelsen eller slet appen, og du er tilbage til standard Lectio. Ingen spor, intet låst inde.",
  },
]

export const headingPools: Record<"why" | "start" | "faq", Variant[]> = {
  why: [
    (name) => `Hvorfor BetterLectio på ${name}?`,
    () => "Lectio — bare bedre.",
    (name) => `Lavet til elever på ${name}`,
  ],
  start: [
    () => "Sådan kommer du i gang",
    () => "Klar på et minut",
    () => "Hent BetterLectio",
  ],
  faq: [
    () => "Ofte stillede spørgsmål",
    () => "Spørgsmål og svar",
    () => "FAQ",
  ],
}
