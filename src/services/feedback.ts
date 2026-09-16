import type { ThreatLevel, ThreatResult } from '@/src/features/detection';
import { submitScanFeedback } from '@/src/services/eventSync';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { isDevelopmentPhoneLoginEnabled, restoreDevelopmentPhoneSession } from '@/src/services/developmentPhoneAuth';

/**
 * Sends only the user's expected classification and stable indicator codes.
 * It intentionally has no field for an SMS body, sender, notification title,
 * or URL, so those values cannot accidentally be uploaded as feedback.
 */
export async function sendScanFeedback(expectedLevel: ThreatLevel, result: ThreatResult, eventId?: string | null) {
  if (isDevelopmentPhoneLoginEnabled) {
    const session = await restoreDevelopmentPhoneSession();
    if (!session) throw new Error('Sign in before saving a report.');
    // Local test reports never enter an authenticated account's upload queue.
    const report = {
      expectedLevel,
      detectedLevel: result.level,
      indicatorCodes: result.reasons.map((reason) => reason.code).slice(0, 32),
      ruleVersion: result.ruleVersion,
      createdAt: new Date().toISOString(),
    };
    await SecureStore.setItemAsync(
      `noticare.local-report.${session.userId}.${Crypto.randomUUID()}`,
      JSON.stringify(report),
    );
    return 'saved_locally' as const;
  }
  await submitScanFeedback(expectedLevel, result, eventId ?? null);
  return 'sent' as const;
}
