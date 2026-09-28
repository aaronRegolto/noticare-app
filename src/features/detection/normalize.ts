import { DETECTION_RULE_BUNDLE } from './rules';
import type { NormalizedMessage } from './types';

const ZERO_WIDTH_OR_DIRECTIONAL = /[\u200B-\u200F\u2060\u2066-\u2069\uFEFF]/g;
const UNEXPECTED_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const ZERO_WIDTH_OR_DIRECTIONAL_TEST = /[\u200B-\u200F\u2060\u2066-\u2069\uFEFF]/;
const UNEXPECTED_CONTROL_TEST = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const EXCESSIVE_WHITESPACE = /\s{2,}/;
const REPEATED_PUNCTUATION = /([!?,.;])\1{2,}/;

const CHARACTER_SUBSTITUTIONS: Record<string, string> = {
  '@': 'a',
  $: 's',
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '!': 'i',
};

/**
 * Normalizes text only for matching. `original` remains untouched for local UI display.
 * It never resolves a hostname or performs a network operation.
 */
export function normalizeMessage(message: string): NormalizedMessage {
  const original = typeof message === 'string' ? message : '';
  const wasTruncated = original.length > DETECTION_RULE_BUNDLE.maxInputCharacters;
  // Keep the caller's original message intact for local display, but bound the work that
  // runs in a notification/background path to protect responsiveness.
  const scanInput = wasTruncated ? original.slice(0, DETECTION_RULE_BUNDLE.maxInputCharacters) : original;
  const unicodeNormalized = scanInput.normalize('NFKC');
  const hadZeroWidthCharacters = ZERO_WIDTH_OR_DIRECTIONAL_TEST.test(unicodeNormalized);
  const hadUnexpectedControlCharacters = UNEXPECTED_CONTROL_TEST.test(unicodeNormalized);
  const hadExcessiveWhitespace = EXCESSIVE_WHITESPACE.test(unicodeNormalized);
  const hadRepeatedPunctuation = REPEATED_PUNCTUATION.test(unicodeNormalized);

  const normalized = unicodeNormalized
    .replace(ZERO_WIDTH_OR_DIRECTIONAL, '')
    .replace(UNEXPECTED_CONTROL, ' ')
    .replace(/\s+/g, ' ')
    .replace(/([!?,.;])\1{2,}/g, '$1$1')
    .trim()
    .toLowerCase();

  const comparable = normalizeCharacterSubstitutions(normalized);
  return {
    original,
    normalized,
    comparable,
    hadZeroWidthCharacters,
    hadUnexpectedControlCharacters,
    hadExcessiveWhitespace,
    hadRepeatedPunctuation,
    hadCharacterSubstitutions: comparable !== normalized,
    wasTruncated,
  };
}

// Amounts, codes, and units such as P500, GoSURF50, bus8, 3pm, 1st, or 100gb: not leetspeak.
const LETTERS_THEN_DIGITS = /^[a-z]+\d+$/i;
const DIGITS_THEN_UNIT =
  /^\d+(?:am|pm|st|nd|rd|th|gb|mb|kb|tb|g|k|m|hrs?|mins?|secs?|yrs?|days?|pcs|x|s|mg|ml|kg|km|cm|mm|ft)$/i;

/**
 * Converts common leetspeak only inside mixed letter/number tokens. Pure numbers (such
 * as OTPs, dates, amounts, and phone numbers) are intentionally left unchanged.
 */
export function normalizeCharacterSubstitutions(value: string): string {
  return value.replace(/[A-Za-z0-9@$!.-]{3,}/g, (token) => {
    // Domains, punycode labels, decimal values, and version numbers must be handled by
    // the URL parser rather than being mistaken for leetspeak.
    if (token.includes('.') || token.includes('-')) return token;
    // A trailing "!" is punctuation ("Hi!"), not a disguised "i".
    const core = token.replace(/!+$/, '');
    const suffix = token.slice(core.length);
    if (!/[A-Za-z]/.test(core) || !/[0-9@$!]/.test(core)) return token;
    if (LETTERS_THEN_DIGITS.test(core) || DIGITS_THEN_UNIT.test(core)) return token;

    const converted = core.replace(/[@$013457!]/g, (character) => CHARACTER_SUBSTITUTIONS[character] ?? character);
    return /[A-Za-z]{2,}/.test(converted) ? converted + suffix : token;
  });
}
