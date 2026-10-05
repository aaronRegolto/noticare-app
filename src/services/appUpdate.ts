import { Platform } from 'react-native';

import { type AppRelease, type InstalledVersion, parseRelease } from '@/src/features/app-update/release';
import { isSupabaseConfigured, supabase } from '@/src/services/supabase';

const UNKNOWN: InstalledVersion = { code: null, name: null };

/**
 * The installed build's Android versionCode and version name. Loaded lazily so a development
 * build made before expo-application was added keeps working; it just never offers updates.
 */
export function installedVersion(): InstalledVersion {
  if (Platform.OS !== 'android') return UNKNOWN;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Application = require('expo-application') as typeof import('expo-application');
    const code = Number(Application.nativeBuildVersion);
    return {
      code: Number.isSafeInteger(code) && code > 0 ? code : null,
      name: Application.nativeApplicationVersion ?? null,
    };
  } catch {
    return UNKNOWN;
  }
}

/** The newest published release, or null when none is published. Throws when it can't be checked. */
export async function fetchLatestRelease(): Promise<AppRelease | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('app_releases')
    .select('version_code,version_name,title,changes,apk_url,required,published_at')
    .eq('published', true)
    .order('version_code', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return parseRelease(data);
}
