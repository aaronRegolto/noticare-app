import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';

/** How long a user can go without opening the app before the guided tour plays again. */
const REPLAY_AFTER_MS = 5 * 24 * 60 * 60 * 1000;

/**
 * Tracks whether a given guided-tour key was shown recently, backed by
 * AsyncStorage. It plays on first install, then automatically replays once
 * the user has gone `REPLAY_AFTER_MS` without opening the app, as a refresher
 * rather than a one-time thing. Call `checkNow()` from a focus effect (tours
 * should only appear once their screen is on-screen and its target elements
 * are laid out).
 */
export function useFirstVisitTour(storageKey: string) {
  const [visible, setVisible] = useState(false);

  const checkNow = useCallback(() => {
    void AsyncStorage.getItem(storageKey).then((raw) => {
      const lastSeenAt = raw ? Number(raw) : null;
      if (!lastSeenAt || Date.now() - lastSeenAt >= REPLAY_AFTER_MS) setVisible(true);
    });
  }, [storageKey]);

  const dismiss = useCallback(() => {
    setVisible(false);
    void AsyncStorage.setItem(storageKey, String(Date.now()));
  }, [storageKey]);

  return { visible, checkNow, dismiss };
}

export const DASHBOARD_TOUR_KEY = 'noticare.tour.dashboard.v1';
