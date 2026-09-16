import * as SecureStore from 'expo-secure-store';
import { sendScanFeedback } from '../feedback';
import { submitScanFeedback } from '../eventSync';
import * as development from '../developmentPhoneAuth';
import type { ThreatResult } from '@/src/features/detection';

jest.mock('expo-secure-store', () => ({ setItemAsync: jest.fn(async () => undefined) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'report-id' }));
jest.mock('../eventSync', () => ({ submitScanFeedback: jest.fn(async () => undefined) }));
jest.mock('../developmentPhoneAuth', () => ({
  __esModule: true,
  isDevelopmentPhoneLoginEnabled: true,
  restoreDevelopmentPhoneSession: jest.fn(async () => ({ userId: 'dev-user', phone: '+639171234567' })),
}));
const sample: ThreatResult = {
  level: 'dangerous',
  score: 90,
  reasons: [{ code: 'ip_link', label: 'Risk', description: 'Private description', weight: 10 }],
  urls: [{ display: 'http://private.example', normalizedDomain: 'private.example', indicators: [] }],
  ruleVersion: 'test',
};
beforeEach(() => {
  (development as { isDevelopmentPhoneLoginEnabled: boolean }).isDevelopmentPhoneLoginEnabled = true;
});
test('OTP bypass reports are saved locally without a network call or message material', async () => {
  expect(await sendScanFeedback('dangerous', sample)).toBe('saved_locally');
  expect(submitScanFeedback).not.toHaveBeenCalled();
  const [key, raw] = (SecureStore.setItemAsync as jest.Mock).mock.calls[0];
  expect(key).toContain('dev-user');
  expect(JSON.parse(raw).expectedLevel).toBe('dangerous');
  expect(raw).not.toMatch(/private|639171234567|description|urls/i);
});
test('real sessions send the classification the user chose and surface upload failure', async () => {
  (development as { isDevelopmentPhoneLoginEnabled: boolean }).isDevelopmentPhoneLoginEnabled = false;
  expect(await sendScanFeedback('dangerous', sample)).toBe('sent');
  expect(submitScanFeedback).toHaveBeenCalledWith('dangerous', sample, null);
  (submitScanFeedback as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  await expect(sendScanFeedback('safe', sample)).rejects.toThrow('offline');
});
test('local storage failures are not reported as success', async () => {
  (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(sendScanFeedback('safe', sample)).rejects.toThrow('storage unavailable');
});
