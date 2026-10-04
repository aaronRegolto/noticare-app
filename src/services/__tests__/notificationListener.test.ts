import { NativeModules } from 'react-native';
import {
  getHistory,
  getHistoryRecord,
  isTextRecognitionAvailable,
  recognizeTextInImage,
  scanTextLocally,
  type HistoryRecord,
  type HistorySummary,
  type LocalThreatResult,
} from '@/src/services/notificationListener';

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: {
    NotificationListenerModule: { scanText: jest.fn(), getHistory: jest.fn(), getHistoryRecord: jest.fn() },
  },
}));

const native = NativeModules.NotificationListenerModule as Record<
  'scanText' | 'getHistory' | 'getHistoryRecord',
  jest.Mock
>;
const reason = { code: 'urgency-pressure', label: 'Urgency', description: 'Pressure to act now', weight: 12 };

// A native build that still returns the raw rule score, or History written before "Safe always shows 0".
const legacySafe: LocalThreatResult = { level: 'safe', score: 12, reasons: [reason], urls: [], ruleVersion: 'v' };
const summary = (id: string, level: HistorySummary['level'], score: number): HistorySummary => ({
  id,
  maskedSender: '+63*******89',
  receivedAt: 1,
  level,
  score,
  redactedPreview: 'SMS notification',
  warningSignCount: 1,
  sourcePackage: 'com.example.sms',
  ruleVersion: 'v',
});

test('a native scan always shows a Safe result as 0 but keeps its reason codes', async () => {
  native.scanText.mockResolvedValueOnce(legacySafe);
  expect(await scanTextLocally('hello')).toEqual({ ...legacySafe, score: 0, reasons: [{ ...reason, weight: 0 }] });

  const dangerous: LocalThreatResult = { ...legacySafe, level: 'dangerous', score: 90 };
  native.scanText.mockResolvedValueOnce(dangerous);
  expect(await scanTextLocally('scam')).toBe(dangerous);
});

test('History saved with a Safe 1–29 score reads as 0', async () => {
  native.getHistory.mockResolvedValueOnce([summary('a', 'safe', 18), summary('b', 'suspicious', 40)]);
  expect((await getHistory()).map((record) => [record.level, record.score])).toEqual([
    ['safe', 0],
    ['suspicious', 40],
  ]);

  const record: HistoryRecord = {
    ...summary('a', 'safe', 18),
    message: 'Limited time menu',
    reasons: [{ ...reason, weight: 18 }],
    urls: [],
    originalSmsNotice: 'The original SMS is still in Messages.',
  };
  native.getHistoryRecord.mockResolvedValueOnce(record);
  expect(await getHistoryRecord('a')).toEqual({ ...record, score: 0, reasons: [{ ...reason, weight: 0 }] });

  native.getHistoryRecord.mockResolvedValueOnce(null);
  expect(await getHistoryRecord('missing')).toBeNull();
});

test('reading text from a photo needs a build with the on-device recognizer', async () => {
  const module = NativeModules.NotificationListenerModule as Record<string, unknown>;
  expect(isTextRecognitionAvailable()).toBe(false);
  await expect(recognizeTextInImage('file:///cache/a.jpeg')).rejects.toThrow('cannot read text from photos');

  const blocks = { blocks: [{ lines: ['Hello'] }] };
  module.recognizeTextInImage = jest.fn().mockResolvedValue(blocks);
  try {
    expect(isTextRecognitionAvailable()).toBe(true);
    expect(await recognizeTextInImage('file:///cache/a.jpeg')).toBe(blocks);
    expect(module.recognizeTextInImage).toHaveBeenCalledWith('file:///cache/a.jpeg');
  } finally {
    delete module.recognizeTextInImage;
  }
});
