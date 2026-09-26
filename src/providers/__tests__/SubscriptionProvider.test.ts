import { computeTier } from '../subscriptionTier';

describe('computeTier', () => {
  it('returns free when plan is not pro', () => {
    expect(computeTier('free', null)).toBe('free');
    expect(computeTier(null, null)).toBe('free');
  });

  it('returns pro when plan is pro and expiry is in the future', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(computeTier('pro', future)).toBe('pro');
  });

  it('returns free when plan is pro but expiry has passed', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(computeTier('pro', past)).toBe('free');
  });

  it('treats a missing expiry as still active', () => {
    expect(computeTier('pro', null)).toBe('pro');
  });
});
