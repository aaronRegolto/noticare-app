// App updates: the admin publishes each new APK's version, notes, and download link here, and the
// app shows them as "Update available" (see the app_releases migration). Writes go through the
// publish_app_release / withdraw_app_release functions, which check admin access themselves.

const invalid = (message) => Object.assign(new Error(message), { status: 400 });
// Android's largest allowed versionCode.
const MAX_VERSION_CODE = 2_100_000_000;

/** Checks a release from the form and returns the publish_app_release arguments. */
export function validateRelease(input) {
  if (!input || typeof input !== 'object') throw invalid('Fill in the release details.');
  const versionCode = Number(input.version_code);
  if (!Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode > MAX_VERSION_CODE)
    throw invalid('Version code must be a whole number, like the one shown on the EAS build page.');
  const versionName = typeof input.version_name === 'string' ? input.version_name.trim() : '';
  if (!versionName || versionName.length > 32) throw invalid('Version name is required, for example 1.1.0.');
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length > 80) throw invalid('Say what this update is for in 80 characters or fewer.');
  const changes = (Array.isArray(input.changes) ? input.changes : String(input.changes ?? '').split(/\r?\n/))
    .map((item) => (typeof item === 'string' ? item.replace(/^\s*[-*•]\s*/, '').trim() : ''))
    .filter(Boolean);
  if (!changes.length || changes.length > 12) throw invalid('List between 1 and 12 changes, one per line.');
  if (changes.some((item) => item.length > 200)) throw invalid('Keep each change to 200 characters or fewer.');
  const apkUrl = typeof input.apk_url === 'string' ? input.apk_url.trim() : '';
  let parsed;
  try {
    parsed = new URL(apkUrl);
  } catch {
    parsed = null;
  }
  if (!parsed || parsed.protocol !== 'https:' || apkUrl.length > 2048 || /\s/.test(apkUrl))
    throw invalid('The APK link must be a full https:// address.');
  return {
    p_version_code: versionCode,
    p_version_name: versionName,
    p_title: title,
    p_changes: changes,
    p_apk_url: apkUrl,
    p_required: input.required === true,
  };
}

function releaseError(error) {
  // 22023 messages are written by publish_app_release itself for the admin, never user data.
  if (error.code === '22023') return Object.assign(new Error(error.message), { status: 400 });
  if (error.code === '23505')
    return Object.assign(new Error('That version code was already used. Build again to get a new one.'), {
      status: 409,
    });
  if (error.code === '42501') return Object.assign(new Error('Admin access required.'), { status: 403 });
  return Object.assign(new Error('Could not save the release. Apply the app_releases migration and try again.'), {
    status: 502,
  });
}

export async function listReleases(db) {
  const { data, error } = await db
    .from('app_releases')
    .select('id,version_code,version_name,title,changes,apk_url,required,published,published_at')
    .order('version_code', { ascending: false })
    .limit(50);
  if (error) throw releaseError(error);
  return data;
}

export async function publishRelease(db, input) {
  const { data, error } = await db.rpc('publish_app_release', validateRelease(input));
  if (error) throw releaseError(error);
  return data;
}

export async function withdrawRelease(db, input) {
  const id = typeof input?.id === 'string' ? input.id : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw invalid('Unknown release.');
  const { error } = await db.rpc('withdraw_app_release', { p_id: id });
  if (error) throw releaseError(error);
  return { id, published: false };
}
