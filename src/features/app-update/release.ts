/**
 * An APK release offered as "Update available". NotiCare is installed from an APK rather than
 * Google Play, so nothing updates it automatically; the admin publishes each new build's version,
 * notes, and download link, and the app compares that with its own Android versionCode.
 */
export type AppRelease = {
  versionCode: number;
  versionName: string;
  /** What the update is for, in one line. */
  title: string;
  /** What was added or changed. */
  changes: string[];
  apkUrl: string;
  required: boolean;
  publishedAt: string;
};

export type InstalledVersion = {
  /** Android versionCode; null where it can't be read (web, Expo Go, tests). */
  code: number | null;
  name: string | null;
};

const MAX_CHANGES = 12;

/** Validates a database row so a malformed or non-HTTPS release is never offered for download. */
export function parseRelease(row: unknown): AppRelease | null {
  if (!row || typeof row !== 'object') return null;
  const value = row as Record<string, unknown>;
  const { version_code, version_name, title, changes, apk_url, required, published_at } = value;
  if (typeof version_code !== 'number' || !Number.isSafeInteger(version_code) || version_code <= 0) return null;
  if (typeof version_name !== 'string' || !version_name.trim()) return null;
  if (typeof title !== 'string' || !title.trim()) return null;
  if (typeof apk_url !== 'string' || !isHttpsUrl(apk_url)) return null;
  const list = Array.isArray(changes)
    ? changes
        .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
        .map((item) => item.trim())
    : [];
  if (!list.length) return null;
  return {
    versionCode: version_code,
    versionName: version_name.trim(),
    title: title.trim(),
    changes: list.slice(0, MAX_CHANGES),
    apkUrl: apk_url.trim(),
    required: required === true,
    publishedAt: typeof published_at === 'string' ? published_at : '',
  };
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value.trim()).protocol === 'https:';
  } catch {
    return false;
  }
}

/** The release to offer, or null when the installed build is current or its version is unknown. */
export function pendingUpdate(installed: InstalledVersion, latest: AppRelease | null): AppRelease | null {
  if (!latest || installed.code === null) return null;
  return latest.versionCode > installed.code ? latest : null;
}

/** "1.0.0 (5)" for display; falls back gracefully when either part is unknown. */
export function formatVersion(installed: InstalledVersion): string {
  if (installed.name && installed.code !== null) return `${installed.name} (${installed.code})`;
  return installed.name ?? (installed.code !== null ? `Build ${installed.code}` : 'Unknown');
}
