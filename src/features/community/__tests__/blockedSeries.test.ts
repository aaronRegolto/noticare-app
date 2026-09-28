import { axisTicks, blockedSeries } from '../blockedSeries';

const now = new Date('2026-09-28T11:20:00Z');
const point = (date: string, blocked: number) => ({ date, blocked_count: blocked });

describe('blockedSeries', () => {
  it('expands a single hourly point to the full UTC day', () => {
    const series = blockedSeries([point('2026-09-28T11:00:00+00:00', 3)], 'today', now);
    expect(series).toHaveLength(24);
    expect(new Date(series[0].start).toISOString()).toBe('2026-09-28T00:00:00.000Z');
    expect(series[11].blocked).toBe(3);
    expect(series.filter((bucket) => bucket.blocked).length).toBe(1);
  });

  it('zero-fills daily ranges ending today', () => {
    const series = blockedSeries(
      [point('2026-09-22T00:00:00+00:00', 2), point('2026-09-28T00:00:00+00:00', 1)],
      'last_7_days',
      now,
    );
    expect(series.map((bucket) => new Date(bucket.start).toISOString().slice(0, 10))).toEqual([
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
    ]);
    expect(series.map((bucket) => bucket.blocked)).toEqual([2, 0, 0, 0, 0, 0, 1]);
    expect(blockedSeries([], 'last_30_days', now)).toHaveLength(30);
  });

  it('covers six calendar months including the current one', () => {
    const series = blockedSeries([point('2026-05-01T00:00:00+00:00', 4)], 'last_6_months', now);
    expect(series.map((bucket) => new Date(bucket.start).toISOString().slice(0, 7))).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
    expect(series[1].blocked).toBe(4);
  });
});

describe('axisTicks', () => {
  it('uses clean steps and covers the maximum', () => {
    expect(axisTicks(0)).toEqual([0, 1, 2, 3, 4]);
    expect(axisTicks(3)).toEqual([0, 1, 2, 3, 4]);
    expect(axisTicks(9)).toEqual([0, 5, 10]);
    expect(axisTicks(42)).toEqual([0, 20, 40, 60]);
  });
});

describe('blockedSeries last_24_hours', () => {
  it('covers the 24 hours ending with the current hour', () => {
    const series = blockedSeries(
      [
        { date: '2026-09-27T12:00:00+00:00', blocked_count: 2 },
        { date: '2026-09-28T11:00:00+00:00', blocked_count: 3 },
      ],
      'last_24_hours',
      new Date('2026-09-28T11:20:00Z'),
    );
    expect(series).toHaveLength(24);
    expect(new Date(series[0].start).toISOString()).toBe('2026-09-27T12:00:00.000Z');
    expect(new Date(series[23].start).toISOString()).toBe('2026-09-28T11:00:00.000Z');
    expect(series[0].blocked).toBe(2);
    expect(series[23].blocked).toBe(3);
  });
});
