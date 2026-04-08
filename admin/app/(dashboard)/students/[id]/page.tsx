import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Monitor, Smartphone } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getStudent } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const student = await getStudent(id);
  if (!student) notFound();

  const name =
    [student.lectio_first_name, student.lectio_last_name]
      .filter(Boolean)
      .join(" ") || "Unknown";

  const school = student.schools as { name: string; display_name: string | null } | null;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/students">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Student Detail
        </h1>
      </div>

      {/* Profile header */}
      <Card>
        <CardContent className="flex items-start gap-6 pt-6">
          <Avatar className="size-20">
            <AvatarImage
              src={student.custom_pfp_url ?? student.lectio_pfp_url ?? undefined}
              className="object-top"
            />
            <AvatarFallback className="text-lg">
              {name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-1">
            <h2 className="text-xl font-semibold">{name}</h2>
            <p className="text-sm text-muted-foreground font-mono">{student.id}</p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {school && (
                <Badge variant="secondary">
                  {school.display_name ?? school.name}
                </Badge>
              )}
              {student.class_name && (
                <Badge variant="outline">{student.class_name}</Badge>
              )}
              {student.has_extension && (
                <Badge variant="secondary" className="gap-1">
                  <Monitor className="size-3" />
                  Extension
                </Badge>
              )}
              {student.has_app && (
                <Badge variant="secondary" className="gap-1">
                  <Smartphone className="size-3" />
                  App
                </Badge>
              )}
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <div>Joined {new Date(student.created_at).toLocaleDateString("da-DK")}</div>
            {student.birthdate && (
              <div>Born {student.birthdate}</div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profile info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Description" value={student.description} />
            <Row label="Instagram" value={student.instagram} />
            <Row
              label="Show birthday"
              value={student.show_birthday ? "Yes" : "No"}
            />
            <Row label="Supabase UID" value={student.supabase_id} mono />
            <Separator />
            <Row label="Lectio PFP" value={student.lectio_pfp_url} link />
            <Row label="Custom PFP" value={student.custom_pfp_url} link />
          </CardContent>
        </Card>

        {/* Lesson overrides */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Lesson Overrides ({student.lessonOverrides.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {student.lessonOverrides.length === 0 ? (
              <p className="text-sm text-muted-foreground">No overrides</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Display Name</TableHead>
                    <TableHead>Color Hue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {student.lessonOverrides.map((o) => {
                    const mapping = o.school_lesson_mappings as {
                      canonical_key: string;
                      default_name: string;
                    } | null;
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-xs">
                          {mapping?.canonical_key ?? o.mapping_id}
                        </TableCell>
                        <TableCell>
                          {o.display_name ?? mapping?.default_name ?? "—"}
                        </TableCell>
                        <TableCell>
                          {o.color_hue != null ? (
                            <div className="flex items-center gap-2">
                              <div
                                className="size-4 rounded-full"
                                style={{
                                  backgroundColor: `oklch(0.65 0.15 ${o.color_hue})`,
                                }}
                              />
                              {o.color_hue}
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Homework activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Recent Homework ({student.homeworkStatuses.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {student.homeworkStatuses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No homework activity</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hold</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Done</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {student.homeworkStatuses.map((h) => {
                  const hw = h.homework_entries as {
                    entry_id: string;
                    hold: string;
                    title: string | null;
                    lesson_date: string;
                  } | null;
                  return (
                    <TableRow key={h.homework_id}>
                      <TableCell className="font-mono text-xs">
                        {hw?.hold ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {hw?.title ?? hw?.entry_id ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {hw?.lesson_date ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={h.is_done ? "default" : "outline"}>
                          {h.is_done ? "Done" : "Not done"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {new Date(h.done_updated_at).toLocaleDateString("da-DK")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  link,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  link?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      {value ? (
        link ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-primary truncate hover:underline"
          >
            <span className="truncate">{value}</span>
            <ExternalLink className="size-3 shrink-0" />
          </a>
        ) : (
          <span
            className={`text-sm text-right truncate ${mono ? "font-mono text-xs" : ""}`}
          >
            {value}
          </span>
        )
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      )}
    </div>
  );
}
