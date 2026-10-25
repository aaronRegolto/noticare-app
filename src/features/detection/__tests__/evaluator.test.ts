import { createHash } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';

import { evaluateRules, evaluateThreat, finalizeRiskScore, finalizeThreatResult, getThreatLevel } from '../evaluator';
import { normalizeMessage } from '../normalize';
import { DETECTION_RULE_BUNDLE } from '../rules';
import type { ThreatResult } from '../types';
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

  it('uses the Safe 0 / Suspicious 1–59 / Dangerous 60–100 boundaries', () => {
    expect(DETECTION_RULE_BUNDLE.thresholds).toEqual({ suspicious: 1, dangerous: 60 });
    expect([0, 1, 59, 60, 100].map(getThreatLevel)).toEqual([
      'safe',
      'suspicious',
      'suspicious',
      'dangerous',
      'dangerous',
    ]);
    const sample = evaluateThreat(corpusMessage('reward-rush-high-bonus-link'));
    expect(sample.score).toBe(36);
  });

  it.each(DETECTION_CORPUS)('$id classifies as $expectedLevel', (testCase) => {
    const result = evaluateThreat(testCase.message);
    expect(result.level).toBe(testCase.expectedLevel);
    expectPublicScore(result);
    expect(result.ruleVersion).toBe(DETECTION_RULE_BUNDLE.version);

    if (testCase.expectedUrlCount !== undefined) {
      expect(result.urls).toHaveLength(testCase.expectedUrlCount);
    }
    for (const code of testCase.expectedReasonCodes ?? []) {
      expect(result.reasons.some((reason) => reason.code === code)).toBe(true);
    }
  });

  it('keeps the TypeScript corpus digest synchronized with the Android parity fixture', () => {
    const canonical = DETECTION_CORPUS.map((testCase) => {
      const result = evaluateThreat(testCase.message);
      const codes = result.reasons.map((reason) => reason.code);
      if (testCase.id === 'unicode-confusable-domain' && !codes.includes('url-punycode')) {
        codes.push('url-punycode');
      }
      return [testCase.id, result.level, result.score, result.urls.length, codes.join(',')].join('|');
    }).join('\n');
    const digest = createHash('sha256').update(canonical).digest('hex');

    expect(digest).toBe('6c1d175800fe0cbfc4a8ccef59e276bfdce2774dd5e64335320cd7949a1f9324');
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

  describe('abusive-language and threat indicators', () => {
    it.each([
      'You are a damn idiot.',
      'Putang ina, gago ka.',
      'Mamatay ka na.',
      'Sana mamatay ka na.',
      'Putang ina mo.',
      'Walang kwenta ka.',
      'Inutil ka.',
      'Pakyu ka.',
    ])('marks profanity as suspicious: %s', (message) => {
      const result = evaluateThreat(message);
      expect(result.level).toBe('suspicious');
      expect(result.reasons.some((reason) => reason.code === 'abusive-language')).toBe(true);
    });

    it('scores "mamatay ka na" as suspicious, not safe', () => {
      const result = evaluateThreat('mamatay ka na');
      expect(result.level).toBe('suspicious');
      expect(result.score).toBe(30);
    });

    it('does not treat a non-targeted mention of death as abusive language', () => {
      expect(evaluateThreat('Maaaring mamatay ang halaman kapag walang tubig.').level).toBe('safe');
    });

    it.each([
      ['I will hurt you if you come here.', 'direct-threat'],
      ['Papatayin kita.', 'direct-threat'],
      ['Sasaksakin kita.', 'direct-threat'],
      ['Babarilin ka namin.', 'direct-threat'],
      ['Susunugin ka nila.', 'direct-threat'],
      ['I will hack your account.', 'cyber-threat'],
      ['Magbayad ka or ipapakalat ko ang private photos mo.', 'cyber-threat'],
    ])('marks a direct or cyber threat dangerous: %s', (message, code) => {
      const result = evaluateThreat(message);
      expect(result.level).toBe('dangerous');
      expect(result.reasons.some((reason) => reason.code === code)).toBe(true);
    });
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
    const result = evaluateThreat(message);
    expect(result.level).toBe('safe');
    expect(result.score).toBe(0);
  });
});

