import { useState } from 'preact/hooks';
import { useTranslation } from '@/lib/i18n';
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

/** A single "Bevistype" (e.g. "STX v2") with its diploma lines + average. */
export interface DiplomaType {
  name: string;
  lines: DiplomaLine[];
  average: string;
}

/** A grade column parsed from the live table header (order + identity vary by school/term). */
export interface GradeColumn {
  /** Canonical key used to look up values in {@link GradeEntry.grades}. */
  key: string;
  /** Full Danish header label (used for tooltips). */
  label: string;
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
  /** Grade columns in the exact order the live table presents them. */
  columns: GradeColumn[];
  grades: GradeEntry[];
  notes: GradeNote[];
  remarks: Remark[];
  diplomaTypes: DiplomaType[];
  protocolLines: ProtocolLine[];
  alerts: string[];
}

// ── Column header normalization ────────────────────────────────────────
// Lectio varies which grade columns appear (and in what order) per school
// and term. We MUST derive columns from the live header row rather than
// assume a fixed set — otherwise values shift and årskarakter/eksamen get
// swapped. `canonicalColumnKey` maps a header label to a stable key so the
// rest of the UI can recognise the well-known columns.

function canonicalColumnKey(raw: string): string {
  const t = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  if (/^1\.?\s*standpunkt/.test(t)) return '1.standpunkt';
  if (/^2\.?\s*standpunkt/.test(t)) return '2.standpunkt';
  if (/^3\.?\s*standpunkt/.test(t)) return '3.standpunkt';
  // Order matters: "afsluttende" and "eksamen" labels both contain "års",
  // so they must be matched before the bare "årskarakter" check.
  if (t.includes('afsluttende')) return 'afsluttende';
  if (t.includes('intern')) return 'intern prøve';
  if (t.includes('eksamen')) return 'eksamenskarakter';
  if (t.startsWith('årskarakter')) return 'årskarakter';
  return t.replace(/[^a-z0-9æøå]+/g, '-').replace(/^-+|-+$/g, '') || raw;
}

// ── Grade hue mapping (Danish 7-step scale) ────────────────────────────

function getGradeHue(grade: string): number {
  switch (grade.trim()) {
    case '12': return 145;  // green – exceptional
    case '10': return 160;  // teal – very good
    case '7':  return 210;  // blue – above average
    case '4':  return 250;  // indigo – average
    case '02': return 50;   // orange – below average
    case '00': return 25;   // red-orange – poor
    case '-3': return 0;    // red – very poor
    default:   return 210;
  }
}

function getGradeChroma(grade: string): number {
  switch (grade.trim()) {
    case '12': return 0.18;
    case '10': return 0.14;
    case '7':  return 0.08;
    case '4':  return 0.08;
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

// ── Representative grade & labels ──────────────────────────────────────

// For "where do I stand" views (distribution) we want ONE grade per subject —
// the most final one available — not every standpunkt/årskarakter cell, which
// would count the same subject several times.
const REPRESENTATIVE_PRIORITY = [
  'eksamenskarakter',
  'årskarakter',
  'afsluttende',
  'intern prøve',
  '3.standpunkt',
  '2.standpunkt',
  '1.standpunkt',
];

function representativeGrade(entry: GradeEntry): GradeInfo | undefined {
  for (const k of REPRESENTATIVE_PRIORITY) {
    if (entry.grades[k]?.grade) return entry.grades[k];
  }
  for (const info of Object.values(entry.grades)) {
    if (info?.grade) return info;
  }
  return undefined;
}

// Short, human label for a grade column. Known columns get a translated label;
// unknown ones fall back to the raw Danish header.
function columnShortLabel(col: GradeColumn, t: (key: any) => string): string {
  switch (col.key) {
    case '1.standpunkt': return '1. stdpkt';
    case '2.standpunkt': return '2. stdpkt';
    case '3.standpunkt': return '3. stdpkt';
    case 'afsluttende': return t('karaktererPage.final');
    case 'intern prøve': return t('karaktererPage.intern');
    case 'årskarakter': return t('karaktererPage.annual');
    case 'eksamenskarakter': return t('karaktererPage.exam');
    default: return col.label;
  }
}

// Parse the official exam result line ("Eksamensresultat ekskl. bonus: 6,9 …
// inkl. evt. bonus: 7,2") into its two numbers.
function parseExamResult(avgText: string): { ekskl: string; inkl: string | null } | null {
  if (!avgText) return null;
  const ekskl = avgText.match(/ekskl[^:]*:\s*([\d,]+)/i)?.[1];
  const inkl = avgText.match(/inkl[^:]*:\s*([\d,]+)/i)?.[1];
  if (!ekskl && !inkl) {
    const m = avgText.match(/([\d,]+)/);
    return m ? { ekskl: m[1], inkl: null } : null;
  }
  const base = ekskl ?? inkl!;
  return { ekskl: base, inkl: inkl && inkl !== base ? inkl : null };
}

// ── Grade distribution ─────────────────────────────────────────────────

function computeGradeDistribution(grades: GradeEntry[]): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const entry of grades) {
    const info = representativeGrade(entry);
    if (info?.grade) {
      const g = info.grade.trim();
      dist[g] = (dist[g] || 0) + 1;
    }
  }
  return dist;
}

