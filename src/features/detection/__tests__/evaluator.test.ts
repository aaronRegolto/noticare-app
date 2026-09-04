import { describe, expect, it } from '@jest/globals';

import { evaluateThreat } from '../evaluator';
import { normalizeMessage } from '../normalize';
import { DETECTION_RULE_BUNDLE } from '../rules';
import { DETECTION_CORPUS } from './corpus';

describe('offline phishing detection corpus', () => {
  it('keeps at least 50 synthetic cases for parity coverage', () => {
    expect(DETECTION_CORPUS.length).toBeGreaterThanOrEqual(50);
  });

  it('preserves the original message while normalizing hidden text locally', () => {
    const source = 'V\u200Berify your acc0unt now!!!';
    const normalized = normalizeMessage(source);

    expect(normalized.original).toBe(source);
    expect(normalized.normalized).toContain('verify your acc0unt now!!');
    expect(normalized.comparable).toContain('verify your account now');
    expect(normalized.hadZeroWidthCharacters).toBe(true);
    expect(normalized.hadCharacterSubstitutions).toBe(true);
  });

  it.each(DETECTION_CORPUS)('$id classifies as $expectedLevel', (testCase) => {
    const result = evaluateThreat(testCase.message);
    expect(result.level).toBe(testCase.expectedLevel);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.ruleVersion).toBe(DETECTION_RULE_BUNDLE.version);

    if (testCase.expectedUrlCount !== undefined) {
      expect(result.urls).toHaveLength(testCase.expectedUrlCount);
    }
    for (const code of testCase.expectedReasonCodes ?? []) {
      expect(result.reasons.some((reason) => reason.code === code)).toBe(true);
    }
  });
});
