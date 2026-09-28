// Dashboard trend: zero-filled UTC buckets from the community aggregate tables, which only ever
// count non-demo events (see aggregate_threat_event in the schema migration).

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const TREND_RANGES = {
  '24h': { granularity: 'hour', buckets: 24 },
  '7d': { granularity: 'day', buckets: 7 },
  '30d': { granularity: 'day', buckets: 30 },
  '90d': { granularity: 'day', buckets: 90 },
};

const LEVELS = ['safe', 'suspicious', 'dangerous'];

function emptyBucket(start) {
  return { start, safe: 0, suspicious: 0, dangerous: 0, blocked: 0 };
}

/**
 * The UTC bucket starts for the current period and the equally long period before it, oldest
 * first. The current period ends with the bucket containing `now`.
 */
export function trendWindow(range, now = new Date()) {
  const spec = TREND_RANGES[range];
  if (!spec) return null;
  const step = spec.granularity === 'hour' ? HOUR : DAY;
  const last = Math.floor(now.getTime() / step) * step;
  const firstPrevious = last - (spec.buckets * 2 - 1) * step;
  return { ...spec, step, firstPrevious, firstCurrent: last - (spec.buckets - 1) * step, last };
}

/** Shapes aggregate rows (daily or hourly) into the response the dashboard renders. */
export function buildTrend(range, rows, now = new Date()) {
  const window = trendWindow(range, now);
  const byStart = new Map();
  for (const row of rows) {
    const start = Date.parse(window.granularity === 'hour' ? row.bucket_start : `${row.bucket_date}T00:00:00Z`);
    if (!Number.isFinite(start)) continue;
    byStart.set(start, {
      safe: Number(row.safe_count) || 0,
      suspicious: Number(row.suspicious_count) || 0,
      dangerous: Number(row.dangerous_count) || 0,
      blocked: Number(row.successfully_blocked_count) || 0,
    });
  }
  const buckets = [];
  const previous = emptyBucket(null);
  delete previous.start;
  for (let start = window.firstPrevious; start <= window.last; start += window.step) {
    const counts = byStart.get(start);
    if (start < window.firstCurrent) {
      if (counts) for (const key of [...LEVELS, 'blocked']) previous[key] += counts[key];
      continue;
    }
    buckets.push({ ...emptyBucket(new Date(start).toISOString()), ...counts });
  }
  return { range, granularity: window.granularity, buckets, previous };
}

/** Reads the aggregate rows covering both periods; at most 180 rows, under PostgREST's cap. */
export async function loadTrend(db, range, now = new Date()) {
  const window = trendWindow(range, now);
  const hourly = window.granularity === 'hour';
  const column = hourly ? 'bucket_start' : 'bucket_date';
  const from = new Date(window.firstPrevious).toISOString();
  const { data, error } = await db
    .from(hourly ? 'community_hourly_stats' : 'community_daily_stats')
    .select(`${column},safe_count,suspicious_count,dangerous_count,successfully_blocked_count`)
    .gte(column, hourly ? from : from.slice(0, 10))
    .order(column);
  if (error) return { error };
  return { data: buildTrend(range, data, now) };
}
