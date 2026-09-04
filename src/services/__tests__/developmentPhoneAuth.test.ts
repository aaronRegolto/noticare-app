import { canUseDevelopmentPhoneLogin } from '@/src/services/developmentPhoneAuth';

describe('development phone login guard', () => {
  it('is available to JavaScript development bundles', () => {
    expect(canUseDevelopmentPhoneLogin(true)).toBe(true);
  });

  it('is unavailable to production bundles', () => {
    expect(canUseDevelopmentPhoneLogin(false)).toBe(false);
  });
});
