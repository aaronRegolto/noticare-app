import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/src/providers/AuthProvider';
import { computeTier } from '@/src/providers/subscriptionTier';
import { logError } from '@/src/services/logger';
import { isNativeMonitoringAvailable, setSubscriptionTier, type SubscriptionTier } from '@/src/services/notificationListener';
import {
  checkPayment,
  createQrphPayment,
  type BillingInterval,
  type CheckPaymentResult,
  type QrphPayment,
} from '@/src/services/paymongo';
import { isSupabaseConfigured, supabase } from '@/src/services/supabase';

export type { BillingInterval };

type SubscriptionContextType = {
  tier: SubscriptionTier;
  loading: boolean;
  proExpiresAt: string | null;
  startQrphPayment: (interval: BillingInterval) => Promise<QrphPayment>;
  checkPaymentNow: (paymentIntentId: string) => Promise<CheckPaymentResult>;
};

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

type ProfilePlanRow = { plan: string | null; pro_expires_at: string | null };

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const [row, setRow] = useState<ProfilePlanRow>({ plan: null, pro_expires_at: null });
  const [loading, setLoading] = useState(true);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (authLoading) return;
    if (!isSupabaseConfigured || !userId) {
      setRow({ plan: null, pro_expires_at: null });
      setLoading(false);
      return;
    }

    let active = true;
    void supabase
      .from('profiles')
      .select('plan, pro_expires_at')
      .eq('user_id', userId)
      .single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) logError('subscription-plan-fetch-failed', error);
        setRow(data ?? { plan: null, pro_expires_at: null });
        setLoading(false);
      });

    // Reacts instantly once paymongo-webhook (or the check-payment fallback)
    // grants Pro after a successful QRPh payment, instead of polling.
    const channel = supabase
      .channel(`profiles-plan-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `user_id=eq.${userId}` },
        (payload) => {
          const next = payload.new as ProfilePlanRow;
          setRow({ plan: next.plan, pro_expires_at: next.pro_expires_at });
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [authLoading, userId]);

  const tier = useMemo(() => computeTier(row.plan, row.pro_expires_at), [row]);

  useEffect(() => {
    if (loading || !isNativeMonitoringAvailable()) return;
    void setSubscriptionTier(tier).catch((error) => {
      logError('subscription-tier-sync-failed', error);
    });
  }, [loading, tier]);

  const startQrphPayment = useCallback((interval: BillingInterval) => createQrphPayment(interval), []);

  const checkPaymentNow = useCallback(async (paymentIntentId: string) => {
    const result = await checkPayment(paymentIntentId);
    if (result.status === 'succeeded' && userId) {
      // The function already wrote profiles.plan; refresh locally in case the
      // realtime event hasn't arrived yet.
      const { data } = await supabase.from('profiles').select('plan, pro_expires_at').eq('user_id', userId).single();
      if (data) setRow(data);
    }
    return result;
  }, [userId]);

  const value = useMemo(
    () => ({ tier, loading, proExpiresAt: row.pro_expires_at, startQrphPayment, checkPaymentNow }),
    [tier, loading, row.pro_expires_at, startQrphPayment, checkPaymentNow],
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) throw new Error('useSubscription must be used within SubscriptionProvider');
  return context;
}
