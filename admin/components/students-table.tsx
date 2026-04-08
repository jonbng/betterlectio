"use client";

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Student = {
  id: string;
  name: string | null;
  class_name: string | null;
  school_id: number;
  has_extension: boolean;
  has_app: boolean;
  created_at: string;
  custom_pfp_url: string | null;
  lectio_pfp_url: string | null;
  description: string | null;
  instagram: string | null;
  schools: { name: string } | null;
};

export function StudentsTable({ students }: { students: Student[] }) {
  const [search, setSearch] = useState("");

  const filtered = students.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.name?.toLowerCase().includes(q) ||
      s.class_name?.toLowerCase().includes(q) ||
      s.schools?.name?.toLowerCase().includes(q) ||
      s.id.includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-4">
      <Input
        placeholder="Search by name, class, school, or ID..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>School</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Profile</TableHead>
              <TableHead className="text-right">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarImage
                        src={s.custom_pfp_url ?? s.lectio_pfp_url ?? undefined}
                        className="object-top"
                      />
                      <AvatarFallback className="text-xs">
                        {(s.name ?? "?").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {s.name ?? "Unknown"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground font-mono">
                        {s.id}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {s.schools?.name ?? s.school_id}
                </TableCell>
                <TableCell className="text-sm">
                  {s.class_name ?? "—"}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {s.has_extension && (
                      <Badge variant="secondary" className="text-xs">
                        Extension
                      </Badge>
                    )}
                    {s.has_app && (
                      <Badge variant="secondary" className="text-xs">
                        App
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {s.description && (
                      <Badge variant="outline" className="text-xs">
                        Bio
                      </Badge>
                    )}
                    {s.instagram && (
                      <Badge variant="outline" className="text-xs">
                        IG
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {new Date(s.created_at).toLocaleDateString("da-DK")}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No students found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
