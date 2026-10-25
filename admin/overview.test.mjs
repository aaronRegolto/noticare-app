import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOverview } from './overview.mjs';

test('overview totals and source breakdowns keep Manual and real-time scans separate', () => {
  assert.deepEqual(
    buildOverview({
      manual: { safe: 12, suspicious: 4, dangerous: 3, blocked: 0 },
      realtime: { safe: 20, suspicious: 5, dangerous: 7, blocked: 6 },
    }),
    {
      scans: 51,
      safe: 32,
      suspicious: 9,
      dangerous: 10,
      blocked: 6,
      manual: { scans: 19, safe: 12, suspicious: 4, dangerous: 3, blocked: 0 },
      realtime: { scans: 32, safe: 20, suspicious: 5, dangerous: 7, blocked: 6 },
    },
  );
});
