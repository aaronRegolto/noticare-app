/**
 * The public result deliberately contains no copy of the scanned SMS.  Callers may
 * keep the original text for local display, but it must not be included in telemetry.
 */
export type ThreatLevel = 'safe' | 'suspicious' | 'dangerous';

export type ThreatReason = {
  code: string;
  label: string;
  description: string;
  weight: number;
};

export type DetectedUrl = {
  /** The text as it appeared in the SMS. Treat as display-only; never open it. */
  display: string;
  /** A lowercase hostname suitable for local comparison, or null when parsing failed. */
  normalizedDomain: string | null;
  /** Stable, privacy-safe indicator codes that explain why this URL was flagged. */
  indicators: string[];
};

export type ThreatResult = {
  level: ThreatLevel;
  /** 0 whenever level is safe; Suspicious scores are 1–59 and Dangerous scores are 60–100. */
  score: number;
  reasons: ThreatReason[];
  urls: DetectedUrl[];
  ruleVersion: string;
};

export type NormalizedMessage = {
  /** Original input is preserved only for the local caller; the evaluator does not return it. */
  original: string;
  normalized: string;
  comparable: string;
  hadZeroWidthCharacters: boolean;
  hadUnexpectedControlCharacters: boolean;
  hadExcessiveWhitespace: boolean;
  hadRepeatedPunctuation: boolean;
  hadCharacterSubstitutions: boolean;
  wasTruncated: boolean;
};

export type TextRule = {
  code: string;
  label: string;
  description: string;
  weight: number;
  /** Regex source strings, not RegExp instances, so the bundle can be mirrored natively. */
  patterns: readonly string[];
  signals: readonly string[];
  /** Safety messages such as “Do not share your OTP” must not trip request rules. */
  ignoreWhenPrecededBySafetyAdvice?: boolean;
};

export type UrlIndicatorRule = {
  code: string;
  label: string;
  description: string;
  weight: number;
};

export type CombinationRule = {
  code: string;
  label: string;
  description: string;
  weight: number;
  requiresAll: readonly string[];
};

export type BrandRule = {
  code: string;
  names: readonly string[];
  /** Domain suffixes used only to avoid claiming a known official domain is unrelated. */
  officialDomains: readonly string[];
};

export type DetectionRuleBundle = {
  version: string;
  scoreCap: number;
  thresholds: {
    suspicious: number;
    dangerous: number;
  };
  maxInputCharacters: number;
  textRules: readonly TextRule[];
  normalizationRules: {
    obfuscatedText: UrlIndicatorRule;
  };
  urlRules: readonly UrlIndicatorRule[];
  urlContextRule: UrlIndicatorRule;
  brandUnrelatedUrlRule: UrlIndicatorRule;
  combinationRules: readonly CombinationRule[];
  brands: readonly BrandRule[];
  shortenerDomains: readonly string[];
};

export type UrlEvidence = DetectedUrl & {
  /** Kept internal to local evaluation; it is never returned to analytics. */
  host: string | null;
  path: string;
  query: string;
};
