import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ThreatResult } from '@/src/features/detection';
import { evaluateRules } from '@/src/features/detection/evaluator';
import {
  flushNativeCommunityReports,
  flushQueuedPhishingReports,
  getCommunityReportFeed,
  getViralPhishingRanking,
  CommunityReportDailyLimitError,
  getMessageFeedbackRecord,
  markMessageFeedback,
  reportAndBlockMessage,
  ViralPhishingRankingUnavailableError,
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
  supabase: { auth: { getSession: jest.fn() }, rpc: jest.fn(), functions: { invoke: jest.fn() } },
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
const DANGEROUS_RESULT: ThreatResult = {
  level: 'dangerous',
  score: 85,
  reasons: [{ code: 'urgency-pressure', label: 'Urgency', description: 'Urgent request', weight: 30 }],
  urls: [],
  ruleVersion: 'test',
};
const QUEUE_KEY = 'noticare.phishing-report-queue.v1.user-a';
const storage = new Map<string, string>();
const rpc = supabase.rpc as jest.Mock;
const invoke = supabase.functions.invoke as jest.Mock;

const reportRow = { viral_score: 1, report_count: 1, is_first_reporter: true };
const sentRiskScores = () =>
  rpc.mock.calls.filter((call) => call[0] === 'record_phishing_report').map((call) => call[1].p_risk_score);

beforeEach(() => {
  storage.clear();
  rpc.mockReset();
  invoke.mockReset().mockResolvedValue({ data: { sent: true }, error: null });
  rpc.mockResolvedValue({ data: [reportRow], error: null });
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { id: 'user-a' } } } });
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key) => storage.get(key) ?? null);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key, value) => {
    storage.set(key, value);
  });
  (isNativeMonitoringAvailable as jest.Mock).mockReturnValue(false);
});

test('a spam label is stored distinctly from safe feedback and remains local', async () => {
  await markMessageFeedback(SAFE_TEXT, 'spam');
  expect(await getMessageFeedbackRecord(SAFE_TEXT)).toBe('spam');
  expect(rpc).not.toHaveBeenCalled();
});

test('community feed returns only redacted message previews and detection source', async () => {
  rpc.mockResolvedValueOnce({
    data: [
      {
        report_event_id: 'event-1',
        message_preview: 'Your account needs verification at [link].',
        detected_in: 'messages',
        report_type: 'phishing',
        sample_sender: 'Sender',
        message_received_at: '2026-11-24T10:00:00.000Z',
      },
    ],
    error: null,
  });
  expect(await getCommunityReportFeed()).toEqual([
    {
      reportEventId: 'event-1',
      messagePreview: 'Your account needs verification at [link].',
      detectedIn: 'messages',
      reportType: 'phishing',
    },
  ]);
  expect(rpc).toHaveBeenCalledWith('get_community_report_message_feed', { p_limit: 100, p_offset: 0 });
});

test('community feed preserves a spam category from scanner indicators', async () => {
  rpc.mockResolvedValueOnce({
    data: [
      {
        report_event_id: 'event-spam',
        message_preview: 'A bonus offer expires tonight at [link].',
        detected_in: 'manual',
        report_type: 'spam',
      },
    ],
    error: null,
  });

  const [entry] = await getCommunityReportFeed();
  expect(entry.reportType).toBe('spam');
});

test('community feed preserves the full redacted message content', async () => {
  const fullPreview = '[email] needs verification. '.repeat(24).trim();
  rpc.mockResolvedValueOnce({
    data: [
      {
        report_event_id: 'event-long',
        message_preview: fullPreview,
        detected_in: 'messages',
        report_type: 'threat',
      },
    ],
    error: null,
  });

  const [entry] = await getCommunityReportFeed();
  expect(entry.messagePreview).toBe(fullPreview);
  expect(entry.reportType).toBe('threat');
});

test('viral phishing ranking returns message previews and detection sources without sender metadata', async () => {
  rpc.mockResolvedValueOnce({
    data: [
      {
        report_id: 'report-1',
        message_preview: 'Your account needs verification at [link].',
        detected_in: ['messages', 'messenger'],
        report_count: 4,
        sample_sender: 'Sender',
        message_received_at: '2026-11-24T10:00:00.000Z',
        message_text: 'private phishing text',
      },
    ],
    error: null,
  });
  expect(await getViralPhishingRanking('realtime')).toEqual([
    {
      reportId: 'report-1',
      messagePreview: 'Your account needs verification at [link].',
      detectedIn: ['messages', 'messenger'],
      reportCount: 4,
    },
  ]);
  expect(rpc).toHaveBeenCalledWith('get_viral_phishing_message_ranking', { p_limit: 10, p_source: 'realtime' });
});

test('viral phishing ranking does not fall back to an older RPC that exposes sender metadata', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } });
  await expect(getViralPhishingRanking('manual')).rejects.toBeInstanceOf(ViralPhishingRankingUnavailableError);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('get_viral_phishing_message_ranking', { p_limit: 10, p_source: 'manual' });
});

test('a synced report dispatches a push using its event ID, not message content', async () => {
  rpc.mockResolvedValueOnce({
    data: [{ ...reportRow, notification_event_id: 'event-1' }],
    error: null,
  });
  await reportAndBlockMessage('private reported text', null, DANGEROUS_RESULT);
  expect(invoke).toHaveBeenCalledWith('send-community-report-alert', { body: { eventId: 'event-1' } });
  expect(JSON.stringify(invoke.mock.calls)).not.toContain('private reported text');
  expect(rpc.mock.calls[0][1].p_message_received_at).toBeNull();
  expect(rpc.mock.calls[0][1].p_detected_in).toBe('manual');
});

