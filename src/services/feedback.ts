import type { ThreatLevel, ThreatResult } from '@/src/features/detection';
import { submitScanFeedback } from '@/src/services/eventSync';

/**
 * Sends only the user's expected classification and stable indicator codes.
 * It intentionally has no field for an SMS body, sender, notification title,
 * or URL, so those values cannot accidentally be uploaded as feedback.
 */
export async function sendScanFeedback(expectedLevel: ThreatLevel, result: ThreatResult, eventId?: string | null) {
  return submitScanFeedback(expectedLevel, result, eventId ?? null);
}
