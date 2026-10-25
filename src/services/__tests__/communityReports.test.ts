import AsyncStorage from '@react-native-async-storage/async-storage';
import { evaluateRules } from '@/src/features/detection/evaluator';
import {
  flushNativeCommunityReports,
  flushQueuedPhishingReports,
  getViralPhishingRanking,
  reportAndBlockMessage,
} from '@/src/services/communityReports';
import {
  ackCommunityReports,
  getPendingCommunityReports,
  isNativeMonitoringAvailable,
} from '@/src/services/notificationListener';
import { supabase } from '@/src/services/supabase';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => Math.random().toString(),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(async (_algorithm: string, text: string) => `hash:${text}`),
}));
jest.mock('@/src/services/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { getSession: jest.fn() }, rpc: jest.fn() },
}));
jest.mock('@/src/services/eventSync', () => ({
  activeUserId: jest.fn(async () => 'user-a'),
  registerDevice: jest.fn(async () => 'device-id'),
}));
jest.mock('@/src/services/notificationListener', () => ({
  isNativeMonitoringAvailable: jest.fn(),
  getPendingCommunityReports: jest.fn(),
  ackCommunityReports: jest.fn(),
  notifyCommunityReportResult: jest.fn(),
  scanTextLocally: jest.fn(),
}));
jest.mock('@/src/services/logger', () => ({ logError: jest.fn(), logDiagnostic: jest.fn() }));

// A Safe corpus message whose raw rule score is 12 (see evaluator.test.ts).
const SAFE_TEXT = 'Click here to read your neighborhood bulletin.';
const QUEUE_KEY = 'noticare.phishing-report-queue.v1.user-a';
const storage = new Map<string, string>();
const rpc = supabase.rpc as jest.Mock;

const reportRow = { viral_score: 1, report_count: 1, is_first_reporter: true };
const sentRiskScores = () =>
  rpc.mock.calls.filter((call) => call[0] === 'record_phishing_report').map((call) => call[1].p_risk_score);

beforeEach(() => {
  storage.clear();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [reportRow], error: null });
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { id: 'user-a' } } } });
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key) => storage.get(key) ?? null);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key, value) => {
    storage.set(key, value);
  });
  (isNativeMonitoringAvailable as jest.Mock).mockReturnValue(false);
});

test('reporting a Safe result stores and sends risk score 0, even from an unfinalized result', async () => {
  const raw = evaluateRules(SAFE_TEXT);
  expect(raw.score).toBe(0);
  rpc.mockResolvedValueOnce({ data: null, error: new Error('offline') });
  await reportAndBlockMessage(SAFE_TEXT, null, raw);
  expect(sentRiskScores()).toEqual([0]);
  const queued = JSON.parse(storage.get(QUEUE_KEY) ?? '[]');
  expect(queued.map((report: { riskScore: number }) => report.riskScore)).toEqual([0]);
});

test('reports queued by an older rule set with a Safe 1–29 score are sent and re-queued as 0', async () => {
  const queued = (id: string, riskScore: number | null | undefined) => ({
    id,
    messageText: `message ${id}`,
    sampleSender: null,
    indicatorCodes: ['urgency-pressure'],
    ruleVersion: '2026.10.25',
    riskScore,
    createdAt: '2026-10-01T00:00:00.000Z',
    attempts: 0,
  });
  storage.set(
    QUEUE_KEY,
    JSON.stringify([queued('a', 18), queued('b', 29), queued('c', 45), queued('d', null), queued('e', undefined)]),
  );
  rpc.mockResolvedValueOnce({ data: null, error: new Error('offline') });
  expect(await flushQueuedPhishingReports()).toEqual({ synced: 4, pending: 1 });
  expect(sentRiskScores()).toEqual([0, 0, 45, null, null]);
  const requeued = JSON.parse(storage.get(QUEUE_KEY) ?? '[]');
  expect(requeued).toEqual([{ ...queued('a', 0), attempts: 1 }]);
});

test('native Block & Report taps from an older rule set with a Safe 1–29 score are sent as 0', async () => {
  (isNativeMonitoringAvailable as jest.Mock).mockReturnValue(true);
  const pending = (id: string, riskScore: number | null) => ({
    id,
    messageText: `native ${id}`,
    sampleSender: null,
    indicatorCodes: [],
    ruleVersion: '2026.10.25',
    riskScore,
    createdAt: Date.now(),
  });
  (getPendingCommunityReports as jest.Mock).mockResolvedValue([pending('safe', 12), pending('danger', 85)]);
  (ackCommunityReports as jest.Mock).mockResolvedValue(2);
  expect(await flushNativeCommunityReports()).toEqual({ synced: 2, pending: 0 });
  expect(sentRiskScores()).toEqual([0, 85]);
});

const rankingRow = (id: string, messageText: string, riskScore: number | null) => ({
  report_id: id,
  message_text: messageText,
  sample_sender: null,
  viral_score: 10,
  report_count: 2,
  first_reported_at: '2026-10-01T00:00:00.000Z',
  last_reported_at: '2026-10-02T00:00:00.000Z',
  risk_score: riskScore,
});

test('ranking rows preserve Suspicious 1–59 scores and cache them unchanged', async () => {
  rpc.mockResolvedValueOnce({
    data: [rankingRow('a', 'old safe report', 12), rankingRow('b', 'scam', 75), rankingRow('c', SAFE_TEXT, null)],
    error: null,
  });
  const { entries, source } = await getViralPhishingRanking('manual');
  expect(source).toBe('network');
  expect(entries.map((entry) => entry.riskScore)).toEqual([12, 75, 0]);
  const cached = JSON.parse(storage.get('noticare.viral-phishing-ranking.v3.manual') ?? '[]');
  expect(cached.map((entry: { riskScore: number }) => entry.riskScore)).toEqual([12, 75, 0]);
});

test('a cached ranking saved by an older build reads legacy Safe 1–29 scores as 0', async () => {
  const cachedEntry = (reportId: string, riskScore: number | null) => ({
    reportId,
    messageText: `cached ${reportId}`,
    sampleSender: null,
    viralScore: 10,
    reportCount: 2,
    firstReportedAt: '2026-10-01T00:00:00.000Z',
    lastReportedAt: '2026-10-02T00:00:00.000Z',
    riskScore,
  });
  storage.set(
    'noticare.viral-phishing-ranking.v1',
    JSON.stringify([cachedEntry('a', 20), cachedEntry('b', 70), cachedEntry('c', 0)]),
  );
  rpc.mockResolvedValueOnce({ data: null, error: new Error('offline') });
  const { entries, source } = await getViralPhishingRanking('manual');
  expect(source).toBe('cache');
  expect(entries.map((entry) => entry.riskScore)).toEqual([0, 70, 0]);
});
