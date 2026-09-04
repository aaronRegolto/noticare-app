import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CommunityRange, Database } from '@/backend/supabase/types/database.types';
import { isSupabaseConfigured, supabase } from '@/src/services/supabase';

const CACHE_PREFIX = 'noticare.community-stats.v1.';

export type CommunityPoint = Database['public']['Functions']['get_community_stats']['Returns'][number];

export type CommunityStats = {
  points: CommunityPoint[];
  source: 'network' | 'cache';
  updatedAt: number | null;
};

function cacheKey(range: CommunityRange) {
  return `${CACHE_PREFIX}${range}`;
}

function isCommunityPoint(value: unknown): value is CommunityPoint {
  if (!value || typeof value !== 'object') return false;
  const point = value as Record<string, unknown>;
  return (
    typeof point.date === 'string' &&
    typeof point.safe_count === 'number' &&
    typeof point.suspicious_count === 'number' &&
    typeof point.dangerous_count === 'number' &&
    typeof point.blocked_count === 'number'
  );
}

async function readCache(range: CommunityRange): Promise<CommunityStats | null> {
  const raw = await AsyncStorage.getItem(cacheKey(range));
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const record = value as { updatedAt?: unknown; points?: unknown };
    if (!Array.isArray(record.points) || !record.points.every(isCommunityPoint)) return null;
    return {
      points: record.points,
      source: 'cache',
      updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : null,
    };
  } catch {
    return null;
  }
}

/** Fetches aggregate-only data. Individual SMS, sender, device, and URL data are never requested. */
export async function getCommunityStats(range: CommunityRange): Promise<CommunityStats> {
  const cached = await readCache(range);
  if (!isSupabaseConfigured) {
    if (cached) return cached;
    throw new Error('Community statistics are unavailable until Supabase is configured.');
  }

  const { data, error } = await supabase.rpc('get_community_stats', { p_range: range });
  if (error) {
    if (cached) return cached;
    throw error;
  }

  const points = (data ?? []).filter(isCommunityPoint);
  const updatedAt = Date.now();
  const result: CommunityStats = { points, source: 'network', updatedAt };
  await AsyncStorage.setItem(cacheKey(range), JSON.stringify({ points, updatedAt }));
  return result;
}

export function summarizeCommunity(points: CommunityPoint[]) {
  return points.reduce(
    (summary, point) => ({
      safe: summary.safe + point.safe_count,
      suspicious: summary.suspicious + point.suspicious_count,
      dangerous: summary.dangerous + point.dangerous_count,
      blocked: summary.blocked + point.blocked_count,
    }),
    { safe: 0, suspicious: 0, dangerous: 0, blocked: 0 },
  );
}
