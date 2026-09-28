import type { CommunityRange } from '@/backend/supabase/types/database.types';

export type BlockedBucket = { start: number; blocked: number };

type BlockedPoint = { date: string; blocked_count: number };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const monthStart = (time: number) => {
  const date = new Date(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
};

/**
 * get_community_stats only returns buckets that have activity, so a quiet range comes back with
 * one or two points. This expands them to the full UTC timeline the range covers (24 hours of
 * today, 7 or 30 days, or 6 months) so the chart's x-axis is stable and gaps read as zero.
 */
export function blockedSeries(points: BlockedPoint[], range: CommunityRange, now = new Date()): BlockedBucket[] {
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let starts: number[];
  let bucketOf: (time: number) => number;
  if (range === 'today') {
    starts = Array.from({ length: 24 }, (_, index) => dayStart + index * HOUR);
    bucketOf = (time) => Math.floor(time / HOUR) * HOUR;
  } else if (range === 'last_6_months') {
    starts = Array.from({ length: 6 }, (_, index) => Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1));
    bucketOf = monthStart;
  } else {
    const days = range === 'last_7_days' ? 7 : 30;
    starts = Array.from({ length: days }, (_, index) => dayStart - (days - 1 - index) * DAY);
    bucketOf = (time) => Math.floor(time / DAY) * DAY;
  }
  const totals = new Map<number, number>();
  for (const point of points) {
    const time = Date.parse(point.date);
    if (!Number.isFinite(time)) continue;
    const bucket = bucketOf(time);
    totals.set(bucket, (totals.get(bucket) ?? 0) + point.blocked_count);
  }
  return starts.map((start) => ({ start, blocked: totals.get(start) ?? 0 }));
}

/** Y-axis ticks at clean steps (1, 2, or 5 × 10^n), about four intervals, never below 0–4. */
export function axisTicks(max: number): number[] {
  const top = Math.max(max, 4);
  const rough = top / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= rough) ?? rough;
  const ticks: number[] = [];
  for (let value = 0; value < top + step; value += step) {
    ticks.push(value);
    if (value >= top) break;
  }
  return ticks;
}
