import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/src/services/supabase';
import { flushNativeTelemetry, flushQueuedThreatEvents, queueThreatEvent } from '@/src/services/eventSync';
import type { ThreatResult } from '@/src/features/detection';
import {
  ackTelemetry,
  getPendingTelemetry,
  isNativeMonitoringAvailable,
  type PendingTelemetryEvent,
} from '@/src/services/notificationListener';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => 'device-id'), setItemAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => Math.random().toString() }));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0' } }));
jest.mock('@/src/services/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { getSession: jest.fn() }, rpc: jest.fn() },
}));
jest.mock('@/src/services/notificationListener', () => ({
  isNativeMonitoringAvailable: jest.fn(),
  getPendingTelemetry: jest.fn(),
  ackTelemetry: jest.fn(),
}));
jest.mock('@/src/services/logger', () => ({ logError: jest.fn() }));

const sample = {
  level: 'suspicious',
  score: 40,
  reasons: [{ code: 'test_code' }],
  urls: [],
  ruleVersion: 'test-v1',
} as unknown as ThreatResult;
const storage = new Map<string, string>();
const rpc = supabase.rpc as jest.Mock;
const getSession = supabase.auth.getSession as jest.Mock;
let user: string | null;
beforeEach(() => {
  storage.clear();
  rpc.mockReset();
  user = 'user-a';
  getSession.mockImplementation(async () => ({ data: { session: user ? { user: { id: user } } : null } }));
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key) => storage.get(key) ?? null);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key, value) => {
    storage.set(key, value);
  });
  rpc.mockResolvedValue({ error: null });
  (isNativeMonitoringAvailable as jest.Mock).mockReturnValue(false);
});
test('concurrent manual scans are all uploaded as metadata without raw text', async () => {
  await Promise.all([queueThreatEvent(sample, 'manual', false), queueThreatEvent(sample, 'manual', false)]);
  expect(await flushQueuedThreatEvents()).toEqual({ synced: 2, pending: 0 });
  expect(rpc).toHaveBeenCalledTimes(2);
  const payload = rpc.mock.calls[0][1];
  expect(payload.p_source).toBe('manual');
  expect(payload.p_score_bucket).toBe(4);
  expect(payload).not.toHaveProperty('text');
});
test('failed uploads retain the same UUID for idempotent retry', async () => {
  const id = await queueThreatEvent(sample, 'manual', false);
  rpc.mockResolvedValueOnce({ error: new Error('offline') });
  expect(await flushQueuedThreatEvents()).toEqual({ synced: 0, pending: 1 });
  expect(await flushQueuedThreatEvents()).toEqual({ synced: 1, pending: 0 });
  expect(rpc.mock.calls.map((call) => call[1].p_client_event_id)).toEqual([id, id]);
});
test('another signed-in account never flushes the previous account queue', async () => {
  await queueThreatEvent(sample, 'manual', false);
  user = 'user-b';
  expect(await flushQueuedThreatEvents()).toEqual({ synced: 0, pending: 0 });
  expect(rpc).not.toHaveBeenCalled();
  user = 'user-a';
  expect(await flushQueuedThreatEvents()).toEqual({ synced: 1, pending: 0 });
});
test('a scan arriving during upload is preserved for the next flush', async () => {
  await queueThreatEvent(sample, 'manual', false);
  let release!: () => void;
  let started!: () => void;
  const startedPromise = new Promise<void>((resolve) => {
    started = resolve;
  });
  rpc.mockImplementationOnce(async () => {
    started();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return { error: null };
  });
  const first = flushQueuedThreatEvents();
  await startedPromise;
  const queued = queueThreatEvent(sample, 'manual', false);
  release();
  await first;
  await queued;
  expect(await flushQueuedThreatEvents()).toEqual({ synced: 1, pending: 0 });
});
test('a Safe scan is always sent as score bucket 0', async () => {
  const safe = { ...sample, level: 'safe', score: 25 } as ThreatResult;
  await queueThreatEvent(safe, 'manual', false);
  expect(await flushQueuedThreatEvents()).toEqual({ synced: 1, pending: 0 });
  expect(rpc.mock.calls[0][1].p_threat_level).toBe('safe');
  expect(rpc.mock.calls[0][1].p_score_bucket).toBe(0);
});
test('a Safe event queued by an older build with bucket 2 is flushed and re-queued as 0', async () => {
  const legacy = {
    clientEventId: 'legacy-safe',
    occurredAt: new Date().toISOString(),
    source: 'manual',
    level: 'safe',
    scoreBucket: 2,
    blocked: false,
    indicatorCodes: ['urgency-pressure'],
    urlCount: 0,
    ruleVersion: 'test-v1',
    attempts: 0,
  };
  storage.set('noticare.anonymous-event-queue.v1.user-a', JSON.stringify([legacy, { ...legacy, clientEventId: 'b' }]));
  rpc.mockResolvedValueOnce({ error: new Error('offline') });
  expect(await flushQueuedThreatEvents()).toEqual({ synced: 1, pending: 1 });
  expect(rpc.mock.calls.map((call) => call[1].p_score_bucket)).toEqual([0, 0]);
  expect(rpc.mock.calls[0][1].p_indicator_codes).toEqual(['urgency-pressure']);
  const requeued = JSON.parse(storage.get('noticare.anonymous-event-queue.v1.user-a') ?? '[]');
  expect(requeued).toEqual([{ ...legacy, attempts: 1, scoreBucket: 0 }]);
});
test('native realtime telemetry sends a Safe event as bucket 0 and keeps other buckets', async () => {
  const event = (id: string, level: PendingTelemetryEvent['level'], scoreBucket: number): PendingTelemetryEvent => ({
    id,
    source: 'realtime',
    level,
    scoreBucket,
    blocked: false,
    indicatorCodes: ['urgency-pressure'],
    urlCount: 0,
    ruleVersion: 'test-v1',
    occurredAt: Date.now(),
  });
  (isNativeMonitoringAvailable as jest.Mock).mockReturnValue(true);
  (getPendingTelemetry as jest.Mock).mockResolvedValue([event('safe', 'safe', 2), event('danger', 'dangerous', 9)]);
  (ackTelemetry as jest.Mock).mockResolvedValue(2);
  expect(await flushNativeTelemetry()).toEqual({ synced: 2, pending: 0 });
  expect(rpc.mock.calls.map((call) => [call[1].p_threat_level, call[1].p_score_bucket])).toEqual([
    ['safe', 0],
    ['dangerous', 9],
  ]);
  expect(ackTelemetry).toHaveBeenCalledWith(['safe', 'danger']);
});
