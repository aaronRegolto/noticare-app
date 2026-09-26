import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { buildTheme, DEFAULT_ACCENT, type AccentId, type ThemeColors, type ThemeMode } from '@/src/theme/palette';

const MODE_KEY = 'noticare.theme.mode.v1';
const ACCENT_KEY = 'noticare.theme.accent.v1';

type ThemeContextType = {
  mode: ThemeMode;
  accent: AccentId;
  scheme: 'light' | 'dark';
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: AccentId) => void;
  loaded: boolean;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [accent, setAccentState] = useState<AccentId>(DEFAULT_ACCENT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.multiGet([MODE_KEY, ACCENT_KEY]).then((pairs) => {
      if (cancelled) return;
      const storedMode = pairs.find(([key]) => key === MODE_KEY)?.[1];
      const storedAccent = pairs.find(([key]) => key === ACCENT_KEY)?.[1];
      if (storedMode === 'light' || storedMode === 'dark' || storedMode === 'system') setModeState(storedMode);
      if (storedAccent) setAccentState(storedAccent as AccentId);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(MODE_KEY, next);
  }, []);

  const setAccent = useCallback((next: AccentId) => {
    setAccentState(next);
    void AsyncStorage.setItem(ACCENT_KEY, next);
  }, []);

  const scheme: 'light' | 'dark' = mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
  const colors = useMemo(() => buildTheme(scheme, accent), [scheme, accent]);

  const value = useMemo(
    () => ({ mode, accent, scheme, colors, setMode, setAccent, loaded }),
    [mode, accent, scheme, colors, setMode, setAccent, loaded],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useAppTheme must be used within AppThemeProvider');
  return context;
}
