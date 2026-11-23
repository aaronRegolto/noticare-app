import { normalizedCommunityPercentages } from '../community';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));
jest.mock('@/src/services/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: {},
}));

describe('normalizedCommunityPercentages', () => {
  it('always allocates exactly 100 percent', () => {
    for (let safe = 0; safe <= 20; safe += 1) {
      for (let suspicious = 0; suspicious <= 20; suspicious += 1) {
        for (let dangerous = 0; dangerous <= 20; dangerous += 1) {
          const percentages = normalizedCommunityPercentages([safe, suspicious, dangerous]);
          expect(percentages.reduce((sum, value) => sum + value, 0)).toBe(safe + suspicious + dangerous ? 100 : 0);
          expect(percentages.every((value) => value >= 0)).toBe(true);
        }
      }
    }
  });

  it('handles common rounding edges', () => {
    expect(normalizedCommunityPercentages([1, 1, 1])).toEqual([34, 33, 33]);
    expect(normalizedCommunityPercentages([98, 1, 1])).toEqual([98, 1, 1]);
    expect(normalizedCommunityPercentages([0, 0, 0])).toEqual([0, 0, 0]);
  });
});
