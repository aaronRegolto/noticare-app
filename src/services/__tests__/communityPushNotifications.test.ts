import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { enableCommunityNotifications, CommunityNotificationSetupError } from '../communityPushNotifications';
import { supabase } from '@/src/services/supabase';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));
jest.mock('expo-constants', () => ({
  expoConfig: { extra: { eas: { projectId: 'test-project' } } },
  easConfig: null,
}));
jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
}));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('@/src/services/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { getSession: jest.fn() }, rpc: jest.fn() },
}));

const rpc = supabase.rpc as jest.Mock;
const getSession = supabase.auth.getSession as jest.Mock;
const getExpoPushToken = Notifications.getExpoPushTokenAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null });
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  getExpoPushToken.mockResolvedValue({ data: 'ExpoPushToken[test]' });
  rpc.mockResolvedValue({ error: null });
});

test('identifies push-token setup failures and does not register a missing token', async () => {
  getExpoPushToken.mockRejectedValueOnce(new Error('FCM is not configured'));

  await expect(enableCommunityNotifications()).rejects.toMatchObject<Partial<CommunityNotificationSetupError>>({
    name: 'CommunityNotificationSetupError',
    stage: 'push-token',
  });
  expect(rpc).not.toHaveBeenCalled();
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

test('identifies server-registration failures and removes the unregistered local token', async () => {
  rpc.mockResolvedValueOnce({ error: { code: 'PGRST202', message: 'RPC not found' } });

  await expect(enableCommunityNotifications()).rejects.toMatchObject<Partial<CommunityNotificationSetupError>>({
    name: 'CommunityNotificationSetupError',
    stage: 'server-registration',
  });
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('noticare.community-push-token.v1', 'ExpoPushToken[test]');
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith('noticare.community-push-token.v1');
});
