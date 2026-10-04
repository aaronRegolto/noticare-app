import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  ensureLanguagePack,
  getMessageTranslationState,
  loadMessageLanguage,
  resetMessageTranslationForTests,
  setMessageLanguage,
  translateForDisplay,
} from '@/src/services/messageTranslation';
import {
  downloadTranslationModels,
  getTranslationModelStatus,
  identifyMessageLanguage,
  isMessageTranslationAvailable,
  setNativeMessageLanguage,
  translateSegments,
} from '@/src/services/notificationListener';

const mockStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockStorage.get(key) ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStorage.set(key, value);
    return Promise.resolve();
  }),
}));

jest.mock('@/src/services/notificationListener', () => ({
  isMessageTranslationAvailable: jest.fn(),
  identifyMessageLanguage: jest.fn(),
  getTranslationModelStatus: jest.fn(),
  downloadTranslationModels: jest.fn(),
  translateSegments: jest.fn(),
  setNativeMessageLanguage: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/src/services/logger', () => ({ logError: jest.fn() }));

const available = isMessageTranslationAvailable as jest.Mock;
const identify = identifyMessageLanguage as jest.Mock;
const modelStatus = getTranslationModelStatus as jest.Mock;
const downloadModels = downloadTranslationModels as jest.Mock;
const translate = translateSegments as jest.Mock;
const nativeLanguage = setNativeMessageLanguage as jest.Mock;
const coded = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => {
  jest.clearAllMocks();
  mockStorage.clear();
  resetMessageTranslationForTests();
  available.mockReturnValue(true);
  modelStatus.mockResolvedValue('ready');
});

test('Default shows every message as received, without touching the translator', async () => {
  expect(await translateForDisplay('Your account is locked.', 'default')).toEqual({ status: 'original' });
  expect(identify).not.toHaveBeenCalled();
});

test('a build without the translator shows messages as received', async () => {
  available.mockReturnValue(false);
  expect(await translateForDisplay('Your account is locked.', 'tl')).toEqual({ status: 'original' });
  expect(await ensureLanguagePack()).toBe('unknown');
  expect(modelStatus).not.toHaveBeenCalled();
});

test('an English message is translated to Tagalog with its link kept exactly as received', async () => {
  identify.mockResolvedValue('en');
  translate.mockResolvedValue(['I-verify ngayon sa', 'o mawawalan ng access.']);

  expect(await translateForDisplay('Verify now at http://gcash-verify.xyz/login or lose access.', 'tl')).toEqual({
    status: 'translated',
    text: 'I-verify ngayon sa http://gcash-verify.xyz/login o mawawalan ng access.',
    from: 'en',
  });
  expect(identify).toHaveBeenCalledWith('Verify now at   or lose access.');
  expect(translate).toHaveBeenCalledWith(['Verify now at ', ' or lose access.'], 'en', 'tl');
});

test('a message already in the chosen language is left as received', async () => {
  identify.mockResolvedValue('fil');
  expect(await translateForDisplay('Kumusta ka na?', 'tl')).toEqual({ status: 'original' });
  expect(translate).not.toHaveBeenCalled();
});

test('a message that is only a link is never sent to the translator', async () => {
  expect(await translateForDisplay('https://bit.ly/abc', 'en')).toEqual({ status: 'original' });
  expect(identify).not.toHaveBeenCalled();
});

test('translations are cached per message and language', async () => {
  identify.mockResolvedValue('fil');
  translate.mockResolvedValue(['Your account is locked.']);
  await translateForDisplay('Naka-lock ang account mo.', 'en');
  await translateForDisplay('Naka-lock ang account mo.', 'en');
  expect(translate).toHaveBeenCalledTimes(1);
});

test('before the language pack downloads, the message shows as received and is retried later', async () => {
  identify.mockResolvedValue('en');
  translate.mockRejectedValueOnce(coded('model_missing'));
  expect(await translateForDisplay('Your parcel is on hold.', 'tl')).toEqual({ status: 'pack-missing' });

  translate.mockResolvedValueOnce(['Naka-hold ang parcel mo.']);
  expect(await translateForDisplay('Your parcel is on hold.', 'tl')).toEqual({
    status: 'translated',
    text: 'Naka-hold ang parcel mo.',
    from: 'en',
  });
});

test('a translator failure shows the original message', async () => {
  identify.mockRejectedValue(new Error('boom'));
  expect(await translateForDisplay('Hello', 'tl')).toEqual({ status: 'failed' });
});

test('choosing Tagalog saves it and downloads the language pack over Wi-Fi', async () => {
  modelStatus.mockResolvedValue('missing');
  downloadModels.mockResolvedValue('ready');
  await setMessageLanguage('tl');
  expect(mockStorage.get('noticare.message-language.v1')).toBe('tl');
  expect(getMessageTranslationState().language).toBe('tl');
  expect(nativeLanguage).toHaveBeenCalledWith('tl');
  expect(await ensureLanguagePack()).toBe('ready');
  expect(getMessageTranslationState().pack).toBe('ready');
  expect(downloadModels).toHaveBeenCalledTimes(1);
});

test('choosing Default does not download anything', async () => {
  modelStatus.mockResolvedValue('missing');
  await setMessageLanguage('default');
  await Promise.resolve();
  expect(modelStatus).not.toHaveBeenCalled();
  expect(downloadModels).not.toHaveBeenCalled();
});

test('the download waits for Wi-Fi, and concurrent requests share one download', async () => {
  modelStatus.mockResolvedValue('missing');
  downloadModels.mockRejectedValueOnce(coded('wifi_required'));
  expect(await ensureLanguagePack()).toBe('wifi-required');

  let finish: (value: string) => void = () => undefined;
  downloadModels.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
  const first = ensureLanguagePack();
  const second = ensureLanguagePack();
  await Promise.resolve();
  await Promise.resolve();
  finish('ready');
  expect(await Promise.all([first, second])).toEqual(['ready', 'ready']);
  expect(downloadModels).toHaveBeenCalledTimes(2);
});

test('an already downloaded pack is not downloaded again; a failed download reports failed', async () => {
  expect(await ensureLanguagePack()).toBe('ready');
  expect(downloadModels).not.toHaveBeenCalled();

  modelStatus.mockResolvedValue('missing');
  downloadModels.mockRejectedValueOnce(coded('download_failed'));
  expect(await ensureLanguagePack()).toBe('failed');
});

test('a saved language is restored once per app run, and an unknown saved value is ignored', async () => {
  mockStorage.set('noticare.message-language.v1', 'en');
  await loadMessageLanguage();
  expect(getMessageTranslationState().language).toBe('en');
  // Re-sent so native warnings follow a choice saved before they could be translated.
  expect(nativeLanguage).toHaveBeenCalledWith('en');

  mockStorage.set('noticare.message-language.v1', 'tl');
  await loadMessageLanguage();
  expect(getMessageTranslationState().language).toBe('en');
  expect(AsyncStorage.getItem).toHaveBeenCalledTimes(1);

  resetMessageTranslationForTests();
  mockStorage.set('noticare.message-language.v1', 'fr');
  await loadMessageLanguage();
  expect(getMessageTranslationState().language).toBe('default');
});

test('a failure to update the native warnings still saves the choice', async () => {
  nativeLanguage.mockRejectedValueOnce(new Error('old build'));
  await setMessageLanguage('en');
  expect(mockStorage.get('noticare.message-language.v1')).toBe('en');
  expect(getMessageTranslationState().language).toBe('en');
});
