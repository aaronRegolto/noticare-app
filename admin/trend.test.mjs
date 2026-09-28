import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTrend, trendWindow } from './trend.mjs';

const now = new Date('2026-09-28T10:25:00Z');

test('daily trend zero-fills the current period and totals the previous one', () => {
  const trend = buildTrend(
    '7d',
    [
      {
        bucket_date: '2026-09-20',
        safe_count: 4,
        suspicious_count: 1,
        dangerous_count: 2,
        successfully_blocked_count: 1,
      },
      {
        bucket_date: '2026-09-22',
        safe_count: 3,
        suspicious_count: 0,
        dangerous_count: 1,
        successfully_blocked_count: 0,
      },
      {
        bucket_date: '2026-09-28',
        safe_count: 2,
        suspicious_count: 5,
        dangerous_count: 0,
        successfully_blocked_count: 0,
      },
    ],
    now,
  );
  assert.equal(trend.granularity, 'day');
  assert.deepEqual(
    trend.buckets.map((bucket) => bucket.start.slice(0, 10)),
    ['2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28'],
  );
  assert.equal(trend.buckets[0].safe, 3);
  assert.equal(trend.buckets[1].safe, 0);
  assert.equal(trend.buckets[6].suspicious, 5);
  assert.deepEqual(trend.previous, { safe: 4, suspicious: 1, dangerous: 2, blocked: 1 });
});

test('hourly trend covers the last 24 UTC hours ending with the current hour', () => {
  const trend = buildTrend(
    '24h',
    [
      {
        bucket_start: '2026-09-28T10:00:00+00:00',
        safe_count: 1,
        suspicious_count: 0,
        dangerous_count: 3,
        successfully_blocked_count: 2,
      },
    ],
    now,
  );
  assert.equal(trend.buckets.length, 24);
  assert.equal(trend.buckets[0].start, '2026-09-27T11:00:00.000Z');
  assert.equal(trend.buckets[23].start, '2026-09-28T10:00:00.000Z');
  assert.equal(trend.buckets[23].dangerous, 3);
  assert.equal(trend.buckets[23].blocked, 2);
});

test('unknown ranges are rejected', () => {
  assert.equal(trendWindow('1y', now), null);
});
