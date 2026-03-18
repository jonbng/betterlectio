import { useState } from 'preact/hooks';
import {
  ChevronDown,
  AlertTriangle,
  GraduationCap,
  MessageSquareText,
  FileText,
  ScrollText,
  NotebookPen,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { getHoldHue, getHoldDisplayName } from '@/lib/hold-mapping';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────

interface GradeInfo {
  grade: string;
  tooltip: string;
}

export interface GradeEntry {
  hold: string;
  fag: string;
  grades: Record<string, GradeInfo | undefined>;
}

export interface GradeNote {
  hold: string;
  type: string;
  grade: string;
  dateInitials: string;
  note: string;
}

export interface Remark {
  dato: string;
  initialer: string;
  type: string;
  elevnote: string;
}

export interface DiplomaLine {
  fag: string;
  aarsVaegt: string;
  aarsKarakter: string;
  aarsECTS: string;
  eksVaegt: string;
  eksKarakter: string;
  eksECTS: string;
}

export interface ProtocolLine {
  termin: string;
  type: string;
  medtaeller: string;
  xprsFag: string;
  evalueringsform: string;
  hold: string;
  vaegt: string;
  karakter: string;
  skala: string;
}

export interface KaraktererData {
  grades: GradeEntry[];
  notes: GradeNote[];
  remarks: Remark[];
  diplomaLines: DiplomaLine[];
  diplomaAverage: string;
  protocolLines: ProtocolLine[];
  alerts: string[];
}

// ── Grade columns in display order ─────────────────────────────────────

const GRADE_COLUMNS = [
  '1.standpunkt',
  '2.standpunkt',
  'intern prøve',
  'årskarakter',
  'eksamenskarakter',
] as const;

const GRADE_COLUMN_SHORT: Record<string, string> = {
  '1.standpunkt': '1. stdpkt',
  '2.standpunkt': '2. stdpkt',
  'intern prøve': 'Intern',
  'årskarakter': 'Årskar.',
  'eksamenskarakter': 'Eksamen',
};

// ── Grade hue mapping (Danish 7-step scale) ────────────────────────────

function getGradeHue(grade: string): number {
  switch (grade.trim()) {
    case '12': return 145;
    case '10': return 145;
    case '7':  return 210;
    case '4':  return 50;
    case '02': return 40;
    case '00': return 25;
    case '-3': return 0;
    default:   return 210;
  }
}

function getGradeChroma(grade: string): number {
  switch (grade.trim()) {
    case '12': return 0.18;
    case '10': return 0.14;
    case '7':  return 0.01;
    case '4':  return 0.12;
    case '02': return 0.10;
    case '00': return 0.14;
    case '-3': return 0.16;
    default:   return 0.01;
  }
}

// Numeric grade value for sorting/averaging
function gradeToNumber(grade: string): number | null {
  const map: Record<string, number> = {
    '12': 12, '10': 10, '7': 7, '4': 4, '02': 2, '00': 0, '-3': -3,
  };
  return map[grade.trim()] ?? null;
}

// ── Subject grouping ───────────────────────────────────────────────────

interface SubjectGroup {
  hold: string;
  subjectBase: string;
  level: string;
  rows: { label: string; entry: GradeEntry }[];
  notes: GradeNote[];
}

function extractLevel(fag: string): string {
  const m = fag.match(/\b([A-C])\b/);
  return m ? m[1] : '';
}

function extractSubjectBase(fag: string): string {
  return fag
    .replace(/,\s*(Skriftlig|Mundtlig)/i, '')
    .trim();
}

function extractRowLabel(fag: string): string {
  const m = fag.match(/,\s*(Skriftlig|Mundtlig)/i);
  return m ? m[1] : '';
}

function groupBySubject(grades: GradeEntry[], notes: GradeNote[]): SubjectGroup[] {
  const holdMap = new Map<string, Map<string, GradeEntry[]>>();

  for (const entry of grades) {
    const base = extractSubjectBase(entry.fag);
    const key = `${entry.hold}::${base}`;
    if (!holdMap.has(key)) holdMap.set(key, new Map());
    const m = holdMap.get(key)!;
    const label = extractRowLabel(entry.fag) || base;
    if (!m.has(label)) m.set(label, []);
    m.get(label)!.push(entry);
  }

  const groups: SubjectGroup[] = [];
  for (const [key, rowMap] of holdMap) {
    const [hold] = key.split('::');
    const firstEntry = [...rowMap.values()][0][0];
    const subjectBase = extractSubjectBase(firstEntry.fag);
    const level = extractLevel(firstEntry.fag);

    const rows: SubjectGroup['rows'] = [];
    for (const [label, entries] of rowMap) {
      rows.push({ label, entry: entries[0] });
    }

    const matchingNotes = notes.filter((n) => n.hold === hold);
    groups.push({ hold, subjectBase, level, rows, notes: matchingNotes });
  }

  return groups;
}

// ── Grade distribution ─────────────────────────────────────────────────

function computeGradeDistribution(grades: GradeEntry[]): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const entry of grades) {
    for (const info of Object.values(entry.grades)) {
      if (info?.grade) {
        const g = info.grade.trim();
        dist[g] = (dist[g] || 0) + 1;
      }
    }
  }
  return dist;
}

