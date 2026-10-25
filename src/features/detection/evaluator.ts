import { normalizeMessage } from './normalize';
import { DETECTION_RULE_BUNDLE } from './rules';
import type { CombinationRule, TextRule, ThreatLevel, ThreatReason, ThreatResult, UrlIndicatorRule } from './types';
import { extractUrlEvidence } from './urls';

type MatchedTextRule = {
  rule: TextRule;
  firstIndex: number;
};

const BAIT_SIGNALS = new Set([
  'prize-or-reward-bait',
  'refund-bait',
  'parcel-delivery-bait',
  'unpaid-bill-pressure',
  'government-aid-impersonation',
  'advance-fee-request',
]);

const URL_CONTEXT_SIGNALS = new Set([
  'credential-request',
  'account-warning',
  'prize-or-reward-bait',
  'high-value-bonus-offer',
  'refund-bait',
  'parcel-delivery-bait',
  'unpaid-bill-pressure',
  'government-aid-impersonation',
  'access-loss-threat',
  'money-transfer-request',
  'advance-fee-request',
]);

/**
 * Evaluates one SMS completely offline. It is deterministic, bounded, and never performs
 * a network request. The returned reason codes can be safely aggregated without raw text.
 * This is the public result: a Safe message always scores 0 (see finalizeThreatResult).
 */
export function evaluateThreat(message: string): ThreatResult {
  return finalizeThreatResult(evaluateRules(message));
}

/**
 * The raw rule result, before finalizing. It mirrors Kotlin SmishingEvaluator.evaluate and is what
 * the parity test hashes. Never show, store, or send it; use evaluateThreat instead.
 */
export function evaluateRules(message: string): ThreatResult {
  const normalized = normalizeMessage(message);
  const matches = collectTextRuleMatches(normalized.comparable);
  const urls = extractUrlEvidence(normalized.normalized);
  const reasons: ThreatReason[] = [];
  const addedCodes = new Set<string>();
  const signals = new Set<string>();

  const addReason = (rule: Pick<ThreatReason, 'code' | 'label' | 'description' | 'weight'>) => {
    if (addedCodes.has(rule.code)) return;
    addedCodes.add(rule.code);
    reasons.push({ ...rule });
  };

  for (const match of matches) {
    addReason(match.rule);
    for (const signal of match.rule.signals) signals.add(signal);
  }

  if (
    normalized.hadZeroWidthCharacters ||
    normalized.hadUnexpectedControlCharacters ||
    normalized.hadCharacterSubstitutions
  ) {
    addReason(DETECTION_RULE_BUNDLE.normalizationRules.obfuscatedText);
    signals.add('obfuscated-text');
  }

  for (const url of urls) {
    for (const indicator of url.indicators) {
      const rule = DETECTION_RULE_BUNDLE.urlRules.find((candidate) => candidate.code === indicator);
      if (rule) addReason(rule);
    }
  }
  if (urls.length > 0) signals.add('url');

  if (urls.length > 0 && hasAnySignal(signals, URL_CONTEXT_SIGNALS)) {
    addReason(DETECTION_RULE_BUNDLE.urlContextRule);
    signals.add('url-sensitive-context');
  }

  if (
    hasBrandWithUnrelatedUrl(
      normalized.comparable,
      urls.map((url) => url.normalizedDomain),
    )
  ) {
    addReason(DETECTION_RULE_BUNDLE.brandUnrelatedUrlRule);
    signals.add('brand-unrelated-url');
  }

  if (hasAnySignal(signals, BAIT_SIGNALS)) signals.add('bait');
  for (const combination of DETECTION_RULE_BUNDLE.combinationRules) {
    if (combination.requiresAll.every((signal) => signals.has(signal))) {
      addReason(combination);
    }
  }

  const score = Math.min(
    DETECTION_RULE_BUNDLE.scoreCap,
    reasons.reduce((total, reason) => total + reason.weight, 0),
  );

  return {
    level: getThreatLevel(score),
    score,
    reasons,
    urls: urls.map(({ display, normalizedDomain, indicators }) => ({ display, normalizedDomain, indicators })),
    ruleVersion: DETECTION_RULE_BUNDLE.version,
  };
}

export function getThreatLevel(score: number): ThreatLevel {
  if (score >= DETECTION_RULE_BUNDLE.thresholds.dangerous) return 'dangerous';
  if (score >= DETECTION_RULE_BUNDLE.thresholds.suspicious) return 'suspicious';
  return 'safe';
}

/**
 * Safe always shows 0. The level is already decided from the raw score; a Safe result then keeps
 * its reason codes, labels, and descriptions (anonymous telemetry uses the codes for rule tuning),
 * but every weight becomes 0 so the points still add up to the score. Other levels are returned
 * unchanged. Idempotent, so it also normalizes Safe results stored or queued by older builds.
 */
export function finalizeThreatResult<T extends ThreatResult>(result: T): T {
  if (result.level !== 'safe') return result;
  return { ...result, score: 0, reasons: result.reasons.map((reason) => ({ ...reason, weight: 0 })) };
}

/**
 * For a score stored without its level, such as a community report. Legacy scores below 30 were
 * Safe under earlier rule sets; preserve all scores from the current 1–59 Suspicious band.
 */
export function finalizeRiskScore(score: number, ruleVersion = DETECTION_RULE_BUNDLE.version): number {
  if (ruleVersion < DETECTION_RULE_BUNDLE.version && score > 0 && score < 30) return 0;
  return getThreatLevel(score) === 'safe' ? 0 : score;
}

function collectTextRuleMatches(text: string): MatchedTextRule[] {
  const matches: MatchedTextRule[] = [];
  for (const rule of DETECTION_RULE_BUNDLE.textRules) {
    let firstIndex = -1;
    for (const pattern of rule.patterns) {
      const expression = new RegExp(pattern, 'giu');
      for (const match of text.matchAll(expression)) {
        const index = match.index ?? 0;
        if (rule.ignoreWhenPrecededBySafetyAdvice && hasSafetyAdviceBefore(text, index)) continue;
        firstIndex = index;
        break;
      }
      if (firstIndex >= 0) break;
    }
    if (firstIndex >= 0) matches.push({ rule, firstIndex });
  }
  return matches.sort((left, right) => left.firstIndex - right.firstIndex);
}

function hasSafetyAdviceBefore(text: string, matchIndex: number): boolean {
  const prefix = text.slice(Math.max(0, matchIndex - 36), matchIndex);
  return /(?:do\s+not|don't|never|huwag(?:\s+mong)?|wag(?:\s+mong)?)\s*$/i.test(prefix);
}

function hasBrandWithUnrelatedUrl(text: string, domains: (string | null)[]): boolean {
  const usableDomains = domains.filter((domain): domain is string => Boolean(domain));
  if (usableDomains.length === 0) return false;

  return DETECTION_RULE_BUNDLE.brands.some((brand) => {
    const mentioned = brand.names.some((name) =>
      new RegExp(`(?:^|[^a-z0-9])${escapeForRegex(name)}(?:$|[^a-z0-9])`, 'i').test(text),
    );
    if (!mentioned) return false;
    return usableDomains.some(
      (domain) =>
        !brand.officialDomains.some(
          (officialDomain) => domain === officialDomain || domain.endsWith(`.${officialDomain}`),
        ),
    );
  });
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasAnySignal(signals: Set<string>, candidates: Set<string>): boolean {
  for (const candidate of candidates) {
    if (signals.has(candidate)) return true;
  }
  return false;
}

// Retain this export for Kotlin-parity harnesses that need to exercise a bundle rule.
export type { CombinationRule, UrlIndicatorRule };
