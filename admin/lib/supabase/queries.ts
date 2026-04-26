import { supabaseAdmin } from "./admin";

// ── Overview stats ──────────────────────────────────────────────────

export async function getOverviewStats() {
  const [
    { count: totalStudents },
    { data: schoolIds },
    { count: extensionUsers },
    { count: appUsers },
    { count: recentSignups },
  ] = await Promise.all([
    supabaseAdmin
      .from("students")
      .select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("students")
      .select("school_id"),
    supabaseAdmin
      .from("students")
      .select("*", { count: "exact", head: true })
      .not("extension_installed_at", "is", null),
    supabaseAdmin
      .from("students")
      .select("*", { count: "exact", head: true })
      .not("app_installed_at", "is", null),
    supabaseAdmin
      .from("students")
      .select("*", { count: "exact", head: true })
      .gte(
        "created_at",
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      ),
  ]);

  const activeSchools = new Set((schoolIds ?? []).map((s) => s.school_id)).size;

  return {
    totalStudents: totalStudents ?? 0,
    totalSchools: activeSchools,
    extensionUsers: extensionUsers ?? 0,
    appUsers: appUsers ?? 0,
    recentSignups: recentSignups ?? 0,
  };
}

export async function getSignupsByDay(days = 30) {
  const since = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data } = await supabaseAdmin
    .from("students")
    .select("created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const day = row.created_at.slice(0, 10);
    counts[day] = (counts[day] ?? 0) + 1;
  }

  // Fill gaps so every day in the range appears
  const result: { date: string; count: number }[] = [];
  const start = new Date(since);
  const end = new Date();
  for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, count: counts[key] ?? 0 });
  }

  return result;
}

// ── Top schools ─────────────────────────────────────────────────────

export async function getTopSchools(limit = 10) {
  const { data: students } = await supabaseAdmin
    .from("students")
    .select("school_id");

  const schoolCounts: Record<number, number> = {};
  for (const s of students ?? []) {
    schoolCounts[s.school_id] = (schoolCounts[s.school_id] ?? 0) + 1;
  }

  const { data: schools } = await supabaseAdmin.from("schools").select("*");

  return (schools ?? [])
    .filter((s) => (schoolCounts[s.id] ?? 0) > 0)
    .map((s) => ({ ...s, studentCount: schoolCounts[s.id] }))
    .sort((a, b) => b.studentCount - a.studentCount)
    .slice(0, limit);
}

// ── Students ────────────────────────────────────────────────────────

export async function getStudents() {
  const { data } = await supabaseAdmin
    .from("students")
    .select("*, schools(name)")
    .order("created_at", { ascending: false });

  return data ?? [];
}

// ── Schools ─────────────────────────────────────────────────────────

export async function getStudent(id: string) {
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("*, schools(name, display_name)")
    .eq("id", id)
    .single();

  if (!student) return null;

  const [{ data: homeworkStatuses }, { data: lessonOverrides }] =
    await Promise.all([
      supabaseAdmin
        .from("student_homework")
        .select("*, homework_entries(entry_id, hold, title, lesson_date)")
        .eq("student_id", id)
        .order("done_updated_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("user_lesson_overrides")
        .select("*, school_lesson_mappings(canonical_key, default_name)")
        .eq("student_id", id)
        .is("deleted_at", null),
    ]);

  return {
    ...student,
    homeworkStatuses: homeworkStatuses ?? [],
    lessonOverrides: lessonOverrides ?? [],
  };
}

// ── Moderation ──────────────────────────────────────────────────────

export async function getStudentsWithProfiles() {
  const { data } = await supabaseAdmin
    .from("students")
    .select("*, schools(name)")
    .or("description.neq.,instagram.neq.")
    .order("created_at", { ascending: false });

  // Filter client-side since .neq. with null is tricky
  return (data ?? []).filter((s) => s.description || s.instagram);
}

export async function clearStudentField(
  studentId: string,
  field: "description" | "instagram",
) {
  if (field === "description") {
    await supabaseAdmin
      .from("students")
      .update({ description: null })
      .eq("id", studentId);
  } else {
    await supabaseAdmin
      .from("students")
      .update({ instagram: null })
      .eq("id", studentId);
  }
}

// ── Schools ─────────────────────────────────────────────────────────

export async function getSchools() {
  const { data: schools } = await supabaseAdmin
    .from("schools")
    .select("*")
    .order("name", { ascending: true });

  const { data: students } = await supabaseAdmin
    .from("students")
    .select("school_id, extension_installed_at, app_installed_at");

  const statsMap: Record<
    number,
    { total: number; extension: number; app: number }
  > = {};
  for (const s of students ?? []) {
    const entry = (statsMap[s.school_id] ??= {
      total: 0,
      extension: 0,
      app: 0,
    });
    entry.total++;
    if (s.extension_installed_at) entry.extension++;
    if (s.app_installed_at) entry.app++;
  }

  return (schools ?? [])
    .filter((s) => statsMap[s.id]?.total > 0)
    .map((s) => ({
      ...s,
      stats: statsMap[s.id],
    }));
}
