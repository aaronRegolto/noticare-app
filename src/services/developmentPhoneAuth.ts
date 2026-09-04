import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const DEVELOPMENT_PHONE_SESSION_KEY = 'noticare.development-phone-session.v1';
const E164_PHONE = /^\+[1-9]\d{6,14}$/;

type StoredDevelopmentPhoneSession = {
  phone: string;
  userId: string;
};

export type DevelopmentPhoneSession = Readonly<StoredDevelopmentPhoneSession>;

/**
 * A local phone-only profile is deliberately available only to a JavaScript
 * development bundle. Release bundles always use Supabase Phone OTP.
 */
export function canUseDevelopmentPhoneLogin(isDevelopmentBundle: boolean) {
  return isDevelopmentBundle;
}

export const isDevelopmentPhoneLoginEnabled = canUseDevelopmentPhoneLogin(__DEV__);

function isStoredSession(value: unknown): value is StoredDevelopmentPhoneSession {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.phone === 'string' &&
    E164_PHONE.test(record.phone) &&
    typeof record.userId === 'string' &&
    /^dev-phone-[a-f0-9]{64}$/.test(record.userId)
  );
}

async function developmentUserId(phone: string) {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, phone);
  return `dev-phone-${digest}`;
}

/** Creates a stable, device-only identity without sending the number to a server. */
export async function createDevelopmentPhoneSession(phone: string): Promise<DevelopmentPhoneSession> {
  if (!isDevelopmentPhoneLoginEnabled) {
    throw new Error('Development phone sign-in is unavailable in this build.');
  }
  if (!E164_PHONE.test(phone)) throw new Error('Enter a valid phone number.');

  const session: StoredDevelopmentPhoneSession = {
    phone,
    userId: await developmentUserId(phone),
  };
  await SecureStore.setItemAsync(DEVELOPMENT_PHONE_SESSION_KEY, JSON.stringify(session));
  return session;
}

/** Restores only a validated local development profile. */
export async function restoreDevelopmentPhoneSession(): Promise<DevelopmentPhoneSession | null> {
  if (!isDevelopmentPhoneLoginEnabled) return null;
  const stored = await SecureStore.getItemAsync(DEVELOPMENT_PHONE_SESSION_KEY);
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!isStoredSession(parsed) || parsed.userId !== (await developmentUserId(parsed.phone))) {
      await SecureStore.deleteItemAsync(DEVELOPMENT_PHONE_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    await SecureStore.deleteItemAsync(DEVELOPMENT_PHONE_SESSION_KEY);
    return null;
  }
}

export async function clearDevelopmentPhoneSession() {
  await SecureStore.deleteItemAsync(DEVELOPMENT_PHONE_SESSION_KEY);
}
