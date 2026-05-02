// Read-only stats for a student's own referral link.
//
// Backed by the `get_referral_stats(p_student_id text)` security-definer RPC
// — the table itself is service-role only, so the extension never reads
// `referral_clicks` directly.

import { sendRpc } from '../client';

export interface ReferralStats {
  totalClicks: number;
  uniqueClickers: number;
  conversions: number;
  recentReferrals: Array<{
    studentId: string;
    name: string | null;
    attributedAt: string | null;
  }>;
}

interface RawStats {
  total_clicks: number | string;
  unique_clickers: number | string;
  conversions: number | string;
  recent_referrals: Array<{
    student_id: string;
    name: string | null;
    attributed_at: string | null;
  }> | null;
}

// Stats are aggregate counts that don't need to be fresh-to-the-minute.
// Cache in localStorage so re-mounting Settings → Inviter doesn't re-fire
// the RPC on every open.
const STATS_CACHE_TTL_MS = 60 * 60_000; // 1 hour
const STATS_CACHE_KEY_PREFIX = 'bl-referral-stats:';

interface CachedStats {
  fetchedAt: number;
  data: ReferralStats;
}

function readStatsCache(studentId: string): ReferralStats | null {
  try {
    const raw = localStorage.getItem(STATS_CACHE_KEY_PREFIX + studentId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedStats;
    if (!parsed?.fetchedAt || !parsed.data) return null;
    if (Date.now() - parsed.fetchedAt > STATS_CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeStatsCache(studentId: string, data: ReferralStats): void {
  try {
    const entry: CachedStats = { fetchedAt: Date.now(), data };
    localStorage.setItem(STATS_CACHE_KEY_PREFIX + studentId, JSON.stringify(entry));
  } catch {
    // Storage full or other error — non-critical
  }
}

export async function getReferralStats(studentId: string): Promise<ReferralStats | null> {
  if (!studentId) return null;

  const cached = readStatsCache(studentId);
  if (cached) return cached;

  const resp = await sendRpc('get_referral_stats', {
    p_student_id: studentId,
  });
  if (!resp.ok) return null;
  // The RPC returns a single-row table.
  const rows = (resp.data as RawStats[] | null) ?? [];
  const row = rows[0];
  const stats: ReferralStats = row
    ? {
        totalClicks: Number(row.total_clicks ?? 0),
        uniqueClickers: Number(row.unique_clickers ?? 0),
        conversions: Number(row.conversions ?? 0),
        recentReferrals: (row.recent_referrals ?? []).map((r) => ({
          studentId: r.student_id,
          name: r.name,
          attributedAt: r.attributed_at,
        })),
      }
    : { totalClicks: 0, uniqueClickers: 0, conversions: 0, recentReferrals: [] };

  writeStatsCache(studentId, stats);
  return stats;
}

export function buildReferralUrl(studentId: string): string {
  return `https://betterlectio.dk/r/${studentId}`;
}
