import { categoriesForCodes } from '../categories';

describe('categoriesForCodes', () => {
  test('supports overlapping threat and phishing categories', () => {
    expect(categoriesForCodes(['direct-threat', 'credential-link-combination'])).toEqual(['threats', 'phishing']);
  });

  test('does not invent a category from a generic signal', () => {
    expect(categoriesForCodes(['urgency-pressure'])).toEqual(['spam']);
    expect(categoriesForCodes(['unknown-rule'])).toEqual([]);
  });
});
