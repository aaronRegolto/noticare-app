import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { type AppRelease, type InstalledVersion, pendingUpdate } from '@/src/features/app-update/release';
import { fetchLatestRelease, installedVersion } from '@/src/services/appUpdate';
import { logError } from '@/src/services/logger';

/** Re-check when the app returns to the foreground, at most this often. */
const RECHECK_INTERVAL_MS = 60 * 60 * 1000;

export type UpdateCheckResult = 'available' | 'current' | 'failed';

type AppUpdateContextType = {
  installed: InstalledVersion;
  /** A newer published release, or null. */
  update: AppRelease | null;
  promptVisible: boolean;
  checking: boolean;
  checkNow: () => Promise<UpdateCheckResult>;
  showPrompt: () => void;
  /** "Later": hides an optional update until the app is next opened. Required updates stay. */
  dismiss: () => void;
};

const AppUpdateContext = createContext<AppUpdateContextType | undefined>(undefined);

export function AppUpdateProvider({ children }: { children: React.ReactNode }) {
  const installed = useMemo(installedVersion, []);
  const [update, setUpdate] = useState<AppRelease | null>(null);
  const [dismissedCode, setDismissedCode] = useState<number | null>(null);
  const [forcedOpen, setForcedOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const lastCheck = useRef(0);

  const checkNow = useCallback(async (): Promise<UpdateCheckResult> => {
    if (installed.code === null) return 'current';
    lastCheck.current = Date.now();
    setChecking(true);
    try {
      const next = pendingUpdate(installed, await fetchLatestRelease());
      setUpdate(next);
      return next ? 'available' : 'current';
    } catch (error) {
      logError('app-update-check-failed', error);
      return 'failed';
    } finally {
      setChecking(false);
    }
  }, [installed]);

  useEffect(() => {
    void checkNow();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastCheck.current > RECHECK_INTERVAL_MS) void checkNow();
    });
    return () => subscription.remove();
  }, [checkNow]);

  const showPrompt = useCallback(() => setForcedOpen(true), []);
  const dismiss = useCallback(() => {
    setForcedOpen(false);
    if (update && !update.required) setDismissedCode(update.versionCode);
  }, [update]);

  const promptVisible = Boolean(update && (update.required || forcedOpen || dismissedCode !== update.versionCode));

  const value = useMemo(
    () => ({ installed, update, promptVisible, checking, checkNow, showPrompt, dismiss }),
    [installed, update, promptVisible, checking, checkNow, showPrompt, dismiss],
  );
  return <AppUpdateContext.Provider value={value}>{children}</AppUpdateContext.Provider>;
}

export function useAppUpdate() {
  const context = useContext(AppUpdateContext);
  if (!context) throw new Error('useAppUpdate must be used within AppUpdateProvider');
  return context;
}
