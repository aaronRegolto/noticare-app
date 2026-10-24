import type { Session } from '@supabase/auth-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  isSupabaseConfigured,
  onAuthStateChange,
  restoreSession,
  signInWithPhone,
  signOut,
  verifyOtp,
} from '@/src/services/supabase';
import { clearCurrentDeviceRegistration } from '@/src/services/eventSync';
import { isNativeMonitoringAvailable, setHistoryOwner } from '@/src/services/notificationListener';
import { logError } from '@/src/services/logger';
import {
  clearDevelopmentPhoneSession,
  createDevelopmentPhoneSession,
  isDevelopmentPhoneLoginEnabled,
  restoreDevelopmentPhoneSession,
} from '@/src/services/developmentPhoneAuth';

type AuthSession = {
  user: {
    id: string;
    phone?: string;
  };
  source: 'supabase' | 'development';
};

type PhoneSignInResult = 'otp_sent' | 'development_signed_in';

type AuthContextType = {
  session: AuthSession | null;
  loading: boolean;
  pendingPhone: string;
  configured: boolean;
  isDevelopmentPhoneLogin: boolean;
  requestOtp: (phone: string) => Promise<PhoneSignInResult>;
  verifyOtp: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function toAuthSession(session: Session): AuthSession {
  return {
    user: { id: session.user.id, phone: session.user.phone },
    source: 'supabase',
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingPhone, setPendingPhone] = useState('');

  useEffect(() => {
    let active = true;
    if (isDevelopmentPhoneLoginEnabled) {
      restoreDevelopmentPhoneSession()
        .then((restored) => {
          if (!active) return;
          setSession(restored ? { user: { id: restored.userId, phone: restored.phone }, source: 'development' } : null);
        })
        .catch(() => active && setSession(null))
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }

    restoreSession()
      .then((restored) => active && setSession(restored ? toAuthSession(restored) : null))
      .catch(() => active && setSession(null))
      .finally(() => active && setLoading(false));

    const { data } = onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession ? toAuthSession(nextSession) : null);
        if (nextSession) setPendingPhone('');
        setLoading(false);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (loading || !isNativeMonitoringAvailable()) return;
    // History is profile-scoped on shared devices. Native hashes the ID before
    // storage; null also clears the scope and turns real-time scanning off.
    void setHistoryOwner(session?.user.id ?? null).catch((error) => {
      logError('history-owner-sync-failed', error);
    });
  }, [loading, session?.user.id]);

  const requestOtp = useCallback(async (phone: string) => {
    if (isDevelopmentPhoneLoginEnabled) {
      const developmentSession = await createDevelopmentPhoneSession(phone);
      setSession({ user: { id: developmentSession.userId, phone: developmentSession.phone }, source: 'development' });
      setPendingPhone('');
      return 'development_signed_in' as const;
    }
    await signInWithPhone(phone);
    setPendingPhone(phone);
    return 'otp_sent' as const;
  }, []);

  const confirmOtp = useCallback(
    async (token: string) => {
      if (isDevelopmentPhoneLoginEnabled) {
        throw new Error('Development phone sign-in does not use an OTP.');
      }
      if (!pendingPhone) throw new Error('Enter your phone number again before verifying the code.');
      await verifyOtp(pendingPhone, token);
    },
    [pendingPhone],
  );

  const signOutCurrentUser = useCallback(async () => {
    if (isNativeMonitoringAvailable()) {
      await setHistoryOwner(null).catch((error) => logError('history-owner-clear-failed', error));
    }
    if (session?.source === 'development') {
      await clearDevelopmentPhoneSession();
      setSession(null);
      setPendingPhone('');
      return;
    }
    // Device registrations are user-scoped. Remove this cached mapping before
    // ending the session so another account on the same install re-registers.
    await clearCurrentDeviceRegistration().catch(() => undefined);
    await signOut();
    setPendingPhone('');
  }, [session?.source]);

  const value = useMemo(
    () => ({
      session,
      loading,
      pendingPhone,
      configured: isSupabaseConfigured || isDevelopmentPhoneLoginEnabled,
      isDevelopmentPhoneLogin: isDevelopmentPhoneLoginEnabled,
      requestOtp,
      verifyOtp: confirmOtp,
      signOut: signOutCurrentUser,
    }),
    [session, loading, pendingPhone, requestOtp, confirmOtp, signOutCurrentUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
