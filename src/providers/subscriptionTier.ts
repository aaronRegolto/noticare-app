import type { SubscriptionTier } from '@/src/services/notificationListener';

/**
 * QRPh has no recurring/subscription concept, so a Pro grant is a fixed term:
 * plan='pro' only counts while pro_expires_at (if set) is still in the future.
 * A null expiry is treated as still active (defensive default; every grant
 * path always sets one in practice).
 */
export function computeTier(plan: unknown, proExpiresAt: unknown): SubscriptionTier {
  if (plan !== 'pro') return 'free';
  if (typeof proExpiresAt !== 'string') return 'pro';
  return new Date(proExpiresAt).getTime() > Date.now() ? 'pro' : 'free';
}
