import { formatVersion, parseRelease, pendingUpdate } from '../release';

const row = {
  version_code: 6,
  version_name: ' 1.1.0 ',
  title: ' Better scam detection ',
  changes: ['Detects fake GCash links', ' ', 'Faster camera scan'],
  apk_url: 'https://example.com/noticare.apk',
  required: false,
  published_at: '2026-10-05T10:00:00Z',
};

describe('parseRelease', () => {
  it('reads a valid release and drops blank changes', () => {
    expect(parseRelease(row)).toEqual({
      versionCode: 6,
      versionName: '1.1.0',
      title: 'Better scam detection',
      changes: ['Detects fake GCash links', 'Faster camera scan'],
      apkUrl: 'https://example.com/noticare.apk',
      required: false,
      publishedAt: '2026-10-05T10:00:00Z',
    });
  });

  it('never offers a non-HTTPS or malformed download link', () => {
    expect(parseRelease({ ...row, apk_url: 'http://example.com/noticare.apk' })).toBeNull();
    expect(parseRelease({ ...row, apk_url: 'javascript:alert(1)' })).toBeNull();
    expect(parseRelease({ ...row, apk_url: 'not a url' })).toBeNull();
  });

  it('rejects rows missing what the update is for', () => {
    expect(parseRelease({ ...row, title: ' ' })).toBeNull();
    expect(parseRelease({ ...row, changes: [] })).toBeNull();
    expect(parseRelease({ ...row, version_code: 0 })).toBeNull();
    expect(parseRelease(null)).toBeNull();
  });
});

describe('pendingUpdate', () => {
  const release = parseRelease(row);

  it('offers only a newer build', () => {
    expect(pendingUpdate({ code: 5, name: '1.0.0' }, release)).toBe(release);
    expect(pendingUpdate({ code: 6, name: '1.1.0' }, release)).toBeNull();
    expect(pendingUpdate({ code: 7, name: '1.2.0' }, release)).toBeNull();
  });

  it('offers nothing when the installed version is unknown', () => {
    expect(pendingUpdate({ code: null, name: null }, release)).toBeNull();
    expect(pendingUpdate({ code: 5, name: '1.0.0' }, null)).toBeNull();
  });
});

describe('formatVersion', () => {
  it('shows the name and build number', () => {
    expect(formatVersion({ code: 5, name: '1.0.0' })).toBe('1.0.0 (5)');
    expect(formatVersion({ code: null, name: '1.0.0' })).toBe('1.0.0');
    expect(formatVersion({ code: null, name: null })).toBe('Unknown');
  });
});
