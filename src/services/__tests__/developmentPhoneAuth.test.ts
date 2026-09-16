import { canUseDevelopmentPhoneLogin } from '@/src/services/developmentPhoneAuth';

describe('development phone login guard', () => {
  it('uses real Supabase authentication by default, including development', () => {
    expect(canUseDevelopmentPhoneLogin(true)).toBe(false);
  });
  it('allows an explicit local development opt-in', () => {
    expect(canUseDevelopmentPhoneLogin(true, true)).toBe(true);
  });

  it('is unavailable to production bundles', () => {
    expect(canUseDevelopmentPhoneLogin(false)).toBe(false);
    expect(canUseDevelopmentPhoneLogin(false, true)).toBe(false);
  });
});
