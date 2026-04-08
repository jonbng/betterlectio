import { getSchools } from "@/lib/supabase/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function SchoolsPage() {
  const schools = await getSchools();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Schools</h1>
        <p className="text-sm text-muted-foreground">
          {schools.length} schools
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {schools
          .sort((a, b) => b.stats.total - a.stats.total)
          .map((s) => (
            <Card key={s.id}>
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
                    {s.stats.total}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    students
                  </span>
                </div>
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
            </Card>
          ))}
      </div>
    </div>
  );
}