// ── Components ─────────────────────────────────────────────────────────

function GradeCell({ info }: { info?: GradeInfo }) {
  if (!info?.grade) {
    return (
      <td className="px-3 py-2.5 text-center">
        <span className="text-muted-foreground/30">–</span>
      </td>
    );
  }

  const grade = info.grade.trim();
  const hue = getGradeHue(grade);
  const chroma = getGradeChroma(grade);

  return (
    <td className="px-3 py-2.5 text-center" title={info.tooltip}>
      <span
        className="inline-flex items-center justify-center min-w-[2.25rem] rounded-md px-2.5 py-1 text-base font-bold tabular-nums"
        style={{
          color: `oklch(0.35 ${chroma} ${hue})`,
          backgroundColor: `oklch(0.94 ${chroma * 0.3} ${hue})`,
        }}
      >
        <span className="dark:hidden">{grade}</span>
        <span
          className="hidden dark:inline"
          style={{
            color: `oklch(0.80 ${chroma * 0.8} ${hue})`,
          }}
        >
          {grade}
        </span>
      </span>
    </td>
  );
}

function SubjectRow({ group }: { group: SubjectGroup }) {
  const holdHue = getHoldHue(group.hold);
  const holdName = getHoldDisplayName(group.hold);
  const hasMultipleRows = group.rows.length > 1;
  const [notesOpen, setNotesOpen] = useState(false);

  return (
    <>
      {group.rows.map(({ label, entry }, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === group.rows.length - 1;
        const hasNotes = isLast && group.notes.length > 0;

        return (
          <tr
            key={`${group.hold}-${label}-${idx}`}
            className={cn(
              'transition-colors hover:bg-accent/30',
              isFirst && 'border-t border-border/60',
              !isFirst && 'border-t border-border/20',
            )}
          >
            {/* Subject name - only on first row, spans all sub-rows */}
            {isFirst && (
              <td
                className="pl-4 pr-3 py-2.5"
                rowSpan={hasMultipleRows ? group.rows.length : undefined}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-1 self-stretch rounded-full shrink-0"
                    style={{ backgroundColor: `oklch(0.65 0.15 ${holdHue})` }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-base font-medium text-foreground">
                        {group.subjectBase}
                      </span>
                      {group.level && (
                        <span className="text-xs font-semibold text-muted-foreground">
                          {group.level}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground leading-none">
                      {holdName || group.hold}
                    </span>
                  </div>
                </div>
              </td>
            )}

            {/* Sub-label (Skriftlig/Mundtlig) */}
            {hasMultipleRows ? (
              <td className="px-2 py-2.5 text-center">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  {label === 'Skriftlig' ? 'Skr.' : label === 'Mundtlig' ? 'Mdt.' : label}
                </span>
              </td>
            ) : (
              <td className="px-2 py-2.5" />
            )}

            {/* Grade cells */}
            {GRADE_COLUMNS.map((col) => (
              <GradeCell key={col} info={entry.grades[col]} />
            ))}

            {/* Notes indicator */}
            {isFirst ? (
              <td
                className="px-2 py-2.5 text-center"
                rowSpan={hasMultipleRows ? group.rows.length : undefined}
              >
                {hasNotes && (
                  <button
                    onClick={() => setNotesOpen(!notesOpen)}
                    className="inline-flex items-center justify-center w-6 h-6 rounded-md hover:bg-accent transition-colors cursor-pointer"
                    title={`${group.notes.length} note${group.notes.length > 1 ? 'r' : ''}`}
                  >
                    <MessageSquareText className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                )}
              </td>
            ) : null}
          </tr>
        );
      })}

      {/* Notes expansion row */}
      {notesOpen && group.notes.length > 0 && (
        <tr className="border-t border-border/20">
          <td colSpan={8} className="px-4 py-2 bg-muted/20">
            <div className="space-y-1.5 pl-4">
              {group.notes.map((note, i) => (
                <div key={i} className="pl-3 border-l-2 border-muted-foreground/15">
                  <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
                    {note.note}
                  </p>
                  <p className="text-[0.6rem] text-muted-foreground mt-0.5">
                    {note.dateInitials} · {note.type.replace(/\n/g, ' – ')}
                  </p>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function SummaryStats({
  grades,
  diplomaAverage,
}: {
  grades: GradeEntry[];
  diplomaAverage: string;
}) {
  const dist = computeGradeDistribution(grades);
  const total = Object.values(dist).reduce((s, c) => s + c, 0);

  let weightedSum = 0;
  let weightCount = 0;
  for (const entry of grades) {
    for (const info of Object.values(entry.grades)) {
      if (info?.grade) {
        const num = gradeToNumber(info.grade);
        if (num !== null) {
          const wMatch = info.tooltip?.match(/Vægt:\s*([\d,]+)/);
          const weight = wMatch ? parseFloat(wMatch[1].replace(',', '.')) : 1;
          weightedSum += num * weight;
          weightCount += weight;
        }
      }
    }
  }
  const computedAvg = weightCount > 0 ? (weightedSum / weightCount).toFixed(2) : null;
  const avgValue = diplomaAverage || computedAvg || '–';

  const gradeOrder = ['12', '10', '7', '4', '02', '00', '-3'];

  if (total === 0 && !diplomaAverage) return null;

  return (
    <div className="flex items-stretch gap-3 flex-wrap">
      {/* Average card */}
      <div className="bg-card border border-border rounded-xl px-5 py-3.5 flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
          <TrendingUp className="w-4.5 h-4.5 text-primary" />
        </div>
        <div>
          <p className="text-2xl font-black tabular-nums text-foreground leading-none">
            {avgValue}
          </p>
          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wide mt-0.5">
            {diplomaAverage ? 'Eksamenssnit' : 'Gennemsnit'}
          </p>
        </div>
      </div>

      {/* Grade distribution chips */}
      {total > 0 && (
        <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-2 flex-wrap">
          {gradeOrder.map((g) => {
            const count = dist[g] || 0;
            if (count === 0) return null;
            const hue = getGradeHue(g);
            const chroma = getGradeChroma(g);
            return (
              <div
                key={g}
                className="flex items-center gap-1.5 rounded-md px-2 py-1"
                style={{
                  backgroundColor: `oklch(0.94 ${chroma * 0.25} ${hue})`,
                }}
              >
                <span
                  className="text-sm font-bold tabular-nums"
                  style={{ color: `oklch(0.40 ${chroma} ${hue})` }}
                >
                  <span className="dark:hidden">{g}</span>
                  <span
                    className="hidden dark:inline"
                    style={{ color: `oklch(0.75 ${chroma * 0.8} ${hue})` }}
                  >
                    {g}
                  </span>
                </span>
                <span className="text-[0.6rem] text-muted-foreground font-medium">
                  ×{count}
                </span>
              </div>
            );
          })}
          <span className="text-[0.6rem] text-muted-foreground ml-1">
            {total} i alt
          </span>
        </div>
      )}
    </div>
  );
}

function AlertBanner({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-[oklch(0.85_0.08_50)] bg-[oklch(0.97_0.02_50)] dark:border-[oklch(0.35_0.06_50)] dark:bg-[oklch(0.18_0.03_50)] px-3.5 py-2.5">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-[oklch(0.55_0.15_50)] dark:text-[oklch(0.70_0.12_50)]" />
      <p className="text-sm text-[oklch(0.40_0.10_50)] dark:text-[oklch(0.75_0.08_50)] leading-relaxed">
        {text}
      </p>
    </div>
  );
}

function CollapsibleSection({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
  count,
}: {
  title: string;
  icon: typeof FileText;
  children: preact.ComponentChildren;
  defaultOpen?: boolean;
  count?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2.5 w-full px-4 py-3 bg-card border border-border rounded-xl hover:bg-accent/50 transition-colors cursor-pointer group">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{title}</span>
        {count !== undefined && count > 0 && (
          <Badge variant="secondary" className="text-[0.6rem] ml-1">{count}</Badge>
        )}
        <ChevronDown
          className={cn(
            'w-4 h-4 text-muted-foreground ml-auto transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 bg-card border border-border rounded-xl overflow-hidden">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Per-column averages ────────────────────────────────────────────────

interface ColumnAverage {
  weighted: string | null;
  unweighted: string | null;
}

function computeColumnAverages(grades: GradeEntry[]): Record<string, ColumnAverage> {
  const result: Record<string, ColumnAverage> = {};

  for (const col of GRADE_COLUMNS) {
    let weightedSum = 0;
    let totalWeight = 0;
    let simpleSum = 0;
    let simpleCount = 0;

    for (const entry of grades) {
      const info = entry.grades[col];
      if (!info?.grade) continue;
      const num = gradeToNumber(info.grade);
      if (num === null) continue;

      simpleSum += num;
      simpleCount++;

      const wMatch = info.tooltip?.match(/Vægt:\s*([\d,]+)/);
      const weight = wMatch ? parseFloat(wMatch[1].replace(',', '.')) : 1;
      weightedSum += num * weight;
      totalWeight += weight;
    }

    result[col] = {
      weighted: totalWeight > 0 ? (weightedSum / totalWeight).toFixed(2) : null,
      unweighted: simpleCount > 0 ? (simpleSum / simpleCount).toFixed(2) : null,
    };
  }

  return result;
}

// ── Main component ─────────────────────────────────────────────────────

export function KaraktererPage({ data }: { data: KaraktererData }) {
  const groups = groupBySubject(data.grades, data.notes);
  const columnAverages = computeColumnAverages(data.grades);

  // Check if weighted differs from unweighted (i.e. weights aren't all equal)
  const hasWeightDiff = GRADE_COLUMNS.some((col) => {
    const avg = columnAverages[col];
    return avg.weighted && avg.unweighted && avg.weighted !== avg.unweighted;
  });

  const avgMatch = data.diplomaAverage.match(/([\d,]+)/);
  const diplomaAvgClean = avgMatch ? avgMatch[1].replace(',', '.') : '';

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <GraduationCap className="w-7 h-7 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Karakterer</h1>
      </div>

      {/* Summary stats */}
      <SummaryStats grades={data.grades} diplomaAverage={diplomaAvgClean} />

      {/* Alert banners */}
      {data.alerts.length > 0 && (
        <div className="space-y-2">
          {data.alerts.map((alert, i) => (
            <AlertBanner key={i} text={alert} />
          ))}
        </div>
      )}

      {/* Grades table */}
      {groups.length > 0 ? (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="pl-4 pr-3 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground font-medium w-[35%]">
                    Fag
                  </th>
                  <th className="px-2 py-3 text-center text-xs uppercase tracking-wider text-muted-foreground font-medium w-[5%]">
                  </th>
                  {GRADE_COLUMNS.map((col) => (
                    <th
                      key={col}
                      className="px-3 py-3 text-center text-xs uppercase tracking-wider text-muted-foreground font-medium whitespace-nowrap"
                    >
                      {GRADE_COLUMN_SHORT[col]}
                    </th>
                  ))}
                  <th className="px-2 py-2.5 w-8" />
                </tr>
              </thead>
              <tbody>
                {groups.map((group, i) => (
                  <SubjectRow
                    key={`${group.hold}-${group.subjectBase}-${i}`}
                    group={group}
                  />
                ))}
              </tbody>
              {/* Average footer */}
              {GRADE_COLUMNS.some((col) => columnAverages[col].unweighted) && (
                <tfoot>
                  {/* Weighted average row (primary) */}
                  <tr className="border-t-2 border-border">
                    <td className="pl-4 pr-3 py-3 text-base font-semibold text-foreground" colSpan={2}>
                      Snit (vægtet)
                    </td>
                    {GRADE_COLUMNS.map((col) => (
                      <td key={col} className="px-3 py-3 text-center">
                        {columnAverages[col].weighted ? (
                          <span className="text-base font-bold tabular-nums text-primary">
                            {columnAverages[col].weighted}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/30">–</span>
                        )}
                      </td>
                    ))}
                    <td />
                  </tr>
                  {/* Unweighted average row (secondary, only if different) */}
                  {hasWeightDiff && (
                    <tr className="border-t border-border/40">
                      <td className="pl-4 pr-3 py-2.5 text-sm font-medium text-muted-foreground" colSpan={2}>
                        Snit (uvægtet)
                      </td>
                      {GRADE_COLUMNS.map((col) => (
                        <td key={col} className="px-3 py-2.5 text-center">
                          {columnAverages[col].unweighted ? (
                            <span className="text-sm tabular-nums text-muted-foreground">
                              {columnAverages[col].unweighted}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/30">–</span>
                          )}
                        </td>
                      ))}
                      <td />
                    </tr>
                  )}
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Ingen karakterer endnu</p>
        </div>
      )}

      {/* Collapsible sections */}
      <div className="space-y-2 pt-2">
        {/* Linjer på bevis */}
        {data.diplomaLines.length > 0 && (
          <CollapsibleSection
            title="Linjer på bevis"
            icon={FileText}
            count={data.diplomaLines.length}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-2 font-medium text-muted-foreground">Fag</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground text-center" colSpan={3}>Årskarakter</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground text-center" colSpan={3}>Eksamenskarakter</th>
                  </tr>
                  <tr className="border-b border-border/50 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-1"></th>
                    <th className="px-3 py-1 text-center font-medium">Vægt</th>
                    <th className="px-3 py-1 text-center font-medium">Kar.</th>
                    <th className="px-3 py-1 text-center font-medium">ECTS</th>
                    <th className="px-3 py-1 text-center font-medium">Vægt</th>
                    <th className="px-3 py-1 text-center font-medium">Kar.</th>
                    <th className="px-3 py-1 text-center font-medium">ECTS</th>
                  </tr>
                </thead>
                <tbody>
                  {data.diplomaLines.map((line, i) => (
                    <tr key={i} className="border-b border-border/30 last:border-0">
                      <td className="px-4 py-2 text-foreground">{line.fag}</td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{line.aarsVaegt}</td>
                      <td className="px-3 py-2 text-center font-semibold text-foreground">{line.aarsKarakter}</td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{line.aarsECTS}</td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{line.eksVaegt}</td>
                      <td className="px-3 py-2 text-center font-semibold text-foreground">{line.eksKarakter}</td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{line.eksECTS}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.diplomaAverage && (
              <div className="px-4 py-2.5 border-t border-border bg-muted/30 text-sm text-foreground">
                {data.diplomaAverage}
              </div>
            )}
          </CollapsibleSection>
        )}

        {/* Protokollinjer */}
        {data.protocolLines.length > 0 && (
          <CollapsibleSection
            title="Protokollinjer"
            icon={ScrollText}
            count={data.protocolLines.length}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Termin</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium text-center">Medtæller</th>
                    <th className="px-3 py-2 font-medium">XPRS fag</th>
                    <th className="px-3 py-2 font-medium">Form</th>
                    <th className="px-3 py-2 font-medium">Hold</th>
                    <th className="px-3 py-2 font-medium text-right">Vægt</th>
                    <th className="px-3 py-2 font-medium text-center">Karakter</th>
                    <th className="px-3 py-2 font-medium">Skala</th>
                  </tr>
                </thead>
                <tbody>
                  {data.protocolLines.map((line, i) => (
                    <tr key={i} className="border-b border-border/30 last:border-0">
                      <td className="px-4 py-2 text-foreground whitespace-nowrap">{line.termin}</td>
                      <td className="px-3 py-2 text-foreground whitespace-nowrap">{line.type}</td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{line.medtaeller}</td>
                      <td className="px-3 py-2 text-foreground">{line.xprsFag}</td>
                      <td className="px-3 py-2 text-muted-foreground">{line.evalueringsform}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{line.hold}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{line.vaegt}</td>
                      <td className="px-3 py-2 text-center font-semibold text-foreground">{line.karakter}</td>
                      <td className="px-3 py-2 text-muted-foreground">{line.skala}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
        )}

        {/* Bemærkninger */}
        {data.remarks.length > 0 && (
          <CollapsibleSection
            title="Bemærkninger"
            icon={NotebookPen}
            count={data.remarks.length}
          >
            <div className="divide-y divide-border/30">
              {data.remarks.map((r, i) => (
                <div key={i} className="px-4 py-2.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <span>{r.dato}</span>
                    <span>·</span>
                    <span>{r.initialer}</span>
                    <span>·</span>
                    <span>{r.type}</span>
                  </div>
                  <p className="text-sm text-foreground">{r.elevnote}</p>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Notes section */}
        {data.notes.length > 0 && (
          <CollapsibleSection
            title="Alle karakternoter"
            icon={MessageSquareText}
            count={data.notes.length}
          >
            <div className="divide-y divide-border/30">
              {data.notes.map((note, i) => (
                <div key={i} className="px-4 py-2.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <span className="font-medium">{note.hold}</span>
                    <span>·</span>
                    <span>{note.type.replace(/\n/g, ' – ')}</span>
                    <span>·</span>
                    <span className="font-semibold">{note.grade}</span>
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">{note.note}</p>
                  <p className="text-[0.6rem] text-muted-foreground mt-1">{note.dateInitials}</p>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}

// ── DOM Parser ─────────────────────────────────────────────────────────

export function parseKaraktererFromDOM(doc: Document = document): KaraktererData {
  const grades: GradeEntry[] = [];
  const notes: GradeNote[] = [];
  const remarks: Remark[] = [];
  const diplomaLines: DiplomaLine[] = [];
  const protocolLines: ProtocolLine[] = [];
  const alerts: string[] = [];
  let diplomaAverage = '';

  // ── Alerts ──
  const alertIds = [
    's_m_Content_Content_karakterView_WrittenProtokolBlockLit',
    's_m_Content_Content_karakterView_OralProtokolBlockLit',
  ];
  for (const id of alertIds) {
    const el = doc.getElementById(id);
    if (el) {
      const text = el.textContent?.trim();
      if (text) alerts.push(text);
    }
  }

  // ── Main grades table ──
  const gradeTable = doc.getElementById('s_m_Content_Content_karakterView_KarakterGV');
  if (gradeTable) {
    const rows = gradeTable.querySelectorAll('tr');
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll('td.OnlyDesktop');
      if (cells.length < 7) continue;

      const hold = cells[0].textContent?.trim() || '';
      const fag = cells[1].textContent?.trim() || '';

      const gradeMap: Record<string, GradeInfo | undefined> = {};
      const colNames = ['1.standpunkt', '2.standpunkt', 'intern prøve', 'årskarakter', 'eksamenskarakter'];

      for (let c = 0; c < colNames.length; c++) {
        const cell = cells[c + 2];
        if (!cell) continue;
        const div = cell.querySelector('div');
        const gradeText = div?.textContent?.trim() || cell.textContent?.trim() || '';
        if (gradeText) {
          gradeMap[colNames[c]] = {
            grade: gradeText,
            tooltip: div?.getAttribute('title') || '',
          };
        }
      }

      grades.push({ hold, fag, grades: gradeMap });
    }
  }

  // ── Karakternoter table ──
  const noteTable = doc.getElementById('s_m_Content_Content_karakterView_KarakterNoterGrid');
  if (noteTable) {
    const rows = noteTable.querySelectorAll('tr');
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll('td.OnlyDesktop, td.wrap.OnlyDesktop');
      if (cells.length < 5) continue;

      const allCells = rows[i].querySelectorAll('td');
      const desktopCells: Element[] = [];
      for (const cell of allCells) {
        if (cell.classList.contains('OnlyDesktop') || (cell.classList.contains('wrap') && cell.classList.contains('OnlyDesktop'))) {
          desktopCells.push(cell);
        }
      }
      if (desktopCells.length < 4) continue;

      const hold = desktopCells[0].textContent?.trim() || '';
      const type = desktopCells[1].textContent?.trim() || '';
      const grade = desktopCells[2].textContent?.trim() || '';
      const dateInitials = desktopCells[3].textContent?.trim() || '';
      const noteCell = desktopCells[desktopCells.length - 1];
      const noteText = noteCell?.innerHTML
        ?.replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .trim() || '';

      notes.push({ hold, type, grade, dateInitials, note: noteText });
    }
  }

  // ── Bemærkninger table ──
  const remarksTable = doc.getElementById('s_m_Content_Content_remarks_grid') ||
    doc.querySelector('[id*="remarks_grid"]');
  if (remarksTable) {
    const rows = remarksTable.querySelectorAll('tr');
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll('td');
      if (cells.length === 1 && cells[0].querySelector('.norecord, .noRecord')) continue;
      if (cells.length < 4) continue;

      remarks.push({
        dato: cells[0].textContent?.trim() || '',
        initialer: cells[1].textContent?.trim() || '',
        type: cells[2].textContent?.trim() || '',
        elevnote: cells[3].textContent?.trim() || '',
      });
    }
  }

  // ── Diploma lines ──
  const diplomaArea = doc.getElementById('printareaDiplomaLines');
  if (diplomaArea) {
    const table = diplomaArea.querySelector('table');
    if (table) {
      const rows = table.querySelectorAll('tr');
      for (let i = 2; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td');
        if (cells.length < 7) continue;

        diplomaLines.push({
          fag: cells[0].textContent?.trim() || '',
          aarsVaegt: cells[1].textContent?.trim() || '',
          aarsKarakter: cells[2].textContent?.trim() || '',
          aarsECTS: cells[3].textContent?.trim() || '',
          eksVaegt: cells[4].textContent?.trim() || '',
          eksKarakter: cells[5].textContent?.trim() || '',
          eksECTS: cells[6].textContent?.trim() || '',
        });
      }
    }

    const avgLabel = doc.getElementById('s_m_Content_Content_DiplomaTypeRepeater_ctl00_GradeAverageLabel');
    if (avgLabel) {
      diplomaAverage = avgLabel.textContent?.trim() || '';
    }
  }

  // ── Protocol lines ──
  const protoTable = doc.getElementById('s_m_Content_Content_ProtokolLinierGrid');
  if (protoTable) {
    const rows = protoTable.querySelectorAll('tr');
    for (let i = 1; i < rows.length; i++) {
      const allCells = rows[i].querySelectorAll('td');
      const desktopCells: Element[] = [];
      for (const cell of allCells) {
        if (cell.classList.contains('OnlyDesktop')) {
          desktopCells.push(cell);
        }
      }
      if (desktopCells.length < 9) continue;

      protocolLines.push({
        termin: desktopCells[0].textContent?.trim() || '',
        type: desktopCells[1].textContent?.trim() || '',
        medtaeller: desktopCells[2].textContent?.trim() || '',
        xprsFag: desktopCells[3].textContent?.trim() || '',
        evalueringsform: desktopCells[4].textContent?.trim() || '',
        hold: desktopCells[5].textContent?.trim() || '',
        vaegt: desktopCells[6].textContent?.trim() || '',
        karakter: desktopCells[7].textContent?.trim() || '',
        skala: desktopCells[8].textContent?.trim() || '',
      });
    }
  }

  return { grades, notes, remarks, diplomaLines, diplomaAverage, protocolLines, alerts };
}
