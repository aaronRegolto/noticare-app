import { evaluateThreat, type ThreatResult } from '@/src/features/detection';

/** @deprecated Use `evaluateThreat` from `src/features/detection` directly. */
export type ThreatCategory = 'High Threat' | 'Low Threat' | 'Safe';

/**
 * Compatibility adapter for older imports. Real-time Android scans use the
 * native rule evaluator plus the advisory V3 LiteRT model.
 */
export async function initializeTfjs() {}

/** @deprecated Model lifecycle is owned by the Android native scanner. */
export async function loadTFLiteModel() {
  return null;
}

export async function classifySmsText(
  text: string,
): Promise<{ category: ThreatCategory; score: number; result: ThreatResult }> {
  const result = evaluateThreat(text);
  return {
    category: result.level === 'dangerous' ? 'High Threat' : result.level === 'suspicious' ? 'Low Threat' : 'Safe',
    score: result.score / 100,
    result,
  };
}
