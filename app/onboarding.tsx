import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '@/src/components/brand-logo';
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
    body: 'NotiCare checks message notifications on your phone for scam and threat warning signs. Safe messages are checked on-device and immediately discarded; only suspicious alerts are saved. SMS scanning is available by default; Messenger scanning is an optional app-by-app choice in Settings.',
    note: "NotiCare can't check messages whose preview Android hides, and no app can catch every scam, so stay alert.",
  },
  {
    icon: 'notifications-outline' as const,
    title: 'Allow notification access',
    body: 'Android needs Notification Access for real-time scanning. NotiCare reads only notifications from apps you enable in Settings: your default Messages app and Messenger.',
    note: 'Other apps are ignored before their notification text is read. Some selected apps may hide or redact previews.',
  },
  {
    icon: 'speedometer-outline' as const,
    title: 'Understand the warnings',
    body: 'Every message gets a risk score from 0 to 100. Safe (0) has no strong warning signs, Suspicious (1–59) means be careful, and Dangerous (60–100) has stronger warning signs. For risky messages, NotiCare shows why and lets you choose Block & Report or Ignore.',
    note: 'Blocking only hides a notification. It never deletes the original message from its source app.',
  },
  {
    icon: 'lock-closed-outline' as const,
    title: 'Your privacy comes first',
    body: 'Your messages, senders, and links stay on this phone. NotiCare only shares anonymous counts, like how many messages were flagged. The one exception is when you tap Block & Report: that message’s text is shared so other NotiCare users can be warned.',
    note: 'You can turn scanning off, delete your saved History, or read the User Guide anytime from Settings.',
  },
];

function statusTitle(status: MonitoringStatus | null) {
  if (!status) return 'Checking…';
  if (status.defaultSmsAppName) return status.defaultSmsAppName;
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
        {index === 0 ? (
          <View style={styles.logo}>
            <BrandLogo size={120} />
          </View>
        ) : (
          <View style={styles.icon}>
            <Ionicons name={page.icon} size={48} color="#00B87C" />
          </View>
        )}
        <Text style={styles.title}>{page.title}</Text>
        <Text style={styles.body}>{page.body}</Text>
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={20} color="#426484" />
          <Text style={styles.noteText}>{page.note}</Text>
        </View>

        {index === 1 ? (
          <View style={styles.permissionCard}>
            <Text style={styles.permissionTitle}>Your Messages app</Text>
            <Text style={styles.permissionValue}>{statusTitle(status)}</Text>
            <Text style={styles.permissionStatus}>
              {needsPermission
                ? 'Notification Access is off. Turn it on to start protection.'
                : 'Notification Access is on.'}
            </Text>
            <Pressable onPress={openNotificationAccess} style={styles.outlineButton} accessibilityRole="button">
              <Ionicons name="settings-outline" size={19} color="#006DAB" />
              <Text style={styles.outlineButtonText}>Open Notification Access settings</Text>
            </Pressable>
            <Pressable onPress={() => void refreshStatus()} style={styles.textButton} accessibilityRole="button">
              <Text style={styles.textButtonText}>Refresh status</Text>
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
                ? 'On. NotiCare is checking new messages from your Messages app.'
                : 'Turn it on now, or later from the Dashboard.'}
            </Text>
            <Pressable
              disabled={loading || status?.status === 'active'}
              onPress={() => void enableScanning()}
              style={[styles.enableButton, (loading || status?.status === 'active') && styles.disabled]}
              accessibilityRole="button"
            >
              <Text style={styles.enableButtonText}>
                {status?.status === 'active' ? 'Scanning is on' : loading ? 'Checking…' : 'Turn on Real-Time Scanning'}
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
              if (isLast) {
                // Onboarding hands off to the User Guide as the starting point; its
                // "Continue to Dashboard" button then opens the app proper.
                void finish().then(() => router.replace('/guide?welcome=1'));
              } else setIndex((current) => current + 1);
            }}
            style={styles.nextButton}
            accessibilityRole="button"
          >
            <Text style={styles.nextText}>{isLast ? 'Open User Guide' : 'Continue'}</Text>
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
  logo: { alignSelf: 'center', marginTop: 8, marginBottom: 4 },
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
