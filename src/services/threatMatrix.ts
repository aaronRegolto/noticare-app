import type { CommunityRange } from '@/backend/supabase/types/database.types';
import { getCommunityStats, summarizeCommunity } from '@/src/services/community';

export type ThreatMatrixSummary = {
  safe: number;
  suspicious: number;
  dangerous: number;
  blocked: number;
  source: 'network' | 'cache';
};

/** Aggregate community-only data; no individual messages or people are queried. */
export async function fetchThreatMatrix(range: CommunityRange = 'today'): Promise<ThreatMatrixSummary> {
  const stats = await getCommunityStats(range);
  return { ...summarizeCommunity(stats.points), source: stats.source };
}
