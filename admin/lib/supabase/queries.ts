import { supabaseAdmin } from "./admin";
import { getSchoolYearFromClassName } from "@/lib/class-name";

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

export async function getStudents(opts: { schoolId?: number } = {}) {
  let q = supabaseAdmin
    .from("students")
    .select("*, schools(name)")
    .order("created_at", { ascending: false });
  if (opts.schoolId != null) q = q.eq("school_id", opts.schoolId);
  const { data } = await q;
  return data ?? [];
}

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

export async function getSchoolDetail(id: number) {
  const { data: school } = await supabaseAdmin
    .from("schools")
    .select("*")
    .eq("id", id)
    .single();
  if (!school) return null;

  const [
    { data: students },
    { data: uninstalls },
    { count: totalStudents },
  ] = await Promise.all([
    supabaseAdmin
      .from("students")
      .select(
        "id, lectio_first_name, lectio_last_name, class_name, school_id, extension_installed_at, app_installed_at, created_at, custom_pfp_url, lectio_pfp_url, description, instagram, app_eligible, app_qr_scanned_at, marked_android_at, schools(name)",
      )
      .eq("school_id", id)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("students")
      .select(
        "id, lectio_first_name, lectio_last_name, class_name, extension_uninstalled_at, extension_uninstall_reason, extension_uninstall_feedback",
      )
      .eq("school_id", id)
      .not("extension_uninstalled_at", "is", null)
      .order("extension_uninstalled_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("students")
      .select("*", { count: "exact", head: true }),
  ]);

  const list = students ?? [];
  const stats = {
    total: list.length,
    extension: list.filter((s) => s.extension_installed_at).length,
    app: list.filter((s) => s.app_installed_at).length,
    eligible: list.filter((s) => s.app_eligible).length,
    qrScanned: list.filter((s) => s.app_qr_scanned_at).length,
    markedAndroid: list.filter((s) => s.marked_android_at).length,
    pctOfTotal: totalStudents
      ? Math.round((list.length / totalStudents) * 100)
      : 0,
  };

  // Class roster (top classes by size)
  const classCounts: Record<string, number> = {};
  for (const s of list) {
    if (!s.class_name) continue;
    classCounts[s.class_name] = (classCounts[s.class_name] ?? 0) + 1;
  }
  const classes = Object.entries(classCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    school,
    students: list,
    uninstalls: uninstalls ?? [],
    stats,
    classes,
  };
}

// ── Uninstall analytics ─────────────────────────────────────────────

export async function getUninstallStats() {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const since7 = new Date(now - 7 * day).toISOString();
  const since30 = new Date(now - 30 * day).toISOString();

  const [
    { count: total },
    { count: last7 },
    { count: last30 },
    { data: rows },
  ] = await Promise.all([
    supabaseAdmin
      .from("students")
      .select("*", { count: "exact", head: true })
      .not("extension_uninstalled_at", "is", null),
    supabaseAdmin
      .from("students")
      .select("*", { count: "exact", head: true })
      .gte("extension_uninstalled_at", since7),
    supabaseAdmin
      .from("students")
      .select("*", { count: "exact", head: true })
      .gte("extension_uninstalled_at", since30),
    supabaseAdmin
      .from("students")
      .select(
        "id, lectio_first_name, lectio_last_name, school_id, class_name, extension_uninstalled_at, extension_uninstall_reason, extension_uninstall_feedback, schools(name, display_name)",
      )
      .not("extension_uninstalled_at", "is", null)
      .order("extension_uninstalled_at", { ascending: false })
      .limit(100),
  ]);

  const reasons: Record<string, number> = {};
  const distinctSchools = new Set<number>();
  for (const r of rows ?? []) {
    distinctSchools.add(r.school_id);
    const raw = r.extension_uninstall_reason;
    if (!raw) continue;
    // Reason can be a single string or comma-separated chips
    for (const chip of String(raw)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      reasons[chip] = (reasons[chip] ?? 0) + 1;
    }
  }

  const reasonChips = Object.entries(reasons)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return {
    total: total ?? 0,
    last7: last7 ?? 0,
    last30: last30 ?? 0,
    distinctSchools: distinctSchools.size,
    reasonChips,
    recent: rows ?? [],
  };
}

// ── Mobile app funnel ───────────────────────────────────────────────

export async function getMobileFunnel() {
  const { data: students } = await supabaseAdmin
    .from("students")
    .select(
      "school_id, app_eligible, app_qr_scanned_at, app_installed_at, dismissed_app_prompt_at, marked_android_at, schools(name, display_name)",
    );

  const list = students ?? [];

  const totals = {
    total: list.length,
    eligible: 0,
    scanned: 0,
    installed: 0,
    markedAndroid: 0,
    dismissed: 0,
  };

  type SchoolRow = {
    schoolId: number;
    name: string;
    eligible: number;
    scanned: number;
    installed: number;
    markedAndroid: number;
  };
  const bySchool: Record<number, SchoolRow> = {};

  for (const s of list) {
    const school = s.schools as
      | { name: string; display_name: string | null }
      | null;
    const row = (bySchool[s.school_id] ??= {
      schoolId: s.school_id,
      name: school?.display_name ?? school?.name ?? `school ${s.school_id}`,
      eligible: 0,
      scanned: 0,
      installed: 0,
      markedAndroid: 0,
    });
    if (s.app_eligible) {
      totals.eligible++;
      row.eligible++;
    }
    if (s.app_qr_scanned_at) {
      totals.scanned++;
      row.scanned++;
    }
    if (s.app_installed_at) {
      totals.installed++;
      row.installed++;
    }
    if (s.marked_android_at) {
      totals.markedAndroid++;
      row.markedAndroid++;
    }
    if (s.dismissed_app_prompt_at) totals.dismissed++;
  }

  const schools = Object.values(bySchool)
    .filter((r) => r.eligible > 0)
    .sort((a, b) => b.eligible - a.eligible);

  return { totals, schools };
}

// ── Homework engagement ─────────────────────────────────────────────

export async function getHomeworkOverview() {
  const since30 = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const since7 = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [
    { count: totalRows },
    { count: doneRows },
    { data: recentToggles },
    { data: recentDistinct },
  ] = await Promise.all([
    supabaseAdmin
      .from("student_homework")
      .select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("student_homework")
      .select("*", { count: "exact", head: true })
      .eq("is_done", true),
    supabaseAdmin
      .from("student_homework")
      .select("student_id, is_done, done_updated_at")
      .gte("done_updated_at", since30)
      .order("done_updated_at", { ascending: false })
      .limit(5000),
    supabaseAdmin
      .from("student_homework")
      .select("student_id")
      .gte("done_updated_at", since7),
  ]);

  // Per-day toggle volume (last 30 days)
  const dailyCounts: Record<string, number> = {};
  for (const r of recentToggles ?? []) {
    const day = r.done_updated_at.slice(0, 10);
    dailyCounts[day] = (dailyCounts[day] ?? 0) + 1;
  }
  const chart: { date: string; count: number }[] = [];
  const start = new Date(since30);
  const end = new Date();
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    chart.push({ date: key, count: dailyCounts[key] ?? 0 });
  }

  const distinctActive7 = new Set(
    (recentDistinct ?? []).map((r) => r.student_id),
  ).size;

  // Per-school completion rate. Done via cross-join with students for school_id.
  const studentIds = Array.from(
    new Set((recentToggles ?? []).map((r) => r.student_id)),
  );
  let bySchool: { schoolId: number; name: string; toggles: number; doneShare: number }[] =
    [];

  if (studentIds.length > 0) {
    const { data: rosters } = await supabaseAdmin
      .from("students")
      .select("id, school_id, schools(name, display_name)")
      .in("id", studentIds);

    const studentSchool = new Map<string, { id: number; name: string }>();
    for (const r of rosters ?? []) {
      const school = r.schools as
        | { name: string; display_name: string | null }
        | null;
      studentSchool.set(r.id, {
        id: r.school_id,
        name: school?.display_name ?? school?.name ?? `school ${r.school_id}`,
      });
    }

    type SchoolAgg = {
      schoolId: number;
      name: string;
      toggles: number;
      done: number;
    };
    const agg: Record<number, SchoolAgg> = {};
    for (const r of recentToggles ?? []) {
      const meta = studentSchool.get(r.student_id);
      if (!meta) continue;
      const entry = (agg[meta.id] ??= {
        schoolId: meta.id,
        name: meta.name,
        toggles: 0,
        done: 0,
      });
      entry.toggles++;
      if (r.is_done) entry.done++;
    }

    bySchool = Object.values(agg)
      .map((r) => ({
        schoolId: r.schoolId,
        name: r.name,
        toggles: r.toggles,
        doneShare: r.toggles > 0 ? r.done / r.toggles : 0,
      }))
      .sort((a, b) => b.toggles - a.toggles)
      .slice(0, 25);
  }

  // Top 10 active classes
  const { data: classRosters } = await supabaseAdmin
    .from("students")
    .select("id, class_name, school_id");
  const studentToClass = new Map<
    string,
    { class: string; school: number }
  >();
  for (const r of classRosters ?? []) {
    if (!r.class_name) continue;
    studentToClass.set(r.id, { class: r.class_name, school: r.school_id });
  }
  const classCounts: Record<string, number> = {};
  for (const r of recentToggles ?? []) {
    const meta = studentToClass.get(r.student_id);
    if (!meta) continue;
    const key = `${meta.school}:${meta.class}`;
    classCounts[key] = (classCounts[key] ?? 0) + 1;
  }
  const topClasses = Object.entries(classCounts)
    .map(([key, count]) => {
      const [schoolId, className] = key.split(":");
      return {
        key,
        schoolId: Number(schoolId),
        className,
        count,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalRows: totalRows ?? 0,
    doneRows: doneRows ?? 0,
    distinctActive7,
    chart,
    bySchool,
    topClasses,
  };
}

// ── Lesson mapping admin ────────────────────────────────────────────

export async function getMappingsForSchool(schoolId: number) {
  const [{ data: mappings }, { data: overrides }] = await Promise.all([
    supabaseAdmin
      .from("school_lesson_mappings")
      .select("*")
      .eq("school_id", schoolId)
      .is("deleted_at", null)
      .order("canonical_key", { ascending: true }),
    supabaseAdmin
      .from("user_lesson_overrides")
      .select("mapping_id, student_id")
      .is("deleted_at", null),
  ]);

  const overrideCounts: Record<string, { total: number; students: Set<string> }> =
    {};
  for (const o of overrides ?? []) {
    const entry = (overrideCounts[o.mapping_id] ??= {
      total: 0,
      students: new Set(),
    });
    entry.total++;
    entry.students.add(o.student_id);
  }

  return (mappings ?? []).map((m) => ({
    ...m,
    overrideCount: overrideCounts[m.id]?.total ?? 0,
    studentCount: overrideCounts[m.id]?.students.size ?? 0,
  }));
}

// ── Synced settings ─────────────────────────────────────────────────

export async function getStudentSyncedSettings(supabaseId: string | null) {
  if (!supabaseId) return { settings: null, themes: [] };

  const [settingsRes, themesRes] = await Promise.all([
    supabaseAdmin
      .from("user_settings")
      .select("*")
      .eq("supabase_id", supabaseId)
      .maybeSingle(),
    supabaseAdmin
      .from("user_school_themes")
      .select("*")
      .eq("supabase_id", supabaseId)
      .order("updated_at", { ascending: false }),
  ]);

  return {
    settings: settingsRes.data ?? null,
    themes: themesRes.data ?? [],
  };
}

type LeafCounter = Record<string, Record<string, number>>;

function flattenSettings(
  settings: unknown,
  prefix: string,
  counter: LeafCounter,
) {
  if (settings == null) return;
  if (typeof settings !== "object" || Array.isArray(settings)) {
    // Treat as a leaf
    const key = prefix || "(root)";
    const valueKey =
      typeof settings === "string" ||
      typeof settings === "number" ||
      typeof settings === "boolean"
        ? String(settings)
        : JSON.stringify(settings);
    (counter[key] ??= {})[valueKey] = (counter[key]?.[valueKey] ?? 0) + 1;
    return;
  }
  for (const [k, v] of Object.entries(settings as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${k}` : k;
    flattenSettings(v, next, counter);
  }
}

export async function getSettingsOverview() {
  const [
    { count: totalSettings },
    { count: totalThemes },
    { data: rows },
    { data: themes },
    { data: recent },
  ] = await Promise.all([
    supabaseAdmin
      .from("user_settings")
      .select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("user_school_themes")
      .select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("user_settings")
      .select("settings, schema_version, updated_at, supabase_id")
      .limit(2000),
    supabaseAdmin
      .from("user_school_themes")
      .select("theme_id, school_id, updated_at, supabase_id")
      .limit(2000),
    supabaseAdmin
      .from("user_settings")
      .select("supabase_id, updated_at, schema_version")
      .order("updated_at", { ascending: false })
      .limit(20),
  ]);

  const counter: LeafCounter = {};
  const versions: Record<string, number> = {};
  for (const r of rows ?? []) {
    flattenSettings(r.settings, "", counter);
    const v = String(r.schema_version);
    versions[v] = (versions[v] ?? 0) + 1;
  }

  // Theme distribution
  const themeUsage: Record<string, number> = {};
  const distinctThemeUsers = new Set<string>();
  for (const t of themes ?? []) {
    themeUsage[t.theme_id] = (themeUsage[t.theme_id] ?? 0) + 1;
    distinctThemeUsers.add(t.supabase_id);
  }

  // Pull display names for the 'recent' list
  const recentIds = (recent ?? []).map((r) => r.supabase_id);
  const studentByUid = new Map<
    string,
    {
      id: string;
      name: string;
      schoolId: number;
      schoolName: string;
    }
  >();
  if (recentIds.length > 0) {
    const { data: students } = await supabaseAdmin
      .from("students")
      .select("id, supabase_id, lectio_first_name, lectio_last_name, school_id, schools(name, display_name)")
      .in("supabase_id", recentIds);
    for (const s of students ?? []) {
      const school = s.schools as
        | { name: string; display_name: string | null }
        | null;
      studentByUid.set(s.supabase_id, {
        id: s.id,
        name:
          [s.lectio_first_name, s.lectio_last_name]
            .filter(Boolean)
            .join(" ") || "Unknown",
        schoolId: s.school_id,
        schoolName:
          school?.display_name ?? school?.name ?? `school ${s.school_id}`,
      });
    }
  }

  const recentWithStudent = (recent ?? []).map((r) => ({
    ...r,
    student: studentByUid.get(r.supabase_id) ?? null,
  }));

  // Sorted leaf-key distributions (only show keys that aren't the version number)
  const keyDistributions = Object.entries(counter)
    .filter(([k]) => k !== "version")
    .map(([key, values]) => {
      const total = Object.values(values).reduce((a, b) => a + b, 0);
      const sorted = Object.entries(values)
        .map(([value, count]) => ({ value, count, share: count / total }))
        .sort((a, b) => b.count - a.count);
      return { key, total, values: sorted };
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  return {
    totalSettings: totalSettings ?? 0,
    totalThemes: totalThemes ?? 0,
    distinctThemeUsers: distinctThemeUsers.size,
    sampledRows: rows?.length ?? 0,
    versions,
    themeUsage: Object.entries(themeUsage)
      .map(([theme_id, count]) => ({ theme_id, count }))
      .sort((a, b) => b.count - a.count),
    keyDistributions,
    recent: recentWithStudent,
  };
}

export async function getOverrideOrphanCount(mappingId: string) {
  const { count } = await supabaseAdmin
    .from("user_lesson_overrides")
    .select("*", { count: "exact", head: true })
    .eq("mapping_id", mappingId)
    .is("deleted_at", null);
  return count ?? 0;
}

// ── Referrals ───────────────────────────────────────────────────────
//
// `referral_clicks` is defined in `20260430_add_referral_tracking.sql`.

const referralClicks = () => supabaseAdmin.from("referral_clicks");

function fillDailySeries(
  rows: { day: string; count: number }[],
  days: number,
): { date: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.day] = r.count;
  const result: { date: string; count: number }[] = [];
  const since = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
  for (
    let d = new Date(since.toISOString().slice(0, 10));
    d <= new Date();
    d.setDate(d.getDate() + 1)
  ) {
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, count: counts[key] ?? 0 });
  }
  return result;
}

export async function getReferralOverview() {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const since30 = new Date(now - 30 * day).toISOString();
  const since7 = new Date(now - 7 * day).toISOString();

  const [
    { count: totalClicks },
    { count: clicksLast7 },
    { count: clicksLast30 },
    { count: totalConversions },
    { count: conversionsLast7 },
    { count: conversionsLast30 },
  ] = await Promise.all([
    referralClicks().select("*", { count: "exact", head: true }),
    referralClicks()
      .select("*", { count: "exact", head: true })
      .gte("created_at", since7),
    referralClicks()
      .select("*", { count: "exact", head: true })
      .gte("created_at", since30),
    referralClicks()
      .select("*", { count: "exact", head: true })
      .not("converted_at", "is", null),
    referralClicks()
      .select("*", { count: "exact", head: true })
      .gte("converted_at", since7),
    referralClicks()
      .select("*", { count: "exact", head: true })
      .gte("converted_at", since30),
  ]);

  const clicks = (totalClicks as number) ?? 0;
  const conversions = (totalConversions as number) ?? 0;

  // Median click → conversion lag
  const { data: convertedRows } = await referralClicks()
    .select("created_at, converted_at")
    .not("converted_at", "is", null)
    .gte("converted_at", since30);

  const lagsHrs: number[] = [];
  for (const r of convertedRows ?? []) {
    if (!r.converted_at) continue;
    const lag = (new Date(r.converted_at).getTime() - new Date(r.created_at).getTime()) / 3600000;
    if (Number.isFinite(lag) && lag >= 0) lagsHrs.push(lag);
  }
  lagsHrs.sort((a, b) => a - b);
  const medianLagHours = lagsHrs.length
    ? Math.round(lagsHrs[Math.floor(lagsHrs.length / 2)] * 10) / 10
    : 0;

  return {
    totalClicks: clicks,
    clicksLast7: (clicksLast7 as number) ?? 0,
    clicksLast30: (clicksLast30 as number) ?? 0,
    totalConversions: conversions,
    conversionsLast7: (conversionsLast7 as number) ?? 0,
    conversionsLast30: (conversionsLast30 as number) ?? 0,
    conversionRate: clicks > 0 ? conversions / clicks : 0,
    medianLagHours,
  };
}

export async function getReferralTimeSeries(days = 30) {
  const since = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [{ data: clicks }, { data: conversions }] = await Promise.all([
    referralClicks()
      .select("created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: true }),
    referralClicks()
      .select("converted_at")
      .not("converted_at", "is", null)
      .gte("converted_at", since)
      .order("converted_at", { ascending: true }),
  ]);

  const clickCounts: Record<string, number> = {};
  for (const r of clicks ?? []) {
    const day = r.created_at.slice(0, 10);
    clickCounts[day] = (clickCounts[day] ?? 0) + 1;
  }

  const conversionCounts: Record<string, number> = {};
  for (const r of conversions ?? []) {
    if (!r.converted_at) continue;
    const day = r.converted_at.slice(0, 10);
    conversionCounts[day] = (conversionCounts[day] ?? 0) + 1;
  }

  return fillDailySeries(
    Object.entries(clickCounts).map(([day, count]) => ({ day, count })),
    days,
  ).map((row) => ({
    ...row,
    conversions: conversionCounts[row.date] ?? 0,
  }));
}

export async function getTopReferrers(limit = 20) {
  // Aggregate clicks
  const { data: clickRows } = await referralClicks().select(
    "referrer_student_id, converted_at",
  );

  const clicks: Record<string, number> = {};
  const conversions: Record<string, number> = {};
  for (const r of clickRows ?? []) {
    clicks[r.referrer_student_id] = (clicks[r.referrer_student_id] ?? 0) + 1;
    if (r.converted_at) {
      conversions[r.referrer_student_id] =
        (conversions[r.referrer_student_id] ?? 0) + 1;
    }
  }

  const topIds = Object.entries(conversions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  if (topIds.length === 0) return [];

  const { data: students } = await supabaseAdmin
    .from("students")
    .select("id, lectio_first_name, lectio_last_name, school_id, class_name, schools(name, display_name)")
    .in("id", topIds);

  return topIds.map((id) => {
    const s = students?.find((row) => row.id === id);
    const school = s?.schools as
      | { name: string; display_name: string | null }
      | null
      | undefined;
    const click = clicks[id] ?? 0;
    const conv = conversions[id] ?? 0;
    return {
      id,
      name:
        [s?.lectio_first_name, s?.lectio_last_name]
          .filter(Boolean)
          .join(" ") || "Unknown",
      schoolId: s?.school_id ?? null,
      schoolName: school?.display_name ?? school?.name ?? null,
      className: s?.class_name ?? null,
      clicks: click,
      conversions: conv,
      conversionRate: click > 0 ? conv / click : 0,
    };
  });
}

export async function getRecentAttributions(limit = 50) {
  const { data: rows } = await referralClicks()
    .select("*")
    .not("converted_at", "is", null)
    .order("converted_at", { ascending: false })
    .limit(limit);

  if (!rows || rows.length === 0) return [];

  const ids = new Set<string>();
  for (const r of rows) {
    ids.add(r.referrer_student_id);
    if (r.converted_student_id) ids.add(r.converted_student_id);
  }

  const { data: students } = await supabaseAdmin
    .from("students")
    .select("id, lectio_first_name, lectio_last_name, school_id, class_name, schools(name, display_name)")
    .in("id", Array.from(ids));

  const byId = new Map(students?.map((s) => [s.id, s]) ?? []);
  const fullName = (id: string | null) => {
    if (!id) return null;
    const s = byId.get(id);
    if (!s) return null;
    return (
      [s.lectio_first_name, s.lectio_last_name].filter(Boolean).join(" ") ||
      "Unknown"
    );
  };
  const schoolFor = (id: string | null) => {
    if (!id) return null;
    const s = byId.get(id);
    const school = s?.schools as
      | { name: string; display_name: string | null }
      | null
      | undefined;
    return school?.display_name ?? school?.name ?? null;
  };

  return rows.map((r) => {
    const lagSeconds = r.converted_at
      ? Math.round(
          (new Date(r.converted_at).getTime() - new Date(r.created_at).getTime()) /
            1000,
        )
      : null;
    let referer_host: string | null = null;
    try {
      if (r.referer) referer_host = new URL(r.referer).host;
    } catch {
      /* noop */
    }
    return {
      id: r.id,
      created_at: r.created_at,
      converted_at: r.converted_at,
      country: r.country,
      referer_host,
      lag_seconds: lagSeconds,
      referrer: {
        id: r.referrer_student_id,
        name: fullName(r.referrer_student_id),
        school: schoolFor(r.referrer_student_id),
      },
      invitee: {
        id: r.converted_student_id,
        name: fullName(r.converted_student_id),
        school: schoolFor(r.converted_student_id),
      },
    };
  });
}

export async function getReferralRejectionBreakdown() {
  const { data: rows } = await referralClicks()
    .select("rejection_reason")
    .not("rejection_reason", "is", null);
  const counts: Record<string, number> = {};
  for (const r of rows ?? []) {
    if (!r.rejection_reason) continue;
    counts[r.rejection_reason] = (counts[r.rejection_reason] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

export type ReferralBreakdown = {
  schools: { schoolId: number; name: string; count: number }[];
  classes: { className: string; count: number }[];
  years: { year: string; count: number }[];
  total: number;
};

function aggregateBreakdown(
  students: {
    id: string;
    class_name: string | null;
    school_id: number;
    schools:
      | { name: string; display_name: string | null }
      | { name: string; display_name: string | null }[]
      | null;
  }[],
  weights: Record<string, number>,
  limit: number,
): ReferralBreakdown {
  const schoolCounts: Record<
    string,
    { schoolId: number; name: string; count: number }
  > = {};
  const classCounts: Record<string, number> = {};
  const yearCounts: Record<string, number> = {};
  let total = 0;

  for (const s of students) {
    const w = weights[s.id] ?? 0;
    if (w === 0) continue;
    total += w;

    const schoolRel = Array.isArray(s.schools) ? s.schools[0] : s.schools;
    const schoolName =
      schoolRel?.display_name ?? schoolRel?.name ?? "Unknown school";
    const schoolKey = `${s.school_id}`;
    const existing = schoolCounts[schoolKey];
    if (existing) existing.count += w;
    else
      schoolCounts[schoolKey] = {
        schoolId: s.school_id,
        name: schoolName,
        count: w,
      };

    if (s.class_name) {
      classCounts[s.class_name] = (classCounts[s.class_name] ?? 0) + w;
      const grade = getSchoolYearFromClassName(s.class_name);
      if (grade !== null) {
        const key = `${grade}.g`;
        yearCounts[key] = (yearCounts[key] ?? 0) + w;
      }
    }
  }

  const schools = Object.values(schoolCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  const classes = Object.entries(classCounts)
    .map(([className, count]) => ({ className, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  const years = Object.entries(yearCounts)
    .map(([year, count]) => ({ year, count }))
    .sort(
      (a, b) => parseInt(a.year, 10) - parseInt(b.year, 10),
    );

  return { schools, classes, years, total };
}

export async function getReferralBreakdowns(
  limit = 10,
): Promise<{ referrers: ReferralBreakdown; invitees: ReferralBreakdown }> {
  // referrers: weight by # of conversions they generated
  // invitees: each converted student counts once
  const { data: rows } = await referralClicks()
    .select("referrer_student_id, converted_student_id")
    .not("converted_student_id", "is", null);

  const referrerWeights: Record<string, number> = {};
  const inviteeWeights: Record<string, number> = {};
  for (const r of rows ?? []) {
    if (!r.converted_student_id) continue;
    referrerWeights[r.referrer_student_id] =
      (referrerWeights[r.referrer_student_id] ?? 0) + 1;
    inviteeWeights[r.converted_student_id] =
      (inviteeWeights[r.converted_student_id] ?? 0) + 1;
  }

  const ids = Array.from(
    new Set([...Object.keys(referrerWeights), ...Object.keys(inviteeWeights)]),
  );

  if (ids.length === 0) {
    const empty: ReferralBreakdown = {
      schools: [],
      classes: [],
      years: [],
      total: 0,
    };
    return { referrers: empty, invitees: empty };
  }

  const { data: students } = await supabaseAdmin
    .from("students")
    .select("id, class_name, school_id, schools(name, display_name)")
    .in("id", ids);

  return {
    referrers: aggregateBreakdown(students ?? [], referrerWeights, limit),
    invitees: aggregateBreakdown(students ?? [], inviteeWeights, limit),
  };
}

