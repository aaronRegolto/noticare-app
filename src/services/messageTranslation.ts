import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useSyncExternalStore } from 'react';

import {
  joinTranslatedSegments,
  planTranslation,
  splitForTranslation,
  warningCopyFor,
  type MessageLanguage,
  type WarningCopy,
} from '@/src/features/translation';
import { logError } from '@/src/services/logger';
import {
  downloadTranslationModels,
  getTranslationModelStatus,
  identifyMessageLanguage,
  isMessageTranslationAvailable,
  setNativeMessageLanguage,
  translateSegments,
} from '@/src/services/notificationListener';

const LANGUAGE_KEY = 'noticare.message-language.v1';
const MAX_CACHED = 300;

export type LanguagePackStatus = 'unknown' | 'ready' | 'missing' | 'downloading' | 'wifi-required' | 'failed';

export type DisplayTranslation =
  | { status: 'original' }
  | { status: 'translated'; text: string; from: 'en' | 'tl' }
  | { status: 'pack-missing' }
  | { status: 'failed' };

type State = { language: MessageLanguage; pack: LanguagePackStatus };

let state: State = { language: 'default', pack: 'unknown' };
let loaded: Promise<void> | null = null;
let download: Promise<LanguagePackStatus> | null = null;
const listeners = new Set<() => void>();
const cache = new Map<string, DisplayTranslation>();

function update(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isMessageLanguage(value: unknown): value is MessageLanguage {
  return value === 'default' || value === 'tl' || value === 'en';
}

/** The chosen message language and language pack status, for code outside React. */
export function getMessageTranslationState(): State {
  return state;
}

/**
 * Reads the saved message language once per app run, and re-sends it to the native warnings (for
 * a choice saved before an update that taught them the language).
 */
export function loadMessageLanguage(): Promise<void> {
  loaded ??= AsyncStorage.getItem(LANGUAGE_KEY)
    .then(async (saved) => {
      if (!isMessageLanguage(saved)) return;
      update({ language: saved });
      await setNativeMessageLanguage(saved);
    })
    .catch((error) => logError('message-language-load-failed', error));
  return loaded;
}

/**
 * Saves the message language, applies it to native warnings and notifications, and, for Tagalog
 * or English, starts the language pack download for translating messages.
 */
export async function setMessageLanguage(language: MessageLanguage): Promise<void> {
  update({ language });
  await AsyncStorage.setItem(LANGUAGE_KEY, language);
  try {
    await setNativeMessageLanguage(language);
  } catch (error) {
    logError('message-language-native-failed', error);
  }
  if (language !== 'default') void ensureLanguagePack();
}

/**
 * Makes sure the English/Tagalog language pack is on this device, downloading it over Wi-Fi only.
 * Safe to call often: concurrent calls share one download.
 */
export function ensureLanguagePack(): Promise<LanguagePackStatus> {
  if (!isMessageTranslationAvailable()) return Promise.resolve(state.pack);
  download ??= (async (): Promise<LanguagePackStatus> => {
    try {
      if ((await getTranslationModelStatus()) === 'ready') return 'ready';
      update({ pack: 'downloading' });
      await downloadTranslationModels();
      return 'ready';
    } catch (error) {
      if (errorCode(error) === 'wifi_required') return 'wifi-required';
      logError('language-pack-download-failed', error);
      return 'failed';
    }
  })()
    .then((pack) => {
      update({ pack });
      return pack;
    })
    .finally(() => {
      download = null;
    });
  return download;
}

/**
 * The text to show for a captured message in the chosen language. Display only: scanning always
 * uses the original. Links and emails are kept exactly as received.
 */
export async function translateForDisplay(text: string, language: MessageLanguage): Promise<DisplayTranslation> {
  if (language === 'default' || !text.trim() || !isMessageTranslationAvailable()) return { status: 'original' };
  const key = `${language}\u0000${text}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const segments = splitForTranslation(text);
  const words = segments.filter((segment) => segment.translate).map((segment) => segment.text);
  let result: DisplayTranslation;
  try {
    const plan = words.join(' ').trim()
      ? planTranslation(await identifyMessageLanguage(words.join(' ')), language)
      : null;
    if (!plan) {
      result = { status: 'original' };
    } else {
      const translated = await translateSegments(words, plan.source, plan.target);
      result = { status: 'translated', text: joinTranslatedSegments(segments, translated), from: plan.source };
    }
  } catch (error) {
    if (errorCode(error) === 'model_missing') {
      update({ pack: 'missing' });
      return { status: 'pack-missing' };
    }
    logError('message-translation-failed', error);
    return { status: 'failed' };
  }

  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value as string);
  cache.set(key, result);
  return result;
}

/** The chosen message language and the language pack status, kept in sync across screens. */
export function useMessageTranslationSettings(): State & { available: boolean } {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
  useEffect(() => {
    void loadMessageLanguage();
  }, []);
  return { ...current, available: isMessageTranslationAvailable() };
}

/** NotiCare's scan-result wording in the chosen language: Tagalog for Tagalog, otherwise English. */
export function useWarningCopy(): WarningCopy {
  return warningCopyFor(useMessageTranslationSettings().language);
}

/** A captured message's display text in the chosen language, falling back to the original. */
export function useTranslatedMessage(text: string | null | undefined): DisplayTranslation | null {
  const { language, pack } = useMessageTranslationSettings();
  const [translation, setTranslation] = useState<DisplayTranslation | null>(null);
  useEffect(() => {
    let active = true;
    setTranslation(null);
    if (!text || language === 'default') return;
    void translateForDisplay(text, language).then((result) => {
      if (active) setTranslation(result);
    });
    return () => {
      active = false;
    };
    // The pack status retries a message once its language pack finishes downloading.
  }, [text, language, pack]);
  return translation;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : undefined;
}

/** Test hook: forget the saved language, the pack status, and cached translations. */
export function resetMessageTranslationForTests() {
  state = { language: 'default', pack: 'unknown' };
  loaded = null;
  download = null;
  cache.clear();
}
