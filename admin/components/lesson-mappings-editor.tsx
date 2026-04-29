"use client";

import { useState, useTransition } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  upsertMapping,
  deleteMapping,
} from "@/app/(dashboard)/lessons/actions";

type Mapping = {
  id: string;
  school_id: number;
  canonical_key: string;
  default_name: string;
  default_color_hue: number | null;
  overrideCount: number;
  studentCount: number;
};

export function LessonMappingsEditor({
  schoolId,
  mappings,
}: {
  schoolId: number;
  mappings: Mapping[];
}) {
  const [drafts, setDrafts] = useState<Record<string, Partial<Mapping>>>({});
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState({
    canonical_key: "",
    default_name: "",
    default_color_hue: 200,
  });

  const isDirty = (m: Mapping) => {
    const d = drafts[m.id];
    if (!d) return false;
    return (
      (d.canonical_key !== undefined &&
        d.canonical_key !== m.canonical_key) ||
      (d.default_name !== undefined && d.default_name !== m.default_name) ||
      (d.default_color_hue !== undefined &&
        d.default_color_hue !== m.default_color_hue)
    );
  };

  const updateDraft = (
    id: string,
    patch: Partial<Mapping>,
  ) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const save = (m: Mapping) => {
    const d = drafts[m.id] ?? {};
    start(async () => {
      await upsertMapping({
        id: m.id,
        schoolId,
        canonicalKey: (d.canonical_key ?? m.canonical_key) ?? "",
        defaultName: (d.default_name ?? m.default_name) ?? "",
        defaultColorHue:
          d.default_color_hue !== undefined
            ? d.default_color_hue
            : m.default_color_hue,
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[m.id];
        return next;
      });
    });
  };

  const remove = (m: Mapping) => {
    if (
      !confirm(
        `Delete "${m.default_name}" (${m.canonical_key})? ${m.overrideCount} student override${
          m.overrideCount === 1 ? "" : "s"
        } will be orphaned.`,
      )
    )
      return;
    start(async () => {
      await deleteMapping(m.id, m.overrideCount);
    });
  };

  const create = () => {
    const key = newRow.canonical_key.trim().toLowerCase();
    const name = newRow.default_name.trim();
    if (!key || !name) return;
    start(async () => {
      await upsertMapping({
        schoolId,
        canonicalKey: key,
        defaultName: name,
        defaultColorHue: newRow.default_color_hue,
      });
      setAdding(false);
      setNewRow({ canonical_key: "", default_name: "", default_color_hue: 200 });
    });
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Canonical key</TableHead>
            <TableHead>Display name</TableHead>
            <TableHead>Hue</TableHead>
            <TableHead className="text-right">Overrides</TableHead>
            <TableHead className="text-right">Students</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {adding && (
            <TableRow className="bg-muted/40">
              <TableCell>
                <Input
                  placeholder="ma"
                  value={newRow.canonical_key}
                  onChange={(e) =>
                    setNewRow((r) => ({
                      ...r,
                      canonical_key: e.target.value,
                    }))
                  }
                  className="h-8 font-mono text-xs"
                />
              </TableCell>
              <TableCell>
                <Input
                  placeholder="Matematik"
                  value={newRow.default_name}
                  onChange={(e) =>
                    setNewRow((r) => ({ ...r, default_name: e.target.value }))
                  }
                  className="h-8"
                />
              </TableCell>
              <TableCell>
                <HueInput
                  value={newRow.default_color_hue}
                  onChange={(v) =>
                    setNewRow((r) => ({ ...r, default_color_hue: v }))
                  }
                />
              </TableCell>
              <TableCell />
              <TableCell />
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    onClick={create}
                    disabled={pending}
                    className="h-8"
                  >
                    Create
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAdding(false)}
                    className="h-8"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )}

          {mappings.map((m) => {
            const d = drafts[m.id] ?? {};
            const dirty = isDirty(m);
            const hue =
              d.default_color_hue !== undefined
                ? d.default_color_hue
                : m.default_color_hue;
            return (
              <TableRow key={m.id}>
                <TableCell>
                  <Input
                    value={d.canonical_key ?? m.canonical_key}
                    onChange={(e) =>
                      updateDraft(m.id, { canonical_key: e.target.value })
                    }
                    className="h-8 font-mono text-xs"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={d.default_name ?? m.default_name}
                    onChange={(e) =>
                      updateDraft(m.id, { default_name: e.target.value })
                    }
                    className="h-8"
                  />
                </TableCell>
                <TableCell>
                  <HueInput
                    value={hue}
                    onChange={(v) =>
                      updateDraft(m.id, { default_color_hue: v })
                    }
                  />
                </TableCell>
                <TableCell className="text-right text-sm">
                  {m.overrideCount > 0 ? (
                    <Badge variant="secondary" className="text-xs">
                      {m.overrideCount}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {m.studentCount > 0 ? m.studentCount : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {dirty && (
                      <Button
                        size="sm"
                        onClick={() => save(m)}
                        disabled={pending}
                        className="h-8"
                      >
                        <Save className="size-3.5" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove(m)}
                      disabled={pending}
                      className="h-8 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {mappings.length === 0 && !adding && (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-6 text-center text-sm text-muted-foreground"
              >
                No mappings for this school yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {!adding && (
        <div className="border-t p-3">
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            Add mapping
          </Button>
        </div>
      )}
    </div>
  );
}

function HueInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  const v = value ?? 200;
  return (
    <div className="flex items-center gap-2">
      <div
        className="size-5 shrink-0 rounded-full border"
        style={{ backgroundColor: `oklch(0.65 0.15 ${v})` }}
      />
      <Input
        type="number"
        min={0}
        max={360}
        value={v}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="h-8 w-16 text-xs"
      />
    </div>
  );
}