// ── Components ─────────────────────────────────────────────────────────

// A single grade pill carries BOTH its light and dark colors. Light colors
// are applied directly; the dark colors live in `--bl-grade-*-dark` custom
// properties that the `.dark .il-grade-pill` rule in globals.css promotes
// (with !important). This avoids relying on a Tailwind `dark:` display toggle,
// which proved fragile — the pill is one element that simply recolors in dark
// mode, so the numbers can never end up hidden.
function gradePillStyle(hue: number, chroma: number): Record<string, string> {
  return {
    color: `oklch(0.35 ${chroma} ${hue})`,
    backgroundColor: `oklch(0.94 ${chroma * 0.3} ${hue})`,
    '--bl-grade-fg-dark': `oklch(0.82 ${chroma * 0.85} ${hue})`,
    '--bl-grade-bg-dark': `oklch(0.28 ${chroma * 0.45} ${hue})`,
  };
}

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
        className="il-grade-pill inline-flex items-center justify-center min-w-[2.25rem] rounded-md px-2.5 py-1 text-base font-bold tabular-nums"
        style={gradePillStyle(hue, chroma) as any}
      >
        {grade}
      </span>
    </td>
  );
}

// Is this a real grade value (vs. an empty/placeholder dash)?
function hasGradeValue(s: string): boolean {
  const v = s.trim();
  return !!v && v !== '-' && v !== '–';
}

// Compact, color-coded grade pill for the diploma/protocol tables. Falls back
// to plain text for non-7-scale values (ECTS letters, "12*" conversions) and a
// muted dash for empties. Shares the same dark-mode mechanism as GradeCell.
function SmallGradePill({ grade }: { grade: string }) {
  const g = grade.trim();
  if (!hasGradeValue(g)) return <span className="text-muted-foreground/40">–</span>;
  const base = g.replace(/\*/g, '').trim();
  if (gradeToNumber(base) === null) {
    return <span className="font-semibold text-foreground tabular-nums">{g}</span>;
  }
  return (
    <span
      className="il-grade-pill inline-flex items-center justify-center min-w-[1.75rem] rounded px-1.5 py-0.5 text-sm font-bold tabular-nums"
      style={gradePillStyle(getGradeHue(base), getGradeChroma(base)) as any}
    >
      {g}
    </span>
  );
}

