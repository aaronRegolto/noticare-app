import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/src/services/supabase';
import { flushQueuedThreatEvents, queueThreatEvent } from '@/src/services/eventSync';
import type { ThreatResult } from '@/src/features/detection';

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
jest.mock('@/src/services/notificationListener', () => ({ isNativeMonitoringAvailable: () => false }));
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
