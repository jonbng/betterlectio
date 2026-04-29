import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Settings = {
  settings: unknown;
  schema_version: number;
  updated_at: string;
  created_at: string;
} | null;

type Theme = {
  school_id: string;
  theme_id: string;
  updated_at: string;
};

export function SyncedSettingsCard({
  settings,
  themes,
}: {
  settings: Settings;
  themes: Theme[];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-sm font-medium">Synced settings</CardTitle>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            Beta
          </Badge>
          {settings ? (
            <Badge variant="secondary" className="text-xs">
              schema v{settings.schema_version}
            </Badge>
          ) : null}
          {settings && (
            <span className="ml-auto text-xs text-muted-foreground">
              Updated{" "}
              {new Date(settings.updated_at).toLocaleString("da-DK")}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          From <span className="font-mono">user_settings</span> /{" "}
          <span className="font-mono">user_school_themes</span>. Schema is still
          evolving — values are shown as raw JSON.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!settings ? (
          <p className="text-sm text-muted-foreground">
            No synced settings yet — this student hasn’t pushed a settings blob.
          </p>
        ) : (
          <details className="rounded-md border bg-muted/30">
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Raw settings JSON
            </summary>
            <pre className="overflow-x-auto border-t bg-background px-3 py-2 font-mono text-[11px] leading-snug">
              {JSON.stringify(settings.settings, null, 2)}
            </pre>
          </details>
        )}

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Per-school themes ({themes.length})
          </div>
          {themes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No themes synced yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>Theme</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {themes.map((t) => (
                  <TableRow key={`${t.school_id}:${t.theme_id}`}>
                    <TableCell className="font-mono text-xs">
                      {t.school_id}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {t.theme_id}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {new Date(t.updated_at).toLocaleString("da-DK")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
