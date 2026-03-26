import {
  applySupabaseLessonMappings,
  getAllLessonMappingSnapshots,
  getLessonMappingSnapshot,
} from '@/lib/hold-mapping';
import { captureException, getDistinctId } from '@/lib/posthog';
import { getLoggedInUserId } from '@/lib/profile-cache';
import { isAuthenticated } from '@/lib/supabase/client';
import {
  getStudentLessonMappingsV2,
  resetUserLessonOverrideV2,
  upsertUserLessonOverrideV2,
} from '@/lib/supabase/resources';

function getCurrentSchoolId(): string | null {
  const match = window.location.pathname.match(/\/lectio\/(\d+)\//);
  return match?.[1] ?? null;
}

let hydratePromise: Promise<boolean> | null = null;
let seedPromise: Promise<void> | null = null;

async function getSyncContext() {
  const schoolId = getCurrentSchoolId();
  const studentId = getLoggedInUserId();

  if (!schoolId || !studentId) return null;
  let authenticated = await isAuthenticated();
  if (!authenticated) {
    try {
      const { ensureSupabaseSession } = await import('@/lib/supabase/session');
      await ensureSupabaseSession(schoolId, 'hold-mapping-sync');
      authenticated = await isAuthenticated();
    } catch {
      authenticated = false;
    }
  }
  if (!authenticated) return null;

  return { schoolId, studentId };
}

export async function hydrateHoldMappingsFromSupabase(force = false): Promise<boolean> {
  if (!force && hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    const context = await getSyncContext();
    if (!context) return false;

    try {
      const rows = await getStudentLessonMappingsV2(context.schoolId, context.studentId);
      return applySupabaseLessonMappings(rows);
    } catch (error) {
      captureException(error, getDistinctId(context.studentId), {
        source: 'hold-mapping-sync',
        action: 'hydrate',
        school_id: context.schoolId,
      });
      throw error;
    }
  })();

  try {
    return await hydratePromise;
  } finally {
    hydratePromise = null;
  }
}

export async function syncHoldMappingOverrideToSupabase(
  canonicalKey: string,
  lastModifiedBy = 'extension',
): Promise<void> {
  const context = await getSyncContext();
  if (!context) return;

  const mapping = getLessonMappingSnapshot(canonicalKey);
  if (!mapping) return;

  try {
    const hasOverride = !mapping.autoGuessed || mapping.colorHue !== null || mapping.icon !== null;
    if (!hasOverride) {
      await resetUserLessonOverrideV2(context.schoolId, context.studentId, canonicalKey, lastModifiedBy);
      return;
    }

    await upsertUserLessonOverrideV2(context.schoolId, context.studentId, {
      canonicalKey: mapping.canonicalKey,
      defaultName: mapping.defaultName,
      defaultColorHue: mapping.defaultColorHue,
      displayName: mapping.autoGuessed ? null : mapping.displayName,
      colorHue: mapping.colorHue,
      icon: mapping.icon,
      lastModifiedBy,
      clientUpdatedAt: new Date().toISOString(),
    });
  } catch (error) {
    captureException(error, getDistinctId(context.studentId), {
      source: 'hold-mapping-sync',
      action: 'sync-override',
      canonical_key: canonicalKey,
      school_id: context.schoolId,
    });
    throw error;
  }
}

export async function seedKnownHoldMappingsToSupabase(): Promise<void> {
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    const context = await getSyncContext();
    if (!context) return;

    const snapshots = getAllLessonMappingSnapshots();
    for (const mapping of snapshots) {
      await upsertUserLessonOverrideV2(context.schoolId, context.studentId, {
        canonicalKey: mapping.canonicalKey,
        defaultName: mapping.defaultName,
        defaultColorHue: mapping.defaultColorHue,
        displayName: mapping.autoGuessed ? null : mapping.displayName,
        colorHue: mapping.colorHue,
        icon: mapping.icon,
        lastModifiedBy: 'extension',
        clientUpdatedAt: new Date().toISOString(),
      }, { invalidate: false });
    }
  })().catch((error) => {
    const studentId = getLoggedInUserId();
    if (studentId) {
      captureException(error, getDistinctId(studentId), {
        source: 'hold-mapping-sync',
        action: 'seed-known-mappings',
      });
    }
    throw error;
  });

  try {
    await seedPromise;
  } finally {
    seedPromise = null;
  }
}