/** Public bands: Safe 0, Suspicious 1–59, Dangerous 60–100. */
function expectPublicScore(result: ThreatResult) {
  if (result.level === 'safe') {
    expect(result.score).toBe(0);
    expect(result.reasons.every((reason) => reason.weight === 0)).toBe(true);
  } else if (result.level === 'suspicious') {
    expect(result.score).toBeGreaterThanOrEqual(DETECTION_RULE_BUNDLE.thresholds.suspicious);
    expect(result.score).toBeLessThan(DETECTION_RULE_BUNDLE.thresholds.dangerous);
  } else {
    expect(result.score).toBeGreaterThanOrEqual(DETECTION_RULE_BUNDLE.thresholds.dangerous);
    expect(result.score).toBeLessThanOrEqual(DETECTION_RULE_BUNDLE.scoreCap);
  }
}

const corpusMessage = (id: string) => {
  const testCase = DETECTION_CORPUS.find((candidate) => candidate.id === id);
  if (!testCase) throw new Error(`Missing corpus case ${id}`);
  return testCase.message;
};

describe('Safe always scores 0', () => {
  // The neutral click/urgency rules retain context without scoring ordinary language.
  it.each([
    ['benign-click-language', 'link-or-reply-pressure'],
    ['benign-limited-promo', 'urgency-pressure'],
  ])('%s keeps the reason without adding risk points', (id, code) => {
    const raw = evaluateRules(corpusMessage(id));
    expect(raw.level).toBe('safe');
    expect(raw.score).toBe(0);
    expect(raw.reasons.map((reason) => [reason.code, reason.weight])).toEqual([[code, 0]]);

    expect(evaluateThreat(corpusMessage(id))).toEqual(raw);
    expect(finalizeThreatResult(raw)).toEqual(raw);
    // Finalizing never mutates the raw result it was given.
    expect(raw.score).toBe(0);
    expect(raw.reasons[0].weight).toBe(0);
  });

  it.each(DETECTION_CORPUS)('$id: evaluateThreat is the finalized raw result', (testCase) => {
    const raw = evaluateRules(testCase.message);
    const result = evaluateThreat(testCase.message);
    expect(result).toEqual(finalizeThreatResult(raw));
    expect(result.level).toBe(raw.level);
    expect(result.reasons.map((reason) => reason.code)).toEqual(raw.reasons.map((reason) => reason.code));
    expect(finalizeThreatResult(result)).toEqual(result);
    if (raw.level !== 'safe') expect(finalizeThreatResult(raw)).toBe(raw);
  });

  it('zeroes a legacy Safe result and leaves other levels untouched', () => {
    const reason = { code: 'urgency-pressure', label: 'Urgency', description: 'Pressure', weight: 18 };
    const legacySafe: ThreatResult = { level: 'safe', score: 18, reasons: [reason], urls: [], ruleVersion: 'v' };
    const once = finalizeThreatResult(legacySafe);
    expect(once).toEqual({ ...legacySafe, score: 0, reasons: [{ ...reason, weight: 0 }] });
    expect(finalizeThreatResult(once)).toEqual(once);

    const suspicious: ThreatResult = { ...legacySafe, level: 'suspicious', score: 30 };
    expect(finalizeThreatResult(suspicious)).toBe(suspicious);
  });

  it.each([
    [0, 0],
    [1, 1],
    [29, 29],
    [59, 59],
    [30, 30],
    [60, 60],
    [100, 100],
  ])('finalizeRiskScore(%i) is %i', (score, expected) => {
    expect(finalizeRiskScore(score)).toBe(expected);
  });

  it.each([1, 29])('finalizeRiskScore(%i, legacy rule set) is 0', (score) => {
    expect(finalizeRiskScore(score, '2026.10.25')).toBe(0);
  });
});

