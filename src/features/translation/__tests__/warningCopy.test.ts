import { readFileSync } from 'node:fs';
import path from 'node:path';

import { DETECTION_RULE_BUNDLE as rules } from '@/src/features/detection/rules';

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
