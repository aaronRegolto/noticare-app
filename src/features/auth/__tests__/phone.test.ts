import { detectPhilippineCarrier } from '../phone';

describe('detectPhilippineCarrier', () => {
  it('returns null for non-Philippine numbers', () => {
    expect(detectPhilippineCarrier('+12015550123')).toBeNull();
  });

  it('returns null for a malformed PH number', () => {
    expect(detectPhilippineCarrier('+639171234')).toBeNull();
  });

  it('recognizes a Globe prefix', () => {
    expect(detectPhilippineCarrier('+639171234567')).toBe('Globe');
  });

  it('recognizes a Smart/TNT prefix', () => {
    expect(detectPhilippineCarrier('+639181234567')).toBe('Smart/TNT');
  });

  it('returns null for an unrecognized/unmapped prefix (e.g. DITO)', () => {
    expect(detectPhilippineCarrier('+639001234567')).toBeNull();
  });
});
