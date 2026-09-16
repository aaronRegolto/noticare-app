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

describe('credential wording regressions', () => {
  it.each([
    'Reply with your six-digit OTP to cancel the transfer.',
    'Enter your e-wallet password to release the refund.',
    'Confirm your username and password.',
    'Update your card number and CVV.',
    'Paki-reply ang OTP para ma-release ang pera.',
    'Isumite ang inyong MPIN.',
  ])('suspicious: %s', (message) => {
    expect(evaluateThreat(message).level).toBe('suspicious');
  });
  it.each([
    'hello love',
    'Never reply with your six-digit OTP.',
    'Do not enter your e-wallet password.',
    'Never confirm your username and password.',
    'Huwag paki-reply ang OTP.',
    'Huwag isumite ang inyong MPIN.',
    'Your six-digit OTP is 123456. Never share it.',
    'Payment received. Thank you.',
  ])('safe: %s', (message) => {
    expect(evaluateThreat(message).level).toBe('safe');
  });
});