/** Rule set 2026.09.29: common Philippine scam families that 2026.09.10 scored Safe. */
const PHILIPPINE_SCAM_REGRESSIONS = [
  'Hi Ma, nasira phone ko at ito ang bago kong number. Kailangan ko ng PHP 15,000 ngayon; send mo sa GCash na ito.',
  'Hello Ma, new number ko ito. Nawala phone ko. Pasend naman ng PHP 3,000 sa GCash ko ngayon, emergency lang.',
  "Boss, changed bank account po. Please send today's company payment to the attached personal account immediately.",
  'Sir, this is your manager. I need you to buy 5 gift cards for a client now. Send me the codes.',
  'Your parcel could not be delivered. Pay the PHP 17 redelivery charge at https://post-delivery.example/track.',
  'LBC: May kulang na delivery fee na PHP 25. Magbayad ngayon sa https://lbc-fee.example para hindi ibalik ang parcel.',
  'CONGRATS! You won PHP 75,000 from GCash anniversary promo. Pay the PHP 250 processing fee to claim: https://gcash-promo.example',
  'Congratulations! Your number won P50,000. To claim, send your full name, bank account number and PIN within 24 hours.',
  'May trabaho ka na! Earn PHP 5,000 daily by liking products. Deposit PHP 300 to activate your task account.',
  'Online loan approved kahit hindi ka nag-apply. I-click ang https://instant-loan.example at magbayad ng insurance fee.',
  'BPI: Unusual login detected on your account. Confirm it was you by sending your password and OTP immediately.',
  'HR recruitment: You are hired without an interview. Submit your ID and online banking password to receive your salary.',
  'Your account passed initial verification. To finish, send a photo of your card showing the number and security code.',
  'PhilHealth refund: May ibabalik na PHP 6,400 sa iyo. I-verify ang ATM card sa https://philhealth-refund.example.',
  'Na-suspend ang GCash wallet mo. I-verify ngayon sa http://gcash-ph.xyz para hindi ma-lock ang account.',
  'Meralco disconnection notice: Putol ang kuryente mo mamayang 6 PM unless you pay at https://meralco-bill.example.',
  'May maling padala akong PHP 2,000 sa iyo. Ibalik gamit ang refund link na https://wallet-return.example.',
  'URGENT: Your Maya account is locked. Send your OTP code now to verify your identity or your account will be permanently closed within 1 hour.',
] as const;

/** Ordinary messages that share words with those scams and must stay Safe. */
const PHILIPPINE_LEGITIMATE_LOOKALIKES = [
  'Ma, ito na bago kong number. Save mo ha, kita tayo mamaya sa bahay.',
  'Pa, pwede mo ba akong padalhan ng pera pang-tuition? Salamat po.',
  'Pls send me your bank account number so I can pay you back for lunch.',
  'Hi! Your Shopee order #2839 has been shipped. Track it in the Shopee app.',
  'Globe: Enjoy FREE 1GB data when you register to GoSURF50 today! Dial *143#.',
  'Meralco: Your bill of PHP 2,345.60 is due on Oct 5. Pay via the Meralco app or payment centers.',
  'Your Home Credit loan payment of PHP 1,500 is due tomorrow. Pay at any partner outlet.',
  'Won P500 sa raffle ng barangay! Libre ko kayo mamaya haha',
  'Smart: Your SIM registration is complete. Thank you!',
  'Please pay the registration fee at the school cashier before Friday.',
  'Meeting at 3pm tomorrow, bring the 2nd draft and 100gb flash drive.',
  'Never share your OTP or MPIN with anyone. GCash will never ask for it.',
  'All sounds good. Fingers . Makes it difficult to type',
] as const;

describe('Philippine scam families (rule set 2026.09.29)', () => {
  it.each(PHILIPPINE_SCAM_REGRESSIONS)('warns: %s', (message) => {
    expect(evaluateThreat(message).level).not.toBe('safe');
  });
  it.each(PHILIPPINE_LEGITIMATE_LOOKALIKES)('safe with no warning signs: %s', (message) => {
    const result = evaluateThreat(message);
    expect(result.level).toBe('safe');
    expect(result.score).toBe(0);
    expect(result.reasons).toEqual([]);
  });
});
