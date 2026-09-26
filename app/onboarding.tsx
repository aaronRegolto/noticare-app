import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useOnboarding } from '@/src/providers/OnboardingProvider';
import {
  getMonitoringStatus,
  requestNotificationListenerAccess,
  setScanningEnabled,
  type MonitoringStatus,
} from '@/src/services/notificationListener';

const pages = [
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Welcome to NotiCare',
    body: 'NotiCare checks notifications from your current default Messages app for common smishing warning signs. It works on your device, even while the app is closed.',
    note: 'It cannot read messages that Android hides in a notification preview, and it cannot guarantee every scam will be detected.',
  },
  {
    icon: 'notifications-outline' as const,
    title: 'Why notification access?',
    body: 'Android requires Notification Access before NotiCare can protect new SMS notifications. NotiCare first checks that a notification is from your default Messages app before reading any text.',
    note: 'It immediately ignores social media, email, banking, shopping, and every other app.',
  },
  {
    icon: 'speedometer-outline' as const,
    title: 'Know the threat levels',
    body: 'Safe means no meaningful warning signs. Suspicious means use caution. Dangerous means strong phishing evidence was found, and NotiCare asks you to Block or Ignore the notification.',
    note: 'Blocking a message does not delete the original SMS from your Messages app.',
  },
  {
    icon: 'lock-closed-outline' as const,
    title: 'Your privacy comes first',
    body: 'Full SMS text, sender details, and links stay on this device. Only anonymous classification counts and warning-sign codes may contribute to community data — unless you explicitly tap Report & Block on a Dangerous message, which shares that message’s exact text to warn other users.',
    note: 'You can review the complete guide, turn scanning off, or delete protected local History at any time.',
  },
];

function statusTitle(status: MonitoringStatus | null) {
  if (!status) return 'Checking Android status…';
  if (status.defaultSmsAppName && status.defaultSmsPackage)
    return `${status.defaultSmsAppName} (${status.defaultSmsPackage})`;
  return 'No default Messages app found';
}

