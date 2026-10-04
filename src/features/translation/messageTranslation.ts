/** The language captured messages are shown in. "default" shows them exactly as received. */
export type MessageLanguage = 'default' | 'tl' | 'en';

/** A piece of a message: text to translate, or a link/email kept exactly as received. */
export type MessageSegment = { text: string; translate: boolean };

export type TranslationPlan = { source: 'en' | 'tl'; target: 'en' | 'tl' };

// Links and email addresses are never sent to the translator: on a scam app the exact address is
// the evidence, and a translator can "correct" a lookalike domain into a real one.
const KEEP_AS_RECEIVED =
  /(?:https?:\/\/|www\.)[^\s]+|[^\s@]+@[^\s@]+\.[a-z]{2,}|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/gi;
const TRAILING_PUNCTUATION = /[.,!?;:)\]]+$/;

/** Splits a message so only its words are translated; links and emails stay as received. */
export function splitForTranslation(message: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let cursor = 0;
  for (const match of message.matchAll(KEEP_AS_RECEIVED)) {
    const start = match.index ?? 0;
    const kept = match[0].replace(TRAILING_PUNCTUATION, '');
    if (!kept) continue;
    if (start > cursor) segments.push({ text: message.slice(cursor, start), translate: true });
    segments.push({ text: kept, translate: false });
    cursor = start + kept.length;
  }
  if (cursor < message.length) segments.push({ text: message.slice(cursor), translate: true });
  return segments;
}

/**
 * Whether a message needs translating for the chosen language. NotiCare's messages are English,
 * Tagalog, or Taglish, so anything not already in the chosen language is translated from the
 * other one; words already in the chosen language usually pass through unchanged.
 * `detected` is ML Kit's language code ("en", "fil", or "und" when unsure).
 */
export function planTranslation(detected: string, language: MessageLanguage): TranslationPlan | null {
  if (language === 'default' || detected === 'und') return null;
  const normalized = detected === 'fil' ? 'tl' : detected;
  if (normalized === language) return null;
  return { source: language === 'tl' ? 'en' : 'tl', target: language };
}

/** Rejoins segments, putting each translation back in place of the text it came from. */
export function joinTranslatedSegments(segments: readonly MessageSegment[], translations: readonly string[]): string {
  let next = 0;
  return segments
    .map((segment) => {
      if (!segment.translate) return segment.text;
      const translated = translations[next++] ?? segment.text;
      // Keep the spacing around links: the translator trims its input's edges.
      const leading = segment.text.match(/^\s*/)?.[0] ?? '';
      const trailing = segment.text.match(/\s*$/)?.[0] ?? '';
      return `${leading}${translated.trim()}${trailing}`;
    })
    .join('');
}

export const LANGUAGE_NAMES: Record<'en' | 'tl', string> = { en: 'English', tl: 'Tagalog' };
