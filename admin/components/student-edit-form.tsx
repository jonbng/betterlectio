"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { updateStudent } from "@/app/(dashboard)/students/[id]/actions";

type Editable = {
  lectio_first_name: string | null;
  lectio_last_name: string | null;
  class_name: string | null;
  description: string | null;
  instagram: string | null;
  show_birthday: boolean;
  app_eligible: boolean;
  marked_android_at: string | null;
  dismissed_app_prompt_at: string | null;
};

export function StudentEditForm({
  studentId,
  initial,
}: {
  studentId: string;
  initial: Editable;
}) {
  const [form, setForm] = useState<Editable>(initial);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const set = <K extends keyof Editable>(key: K, value: Editable[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const dirty = (Object.keys(form) as (keyof Editable)[]).some(
    (k) => form[k] !== initial[k],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
    start(async () => {
      setMessage(null);
      const res = await updateStudent(studentId, form);
      setMessage(
        res.changed
          ? "Saved."
          : "No changes detected.",
      );
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name">
          <Input
            value={form.lectio_first_name ?? ""}
            onChange={(e) => set("lectio_first_name", e.target.value || null)}
          />
        </Field>
        <Field label="Last name">
          <Input
            value={form.lectio_last_name ?? ""}
            onChange={(e) => set("lectio_last_name", e.target.value || null)}
          />
        </Field>
        <Field label="Class">
          <Input
            value={form.class_name ?? ""}
            onChange={(e) => set("class_name", e.target.value || null)}
          />
        </Field>
        <Field label="Instagram">
          <Input
            value={form.instagram ?? ""}
            onChange={(e) => set("instagram", e.target.value || null)}
          />
        </Field>
      </div>

      <Field label="Description">
        <textarea
          value={form.description ?? ""}
          onChange={(e) => set("description", e.target.value || null)}
          rows={3}
          className="w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none ring-ring/50 focus-visible:ring-[3px]"
        />
      </Field>

      <div className="grid gap-2 sm:grid-cols-2">
        <Toggle
          label="Show birthday"
          checked={form.show_birthday}
          onChange={(v) => set("show_birthday", v)}
        />
        <Toggle
          label="App eligible"
          checked={form.app_eligible}
          onChange={(v) => set("app_eligible", v)}
        />
        <Toggle
          label="Marked Android"
          checked={!!form.marked_android_at}
          onChange={(v) =>
            set("marked_android_at", v ? new Date().toISOString() : null)
          }
        />
        <Toggle
          label="Dismissed app prompt"
          checked={!!form.dismissed_app_prompt_at}
          onChange={(v) =>
            set("dismissed_app_prompt_at", v ? new Date().toISOString() : null)
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          size="sm"
          disabled={!dirty || pending}
        >
          <Save className="size-4" />
          {pending ? "Saving…" : "Save changes"}
        </Button>
        {message && (
          <span className="text-xs text-muted-foreground">{message}</span>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-primary"
      />
      <span>{label}</span>
    </label>
  );
}
