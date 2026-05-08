import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSchools, getMappingsForSchool } from "@/lib/supabase/queries";
import { LessonMappingsEditor } from "@/components/lesson-mappings-editor";

export const dynamic = "force-dynamic";

export default async function LessonsPage({
  searchParams,
}: {
  searchParams: Promise<{ school?: string }>;
}) {
  const { school } = await searchParams;
  const schools = await getSchools();
  const sorted = [...schools].sort((a, b) => {
    if (b.stats.active !== a.stats.active)
      return b.stats.active - a.stats.active;
    return b.stats.total - a.stats.total;
  });

  const selectedId =
    school && Number.isFinite(Number(school))
      ? Number(school)
      : (sorted[0]?.id ?? null);

  const mappings = selectedId ? await getMappingsForSchool(selectedId) : [];
  const selectedSchool = sorted.find((s) => s.id === selectedId);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Lesson mappings
        </h1>
        <p className="text-sm text-muted-foreground">
          Canonical lesson keys per school (e.g. <span className="font-mono">ma</span>{" "}
          &rarr; “Matematik”). Edits here change the school-wide default;
          per-student overrides live in{" "}
          <span className="font-mono">user_lesson_overrides</span>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">School</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {sorted.map((s) => (
              <Link
                key={s.id}
                href={`/lessons?school=${s.id}`}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  s.id === selectedId
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted"
                }`}
              >
                {s.display_name ?? s.name}
                <span
                  className={`ml-1.5 ${
                    s.id === selectedId
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground"
                  }`}
                >
                  {s.stats.active}
                </span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedSchool && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-medium">
              <span>
                Mappings for{" "}
                {selectedSchool.display_name ?? selectedSchool.name}
              </span>
              <Badge variant="secondary" className="text-xs">
                {mappings.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <LessonMappingsEditor
              schoolId={selectedSchool.id}
              mappings={mappings}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
