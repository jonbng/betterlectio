import { useEffect, useRef, useState } from "preact/hooks";
import { createPortal } from "preact/compat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import {
  X,
  Palette,
  Type,
  RulerIcon,
  MousePointerClick,
  Tag,
  LayoutGrid,
  FormInput,
  TableIcon,
  CalendarDays,
  UserRound,
  FileText,
  Timer,
  AlertTriangle,
  Plus,
  ArrowRight,
  Download,
  Search,
  Star,
  CheckCircle2,
  Clock,
  CircleAlert,
  School,
  DoorOpen,
} from "lucide-react";

interface DesignPlaygroundProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const sections = [
  { id: "farver", name: "Farver", icon: Palette },
  { id: "typografi", name: "Typografi", icon: Type },
  { id: "afstand", name: "Afstand & Radius", icon: RulerIcon },
  { id: "knapper", name: "Knapper", icon: MousePointerClick },
  { id: "badges", name: "Badges & Pills", icon: Tag },
  { id: "kort", name: "Kort", icon: LayoutGrid },
  { id: "formularer", name: "Formularer", icon: FormInput },
  { id: "tabeller", name: "Tabeller", icon: TableIcon },
  { id: "skemabrikker", name: "Skema Brikker", icon: CalendarDays },
  { id: "personkort", name: "Personkort", icon: UserRound },
  { id: "opgavekort", name: "Opgavekort", icon: FileText },
  { id: "nedtaelling", name: "Nedtælling", icon: Timer },
  { id: "advarsler", name: "Advarsler", icon: AlertTriangle },
];

