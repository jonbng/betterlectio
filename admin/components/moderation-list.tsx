"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { clearField } from "@/app/(dashboard)/moderation/actions";

type Student = {
  id: string;
  lectio_first_name: string | null;
  lectio_last_name: string | null;
  name: string | null;
  class_name: string | null;
  school_id: number;
  description: string | null;
  instagram: string | null;
  custom_pfp_url: string | null;
  lectio_pfp_url: string | null;
  schools: { name: string } | null;
};

function studentName(s: Student) {
  return (
    [s.lectio_first_name, s.lectio_last_name].filter(Boolean).join(" ") ||
    "Unknown"
  );
}

export function ModerationList({ students }: { students: Student[] }) {
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<Set<string>>(new Set());

  const filtered = students.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      studentName(s).toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q) ||
      s.instagram?.toLowerCase().includes(q) ||
      s.schools?.name?.toLowerCase().includes(q)
    );
  });

  async function handleClear(
    studentId: string,
    field: "description" | "instagram",
  ) {
    const key = `${studentId}:${field}`;
    setPending((prev) => new Set(prev).add(key));
    await clearField(studentId, field);
    setPending((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Input
        placeholder="Search by name, description, instagram, school..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />
      <div className="space-y-3">
        {filtered.map((s) => (
          <Card key={s.id}>
            <CardContent className="flex items-start gap-4 pt-4">
              <Link href={`/students/${s.id}`}>
                <Avatar className="size-10">
                  <AvatarImage
                    src={
                      s.custom_pfp_url ?? s.lectio_pfp_url ?? undefined
                    }
                    className="object-top"
                  />
                  <AvatarFallback className="text-xs">
                    {studentName(s).slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Link>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/students/${s.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {studentName(s)}
                  </Link>
                  {s.class_name && (
                    <Badge variant="outline" className="text-xs">
                      {s.class_name}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {s.schools?.name}
                  </span>
                </div>

                {s.description && (
                  <div className="flex items-start gap-2">
                    <div className="flex-1 rounded-md bg-muted px-3 py-2 text-sm">
                      {s.description}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive hover:text-destructive"
                      disabled={pending.has(`${s.id}:description`)}
                      onClick={() => handleClear(s.id, "description")}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}

                {s.instagram && (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      @{s.instagram.replace(/^@/, "")}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0 text-destructive hover:text-destructive"
                      disabled={pending.has(`${s.id}:instagram`)}
                      onClick={() => handleClear(s.id, "instagram")}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No profiles to review
          </p>
        )}
      </div>
    </div>
  );
}
