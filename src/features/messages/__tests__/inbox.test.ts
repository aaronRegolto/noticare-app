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

test('all scanned levels remain visible, newest first, without mutating the input', () => {
  const records = [message('safe'), message('risk', { level: 'dangerous', receivedAt: 2 })];
  expect(filterMessages(records, 'all', '').map((item) => item.id)).toEqual(['risk', 'safe']);
  expect(records[0].id).toBe('safe');
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
