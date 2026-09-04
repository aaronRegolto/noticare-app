import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/src/providers/AuthProvider';
import { WarningAppearanceSelector } from '@/src/components/warning-appearance-selector';
import {
  clearHistory,
  getMonitoringStatus,
  isNativeMonitoringAvailable,
  openAppNotificationSettings,
  requestNotificationListenerAccess,
  setScanningEnabled,
  setFullScreenWarnings,
  type MonitoringStatus,
} from '@/src/services/notificationListener';

const navy = '#1E2D43';
const emerald = '#00B87C';

function maskPhone(phone: string | undefined) {
  if (!phone) return 'Signed in securely';
  const compact = phone.replace(/\s+/g, '');
  const lastFour = compact.replace(/\D/g, '').slice(-4);
  const countryCode = compact.startsWith('+63') ? '+63' : compact.startsWith('+1') ? '+1' : '+…';
  return lastFour ? `${countryCode} ••• ••• ${lastFour}` : 'Signed in securely';
}

function humanStatus(status: MonitoringStatus | null) {
  if (!status) return { title: 'Checking status', tone: '#687E9D', message: 'Reading Android monitoring status…' };
  switch (status.status) {
    case 'active':
      return {
        title: 'Active',
        tone: emerald,
        message: `Monitoring ${status.defaultSmsAppName ?? 'your default Messages app'}.`,
      };
    case 'off':
      return { title: 'Off', tone: '#687E9D', message: 'Real-Time Scanning is turned off on this device.' };
    case 'permission_required':
      return {
        title: 'Permission required',
        tone: '#C77700',
        message: 'Allow Android Notification Access to enable scanning.',
      };
    case 'service_disconnected':
      return {
        title: 'Service disconnected',
        tone: '#C77700',
        message: 'Android has not connected the notification listener yet.',
      };
    case 'sms_app_unavailable':
      return {
        title: 'Messages app unavailable',
        tone: '#B42318',
        message: 'Choose a default SMS app in Android settings first.',
      };
  }
}

