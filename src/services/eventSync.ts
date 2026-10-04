import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

import type { ThreatLevel, ThreatResult } from '@/src/features/detection';
import type { Database } from '@/backend/supabase/types/database.types';
import { logError } from '@/src/services/logger';
import {
  ackTelemetry,
  getPendingTelemetry,
  isNativeMonitoringAvailable,
  type PendingTelemetryEvent,
} from '@/src/services/notificationListener';
import { isSupabaseConfigured, supabase } from '@/src/services/supabase';

const INSTALLATION_ID_KEY = 'noticare.installation-id.v1';
const DEVICE_ID_KEY_PREFIX = 'noticare.device-id.v1';
const EVENT_QUEUE_KEY = 'noticare.anonymous-event-queue.v1';
const MAX_QUEUED_EVENTS = 100;
let queueWork: Promise<unknown> = Promise.resolve();
function serializeQueue<T>(operation: () => Promise<T>): Promise<T> {
  const next = queueWork.then(operation, operation);
  queueWork = next.catch(() => undefined);
  return next;
}

type QueueEvent = {
  clientEventId: string;
  occurredAt: string;
  source: 'manual' | 'realtime';
  level: ThreatLevel;
  scoreBucket: number;
  blocked: boolean;
  indicatorCodes: string[];
  urlCount: number;
  ruleVersion: string;
  attempts: number;
};

function appVersion() {
  return Constants.expoConfig?.version ?? '0.0.0';
}

async function getOrCreateSecureId(key: string) {
  const existing = await SecureStore.getItemAsync(key);
  if (existing) return existing;
  const created = Crypto.randomUUID();
  await SecureStore.setItemAsync(key, created);
  return created;
}

async function readQueue(userId: string): Promise<QueueEvent[]> {
  const raw = await AsyncStorage.getItem(`${EVENT_QUEUE_KEY}.${userId}`);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
          .filter(isQueueEvent)
          .map((event) => ({ ...event, scoreBucket: scoreBucket(event.level, event.scoreBucket) }))
      : [];
  } catch {
    return [];
  }
}

function isQueueEvent(value: unknown): value is QueueEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.clientEventId === 'string' &&
    typeof event.occurredAt === 'string' &&
    (event.source === 'manual' || event.source === 'realtime') &&
    (event.level === 'safe' || event.level === 'suspicious' || event.level === 'dangerous') &&
    typeof event.scoreBucket === 'number' &&
    typeof event.blocked === 'boolean' &&
    Array.isArray(event.indicatorCodes) &&
    typeof event.urlCount === 'number' &&
    typeof event.ruleVersion === 'string' &&
    typeof event.attempts === 'number'
  );
}

async function writeQueue(queue: QueueEvent[], userId: string) {
  await AsyncStorage.setItem(`${EVENT_QUEUE_KEY}.${userId}`, JSON.stringify(queue.slice(-MAX_QUEUED_EVENTS)));
}

/** Creates an anonymized event. The caller passes no text, sender, title, or raw URL. */
export async function queueThreatEvent(
  result: ThreatResult,
  source: 'manual' | 'realtime',
  blocked: boolean,
): Promise<string> {
  const userId = await activeUserId();
  const event: QueueEvent = {
    clientEventId: Crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    source,
    level: result.level,
    scoreBucket: scoreBucket(result.level, result.score / 10),
    blocked,
    indicatorCodes: result.reasons.map((reason) => reason.code).slice(0, 32),
    urlCount: Math.min(result.urls.length, 20),
    ruleVersion: result.ruleVersion,
    attempts: 0,
  };
  await serializeQueue(async () => {
    const queue = await readQueue(userId);
    queue.push(event);
    await writeQueue(queue, userId);
  });
  return event.clientEventId;
}

export async function activeUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error('Sign in before syncing anonymous community metadata.');
  return userId;
}

function deviceKeyForUser(userId: string) {
  return `${DEVICE_ID_KEY_PREFIX}.${userId}`;
}

export async function registerDevice(ruleVersion: string): Promise<string> {
  const userId = await activeUserId();
  const deviceKey = deviceKeyForUser(userId);
  const cachedDeviceId = await SecureStore.getItemAsync(deviceKey);
  if (cachedDeviceId) return cachedDeviceId;
  const installationId = await getOrCreateSecureId(INSTALLATION_ID_KEY);
  const { data, error } = await supabase.rpc('register_device', {
    p_installation_id: installationId,
    p_app_version: appVersion(),
    p_rule_version: ruleVersion,
  });
  if (error) throw error;
  await SecureStore.setItemAsync(deviceKey, data.id);
  return data.id;
}

