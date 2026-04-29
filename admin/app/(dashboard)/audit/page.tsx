import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getRecentAudit } from "@/lib/supabase/audit";
import { AuditRow } from "@/components/audit-row";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const rows = await getRecentAudit(200, q?.trim() || undefined);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Last {rows.length} write actions performed in the admin dashboard.
        </p>
      </div>

      <form className="flex max-w-sm gap-2">
        <Input
          name="q"
          placeholder="Filter by action prefix… (e.g. student.)"
          defaultValue={q ?? ""}
        />
      </form>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No audit entries
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((row) => (
                <AuditRow key={row.id} row={row} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
