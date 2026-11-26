import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { isSupabaseConfigured, supabase } from '@/src/services/supabase';

const registeredTokenKey = 'noticare.community-push-token.v1';

export class CommunityNotificationPermissionError extends Error {}

export type CommunityNotificationSetupStage = 'project-config' | 'push-token' | 'server-registration';

export class CommunityNotificationSetupError extends Error {
  constructor(
    readonly stage: CommunityNotificationSetupStage,
    readonly cause: unknown,
  ) {
    super(`Community notification setup failed at ${stage}.`);
    this.name = 'CommunityNotificationSetupError';
  }
}

export async function isCommunityNotificationsEnabled() {
  return Boolean(await AsyncStorage.getItem(registeredTokenKey));
}

export async function enableCommunityNotifications() {
  if (Platform.OS !== 'android') throw new Error('Community notifications are available on Android only.');
  if (!isSupabaseConfigured) throw new Error('Community notifications require a configured account.');
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) throw new Error('Sign in before enabling community notifications.');

  await Notifications.setNotificationChannelAsync('community-reports', {
    name: 'Community alerts',
    description: 'Anonymous reports about suspicious messages',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200, 150, 200],
    lightColor: '#1E2D43',
  });

  const existingPermissions = await Notifications.getPermissionsAsync();
  const permissions =
    existingPermissions.status === 'granted' ? existingPermissions : await Notifications.requestPermissionsAsync();
  if (permissions.status !== 'granted')
    throw new CommunityNotificationPermissionError('Notification permission was not granted.');

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (typeof projectId !== 'string' || !projectId) {
    throw new CommunityNotificationSetupError('project-config', new Error('Expo project ID is missing.'));
  }
  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (cause) {
    throw new CommunityNotificationSetupError('push-token', cause);
  }
  await AsyncStorage.setItem(registeredTokenKey, token);
  try {
    const { error } = await supabase.rpc('register_community_push_token', {
      p_expo_push_token: token,
    });
    if (error) throw error;
  } catch (cause) {
    await AsyncStorage.removeItem(registeredTokenKey);
    throw new CommunityNotificationSetupError('server-registration', cause);
  }
}

export async function disableCommunityNotifications() {
  const token = await AsyncStorage.getItem(registeredTokenKey);
  if (!token) return;
  if (!isSupabaseConfigured) throw new Error('Cannot remove the community notification registration while offline.');

  await AsyncStorage.removeItem(registeredTokenKey);
  const { error } = await supabase.rpc('unregister_community_push_token', {
    p_expo_push_token: token,
  });
  if (error) {
    await AsyncStorage.setItem(registeredTokenKey, token);
    throw error;
  }
}