export default function OnboardingScreen() {
  const { finish } = useOnboarding();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<MonitoringStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await getMonitoringStatus());
    } catch {
      setStatus(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshStatus();
    }, [refreshStatus]),
  );

  const openNotificationAccess = useCallback(() => {
    Alert.alert(
      'Allow Notification Access?',
      'Android will open its Notification Access settings. Turn on NotiCare, then return here so we can confirm it.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Open settings',
          onPress: () => {
            void requestNotificationListenerAccess().catch(() =>
              Alert.alert('Settings unavailable', 'Android Notification Access settings could not be opened.'),
            );
          },
        },
      ],
    );
  }, []);

  const enableScanning = useCallback(async () => {
    setLoading(true);
    try {
      const current = await getMonitoringStatus();
      if (!current.notificationAccessGranted) {
        setStatus(await setScanningEnabled(true));
        openNotificationAccess();
        return;
      }
      const next = await setScanningEnabled(true);
      setStatus(next);
      if (next.status !== 'active') {
        Alert.alert(
          'Almost ready',
          'NotiCare needs notification access and a default Messages app before real-time scanning can turn on.',
        );
      }
    } catch {
      Alert.alert('Unable to update scanning', 'Please try again after returning from Android settings.');
    } finally {
      setLoading(false);
    }
  }, [openNotificationAccess]);

  const page = pages[index];
  const isLast = index === pages.length - 1;
  const needsPermission = !status?.notificationAccessGranted;

  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.progress} accessibilityLabel={`Onboarding step ${index + 1} of ${pages.length}`}>
          {pages.map((_, pageIndex) => (
            <View key={pageIndex} style={[styles.progressDot, pageIndex <= index && styles.progressDotActive]} />
          ))}
        </View>
        <View style={styles.icon}>
          <Ionicons name={page.icon} size={48} color="#00B87C" />
        </View>
        <Text style={styles.title}>{page.title}</Text>
        <Text style={styles.body}>{page.body}</Text>
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={20} color="#426484" />
          <Text style={styles.noteText}>{page.note}</Text>
        </View>

        {index === 1 ? (
          <View style={styles.permissionCard}>
            <Text style={styles.permissionTitle}>Detected Messages app</Text>
            <Text style={styles.permissionValue}>{statusTitle(status)}</Text>
            <Text style={styles.permissionStatus}>
              {needsPermission ? 'Notification Access is still required.' : 'Notification Access has been granted.'}
            </Text>
            <Pressable onPress={openNotificationAccess} style={styles.outlineButton} accessibilityRole="button">
              <Ionicons name="settings-outline" size={19} color="#006DAB" />
              <Text style={styles.outlineButtonText}>Open Notification Access</Text>
            </Pressable>
            <Pressable onPress={() => void refreshStatus()} style={styles.textButton} accessibilityRole="button">
              <Text style={styles.textButtonText}>Check again</Text>
            </Pressable>
          </View>
        ) : null}

        {isLast ? (
          <View style={styles.scanStartCard}>
            <View style={styles.scanStartHeading}>
              <Ionicons name="radio-outline" size={22} color="#00A875" />
              <Text style={styles.scanStartTitle}>Real-Time Scanning</Text>
            </View>
            <Text style={styles.scanStartText}>
              {status?.status === 'active'
                ? 'Active: NotiCare is ready to monitor your default Messages app.'
                : 'You can turn this on now or later from Dashboard settings.'}
            </Text>
            <Pressable
              disabled={loading || status?.status === 'active'}
              onPress={() => void enableScanning()}
              style={[styles.enableButton, (loading || status?.status === 'active') && styles.disabled]}
              accessibilityRole="button"
            >
              <Text style={styles.enableButtonText}>
                {status?.status === 'active'
                  ? 'Scanning is active'
                  : loading
                    ? 'Checking…'
                    : 'Turn on Real-Time Scanning'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.footer}>
          {index > 0 ? (
            <Pressable
              onPress={() => setIndex((current) => current - 1)}
              style={styles.backButton}
              accessibilityRole="button"
            >
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable
            onPress={() => {
              if (isLast) void finish();
              else setIndex((current) => current + 1);
            }}
            style={styles.nextButton}
            accessibilityRole="button"
          >
            <Text style={styles.nextText}>{isLast ? 'Open Dashboard' : 'Continue'}</Text>
            <Ionicons name={isLast ? 'checkmark' : 'arrow-forward'} size={18} color="#fff" />
          </Pressable>
        </View>
        <Pressable onPress={() => router.push('/guide')} style={styles.guideLink} accessibilityRole="button">
          <Ionicons name="book-outline" size={18} color="#006DAB" />
          <Text style={styles.guideText}>Read the User Guide</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F6F8FC' },
  content: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  progress: { flexDirection: 'row', justifyContent: 'center', gap: 7, marginBottom: 28 },
  progressDot: { height: 7, width: 7, borderRadius: 5, backgroundColor: '#D1DAE7' },
  progressDotActive: { width: 23, backgroundColor: '#00B87C' },
  icon: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: '#E8FAF2',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: { color: '#152B45', fontSize: 27, fontWeight: '800', textAlign: 'center', marginTop: 24 },
  body: { color: '#576F8E', fontSize: 16, lineHeight: 24, textAlign: 'center', marginTop: 13 },
  note: { flexDirection: 'row', backgroundColor: '#EDF4FA', borderRadius: 12, padding: 14, gap: 9, marginTop: 20 },
  noteText: { color: '#486482', lineHeight: 19, flex: 1, fontSize: 13 },
  permissionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginTop: 17,
    borderWidth: 1,
    borderColor: '#DDE8F1',
  },
  permissionTitle: { color: '#526D8C', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  permissionValue: { color: '#203B59', fontWeight: '700', marginTop: 6 },
  permissionStatus: { color: '#637B99', fontSize: 13, marginTop: 7 },
  outlineButton: {
    minHeight: 46,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#AFC8E3',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 15,
  },
  outlineButtonText: { color: '#006DAB', fontWeight: '800' },
  textButton: { alignSelf: 'center', padding: 12, marginTop: 2 },
  textButtonText: { color: '#006DAB', fontWeight: '700', fontSize: 13 },
  scanStartCard: {
    backgroundColor: '#EAFBF3',
    borderRadius: 14,
    padding: 16,
    marginTop: 19,
    borderWidth: 1,
    borderColor: '#BCEBD5',
  },
  scanStartHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanStartTitle: { color: '#1C4A3A', fontWeight: '800', fontSize: 16 },
  scanStartText: { color: '#507667', lineHeight: 19, marginTop: 7, fontSize: 13 },
  enableButton: {
    height: 49,
    borderRadius: 9,
    marginTop: 14,
    backgroundColor: '#00B87C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  enableButtonText: { color: '#fff', fontWeight: '800' },
  disabled: { opacity: 0.55 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 30 },
  backButton: { paddingVertical: 13, paddingHorizontal: 8 },
  backText: { color: '#526D8C', fontWeight: '700' },
  nextButton: {
    minHeight: 50,
    borderRadius: 10,
    backgroundColor: '#1E2D43',
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  nextText: { color: '#fff', fontWeight: '800' },
  guideLink: { alignSelf: 'center', flexDirection: 'row', gap: 7, alignItems: 'center', marginTop: 22, padding: 8 },
  guideText: { color: '#006DAB', fontWeight: '700', fontSize: 13 },
});
