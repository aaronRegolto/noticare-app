import { filterMessages, isMessageBlocked } from '../inbox';
import type { HistorySummary } from '@/src/services/notificationListener';

const message = (id: string, overrides: Partial<HistorySummary> = {}): HistorySummary => ({
  id,
  maskedSender: '•••12',
  sender: 'Test sender',
  preview: 'Your appointment is tomorrow',
  receivedAt: 1,
  level: 'safe',
  score: 0,
  redactedPreview: 'Content redacted',
  warningSignCount: 0,
  sourcePackage: 'sms',
  ruleVersion: 'test',
  blocked: false,
  isRead: false,
  ...overrides,
});

test('alert records are sorted newest first without mutating the input', () => {
  const records = [
    message('suspicious', { level: 'suspicious', receivedAt: 1 }),
    message('dangerous', { level: 'dangerous', receivedAt: 2 }),
  ];
  expect(filterMessages(records, 'all', '').map((item) => item.id)).toEqual(['dangerous', 'suspicious']);
  expect(records[0].id).toBe('suspicious');
});
test('blocked status is independent of classification and read status', () => {
  const records = [
    message('danger', { level: 'dangerous' }),
    message('blocked', { level: 'suspicious', blocked: true, isRead: true }),
  ];
  expect(filterMessages(records, 'blocked', '').map((item) => item.id)).toEqual(['blocked']);
  expect(filterMessages(records, 'unread', '').map((item) => item.id)).toEqual(['danger']);
  expect(filterMessages(records, 'dangerous', '').map((item) => item.id)).toEqual(['danger']);
});
test('sender and preview search combine with filters, including legacy blocked records', () => {
  const records = [message('a'), message('b', { sender: 'BANK', level: 'suspicious' })];
  expect(filterMessages(records, 'safe', ' appointment ')).toHaveLength(1);
  expect(filterMessages(records, 'safe', 'BANK')).toHaveLength(0);
  expect(filterMessages(records, 'suspicious', 'bank')[0].id).toBe('b');
  expect(isMessageBlocked(message('legacy', { blocked: undefined }))).toBe(true);
});

test('category and risk-level filters combine', () => {
  const records = [
    message('spam-safe', { categories: ['spam'] }),
    message('phishing-risk', { categories: ['phishing'], level: 'dangerous', score: 85 }),
    message('threat', { categories: ['threats'], level: 'suspicious', score: 30 }),
  ];
  expect(filterMessages(records, 'all', '', 'spam').map((item) => item.id)).toEqual(['spam-safe']);
  expect(filterMessages(records, 'dangerous', '', 'phishing').map((item) => item.id)).toEqual(['phishing-risk']);
  expect(filterMessages(records, 'safe', '', 'threats')).toEqual([]);
});
