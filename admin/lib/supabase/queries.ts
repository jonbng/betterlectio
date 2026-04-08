import { supabaseAdmin } from "./admin";

// ── Overview stats ──────────────────────────────────────────────────

export async function getOverviewStats() {
  const [
    { count: totalStudents },
    { count: totalSchools },
    { count: extensionUsers },
    { count: appUsers },
    { count: recentSignups },
  ] = await Promise.all([
    supabaseAdmin
      .from("students")
      .select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("schools")
      .select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("students")
      .select("*", { count: "exact", head: true })
      .eq("has_extension", true),
    supabaseAdmin
      .from("students")
      .select("*", { count: "exact", head: true })
      .eq("has_app", true),
    supabaseAdmin
      .from("students")
      .select("*", { count: "exact", head: true })
      .gte(
        "created_at",
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      ),
  ]);

  return {
    totalStudents: totalStudents ?? 0,
    totalSchools: totalSchools ?? 0,
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
    .map((s) => ({ ...s, studentCount: schoolCounts[s.id] ?? 0 }))
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

export async function getSchools() {
  const { data: schools } = await supabaseAdmin
    .from("schools")
    .select("*")
    .order("name", { ascending: true });

  const { data: students } = await supabaseAdmin
    .from("students")
    .select("school_id, has_extension, has_app");

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
    if (s.has_extension) entry.extension++;
    if (s.has_app) entry.app++;
  }

  return (schools ?? []).map((s) => ({
    ...s,
    stats: statsMap[s.id] ?? { total: 0, extension: 0, app: 0 },
  }));
}