/* ─── Section wrapper ─────────────────────────────────────── */
function Section({ title, description, children }: {
  title: string;
  description?: string;
  children: preact.ComponentChildren;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Subsection({ title, children }: {
  title: string;
  children: preact.ComponentChildren;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}

/* ─── Color swatch ────────────────────────────────────────── */
function Swatch({ name, value, cssVar }: { name: string; value: string; cssVar?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="w-12 h-12 rounded-lg border shadow-sm"
        style={{ background: cssVar ? `var(${cssVar})` : value }}
      />
      <span className="text-[11px] font-medium text-center leading-tight">{name}</span>
      <span className="text-[10px] text-muted-foreground font-mono text-center leading-tight">{value}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   1. FARVER
   ═══════════════════════════════════════════════════════════ */
function FarverSection() {
  return (
    <Section title="Farver" description="Alle farver bruger OKLCH med hue 265 (indigo-blå)">
      <Subsection title="Kernepalette">
        <div className="flex flex-wrap gap-4">
          <Swatch name="Primary" value="oklch(0.54 0.2 265)" cssVar="--primary" />
          <Swatch name="Primary FG" value="oklch(0.985 0 0)" cssVar="--primary-foreground" />
          <Swatch name="Secondary" value="oklch(0.955 0.01 265)" cssVar="--secondary" />
          <Swatch name="Secondary FG" value="oklch(0.205 0.015 265)" cssVar="--secondary-foreground" />
          <Swatch name="Accent" value="oklch(0.94 0.012 265)" cssVar="--accent" />
          <Swatch name="Destructive" value="oklch(0.577 0.245 27)" cssVar="--destructive" />
        </div>
      </Subsection>

      <Subsection title="Neutraler">
        <div className="flex flex-wrap gap-4">
          <Swatch name="Background" value="oklch(0.985 0.003 265)" cssVar="--background" />
          <Swatch name="Foreground" value="oklch(0.145 0.014 265)" cssVar="--foreground" />
          <Swatch name="Card" value="oklch(1 0 0)" cssVar="--card" />
          <Swatch name="Muted" value="oklch(0.955 0.01 265)" cssVar="--muted" />
          <Swatch name="Muted FG" value="oklch(0.55 0.02 265)" cssVar="--muted-foreground" />
          <Swatch name="Border" value="oklch(0.91 0.008 265)" cssVar="--border" />
          <Swatch name="Input" value="oklch(0.91 0.008 265)" cssVar="--input" />
          <Swatch name="Ring" value="oklch(0.54 0.2 265)" cssVar="--ring" />
        </div>
      </Subsection>

      <Subsection title="Sidebar">
        <div className="flex flex-wrap gap-4">
          <Swatch name="Sidebar" value="oklch(0.97 0.006 265)" cssVar="--sidebar" />
          <Swatch name="Sidebar FG" value="oklch(0.3 0.02 265)" cssVar="--sidebar-foreground" />
          <Swatch name="Sidebar Primary" value="oklch(0.54 0.2 265)" cssVar="--sidebar-primary" />
          <Swatch name="Sidebar Accent" value="oklch(0.94 0.012 265)" cssVar="--sidebar-accent" />
          <Swatch name="Sidebar Border" value="oklch(0.91 0.008 265)" cssVar="--sidebar-border" />
        </div>
      </Subsection>

      <Subsection title="Semantiske (foreslåede)">
        <div className="flex flex-wrap gap-4">
          <Swatch name="Success" value="oklch(0.55 0.16 145)" />
          <Swatch name="Warning" value="oklch(0.72 0.15 80)" />
          <Swatch name="Error" value="oklch(0.577 0.245 27)" />
          <Swatch name="Info" value="oklch(0.6 0.15 240)" />
        </div>
      </Subsection>

      <Subsection title="Opgave-urgency">
        <div className="flex flex-wrap gap-4">
          <Swatch name="Overdue" value="oklch(0.55 0.22 25)" />
          <Swatch name="Imminent" value="oklch(0.6 0.18 50)" />
          <Swatch name="Soon" value="oklch(0.72 0.12 80)" />
          <Swatch name="Later" value="oklch(0.55 0.02 265)" />
        </div>
      </Subsection>
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════
   2. TYPOGRAFI
   ═══════════════════════════════════════════════════════════ */
function TypografiSection() {
  const typeScale = [
    { name: "Display", size: "2rem", weight: 800, tracking: "-0.03em", sample: "Opgaver" },
    { name: "Title", size: "1.25rem", weight: 700, tracking: "-0.02em", sample: "Kommende afleveringer" },
    { name: "Heading", size: "1rem", weight: 650, tracking: "-0.01em", sample: "Afleveret i dag" },
    { name: "Body", size: "0.875rem", weight: 400, tracking: "0", sample: "Dansk stil om H.C. Andersen" },
    { name: "Small", size: "0.8125rem", weight: 500, tracking: "0", sample: "1x DA · Jensen · 2 timer" },
    { name: "Caption", size: "0.75rem", weight: 400, tracking: "0", sample: "Afleveret 24. feb 2026" },
  ];

  const weights = [
    { value: 400, name: "Regular" },
    { value: 500, name: "Medium" },
    { value: 600, name: "Semibold" },
    { value: 700, name: "Bold" },
  ];

  return (
    <Section title="Typografi" description="Geist sans-serif med foreslået 6-trins skala">
      <Subsection title="Type-skala">
        <div className="space-y-4 rounded-lg border p-4">
          {typeScale.map((t) => (
            <div key={t.name} className="flex items-baseline gap-4">
              <span className="text-xs text-muted-foreground font-mono w-16 shrink-0">{t.name}</span>
              <span className="text-xs text-muted-foreground font-mono w-16 shrink-0">{t.size}</span>
              <span
                style={{
                  fontSize: t.size,
                  fontWeight: t.weight,
                  letterSpacing: t.tracking,
                  lineHeight: 1.3,
                }}
              >
                {t.sample}
              </span>
            </div>
          ))}
        </div>
      </Subsection>

      <Subsection title="Vægte">
        <div className="flex flex-wrap gap-6">
          {weights.map((w) => (
            <div key={w.value} className="space-y-1">
              <span style={{ fontWeight: w.value, fontSize: "1.125rem" }}>Aa Ææ Øø Åå</span>
              <div className="text-xs text-muted-foreground font-mono">{w.value} · {w.name}</div>
            </div>
          ))}
        </div>
      </Subsection>
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════
   3. AFSTAND & RADIUS
   ═══════════════════════════════════════════════════════════ */
function AfstandSection() {
  const spacingScale = [
    { name: "0.5", px: 2 },
    { name: "1", px: 4 },
    { name: "1.5", px: 6 },
    { name: "2", px: 8 },
    { name: "3", px: 12 },
    { name: "4", px: 16 },
    { name: "5", px: 20 },
    { name: "6", px: 24 },
    { name: "8", px: 32 },
    { name: "10", px: 40 },
    { name: "12", px: 48 },
    { name: "16", px: 64 },
  ];

  const radii = [
    { name: "sm", value: "calc(0.625rem - 4px)", display: "~6px" },
    { name: "md", value: "calc(0.625rem - 2px)", display: "~8px" },
    { name: "lg", value: "0.625rem", display: "10px" },
    { name: "xl", value: "calc(0.625rem + 4px)", display: "14px" },
    { name: "full", value: "9999px", display: "pill" },
  ];

  return (
    <Section title="Afstand & Radius" description="Tailwind spacing-skala + vores border-radius tokens">
      <Subsection title="Spacing-skala">
        <div className="space-y-2">
          {spacingScale.map((s) => (
            <div key={s.name} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground font-mono w-8 text-right">{s.name}</span>
              <div
                className="h-3 rounded-sm"
                style={{
                  width: `${s.px}px`,
                  background: "var(--primary)",
                  minWidth: "2px",
                }}
              />
              <span className="text-xs text-muted-foreground">{s.px}px</span>
            </div>
          ))}
        </div>
      </Subsection>

      <Subsection title="Border-radius">
        <div className="flex flex-wrap gap-4">
          {radii.map((r) => (
            <div key={r.name} className="flex flex-col items-center gap-1.5">
              <div
                className="w-14 h-14 border-2 border-primary bg-primary/10"
                style={{ borderRadius: r.value }}
              />
              <span className="text-xs font-medium">{r.name}</span>
              <span className="text-[10px] text-muted-foreground font-mono">{r.display}</span>
            </div>
          ))}
        </div>
      </Subsection>
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════
   4. KNAPPER
   ═══════════════════════════════════════════════════════════ */
function KnapperSection() {
  return (
    <Section title="Knapper" description="shadcn/ui Button med alle varianter og størrelser">
      <Subsection title="Varianter">
        <div className="flex flex-wrap gap-3">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </div>
      </Subsection>

      <Subsection title="Størrelser">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="default">Default</Button>
          <Button size="lg">Large</Button>
          <Button size="icon"><Plus className="size-4" /></Button>
          <Button size="icon-sm"><Plus className="size-4" /></Button>
        </div>
      </Subsection>

      <Subsection title="Med ikoner">
        <div className="flex flex-wrap gap-3">
          <Button><Download className="size-4" /> Download</Button>
          <Button variant="outline"><Search className="size-4" /> Søg</Button>
          <Button variant="secondary">Næste <ArrowRight className="size-4" /></Button>
        </div>
      </Subsection>

      <Subsection title="Disabled">
        <div className="flex flex-wrap gap-3">
          <Button disabled>Default</Button>
          <Button variant="outline" disabled>Outline</Button>
          <Button variant="secondary" disabled>Secondary</Button>
        </div>
      </Subsection>
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════
   5. BADGES & PILLS
   ═══════════════════════════════════════════════════════════ */
function BadgesSection() {
  const gradeHues: Record<string, number> = {
    "12": 55, "10": 145, "7": 220, "4": 265, "02": 290, "00": 25, "-3": 0,
  };

  return (
    <Section title="Badges & Pills" description="Standard badges, hold-pills og karakterbadges">
      <Subsection title="Standard Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </div>
      </Subsection>

      <Subsection title="Hold-pills (.il-opgaver-hold-pill)">
        <div className="flex flex-wrap gap-2">
          {[
            { name: "1x DA", hue: 265 },
            { name: "2y MA", hue: 145 },
            { name: "1x EN", hue: 25 },
            { name: "3z HI", hue: 55 },
            { name: "1x FY", hue: 200 },
          ].map((h) => (
            <span
              key={h.name}
              className="il-opgaver-hold-pill"
              style={{ "--hold-hue": h.hue } as any}
            >
              {h.name}
            </span>
          ))}
        </div>
      </Subsection>

      <Subsection title="Karakter-badges (.il-opgaver-grade)">
        <div className="flex flex-wrap gap-2">
          {Object.entries(gradeHues).map(([grade, hue]) => (
            <span
              key={grade}
              className="il-opgaver-grade"
              style={{ "--grade-hue": hue } as any}
            >
              {grade}
            </span>
          ))}
        </div>
      </Subsection>

      <Subsection title="Person type-badges (.findskema-card-badge)">
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Elev", bg: "oklch(0.93 0.04 265)", color: "oklch(0.45 0.15 265)" },
            { label: "Lærer", bg: "oklch(0.93 0.04 145)", color: "oklch(0.4 0.12 145)" },
            { label: "Klasse", bg: "oklch(0.93 0.04 295)", color: "oklch(0.45 0.14 295)" },
            { label: "Lokale", bg: "oklch(0.93 0.04 55)", color: "oklch(0.45 0.14 55)" },
            { label: "Hold", bg: "oklch(0.93 0.04 200)", color: "oklch(0.45 0.14 200)" },
          ].map((b) => (
            <span
              key={b.label}
              className="findskema-card-badge"
              style={{ background: b.bg, color: b.color }}
            >
              {b.label}
            </span>
          ))}
        </div>
      </Subsection>
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════
   6. KORT
   ═══════════════════════════════════════════════════════════ */
function KortSection() {
  return (
    <Section title="Kort" description="shadcn/ui Card med kompositioner">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Info-kort</CardTitle>
            <CardDescription>Et simpelt kort med titel og beskrivelse</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">Kortindhold med noget tekst der forklarer hvad dette kort handler om.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Handlingskort</CardTitle>
            <CardDescription>Kort med en handlingsknap i bunden</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">Brug dette mønster til kort der kræver brugerinteraktion.</p>
          </CardContent>
          <CardFooter className="gap-2">
            <Button size="sm">Gem</Button>
            <Button size="sm" variant="outline">Annuller</Button>
          </CardFooter>
        </Card>

        <Card className="py-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Kompakt kort</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">42</div>
            <p className="text-xs text-muted-foreground">Opgaver afleveret i denne uge</p>
          </CardContent>
        </Card>

        <Card className="py-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Statistik</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "oklch(0.55 0.16 145)" }}>10</div>
            <p className="text-xs text-muted-foreground">Gennemsnitskarakter</p>
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════
   7. FORMULARER
   ═══════════════════════════════════════════════════════════ */
function FormularerSection() {
  return (
    <Section title="Formularer" description="Input, select, textarea, switch og checkbox">
      <div className="max-w-md space-y-5">
        <div className="space-y-2">
          <Label htmlFor="demo-input">Input</Label>
          <Input id="demo-input" placeholder="Skriv noget..." />
        </div>

        <div className="space-y-2">
          <Label htmlFor="demo-input-disabled">Input (disabled)</Label>
          <Input id="demo-input-disabled" placeholder="Deaktiveret" disabled />
        </div>

        <div className="space-y-2">
          <Label htmlFor="demo-textarea">Textarea</Label>
          <textarea
            id="demo-textarea"
            rows={3}
            placeholder="Skriv en kommentar..."
            className="w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <Switch id="demo-switch" />
          <Label htmlFor="demo-switch">Aktiver funktion</Label>
        </div>

        <div className="flex items-center gap-3">
          <Switch id="demo-switch-checked" checked />
          <Label htmlFor="demo-switch-checked">Aktiveret</Label>
        </div>

        <div className="flex items-center gap-3">
          <Checkbox id="demo-checkbox" />
          <Label htmlFor="demo-checkbox">Accepter vilkår</Label>
        </div>

        <div className="flex items-center gap-3">
          <Checkbox id="demo-checkbox-checked" checked />
          <Label htmlFor="demo-checkbox-checked">Markeret</Label>
        </div>
      </div>
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════
   8. TABELLER
   ═══════════════════════════════════════════════════════════ */
function TabellerSection() {
  const rows = [
    { fag: "Dansk", hold: "1x DA", karakter: "10", dato: "24. feb 2026" },
    { fag: "Matematik", hold: "1x MA", karakter: "12", dato: "22. feb 2026" },
    { fag: "Engelsk", hold: "1x EN", karakter: "7", dato: "20. feb 2026" },
    { fag: "Historie", hold: "1x HI", karakter: "4", dato: "18. feb 2026" },
  ];

  const gradeHue: Record<string, number> = { "12": 55, "10": 145, "7": 220, "4": 265 };

  return (
    <Section title="Tabeller" description="shadcn/ui Table med eksempeldata">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fag</TableHead>
            <TableHead>Hold</TableHead>
            <TableHead>Karakter</TableHead>
            <TableHead>Dato</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.fag}>
              <TableCell className="font-medium">{r.fag}</TableCell>
              <TableCell>
                <span
                  className="il-opgaver-hold-pill"
                  style={{ "--hold-hue": gradeHue[r.karakter] ?? 265 } as any}
                >
                  {r.hold}
                </span>
              </TableCell>
              <TableCell>
                <span
                  className="il-opgaver-grade"
                  style={{ "--grade-hue": gradeHue[r.karakter] ?? 145 } as any}
                >
                  {r.karakter}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">{r.dato}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════
   9. SKEMA BRIKKER (mock)
   ═══════════════════════════════════════════════════════════ */
function SkemaBrikkerSection() {
  const bricks = [
    {
      label: "Aktiv",
      subject: "Matematik A",
      time: "08:10 – 09:50",
      room: "Lokale 201",
      bg: "oklch(0.97 0.008 265)",
      border: "oklch(0.91 0.015 265)",
      accent: "oklch(0.54 0.2 265)",
    },
    {
      label: "Ændret",
      subject: "Dansk A",
      time: "10:05 – 11:35",
      room: "Lokale 105",
      bg: "oklch(0.98 0.015 85)",
      border: "oklch(0.88 0.04 85)",
      accent: "oklch(0.68 0.14 85)",
    },
    {
      label: "Aflyst",
      subject: "Fysik B",
      time: "12:15 – 13:45",
      room: "Lokale 302",
      bg: "oklch(0.98 0.012 25)",
      border: "oklch(0.9 0.035 25)",
      accent: "oklch(0.6 0.18 25)",
    },
  ];

  return (
    <Section title="Skema Brikker" description="Mock af skemabrikker (produktion bruger #il-original-content-scoped CSS)">
      <div className="flex flex-wrap gap-4">
        {bricks.map((b) => (
          <div
            key={b.label}
            className="w-40 rounded-lg p-2.5 border cursor-pointer transition-shadow hover:shadow-md"
            style={{
              background: b.bg,
              borderColor: b.border,
              borderLeft: `3px solid ${b.accent}`,
            }}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: b.accent }}>
              {b.label}
            </div>
            <div className="text-sm font-semibold leading-tight mb-0.5">{b.subject}</div>
            <div className="text-xs text-muted-foreground">{b.time}</div>
            <div className="text-xs text-muted-foreground">{b.room}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════
   10. PERSONKORT
   ═══════════════════════════════════════════════════════════ */
function PersonkortSection() {
  const people = [
    { name: "Anna Larsen", initials: "AL", class: "3.a", type: "Elev", bg: "oklch(0.93 0.04 265)", color: "oklch(0.45 0.15 265)" },
    { name: "Henrik Jensen", initials: "HJ", class: "Matematik", type: "Lærer", bg: "oklch(0.93 0.04 145)", color: "oklch(0.4 0.12 145)" },
  ];

  const entities = [
    { name: "3.a", type: "Klasse", icon: School, borderClass: "findskema-entity-K" },
    { name: "Lokale 201", type: "Lokale", icon: DoorOpen, borderClass: "findskema-entity-L" },
  ];

  return (
    <Section title="Personkort" description="FindSkema person- og entitetskort (CSS-klasser, ingen netværk)">
      <Subsection title="Personkort">
        <div className="findskema-card-grid" style={{ maxWidth: 400 }}>
          {people.map((p) => (
            <div key={p.name} className="findskema-person-card">
              <div className="findskema-card-image-container">
                <div className="findskema-card-fallback">{p.initials}</div>
              </div>
              <div className="findskema-card-content">
                <div className="findskema-card-name">{p.name}</div>
                <div className="findskema-card-meta">
                  <span className="findskema-card-class">{p.class}</span>
                  <span className="findskema-card-badge" style={{ background: p.bg, color: p.color }}>
                    {p.type}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Subsection>

      <Subsection title="Entitetskort">
        <div className="findskema-card-grid" style={{ maxWidth: 400 }}>
          {entities.map((e) => (
            <div key={e.name} className={`findskema-person-card findskema-entity-card ${e.borderClass}`}>
              <div className="findskema-entity-bg-icon">
                <e.icon className="w-full h-full" />
              </div>
              <div className="findskema-entity-content">
                <span className="findskema-entity-name">{e.name}</span>
                <span
                  className="findskema-card-badge"
                  style={{
                    background: e.type === "Klasse" ? "oklch(0.93 0.04 295)" : "oklch(0.93 0.04 55)",
                    color: e.type === "Klasse" ? "oklch(0.45 0.14 295)" : "oklch(0.45 0.14 55)",
                  }}
                >
                  {e.type}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Subsection>
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════
   11. OPGAVEKORT
   ═══════════════════════════════════════════════════════════ */
function OpgavekortSection() {
  const cards = [
    {
      urgency: "is-overdue",
      deadline: "2 dage forsinket",
      detail: "26. feb · 23:59",
      title: "Dansk stil: H.C. Andersen",
      hold: "1x DA",
      holdHue: 265,
      meta: "Jensen · 4 timer",
    },
    {
      urgency: "is-imminent",
      deadline: "Om 3 timer",
      detail: "I dag · 14:00",
      title: "Matematikopgave: Differentialregning",
      hold: "2y MA",
      holdHue: 145,
      meta: "Petersen · 2 timer",
    },
    {
      urgency: "is-soon",
      deadline: "I morgen",
      detail: "2. mar · 23:59",
      title: "Engelsk essay: Shakespeare",
      hold: "1x EN",
      holdHue: 25,
      meta: "Andersen · 3 timer",
    },
    {
      urgency: "is-later",
      deadline: "Om 5 dage",
      detail: "6. mar · 23:59",
      title: "Fysik rapport: Mekanik",
      hold: "1x FY",
      holdHue: 200,
      meta: "Nielsen · 6 timer",
    },
  ];

  const submitted = [
    { title: "Samfundsfag: Velfærdsstaten", hold: "1x SA", holdHue: 55, grade: "12", gradeHue: 55, date: "20. feb" },
    { title: "Biologi: Celledeling", hold: "1x BI", holdHue: 145, grade: "10", gradeHue: 145, date: "18. feb" },
    { title: "Kemi: Organisk kemi", hold: "1x KE", holdHue: 290, grade: "7", gradeHue: 220, date: "15. feb" },
    { title: "Idræt: Træningsplan", hold: "1x ID", holdHue: 25, grade: null, gradeHue: 145, date: "12. feb" },
  ];

  return (
    <Section title="Opgavekort" description="Alle 4 urgency-tiers + afleverede kort (globalt scoped CSS)">
      <Subsection title="Kommende (4 urgency-niveauer)">
        <div className="il-opgaver-upcoming" style={{ maxWidth: 500 }}>
          {cards.map((c) => (
            <div key={c.title} className={`il-opgaver-card ${c.urgency}`} style={{ "--hold-hue": c.holdHue } as any}>
              <div className="il-opgaver-card-deadline">
                <div className="il-opgaver-deadline-info">
                  <span className="il-opgaver-deadline-label">{c.deadline}</span>
                  <span className="il-opgaver-deadline-sep">·</span>
                  <span className="il-opgaver-deadline-detail">{c.detail}</span>
                </div>
              </div>
              <span className="il-opgaver-card-title">{c.title}</span>
              <div className="il-opgaver-card-meta">
                <span className="il-opgaver-hold-pill" style={{ "--hold-hue": c.holdHue } as any}>{c.hold}</span>
                <span className="il-opgaver-meta-dot" />
                <span>{c.meta}</span>
              </div>
            </div>
          ))}
        </div>
      </Subsection>

      <Subsection title="Afleverede">
        <div className="il-opgaver-submitted-grid" style={{ maxWidth: 500 }}>
          {submitted.map((s) => (
            <div key={s.title} className="il-opgaver-submitted-card" style={{ "--hold-hue": s.holdHue } as any}>
              <div className="il-opgaver-submitted-grade-wrap" style={{ "--grade-hue": s.gradeHue } as any}>
                {s.grade ? (
                  <span className="il-opgaver-submitted-grade" style={{ "--grade-hue": s.gradeHue } as any}>
                    {s.grade}
                  </span>
                ) : (
                  <CheckCircle2 className="size-5 il-opgaver-submitted-check" />
                )}
              </div>
              <div className="il-opgaver-submitted-info">
                <span className="il-opgaver-submitted-title">{s.title}</span>
                <div className="il-opgaver-submitted-meta">
                  <span className="il-opgaver-hold-pill" style={{ "--hold-hue": s.holdHue } as any}>{s.hold}</span>
                  <span className="il-opgaver-submitted-date">{s.date}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Subsection>
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════
   12. NEDTÆLLING
   ═══════════════════════════════════════════════════════════ */
function NedtaellingSection() {
  return (
    <Section title="Nedtælling" description="Countdown-widget i 4 tilstande (.il-cd CSS)">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ maxWidth: 500 }}>
        {/* Active */}
        <div className="il-cd">
          <div className="il-cd-top">
            <span className="il-cd-subject">Matematik A</span>
            <span className="il-cd-time">32:15</span>
          </div>
          <div className="il-cd-bar">
            <div className="il-cd-fill" style={{ width: "65%", background: "oklch(0.54 0.2 265)" }} />
          </div>
          <div className="il-cd-sub">Slutter 09:50 · Lokale 201</div>
        </div>

        {/* Break / pause */}
        <div className="il-cd" data-state="break">
          <div className="il-cd-top">
            <span className="il-cd-pause">Frikvarter</span>
            <span className="il-cd-time">8:42</span>
          </div>
          <div className="il-cd-bar">
            <div className="il-cd-fill" style={{ width: "35%", background: "oklch(0.55 0.02 265)" }} />
          </div>
          <div className="il-cd-sub">Næste: Dansk A · 10:05</div>
        </div>

        {/* Done */}
        <div className="il-cd" data-state="done">
          <div className="il-cd-top">
            <svg className="il-cd-check" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8.5L6.5 12L13 4" stroke="oklch(0.42 0.1 145)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span className="il-cd-done-text">Færdig for i dag</span>
            <span className="il-cd-emoji">🎉</span>
          </div>
        </div>

        {/* Cancelled */}
        <div className="il-cd" data-state="cancelled">
          <div className="il-cd-top">
            <span className="il-cd-done-text">Aflyst</span>
            <span className="il-cd-emoji">😊</span>
          </div>
          <div className="il-cd-cancelled-sub">
            <s>Fysik B · 12:15 – 13:45</s>
          </div>
          <div className="il-cd-next">
            <span className="il-cd-next-dot" style={{ background: "oklch(0.54 0.2 265)" }} />
            <span className="il-cd-next-label">Historie A</span>
            <span className="il-cd-next-time">14:00</span>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════
   13. ADVARSLER
   ═══════════════════════════════════════════════════════════ */
function AdvarslerSection() {
  const alerts = [
    {
      type: "Info",
      icon: CircleAlert,
      bg: "oklch(0.96 0.02 240)",
      border: "oklch(0.88 0.05 240)",
      iconColor: "oklch(0.55 0.15 240)",
      textColor: "oklch(0.35 0.06 240)",
    },
    {
      type: "Success",
      icon: CheckCircle2,
      bg: "oklch(0.96 0.02 145)",
      border: "oklch(0.88 0.05 145)",
      iconColor: "oklch(0.5 0.14 145)",
      textColor: "oklch(0.32 0.06 145)",
    },
    {
      type: "Warning",
      icon: AlertTriangle,
      bg: "oklch(0.97 0.02 85)",
      border: "oklch(0.88 0.05 85)",
      iconColor: "oklch(0.6 0.16 85)",
      textColor: "oklch(0.38 0.06 85)",
    },
    {
      type: "Error",
      icon: CircleAlert,
      bg: "oklch(0.97 0.015 25)",
      border: "oklch(0.9 0.04 25)",
      iconColor: "oklch(0.55 0.2 25)",
      textColor: "oklch(0.35 0.08 25)",
    },
  ];

  return (
    <Section title="Advarsler" description="Info / success / warning / error callout-bokse">
      <div className="space-y-3" style={{ maxWidth: 500 }}>
        {alerts.map((a) => (
          <div
            key={a.type}
            className="flex items-start gap-3 px-4 py-3 rounded-lg border"
            style={{ background: a.bg, borderColor: a.border }}
          >
            <a.icon className="size-5 shrink-0 mt-0.5" style={{ color: a.iconColor }} />
            <div>
              <div className="text-sm font-semibold" style={{ color: a.textColor }}>{a.type}</div>
              <div className="text-sm mt-0.5" style={{ color: a.textColor, opacity: 0.85 }}>
                Dette er en {a.type.toLowerCase()}-besked med relevant information til brugeren.
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PLAYGROUND COMPONENT
   ═══════════════════════════════════════════════════════════ */
export function DesignPlayground({ open, onOpenChange }: DesignPlaygroundProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState("farver");

  // Handle escape key — stopImmediatePropagation so SettingsModal stays open
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onOpenChange(false);
      }
    };

    contentRef.current?.focus();
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open, onOpenChange]);

  // Prevent body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const sectionComponents: Record<string, () => preact.JSX.Element> = {
    farver: FarverSection,
    typografi: TypografiSection,
    afstand: AfstandSection,
    knapper: KnapperSection,
    badges: BadgesSection,
    kort: KortSection,
    formularer: FormularerSection,
    tabeller: TabellerSection,
    skemabrikker: SkemaBrikkerSection,
    personkort: PersonkortSection,
    opgavekort: OpgavekortSection,
    nedtaelling: NedtaellingSection,
    advarsler: AdvarslerSection,
  };

  const ActiveComponent = sectionComponents[activeSection] ?? FarverSection;
  const activeName = sections.find((s) => s.id === activeSection)?.name ?? "Farver";

  const modalContent = (
    <div
      className="fixed inset-0 z-300 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="playground-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-200"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={contentRef}
        tabIndex={-1}
        className="relative z-10 bg-background w-[95vw] max-w-[1100px] h-[90vh] overflow-hidden rounded-xl border shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 z-20 rounded-sm opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
          aria-label="Luk"
        >
          <X className="size-5" />
        </button>

        <SidebarProvider className="design-playground-modal items-stretch min-h-0 h-full w-full">
          <Sidebar collapsible="none" className="flex border-r py-4 w-[180px]!">
            <SidebarContent className="overflow-y-auto">
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {sections.map((item) => (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          isActive={item.id === activeSection}
                          onClick={() => setActiveSection(item.id)}
                          className="cursor-pointer h-9! text-[13px]!"
                        >
                          <item.icon className="size-4!" />
                          <span>{item.name}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>

          <main className="design-playground-main flex flex-1 min-h-0 flex-col overflow-hidden">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-6">
              <h1 id="playground-title" className="text-[15px] font-semibold">
                Design System
              </h1>
              <span className="text-muted-foreground text-[15px]">·</span>
              <span className="text-[15px] text-muted-foreground">{activeName}</span>
            </header>

            <div className="design-playground-scroll flex flex-1 min-h-0 flex-col gap-6 p-6 overflow-y-auto overscroll-contain">
              <ActiveComponent />
            </div>
          </main>
        </SidebarProvider>
      </div>
    </div>
  );

  const portalTarget = document.getElementById("il-root") || document.body;
  return createPortal(modalContent, portalTarget);
}
