import { readFileSync } from 'node:fs';
import path from 'node:path';

import { DETECTION_RULE_BUNDLE as rules } from '@/src/features/detection/rules';

import { ENGLISH_WARNING_COPY, localizeReason, TAGALOG_WARNING_COPY, warningCopyFor } from '../warningCopy';

// Native warnings translate each warning sign by its code (plugins/android/WarningCopy.kt). Every
// code the scanner can produce needs a Tagalog entry, or that sign would show in English.
const warningCopy = readFileSync(path.join(__dirname, '../../../../plugins/android/WarningCopy.kt'), 'utf8');
const tagalog = warningCopy.slice(warningCopy.indexOf('object Tagalog'));

const codes = [
  ...rules.textRules,
  rules.normalizationRules.obfuscatedText,
  ...rules.urlRules,
  rules.urlContextRule,
  rules.brandUnrelatedUrlRule,
  ...rules.combinationRules,
].map((rule) => rule.code);

test.each([...codes, 'v3-model-risk'])('the Tagalog warning copy translates "%s"', (code) => {
  expect(tagalog).toContain(`"${code}" to (`);
});

test('the Tagalog copy has no warning-sign codes the scanner does not produce', () => {
  const translated = [...tagalog.matchAll(/"([a-z0-9-]+)" to \(/g)].map((match) => match[1]);
  expect(translated.filter((code) => !codes.includes(code) && code !== 'v3-model-risk')).toEqual([]);
});

describe('in-app warning copy', () => {
  // Pairs of "code" to ("label" to "description") from the native Tagalog copy.
  const nativeTagalog = Object.fromEntries(
    [...tagalog.matchAll(/"([a-z0-9-]+)" to \("([^"]*)" to\s*"([^"]*)"\)/g)].map((match) => [
      match[1],
      [match[2], match[3]],
    ]),
  );

  it('uses the same Tagalog warning-sign wording as the native warnings', () => {
    expect(Object.keys(nativeTagalog)).toHaveLength(codes.length + 1);
    expect(TAGALOG_WARNING_COPY.reasons).toEqual(nativeTagalog);
  });

  it('picks Tagalog only for Tagalog', () => {
    expect(warningCopyFor('tl')).toBe(TAGALOG_WARNING_COPY);
    expect(warningCopyFor('en')).toBe(ENGLISH_WARNING_COPY);
    expect(warningCopyFor('default')).toBe(ENGLISH_WARNING_COPY);
  });

  it('translates a warning sign by code and keeps its points', () => {
    const reason = { code: 'url-shortener', label: 'Shortened link', description: 'x', weight: 30 };
    expect(localizeReason(reason, TAGALOG_WARNING_COPY)).toEqual({
      ...reason,
      label: 'Pinaikling link',
      description: 'Itinatago ng URL shortener kung saang website talaga papunta ang link.',
    });
    expect(localizeReason(reason, ENGLISH_WARNING_COPY)).toBe(reason);
    const unknown = { code: 'future-rule', label: 'Future rule', description: 'y', weight: 5 };
    expect(localizeReason(unknown, TAGALOG_WARNING_COPY)).toBe(unknown);
  });

  it('keeps the numbers in translated sentences', () => {
    expect(TAGALOG_WARNING_COPY.suspiciousScoreExplanation(45)).toContain('45/100');
    expect(TAGALOG_WARNING_COPY.reportedBy(3)).toContain('3');
    expect(TAGALOG_WARNING_COPY.cappedNote(130)).toContain('130');
    expect(ENGLISH_WARNING_COPY.reportBadge(1)).toBe('1 report');
    expect(ENGLISH_WARNING_COPY.reportBadge(4)).toBe('4 reports');
  });
});
