import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/src/providers/AuthProvider';
import { flushNativeTelemetry, flushQueuedThreatEvents } from '@/src/services/eventSync';
import { logError } from '@/src/services/logger';

/** Retry queued metadata while the authenticated app is in the foreground. */
export function EventSync() {
  const { session } = useAuth();
  useEffect(() => {
    if (session?.source !== 'supabase') return;
    let running = false;
    const sync = async () => {
      if (running || AppState.currentState !== 'active') return;
      running = true;
      try {
        await Promise.all([flushQueuedThreatEvents(), flushNativeTelemetry()]);
      } catch (error) {
        logError('foreground-sync-failed', error);
      } finally {
        running = false;
      }
    };
    void sync();
    const timer = setInterval(() => {
      void sync();
    }, 30000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [session?.source, session?.user.id]);
  return null;
}
