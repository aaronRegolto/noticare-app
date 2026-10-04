export { evaluateThreat, finalizeRiskScore, finalizeThreatResult, getThreatLevel } from './evaluator';
export { normalizeCharacterSubstitutions, normalizeMessage } from './normalize';
export { DETECTION_RULE_BUNDLE } from './rules';
export { extractUrlEvidence } from './urls';
export type {
  BrandRule,
  CombinationRule,
  DetectedUrl,
  DetectionRuleBundle,
  NormalizedMessage,
  TextRule,
  ThreatLevel,
  ThreatReason,
  ThreatResult,
  UrlEvidence,
  UrlIndicatorRule,
} from './types';
