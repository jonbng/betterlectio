import Link from "next/link";
import { getSchools } from "@/lib/supabase/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function SchoolsPage() {
  const schools = await getSchools();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Schools</h1>
        <p className="text-sm text-muted-foreground">
          {schools.length} schools
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {schools
          .sort((a, b) => {
            if (b.stats.active !== a.stats.active)
              return b.stats.active - a.stats.active;
            const ap = a.stats.adoptionPct ?? -1;
            const bp = b.stats.adoptionPct ?? -1;
            if (bp !== ap) return bp - ap;
            return b.stats.total - a.stats.total;
          })
          .map((s) => (
            <Card key={s.id} className="transition-colors hover:bg-muted/40">
              <Link href={`/schools/${s.id}`} className="block">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  {s.display_name ?? s.name}
                </CardTitle>
                <p className="text-xs text-muted-foreground font-mono">
                  ID: {s.id}
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">
                    {s.stats.active}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    active
                  </span>
                  {s.student_count != null && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      / {s.student_count.toLocaleString()} total
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {s.stats.total} ever onboarded
                </p>
                {s.stats.adoptionPct != null && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Adoption</span>
                      <span className="font-mono font-medium text-foreground">
                        {s.stats.adoptionPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-primary"
                        style={{ width: `${s.stats.adoptionPct}%` }}
                      />
                    </div>
                  </div>
                )}
                <div className="mt-2 flex gap-1.5">
                  {s.stats.extension > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {s.stats.extension} extension
                    </Badge>
                  )}
                  {s.stats.app > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {s.stats.app} app
                    </Badge>
                  )}
                </div>
              </CardContent>
              </Link>
            </Card>
          ))}
      </div>
    </div>
  );
}
