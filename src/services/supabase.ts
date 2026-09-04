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