test('report sync does not discard a known source when the database RPC is outdated', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } });
  await reportAndBlockMessage('private reported text', null, DANGEROUS_RESULT);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc.mock.calls[0][1].p_detected_in).toBe('manual');
  expect(JSON.parse(storage.get(QUEUE_KEY) ?? '[]')).toHaveLength(1);
});

test('a report rejected by the daily limit is not left in the manual retry queue', async () => {
  rpc.mockResolvedValueOnce({
    data: null,
    error: { code: 'P0001', message: 'community_report_daily_limit_reached' },
  });

  await expect(reportAndBlockMessage('limited report', null, DANGEROUS_RESULT)).rejects.toBeInstanceOf(
    CommunityReportDailyLimitError,
  );
  expect(JSON.parse(storage.get(QUEUE_KEY) ?? '[]')).toEqual([]);
  expect(invoke).not.toHaveBeenCalled();
});

test('Safe results cannot be uploaded through the community report path', async () => {
  const raw = evaluateRules(SAFE_TEXT);
  expect(raw.score).toBe(0);
  await expect(reportAndBlockMessage(SAFE_TEXT, null, raw)).rejects.toThrow(
    'Safe messages cannot be submitted as community reports.',
  );
  expect(rpc).not.toHaveBeenCalled();
  expect(storage.has(QUEUE_KEY)).toBe(false);
});

test('legacy Safe reports are discarded while non-Safe queued reports still retry', async () => {
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
  expect(await flushQueuedPhishingReports()).toEqual({ synced: 2, pending: 1, rateLimited: 0 });
  expect(sentRiskScores()).toEqual([45, null, null]);
  const requeued = JSON.parse(storage.get(QUEUE_KEY) ?? '[]');
  expect(requeued).toEqual([{ ...queued('c', 45), attempts: 1 }]);
});

test('queued manual reports rejected by the daily limit are discarded and counted', async () => {
  storage.set(
    QUEUE_KEY,
    JSON.stringify([
      {
        id: 'limited',
        messageText: 'queued report',
        sampleSender: null,
        indicatorCodes: [],
        ruleVersion: 'test',
        riskScore: 85,
        createdAt: new Date().toISOString(),
        attempts: 0,
      },
    ]),
  );
  rpc.mockResolvedValueOnce({
    data: null,
    error: { code: 'P0001', message: 'community_report_daily_limit_reached' },
  });

  expect(await flushQueuedPhishingReports()).toEqual({ synced: 0, pending: 0, rateLimited: 1 });
  expect(JSON.parse(storage.get(QUEUE_KEY) ?? '[]')).toEqual([]);
});

test('legacy Safe native reports are discarded while Dangerous alerts retain receive time', async () => {
  (isNativeMonitoringAvailable as jest.Mock).mockReturnValue(true);
  const pending = (id: string, riskScore: number | null) => ({
    id,
    messageText: `native ${id}`,
    sampleSender: null,
    messageReceivedAt: 1795521600000,
    detectedIn: 'messages',
    indicatorCodes: [],
    ruleVersion: '2026.10.25',
    riskScore,
    createdAt: Date.now(),
  });
  (getPendingCommunityReports as jest.Mock).mockResolvedValue([pending('safe', 12), pending('danger', 85)]);
  (ackCommunityReports as jest.Mock).mockResolvedValue(2);
  expect(await flushNativeCommunityReports()).toEqual({ synced: 1, pending: 0, rateLimited: 0 });
  expect(sentRiskScores()).toEqual([85]);
  expect(rpc.mock.calls[0][1].p_message_received_at).toBe(new Date(1795521600000).toISOString());
  expect(rpc.mock.calls[0][1].p_detected_in).toBe('messages');
});

test('native reports stay queued instead of losing their detected app on an outdated RPC', async () => {
  (isNativeMonitoringAvailable as jest.Mock).mockReturnValue(true);
  (getPendingCommunityReports as jest.Mock).mockResolvedValue([
    {
      id: 'native-source',
      messageText: 'native report',
      sampleSender: null,
      detectedIn: 'messenger',
      indicatorCodes: [],
      ruleVersion: 'test',
      riskScore: 85,
      createdAt: Date.now(),
    },
  ]);
  rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } });

  expect(await flushNativeCommunityReports()).toEqual({ synced: 0, pending: 1, rateLimited: 0 });
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc.mock.calls[0][1].p_detected_in).toBe('messenger');
  expect(ackCommunityReports).not.toHaveBeenCalled();
});

test('native reports rejected by the daily limit are acknowledged instead of retried forever', async () => {
  (isNativeMonitoringAvailable as jest.Mock).mockReturnValue(true);
  (getPendingCommunityReports as jest.Mock).mockResolvedValue([
    {
      id: 'native-limited',
      messageText: 'native limited report',
      sampleSender: null,
      detectedIn: 'messages',
      indicatorCodes: [],
      ruleVersion: 'test',
      riskScore: 85,
      createdAt: Date.now(),
    },
  ]);
  (ackCommunityReports as jest.Mock).mockResolvedValue(1);
  rpc.mockResolvedValueOnce({
    data: null,
    error: { code: 'P0001', message: 'community_report_daily_limit_reached' },
  });

  expect(await flushNativeCommunityReports()).toEqual({ synced: 0, pending: 0, rateLimited: 1 });
  expect(ackCommunityReports).toHaveBeenCalledWith(['native-limited']);
  expect(invoke).not.toHaveBeenCalled();
});