/** Removes only this signed-in user's cached device registration on sign-out. */
export async function clearCurrentDeviceRegistration() {
  if (!isSupabaseConfigured) return;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (userId) await SecureStore.deleteItemAsync(deviceKeyForUser(userId));
}

/**
 * Flushes the durable anonymous queue after authentication. Retrying uses the
 * same client UUID, and the database RPC is idempotent. Raw message material is
 * intentionally unavailable to this function.
 */
export async function flushQueuedThreatEvents() {
  return serializeQueue(flushUserQueue);
}
async function flushUserQueue() {
  if (!isSupabaseConfigured) return { synced: 0, pending: 0 };
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { synced: 0, pending: 0 };
  const userId = sessionData.session.user.id;

  const queued = await readQueue(userId);
  const remaining: QueueEvent[] = [];
  let synced = 0;
  for (const event of queued) {
    try {
      if ((await activeUserId()) !== userId) throw new Error('Account changed during sync.');
      const deviceId = await registerDevice(event.ruleVersion);
      const { error } = await supabase.rpc('record_threat_event', {
        p_client_event_id: event.clientEventId,
        p_device_id: deviceId,
        p_source: event.source,
        p_threat_level: event.level as Database['public']['Enums']['threat_level'],
        p_score_bucket: event.scoreBucket,
        p_blocked: event.blocked,
        p_indicator_codes: event.indicatorCodes,
        p_url_count: event.urlCount,
        p_rule_version: event.ruleVersion,
        p_occurred_at: event.occurredAt,
      });
      if (error) throw error;
      synced += 1;
    } catch (error) {
      logError('anonymous-event-sync-failed', error);
      remaining.push({ ...event, attempts: event.attempts + 1 });
    }
  }
  await writeQueue(remaining, userId);
  return { synced, pending: remaining.length };
}

/**
 * Telemetry holds a coarse 0..10 bucket, never an exact score. Safe is always bucket 0, including
 * events an older build queued (in AsyncStorage or natively) with a Safe score's bucket of 1–2.
 */
function scoreBucket(level: ThreatLevel, value: number) {
  return level === 'safe' ? 0 : Math.max(0, Math.min(10, Math.trunc(value)));
}

/** Uploads only the native encrypted queue's sanitized realtime metadata. */
export async function flushNativeTelemetry() {
  if (!isSupabaseConfigured || !isNativeMonitoringAvailable()) return { synced: 0, pending: 0 };
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { synced: 0, pending: 0 };

  let pending: PendingTelemetryEvent[];
  try {
    pending = await getPendingTelemetry();
  } catch (error) {
    logError('native-telemetry-read-failed', error);
    return { synced: 0, pending: 0 };
  }

  const acknowledged: string[] = [];
  for (const event of pending) {
    try {
      const deviceId = await registerDevice(event.ruleVersion);
      const { error } = await supabase.rpc('record_threat_event', {
        p_client_event_id: event.id,
        p_device_id: deviceId,
        p_source: 'realtime',
        p_threat_level: event.level,
        p_score_bucket: scoreBucket(event.level, event.scoreBucket),
        p_blocked: event.blocked,
        p_indicator_codes: event.indicatorCodes.slice(0, 32),
        p_url_count: Math.min(event.urlCount, 20),
        p_rule_version: event.ruleVersion,
        p_occurred_at: new Date(event.occurredAt).toISOString(),
      });
      if (error) throw error;
      acknowledged.push(event.id);
    } catch (error) {
      logError('native-telemetry-sync-failed', error);
    }
  }

  if (acknowledged.length) {
    try {
      await ackTelemetry(acknowledged);
    } catch (error) {
      // The RPC is idempotent, so a failed acknowledgement merely retries later.
      logError('native-telemetry-ack-failed', error);
    }
  }
  return { synced: acknowledged.length, pending: pending.length - acknowledged.length };
}

export async function submitScanFeedback(
  expectedLevel: ThreatLevel,
  result: ThreatResult,
  eventId: string | null = null,
) {
  if (!isSupabaseConfigured) throw new Error('Feedback is unavailable until Supabase is configured.');
  const { error } = await supabase.rpc('submit_scan_feedback', {
    p_event_id: eventId,
    p_expected_level: expectedLevel,
    p_indicator_codes: result.reasons.map((reason) => reason.code).slice(0, 32),
    p_rule_version: result.ruleVersion,
  });
  if (error) throw error;
}
