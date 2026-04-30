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

export async function getReferralStats(studentId: string): Promise<ReferralStats | null> {
  if (!studentId) return null;
  const resp = await sendRpc('get_referral_stats', {
    p_student_id: studentId,
  });
  if (!resp.ok) return null;
  // The RPC returns a single-row table.
  const rows = (resp.data as RawStats[] | null) ?? [];
  const row = rows[0];
  if (!row) {
    return { totalClicks: 0, uniqueClickers: 0, conversions: 0, recentReferrals: [] };
  }
  return {
    totalClicks: Number(row.total_clicks ?? 0),
    uniqueClickers: Number(row.unique_clickers ?? 0),
    conversions: Number(row.conversions ?? 0),
    recentReferrals: (row.recent_referrals ?? []).map((r) => ({
      studentId: r.student_id,
      name: r.name,
      attributedAt: r.attributed_at,
    })),
  };
}

export function buildReferralUrl(studentId: string): string {
  return `https://betterlectio.dk/r/${studentId}`;
}
