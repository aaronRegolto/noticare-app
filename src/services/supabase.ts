import * as SecureStore from 'expo-secure-store';
import { createClient, type AuthChangeEvent, type Session } from '@supabase/supabase-js';

import type { Database } from '@/backend/supabase/types/database.types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

// Calls are blocked below when configuration is absent. The invalid fallback only lets
// the typed client exist without embedding any credential in the application.
export const supabase = createClient<Database>(url ?? 'https://not-configured.invalid', anonKey ?? 'not-configured', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: secureStorage,
    storageKey: 'noticare.supabase.auth.token',
  },
});

function requireConfiguration() {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env.',
    );
  }
}

export async function signInWithPhone(phone: string) {
  requireConfiguration();
  const { data, error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
  return data;
}

export async function verifyOtp(phone: string, token: string) {
  requireConfiguration();
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw error;
  return data;
}

/**
 * Sends an OTP to a new phone number for the currently signed-in user — the same
 * built-in flow Supabase uses for changing your sign-in phone. Used here to prove
 * ownership of a second number before linking it (see confirmPhoneChange).
 */
export async function requestPhoneChange(phone: string) {
  requireConfiguration();
  const { data, error } = await supabase.auth.updateUser({ phone });
  if (error) throw error;
  return data;
}

/** Verifies the new phone's OTP, which also makes it the account's new primary sign-in phone. */
export async function confirmPhoneChange(phone: string, token: string) {
  requireConfiguration();
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'phone_change' });
  if (error) throw error;
  return data;
}

/**
 * Resolves a phone typed on the login screen to the account's current primary
 * phone if it's a linked alias (see the linked_phone_numbers table), otherwise
 * returns it unchanged. Always callable pre-session.
 */
export async function resolveLoginPhone(phone: string): Promise<string> {
  if (!isSupabaseConfigured) return phone;
  const { data, error } = await supabase.rpc('resolve_primary_phone', { p_phone: phone });
  if (error) throw error;
  return data ?? phone;
}

export async function listLinkedPhones() {
  requireConfiguration();
  const { data, error } = await supabase.rpc('list_linked_phones');
  if (error) throw error;
  return data ?? [];
}

export async function recordLinkedPhone(previousPhone: string) {
  requireConfiguration();
  const { error } = await supabase.rpc('record_linked_phone', { p_previous_phone: previousPhone });
  if (error) throw error;
}

export async function unlinkPhone(phone: string) {
  requireConfiguration();
  const { data, error } = await supabase.rpc('unlink_phone', { p_phone: phone });
  if (error) throw error;
  return data ?? false;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function restoreSession() {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
  return supabase.auth.onAuthStateChange((event, session) => callback(event, session));
}