function SubjectRow({ group, columns }: { group: SubjectGroup; columns: GradeColumn[] }) {
  const holdHue = getHoldHue(group.hold);
  const holdName = getHoldDisplayName(group.hold);
  const hasMultipleRows = group.rows.length > 1;
  const [notesOpen, setNotesOpen] = useState(false);
  // subject col + sub-label col + one per grade column + notes col
  const totalCols = columns.length + 3;

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
              'transition-[background-color] duration-150 hover:bg-accent/30',
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
                    <span className="text-sm text-muted-foreground leading-none">
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
            {columns.map((col) => (
              <GradeCell key={col.key} info={entry.grades[col.key]} />
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
                    className="inline-flex items-center justify-center w-6 h-6 rounded-md hover:bg-accent transition-[background-color] duration-150 cursor-pointer active:scale-[0.9]"
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
          <td colSpan={totalCols} className="px-4 py-2 bg-muted/20">
            <div className="space-y-1.5 pl-4">
              {group.notes.map((note, i) => (
                <div key={i} className="pl-3 border-l-2 border-muted-foreground/15">
                  <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
                    {note.note}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
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

// Emphasized card for the official, unambiguous "Eksamensresultat" (the number
// that lands on the diploma). Only rendered when Lectio actually reports one.
function ExamResultCard({
  result,
  name,
}: {
  result: { ekskl: string; inkl: string | null };
  name: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="bg-primary/5 border border-primary/30 rounded-xl px-5 py-3.5 flex items-center gap-3.5">
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/15 shrink-0">
        <GraduationCap className="w-5 h-5 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-3xl font-black tabular-nums text-foreground leading-none">
          {result.ekskl}
        </p>
        <p className="text-xs font-semibold text-foreground/80 uppercase tracking-wide mt-1.5">
          {t('karaktererPage.examResult')}
          {name && <span className="text-muted-foreground font-medium normal-case"> · {name}</span>}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {result.inkl
            ? `${t('karaktererPage.inclBonus')}: ${result.inkl}`
            : t('karaktererPage.basedOnCurrent')}
        </p>
      </div>
    </div>
  );
}

// Every populated grade column shown as its own labeled mini-stat, so no
// average is ever displayed without saying which average it is.
function AveragesCard({
  columns,
  columnAverages,
}: {
  columns: GradeColumn[];
  columnAverages: Record<string, ColumnAverage>;
}) {
  const { t } = useTranslation();
  const populated = columns.filter((c) => columnAverages[c.key]?.weighted);
  if (populated.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 flex flex-col">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5 flex items-center gap-1.5">
        <TrendingUp className="w-3.5 h-3.5" />
        {t('karaktererPage.averagesTitle')}
        <span className="font-normal normal-case text-muted-foreground/70">· {t('karaktererPage.weightedNote')}</span>
      </p>
      <div className="flex items-end gap-x-5 gap-y-2.5 flex-wrap mt-auto">
        {populated.map((col) => (
          <div key={col.key} className="flex flex-col" title={col.label}>
            <span className="text-xl font-bold tabular-nums text-foreground leading-none">
              {columnAverages[col.key].weighted}
            </span>
            <span className="text-[11px] text-muted-foreground mt-1 whitespace-nowrap">
              {columnShortLabel(col, t)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Distribution of each subject's current standing (one representative grade per
// subject — see representativeGrade).
function DistributionCard({ grades }: { grades: GradeEntry[] }) {
  const { t } = useTranslation();
  const dist = computeGradeDistribution(grades);
  const total = Object.values(dist).reduce((s, c) => s + c, 0);
  if (total === 0) return null;

  const gradeOrder = ['12', '10', '7', '4', '02', '00', '-3'];

  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 flex flex-col">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">
        {t('karaktererPage.distributionTitle')}
        <span className="font-normal normal-case text-muted-foreground/70"> · {total} {t('karaktererPage.subjectsTotal')}</span>
      </p>
      <div className="flex items-center gap-1.5 flex-wrap mt-auto">
        {gradeOrder.map((g) => {
          const count = dist[g] || 0;
          if (count === 0) return null;
          const hue = getGradeHue(g);
          const chroma = getGradeChroma(g);
          return (
            <div key={g} className="flex items-center gap-1.5">
              <span
                className="il-grade-pill text-sm font-bold tabular-nums rounded px-1.5 py-0.5"
                style={{
                  color: `oklch(0.40 ${chroma} ${hue})`,
                  backgroundColor: `oklch(0.94 ${chroma * 0.25} ${hue})`,
                  '--bl-grade-fg-dark': `oklch(0.82 ${chroma * 0.85} ${hue})`,
                  '--bl-grade-bg-dark': `oklch(0.28 ${chroma * 0.45} ${hue})`,
                } as any}
              >
                {g}
              </span>
              <span className="text-xs text-muted-foreground font-medium mr-1">
                ×{count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KaraktererSummary({
  grades,
  columns,
  columnAverages,
  diplomaTypes,
}: {
  grades: GradeEntry[];
  columns: GradeColumn[];
  columnAverages: Record<string, ColumnAverage>;
  diplomaTypes: DiplomaType[];
}) {
  const examResults = diplomaTypes
    .map((d) => ({ name: d.name, result: parseExamResult(d.average) }))
    .filter((d): d is { name: string; result: { ekskl: string; inkl: string | null } } => !!d.result);

  const hasAverages = columns.some((c) => columnAverages[c.key]?.weighted);
  const hasGrades = grades.some((e) => representativeGrade(e));

  if (examResults.length === 0 && !hasAverages && !hasGrades) return null;

  return (
    <div className="flex items-stretch gap-3 flex-wrap animate-[bl-fade-in_350ms_var(--ease-out)_100ms_both]">
      {examResults.map((e, i) => (
        <ExamResultCard key={i} result={e.result} name={e.name} />
      ))}
      <AveragesCard columns={columns} columnAverages={columnAverages} />
      <DistributionCard grades={grades} />
    </div>
  );
}

// Diploma "Linjer på bevis" table. Grades are shown as color pills. The whole
// Eksamenskarakter column group is hidden when the student has no exam grades
// yet (the common pre-exam case), collapsing to a clean 4-column table.
function DiplomaLinesTable({ diploma }: { diploma: DiplomaType }) {
  const { t } = useTranslation();
  const showExam = diploma.lines.some((l) => hasGradeValue(l.eksKarakter));
  const examResult = parseExamResult(diploma.average);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {showExam ? (
              <>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-2 font-medium text-muted-foreground">{t('karaktererPage.subject')}</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-center" colSpan={3}>{t('karaktererPage.annualGrade')}</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-center border-l border-border/50" colSpan={3}>{t('karaktererPage.examGrade')}</th>
                </tr>
                <tr className="border-b border-border/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-1"></th>
                  <th className="px-3 py-1 text-center font-medium">{t('karaktererPage.weight')}</th>
                  <th className="px-3 py-1 text-center font-medium">{t('karaktererPage.grade')}</th>
                  <th className="px-3 py-1 text-center font-medium">ECTS</th>
                  <th className="px-3 py-1 text-center font-medium border-l border-border/50">{t('karaktererPage.weight')}</th>
                  <th className="px-3 py-1 text-center font-medium">{t('karaktererPage.grade')}</th>
                  <th className="px-3 py-1 text-center font-medium">ECTS</th>
                </tr>
              </>
            ) : (
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">{t('karaktererPage.subject')}</th>
                <th className="px-3 py-2 text-center font-medium">{t('karaktererPage.weight')}</th>
                <th className="px-3 py-2 text-center font-medium">{t('karaktererPage.annualGrade')}</th>
                <th className="px-3 py-2 text-center font-medium">ECTS</th>
              </tr>
            )}
          </thead>
          <tbody>
            {diploma.lines.map((line, i) => (
              <tr key={i} className="border-b border-border/30 last:border-0">
                <td className="px-4 py-2 text-foreground">{line.fag}</td>
                <td className="px-3 py-2 text-center text-muted-foreground tabular-nums">{line.aarsVaegt}</td>
                <td className="px-3 py-2 text-center"><SmallGradePill grade={line.aarsKarakter} /></td>
                <td className="px-3 py-2 text-center text-muted-foreground">{line.aarsECTS}</td>
                {showExam && (
                  <>
                    <td className="px-3 py-2 text-center text-muted-foreground tabular-nums border-l border-border/50">{line.eksVaegt}</td>
                    <td className="px-3 py-2 text-center"><SmallGradePill grade={line.eksKarakter} /></td>
                    <td className="px-3 py-2 text-center text-muted-foreground">{line.eksECTS}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {examResult && (
        <div className="flex items-baseline gap-2 px-4 py-2.5 border-t border-border bg-muted/30">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('karaktererPage.examResult')}
          </span>
          <span className="text-base font-bold tabular-nums text-foreground">{examResult.ekskl}</span>
          {examResult.inkl && (
            <span className="text-xs text-muted-foreground">
              ({t('karaktererPage.inclBonus')}: <span className="font-semibold text-foreground">{examResult.inkl}</span>)
            </span>
          )}
        </div>
      )}
    </>
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
      <CollapsibleTrigger className="flex items-center gap-2.5 w-full px-4 py-3 bg-card border border-border rounded-xl hover:bg-accent/30 transition-[background-color,transform] duration-150 ease-out active:scale-[0.99] cursor-pointer group">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{title}</span>
        {count !== undefined && count > 0 && (
          <Badge variant="secondary" className="text-xs ml-1">{count}</Badge>
        )}
        <ChevronDown
          className={cn(
            'w-4 h-4 text-muted-foreground ml-auto transition-[transform] duration-200 ease-out',
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

function computeColumnAverages(
  grades: GradeEntry[],
  columns: GradeColumn[],
): Record<string, ColumnAverage> {
  const result: Record<string, ColumnAverage> = {};

  for (const col of columns) {
    let weightedSum = 0;
    let totalWeight = 0;
    let simpleSum = 0;
    let simpleCount = 0;

    for (const entry of grades) {
      const info = entry.grades[col.key];
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

    result[col.key] = {
      weighted: totalWeight > 0 ? (weightedSum / totalWeight).toFixed(2) : null,
      unweighted: simpleCount > 0 ? (simpleSum / simpleCount).toFixed(2) : null,
    };
  }

  return result;
}

// ── Main component ─────────────────────────────────────────────────────

export function KaraktererPage({ data }: { data: KaraktererData }) {
  const { t } = useTranslation();
  const columns = data.columns;
  // Short header label for the well-known columns; falls back to the full
  // Danish header for anything we don't have a translation for.
  const shortLabelFor = (col: GradeColumn): string => {
    switch (col.key) {
      case '1.standpunkt': return '1. stdpkt';
      case '2.standpunkt': return '2. stdpkt';
      case '3.standpunkt': return '3. stdpkt';
      case 'afsluttende': return t('karaktererPage.final');
      case 'intern prøve': return t('karaktererPage.intern');
      case 'årskarakter': return t('karaktererPage.annual');
      case 'eksamenskarakter': return t('karaktererPage.exam');
      default: return col.label;
    }
  };
  const groups = groupBySubject(data.grades, data.notes);
  const columnAverages = computeColumnAverages(data.grades, columns);

  // Check if weighted differs from unweighted (i.e. weights aren't all equal)
  const hasWeightDiff = columns.some((col) => {
    const avg = columnAverages[col.key];
    return avg.weighted && avg.unweighted && avg.weighted !== avg.unweighted;
  });


  return (
    <div className="max-w-7xl mx-auto px-10 pb-12 pt-8 space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3 border-b border-border pb-5">
        <GraduationCap className="w-7 h-7 text-primary" />
        <h1 className="text-[2rem] font-[800] tracking-[-0.02em] text-foreground">{t('karaktererPage.title')}</h1>
      </div>

      {/* Summary stats */}
      <KaraktererSummary
        grades={data.grades}
        columns={columns}
        columnAverages={columnAverages}
        diplomaTypes={data.diplomaTypes}
      />

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
        <div className="bg-card border border-border rounded-xl overflow-hidden animate-[bl-fade-in_350ms_var(--ease-out)_both]">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="pl-4 pr-3 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground font-medium w-[35%]">
                    {t('karaktererPage.subject')}
                  </th>
                  <th className="px-2 py-3 text-center text-xs uppercase tracking-wider text-muted-foreground font-medium w-[5%]">
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      title={col.label}
                      className="px-3 py-3 text-center text-xs uppercase tracking-wider text-muted-foreground font-medium whitespace-nowrap"
                    >
                      {shortLabelFor(col)}
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
                    columns={columns}
                  />
                ))}
              </tbody>
              {/* Average footer */}
              {columns.some((col) => columnAverages[col.key].unweighted) && (
                <tfoot>
                  {/* Weighted average row (primary) */}
                  <tr className="border-t-2 border-border">
                    <td className="pl-4 pr-3 py-3 text-base font-semibold text-foreground" colSpan={2}>
                      {t('karaktererPage.weightedAverage')}
                    </td>
                    {columns.map((col) => (
                      <td key={col.key} className="px-3 py-3 text-center">
                        {columnAverages[col.key].weighted ? (
                          <span className="text-base font-bold tabular-nums text-primary">
                            {columnAverages[col.key].weighted}
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
                        {t('karaktererPage.unweightedAverage')}
                      </td>
                      {columns.map((col) => (
                        <td key={col.key} className="px-3 py-2.5 text-center">
                          {columnAverages[col.key].unweighted ? (
                            <span className="text-sm tabular-nums text-muted-foreground">
                              {columnAverages[col.key].unweighted}
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
      ) : data.diplomaTypes.length === 0 && data.protocolLines.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-14 text-center">
          <GraduationCap className="mb-3 size-7 text-muted-foreground" />
          <p className="text-base font-semibold text-foreground">{t('karaktererPage.noGrades')}</p>
          <p className="text-sm text-muted-foreground">{t('karaktererPage.noGradesMessage')}</p>
        </div>
      ) : null}

      {/* Collapsible sections */}
      <div className="space-y-2 pt-2">
        {/* Linjer på bevis — one section per bevistype, expanded by default */}
        {data.diplomaTypes.map((diploma, di) => (
          diploma.lines.length > 0 && (
            <CollapsibleSection
              key={di}
              title={
                diploma.name
                  ? `${t('karaktererPage.diplomaLines')} · ${diploma.name}`
                  : t('karaktererPage.diplomaLines')
              }
              icon={FileText}
              count={diploma.lines.length}
              defaultOpen
            >
              <DiplomaLinesTable diploma={diploma} />
            </CollapsibleSection>
          )
        ))}

        {/* Protokollinjer */}
        {data.protocolLines.length > 0 && (
          <CollapsibleSection
            title={t('karaktererPage.protocolLines')}
            icon={ScrollText}
            count={data.protocolLines.length}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">{t('karaktererPage.term')}</th>
                    <th className="px-3 py-2 font-medium">{t('karaktererPage.type')}</th>
                    <th className="px-3 py-2 font-medium text-center">{t('karaktererPage.counts')}</th>
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
                      <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{line.vaegt}</td>
                      <td className="px-3 py-2 text-center"><SmallGradePill grade={line.karakter} /></td>
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
            title={t('karaktererPage.remarks')}
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
            title={t('karaktererPage.allGradeNotes')}
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
                  <p className="text-xs text-muted-foreground mt-1">{note.dateInitials}</p>
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
  const columns: GradeColumn[] = [];
  const grades: GradeEntry[] = [];
  const notes: GradeNote[] = [];
  const remarks: Remark[] = [];
  const diplomaTypes: DiplomaType[] = [];
  const protocolLines: ProtocolLine[] = [];
  const alerts: string[] = [];

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
  // The grade columns (and their order) vary per school/term — Lectio has
  // added columns like "Afsluttende års-/standpunktskarakter" mid-table. We
  // read the header row to learn the columns instead of assuming a fixed set,
  // otherwise every value after a new column shifts and årskarakter/eksamen
  // are silently swapped.
  const gradeTable = doc.getElementById('s_m_Content_Content_karakterView_KarakterGV');
  if (gradeTable) {
    const rows = gradeTable.querySelectorAll('tr');

    // Header row → column definitions. First two desktop <th> are Hold + Fag.
    const headerCells = rows[0]?.querySelectorAll('th.OnlyDesktop');
    if (headerCells) {
      for (let h = 2; h < headerCells.length; h++) {
        const label = headerCells[h].textContent?.replace(/\s+/g, ' ').trim() || '';
        if (!label) continue;
        columns.push({ key: canonicalColumnKey(label), label });
      }
    }

    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll('td.OnlyDesktop');
      // hold + fag + one cell per column
      if (cells.length < 2 + columns.length) continue;

      const hold = cells[0].textContent?.trim() || '';
      const fag = cells[1].textContent?.trim() || '';

      const gradeMap: Record<string, GradeInfo | undefined> = {};
      for (let c = 0; c < columns.length; c++) {
        const cell = cells[c + 2];
        if (!cell) continue;
        const div = cell.querySelector('div');
        const gradeText = div?.textContent?.trim() || cell.textContent?.trim() || '';
        if (gradeText) {
          gradeMap[columns[c].key] = {
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

  // ── Diploma lines (one block per "Bevistype") ──
  // Lectio renders these inside a repeater, so element ids are prefixed with
  // the repeater control (e.g. `..._ctl00_printareaDiplomaLines`). Match by id
  // suffix rather than the bare id — Lectio changed from `printareaDiplomaLines`
  // to the prefixed form, which silently broke the old exact-id lookup.
  const cleanAverage = (htmlStr: string): string =>
    htmlStr
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&[a-z]+;/gi, '')
      .replace(/[ \t]+/g, ' ')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n');

  const parseDiplomaTable = (area: Element): DiplomaLine[] => {
    const lines: DiplomaLine[] = [];
    const table = area.querySelector('table');
    if (!table) return lines;
    const rows = table.querySelectorAll('tr');
    for (let i = 2; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll('td');
      if (cells.length < 7) continue;
      lines.push({
        fag: cells[0].textContent?.trim() || '',
        aarsVaegt: cells[1].textContent?.trim() || '',
        aarsKarakter: cells[2].textContent?.trim() || '',
        aarsECTS: cells[3].textContent?.trim() || '',
        eksVaegt: cells[4].textContent?.trim() || '',
        eksKarakter: cells[5].textContent?.trim() || '',
        eksECTS: cells[6].textContent?.trim() || '',
      });
    }
    return lines;
  };

  // Iterate the always-present printarea elements (one per repeater item). The
  // "Bevistype:" label span is optional, so we look it up per item but don't
  // depend on it. Falls back to the legacy bare `printareaDiplomaLines` id.
  const printAreas = doc.querySelectorAll<HTMLElement>(
    '[id*="DiplomaTypeRepeater"][id$="_printareaDiplomaLines"]',
  );
  const areaList: Element[] = printAreas.length > 0
    ? Array.from(printAreas)
    : [doc.getElementById('printareaDiplomaLines'), doc.querySelector('[id$="printareaDiplomaLines"]')]
        .filter((el): el is Element => !!el)
        .slice(0, 1);

  for (const area of areaList) {
    // Only a repeater-scoped id (`..._ctlNN_printareaDiplomaLines`) yields a
    // usable prefix for sibling lookups; the legacy bare id does not.
    const prefix = /_printareaDiplomaLines$/.test(area.id)
      ? area.id.replace(/_printareaDiplomaLines$/, '')
      : '';
    const nameSpan = prefix ? doc.getElementById(`${prefix}_DiplomaTypeText`) : null;
    const name = (nameSpan?.textContent || '').replace(/^\s*Bevistype:\s*/i, '').trim();
    const lines = parseDiplomaTable(area);
    const avgLabel = prefix
      ? doc.getElementById(`${prefix}_GradeAverageLabel`)
      : doc.querySelector('[id$="GradeAverageLabel"]');
    const average = avgLabel ? cleanAverage(avgLabel.innerHTML) : '';
    if (lines.length > 0 || average) {
      diplomaTypes.push({ name, lines, average });
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

  return { columns, grades, notes, remarks, diplomaTypes, protocolLines, alerts };
}