function SettingRow({
  icon,
  title,
  subtitle,
  onPress,
  destructive = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={styles.settingRow} accessibilityRole="button">
      <View style={[styles.settingIcon, destructive && styles.settingIconDanger]}>
        <Ionicons name={icon} size={20} color={destructive ? '#B42318' : '#386080'} />
      </View>
      <View style={styles.settingCopy}>
        <Text style={[styles.settingTitle, destructive && styles.dangerText]}>{title}</Text>
        {subtitle ? <Text style={styles.settingSubtitle}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color="#90A1B7" />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [status, setStatus] = useState<MonitoringStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!isNativeMonitoringAvailable()) {
      setStatus(null);
      setStatusError(
        'Install an Android development or release build to manage real-time scanning. Expo Go cannot load NotiCare’s native listener.',
      );
      return;
    }
    try {
      setStatus(await getMonitoringStatus());
      setStatusError(null);
    } catch {
      setStatus(null);
      setStatusError(
        'NotiCare could not read Android monitoring status. Try again after checking Notification Access.',
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshStatus();
    }, [refreshStatus]),
  );

  const changeScanning = useCallback(
    async (enabled: boolean) => {
      if (saving) return;
      if (!isNativeMonitoringAvailable()) {
        Alert.alert(
          'Android development build required',
          'Expo Go cannot run NotiCare’s Kotlin notification listener. Build and install the Android development build first.',
        );
        return;
      }
      if (enabled && !status?.notificationAccessGranted) {
        Alert.alert(
          'Notification Access needed',
          'NotiCare needs Android Notification Access before it can examine notifications from your Messages app.',
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Open settings',
              onPress: () => {
                void setScanningEnabled(true)
                  .then(setStatus)
                  .then(() => requestNotificationListenerAccess())
                  .catch(() =>
                    Alert.alert('Settings unavailable', 'Android Notification Access settings could not be opened.'),
                  );
              },
            },
          ],
        );
        return;
      }
      setSaving(true);
      try {
        const next = await setScanningEnabled(enabled);
        setStatus(next);
        if (enabled && next.status !== 'active') Alert.alert('Scanning is not active yet', humanStatus(next).message);
      } catch {
        Alert.alert('Unable to save preference', 'Please try again after checking Android settings.');
      } finally {
        setSaving(false);
      }
    },
    [saving, status],
  );

  const changeWarningStyle = useCallback(
    async (fullScreen: boolean) => {
      if (saving || !status) return;
      setSaving(true);
      try {
        setStatus(await setFullScreenWarnings(fullScreen));
      } catch {
        Alert.alert('Unable to save warning style', 'Please try again.');
      } finally {
        setSaving(false);
      }
    },
    [saving, status],
  );

  const confirmClearHistory = useCallback(() => {
    Alert.alert(
      'Clear protected History?',
      'This permanently deletes local copies of successfully blocked notifications from this device. The original SMS messages remain in your Messages inbox.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear History',
          style: 'destructive',
          onPress: () => {
            void clearHistory()
              .then(() => Alert.alert('History cleared', 'Protected local History has been deleted.'))
              .catch(() => Alert.alert('Unable to clear History', 'Protected local History could not be cleared.'));
          },
        },
      ],
    );
  }, []);

  const confirmSignOut = useCallback(() => {
    Alert.alert(
      'Sign out?',
      'Real-Time Scanning will be turned off. Kept History stays encrypted and locked to this account; another account on this phone cannot view it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out & keep History',
          onPress: () => {
            void setScanningEnabled(false)
              .catch(() => undefined)
              .finally(() => {
                void signOut();
              });
          },
        },
        {
          text: 'Sign out & delete History',
          style: 'destructive',
          onPress: () => {
            void setScanningEnabled(false)
              .catch(() => undefined)
              .then(() => clearHistory())
              .catch(() => undefined)
              .finally(() => {
                void signOut();
              });
          },
        },
      ],
    );
  }, [signOut]);

  const current = statusError ? { title: 'Unavailable', tone: '#B42318', message: statusError } : humanStatus(status);
  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close settings"
        >
          <Ionicons name="arrow-back" size={25} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Settings & Privacy</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profile}>
          <View style={styles.profileIcon}>
            <Ionicons name="person-outline" size={24} color={navy} />
          </View>
          <View>
            <Text style={styles.profileTitle}>Your account</Text>
            <Text style={styles.profilePhone}>{maskPhone(session?.user.phone)}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>REAL-TIME PROTECTION</Text>
        <View style={styles.card}>
          <View style={styles.scanRow}>
            <View style={styles.scanLabel}>
              <View style={[styles.statusDot, { backgroundColor: current.tone }]} />
              <View>
                <Text style={styles.cardTitle}>Real-Time Scanning</Text>
                <Text style={styles.cardSubtitle}>{current.title}</Text>
              </View>
            </View>
            <Switch
              value={Boolean(status?.scanningEnabled)}
              disabled={saving || !status}
              onValueChange={(value) => void changeScanning(value)}
              trackColor={{ false: '#AFBBCB', true: '#62D6B0' }}
              thumbColor={status?.scanningEnabled ? emerald : '#fff'}
              accessibilityLabel="Turn real-time scanning on or off"
            />
          </View>
          <Text style={styles.statusCopy}>{current.message}</Text>
          {statusError ? (
            <Pressable
              onPress={() => void refreshStatus()}
              style={styles.retryStatusButton}
              accessibilityRole="button"
              accessibilityLabel="Retry Android monitoring status"
            >
              <Ionicons name="refresh-outline" size={17} color="#006DAB" />
              <Text style={styles.retryStatusText}>Retry status</Text>
            </Pressable>
          ) : null}
          <View style={styles.messagesApp}>
            <Ionicons name="chatbubble-outline" size={19} color="#426484" />
            <View style={styles.flex}>
              <Text style={styles.messagesTitle}>Current Messages app</Text>
              <Text style={styles.messagesValue}>
                {status?.defaultSmsAppName ?? 'Not detected'}
                {status?.defaultSmsPackage ? ` · ${status.defaultSmsPackage}` : ''}
              </Text>
            </View>
          </View>
          {status && !status.appNotificationsGranted ? (
            <Pressable
              onPress={() => void openAppNotificationSettings()}
              style={styles.permissionButton}
              accessibilityRole="button"
            >
              <Text style={styles.permissionText}>Allow NotiCare warning notifications</Text>
            </Pressable>
          ) : null}
          {status?.historyStorageAvailable === false ? (
            <Text style={styles.storageWarning}>
              Protected local History is unavailable. No raw message content will be saved until secure storage is
              working.
            </Text>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>WARNING APPEARANCE</Text>
        <View style={styles.appearanceCard}>
          <Text style={styles.appearanceTitle}>How should phishing warnings appear?</Text>
          <Text style={styles.appearanceSubtitle}>Choose the alert style that feels right for you.</Text>
          <WarningAppearanceSelector
            value={status?.fullScreenWarnings ? 'full-screen' : 'banner'}
            disabled={saving || !status}
            onChange={(mode) => void changeWarningStyle(mode === 'full-screen')}
          />
        </View>

        <Text style={styles.sectionLabel}>HELP & PRIVACY</Text>
        <View style={styles.card}>
          <SettingRow
            icon="book-outline"
            title="User Guide"
            subtitle="Learn how to use NotiCare safely"
            onPress={() => router.push('/guide')}
          />
          <View style={styles.divider} />
          <SettingRow
            icon="lock-closed-outline"
            title="Privacy information"
            subtitle="What stays on your device"
            onPress={() => router.push('/privacy')}
          />
          <View style={styles.divider} />
          <SettingRow
            icon="information-circle-outline"
            title="About NotiCare"
            subtitle="Android-only smishing protection"
            onPress={() => router.push('/about')}
          />
        </View>

        <Text style={styles.sectionLabel}>LOCAL DATA</Text>
        <View style={styles.card}>
          <SettingRow
            icon="trash-outline"
            title="Clear Local History"
            subtitle="Delete protected copies of blocked notifications"
            onPress={confirmClearHistory}
            destructive
          />
        </View>
        <View style={styles.card}>
          <SettingRow
            icon="log-out-outline"
            title="Sign out"
            subtitle="Turn off scanning for this profile"
            onPress={confirmSignOut}
            destructive
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F6F8FC' },
  header: {
    minHeight: 64,
    backgroundColor: navy,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: '#fff', fontWeight: '800', fontSize: 18 },
  headerSpacer: { width: 25 },
  content: { padding: 16, paddingBottom: 36 },
  profile: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: '#ECF5FC',
    borderRadius: 14,
    padding: 16,
  },
  profileIcon: {
    height: 48,
    width: 48,
    borderRadius: 24,
    backgroundColor: '#D6E6F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileTitle: { color: navy, fontWeight: '800', fontSize: 16 },
  profilePhone: { color: '#607A9B', marginTop: 3 },
  sectionLabel: {
    color: '#7186A4',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginTop: 23,
    marginBottom: 8,
  },
  card: { backgroundColor: '#fff', borderRadius: 13, borderWidth: 1, borderColor: '#E3EAF2', overflow: 'hidden' },
  scanRow: { padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  scanLabel: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot: { width: 11, height: 11, borderRadius: 6 },
  cardTitle: { color: '#263F5E', fontWeight: '800', fontSize: 15 },
  cardSubtitle: { color: '#637B99', fontSize: 12, marginTop: 2 },
  statusCopy: { color: '#617A99', lineHeight: 19, paddingHorizontal: 16, paddingBottom: 14 },
  retryStatusButton: {
    alignSelf: 'flex-start',
    marginHorizontal: 16,
    marginBottom: 14,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#ECF5FC',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  retryStatusText: { color: '#006DAB', fontWeight: '800', fontSize: 12 },
  messagesApp: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#F3F7FB',
    borderRadius: 9,
    padding: 12,
    flexDirection: 'row',
    gap: 9,
  },
  flex: { flex: 1 },
  messagesTitle: { color: '#53708E', fontSize: 11, fontWeight: '800' },
  messagesValue: { color: '#324D6B', fontSize: 12, marginTop: 3 },
  permissionButton: {
    marginHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#ECF5FC',
  },
  permissionText: { color: '#006DAB', fontWeight: '800', fontSize: 12 },
  storageWarning: {
    color: '#A15D00',
    backgroundColor: '#FFF5E4',
    margin: 16,
    marginTop: 0,
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    lineHeight: 17,
  },
  settingRow: { minHeight: 68, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 11 },
  settingIcon: {
    height: 37,
    width: 37,
    borderRadius: 10,
    backgroundColor: '#EDF4FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingIconDanger: { backgroundColor: '#FFF0F0' },
  settingCopy: { flex: 1 },
  settingTitle: { color: '#29425F', fontWeight: '700', fontSize: 14 },
  dangerText: { color: '#B42318' },
  settingSubtitle: { color: '#7890AD', fontSize: 12, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#EEF2F6', marginLeft: 64 },
  appearanceCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: '#E3EAF2',
    padding: 16,
    gap: 5,
  },
  appearanceTitle: { color: navy, fontWeight: '800', fontSize: 17 },
  appearanceSubtitle: { color: '#6B819D', fontSize: 13, paddingBottom: 12 },
});
