import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { isTutorialDue, TUTORIAL_REPEAT_INTERVAL_MS } from '@/src/providers/onboarding-schedule';

const LEGACY_ONBOARDING_KEY = 'noticare.onboarding.complete.v1';
const NEXT_TUTORIAL_AT_KEY = 'noticare.onboarding.next-tutorial-at.v2';

type OnboardingContextType = {
  complete: boolean;
  loading: boolean;
  finish: () => Promise<void>;
  restart: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [complete, setComplete] = useState(false);
  const [nextTutorialAt, setNextTutorialAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const storedNextTutorialAt = await AsyncStorage.getItem(NEXT_TUTORIAL_AT_KEY);
      const parsedNextTutorialAt = Number(storedNextTutorialAt);
      const validNextTutorialAt = Number.isFinite(parsedNextTutorialAt) ? parsedNextTutorialAt : null;
      setNextTutorialAt(validNextTutorialAt);
      setComplete(!isTutorialDue(storedNextTutorialAt));
    } catch {
      // If the schedule cannot be read, showing the tutorial is the safer fallback.
      setComplete(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });

    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    if (!complete) return;

    const delay = nextTutorialAt ? Math.max(0, nextTutorialAt - Date.now()) : TUTORIAL_REPEAT_INTERVAL_MS;
    const timer = setTimeout(() => {
      void refresh();
    }, delay);

    return () => clearTimeout(timer);
  }, [complete, nextTutorialAt, refresh]);

  const finish = useCallback(async () => {
    const nextTutorialAt = Date.now() + TUTORIAL_REPEAT_INTERVAL_MS;
    await AsyncStorage.multiSet([
      [NEXT_TUTORIAL_AT_KEY, String(nextTutorialAt)],
      [LEGACY_ONBOARDING_KEY, 'true'],
    ]);
    setNextTutorialAt(nextTutorialAt);
    setComplete(true);
  }, []);

  const restart = useCallback(async () => {
    await AsyncStorage.multiRemove([NEXT_TUTORIAL_AT_KEY, LEGACY_ONBOARDING_KEY]);
    setNextTutorialAt(null);
    setComplete(false);
  }, []);

  const value = useMemo(() => ({ complete, loading, finish, restart }), [complete, loading, finish, restart]);
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error('useOnboarding must be used within OnboardingProvider');
  return context;
}
