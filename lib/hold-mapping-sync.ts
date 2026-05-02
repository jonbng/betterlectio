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

// `upsert_user_lesson_override_v2` / `reset_user_lesson_override_v2` raise
// `'Unauthorized'` when the current Supabase session doesn't own the
// targeted student. `sendRpc` already force-reauths and retries once on
// these; anything that escapes up to here means recovery also failed
// (typically the user is logged out of Lectio). Not an actionable bug —
// don't spam PostHog with it.
function isAuthOwnershipError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';
  return /\bunauthorized\b/i.test(message);
}

let hydratePromise: Promise<boolean> | null = null;
let seedPromise: Promise<void> | null = null;

const HYDRATED_AT_KEY = 'bl-hold-mappings-hydrated-at';
const SEEDED_AT_KEY = 'bl-hold-mappings-seeded-at';
// Skip the bootstrap GET if hydrated recently. Override mutations write
// through immediately and bypass this gate.
const HYDRATE_TTL_MS = 30 * 60_000;
// Seed is a one-time backfill of all locally-known mappings to Supabase.
// User edits go through `syncHoldMappingOverrideToSupabase` directly, so
// re-seeding adds no value and just floods writes. 7-day TTL covers the
// case where local snapshots gain new entries during normal use.
const SEED_TTL_MS = 7 * 24 * 60 * 60_000;

function hydrateKey(schoolId: string, studentId: string): string {
  return `${HYDRATED_AT_KEY}:${schoolId}:${studentId}`;
}

function seedKey(schoolId: string, studentId: string): string {
  return `${SEEDED_AT_KEY}:${schoolId}:${studentId}`;
}

function isHydrateFresh(schoolId: string, studentId: string): boolean {
  try {
    const raw = localStorage.getItem(hydrateKey(schoolId, studentId));
    if (!raw) return false;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return false;
    return Date.now() - parsed < HYDRATE_TTL_MS;
  } catch {
    return false;
  }
}

function isSeedFresh(schoolId: string, studentId: string): boolean {
  try {
    const raw = localStorage.getItem(seedKey(schoolId, studentId));
    if (!raw) return false;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return false;
    return Date.now() - parsed < SEED_TTL_MS;
  } catch {
    return false;
  }
}

function stampHydrate(schoolId: string, studentId: string): void {
  try {
    localStorage.setItem(hydrateKey(schoolId, studentId), String(Date.now()));
  } catch {
    // Ignore storage errors.
  }
}

function stampSeed(schoolId: string, studentId: string): void {
  try {
    localStorage.setItem(seedKey(schoolId, studentId), String(Date.now()));
  } catch {
    // Ignore storage errors.
  }
}

async function getSyncContext() {
  const schoolId = getCurrentSchoolId();
  const studentId = getLoggedInUserId();

  if (!schoolId || !studentId) return null;

  // Always run ensureSupabaseSession with the expected studentId so the
  // background can validate that any existing session is actually owned
  // by this Lectio user. Otherwise a stale session left over from a
  // different account would slip past `isAuthenticated()` here and cause
  // `upsert_user_lesson_override_v2` to raise "Unauthorized" server-side.
  try {
    const { ensureSupabaseSession } = await import('@/lib/supabase/session');
    await ensureSupabaseSession(schoolId, 'hold-mapping-sync', studentId);
  } catch {
    // ensureSupabaseSession is fire-and-forget; ignore failures and fall
    // through to the isAuthenticated gate below.
  }

  const authenticated = await isAuthenticated();
  if (!authenticated) return null;

  return { schoolId, studentId };
}

export async function hydrateHoldMappingsFromSupabase(force = false): Promise<boolean> {
  if (!force && hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    const context = await getSyncContext();
    if (!context) return false;

    if (!force && isHydrateFresh(context.schoolId, context.studentId)) {
      return false;
    }

    try {
      const rows = await getStudentLessonMappingsV2(context.schoolId, context.studentId);
      stampHydrate(context.schoolId, context.studentId);
      return applySupabaseLessonMappings(rows);
    } catch (error) {
      if (!isAuthOwnershipError(error)) {
        captureException(error, getDistinctId(context.studentId), {
          source: 'hold-mapping-sync',
          action: 'hydrate',
          school_id: context.schoolId,
        });
      }
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
      stampHydrate(context.schoolId, context.studentId);
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
    stampHydrate(context.schoolId, context.studentId);
  } catch (error) {
    if (!isAuthOwnershipError(error)) {
      captureException(error, getDistinctId(context.studentId), {
        source: 'hold-mapping-sync',
        action: 'sync-override',
        canonical_key: canonicalKey,
        school_id: context.schoolId,
      });
    }
    throw error;
  }
}

export async function seedKnownHoldMappingsToSupabase(): Promise<void> {
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    const context = await getSyncContext();
    if (!context) return;

    // Skip if we seeded for this user recently. User edits go through
    // `syncHoldMappingOverrideToSupabase` so a re-seed adds no value.
    if (isSeedFresh(context.schoolId, context.studentId)) return;

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
    stampSeed(context.schoolId, context.studentId);
  })().catch((error) => {
    const studentId = getLoggedInUserId();
    if (studentId && !isAuthOwnershipError(error)) {
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
