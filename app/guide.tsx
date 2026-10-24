import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useMemo, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/src/theme/ThemeProvider';
import type { ThemeColors } from '@/src/theme/palette';

type GuideTopic = { title: string; body: string };

const topics: GuideTopic[] = [
  {
    title: 'What NotiCare does',
    body: 'NotiCare checks notifications from the apps you enable in Settings: your default Messages app and Messenger. It looks for common scam, phishing, and threat warning signs on your device. Safe messages are checked in memory and discarded; only Suspicious or Dangerous alerts appear in Messages.',
  },
  {
    title: 'Signing in with a one-time code',
    body: 'Choose your country code, enter your mobile number, then tap Send code. Enter the six-digit verification code that arrives by SMS. Your phone number is used for authentication; NotiCare does not upload your full SMS messages.',
  },
  {
    title: 'Notification access',
    body: 'Android requires Notification Access for real-time scanning. NotiCare checks the package and your per-app selection before it reads notification text. Messenger is optional and appears as unavailable when not installed. Android or the source app may hide message previews.',
  },
  {
    title: 'Turn Real-Time Scanning on or off',
    body: 'Open Dashboard settings, use the Real-Time Scanning switch, and select which installed apps to monitor. Optional Identify saved senders checks whether a flagged sender matches a contact on your phone; contact details are never copied or uploaded. When turning scanning on, allow Notification Access in Android settings and return to NotiCare.',
  },
  {
    title: 'Threat levels',
    body: 'Safe means no meaningful warning signs were found, and its risk score is always 0. Suspicious (30–69) means caution is recommended. Dangerous (70–100) means strong phishing evidence was found.',
  },
  {
    title: 'Choose Block & Report or Ignore',
    body: 'For a Suspicious or Dangerous message, NotiCare shows the warning signs, how many points each added to the risk score, and asks you to choose. Block & Report hides the notification (Android may not always allow this), marks the protected alert in History as blocked, and shares the message text so other NotiCare users can spot it. Ignore leaves it visible. If the same message arrives again after you blocked it, NotiCare hides it automatically and only shows a short "Already blocked" notice. Neither choice deletes the original SMS from your Messages app.',
  },
  {
    title: 'Manual Scan',
    body: 'Tap Take a photo and point your camera at the message — even on someone else’s phone — or tap Upload screenshot. NotiCare reads the text on this phone and deletes the photo. Check the text, especially any links, then tap Check message. You can also copy an SMS in Messages and tap Paste text. NotiCare never opens links it finds.',
  },
  {
    title: 'Safe Link Protection',
    body: 'When NotiCare is your default browser, it checks links that Android sends to a browser before opening them. Safe links open in your chosen browser; risky links show a warning. Facebook and Messenger may open links in an in-app browser that NotiCare cannot transparently inspect. Use Share → NotiCare to check a shared link, or enable the source app’s “open links externally” option where available. The check happens on your phone; NotiCare never opens or loads the link to check it.',
  },
  {
    title: 'Turn on Safe Link Protection',
    body: 'Open Settings & Privacy and tap Set as default browser under Safe Link Protection, then choose NotiCare when Android asks. Under "Open safe links in", pick the browser you normally use (for example Chrome); safe links will keep opening there. On a warning screen, tap Go back to stay safe, or Open anyway if you are sure the link is legitimate. To turn protection off, set a different default browser in Android settings.',
  },
  {
    title: 'Most Reported Phishing Messages',
    body: 'When you tap Block & Report, NotiCare saves the message on this device and, once online, shares its exact text and risk score so other NotiCare users can be warned about the same scam. The Dashboard’s "Most Reported Phishing Messages" list ranks the scams reported by the most people, with separate tabs for Manual scans and Real-time. This is the only action in NotiCare that uploads message text; Ignore never uploads anything.',
  },
  {
    title: 'Messages inbox',
    body: 'Messages shows only notifications classified Suspicious or Dangerous. Safe conversations are checked on-device and immediately discarded, not saved. Search alert senders or message text, filter by category, risk, unread/blocked status, and month, then tap an alert for details. Earlier SMS and Manual Scan results are not imported. Deleting an alert does not delete the original message.',
  },
  {
    title: 'Privacy',
    body: 'Full SMS content, sender numbers, notification titles, and raw links stay on your device. Community reporting contains only anonymous classification metadata, except the text of messages you Block & Report. You can permanently delete your account from Settings & Privacy. The full Privacy Policy is at admin.noticare.site/privacy.',
  },
  {
    title: 'Notification permission troubleshooting',
    body: 'If scanning says Permission required, open Android Notification Access from Dashboard settings. Turn on NotiCare, then return to the app. Android may show the service as disconnected for a short time after access is granted.',
  },
  {
    title: 'Hidden notification previews',
    body: 'If Messages hides the preview text on your lock screen, NotiCare cannot safely guess the content and shows "Content redacted" instead. That status does not mean the message is Safe — unlock your device and check Messages directly.',
  },
  {
    title: 'Offline troubleshooting',
    body: 'Real-time scanning and manual scans work locally without internet. Community charts and anonymous feedback need a connection. Cached community data is labeled when you are offline.',
  },
  {
    title: 'Changed Messages app',
    body: 'NotiCare checks the current Android default SMS app each time it receives a notification. If you change it, return to Dashboard settings and make sure the new app is shown.',
  },
  {
    title: 'False positives and false negatives',
    body: 'A legitimate message can look suspicious, and a scam can avoid known warning signs. Use the feedback controls after a Manual Scan and always verify unexpected requests independently.',
  },
  {
    title: 'Application limitations',
    body: 'NotiCare only examines available notifications from your default SMS app. It cannot scan hidden previews, delete SMS messages, or guarantee that every phishing attempt will be found.',
  },
  {
    title: 'Safety advice',
    body: 'Do not tap suspicious links or share passwords, PINs, or OTPs. Contact organizations through official apps, websites, or verified phone numbers. NotiCare cannot guarantee detection of every scam.',
  },
];

export default function GuideScreen() {
  const router = useRouter();
  // Follows the Light / Dark / System choice in Settings, like the rest of the app.
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Set when onboarding hands off here, so the guide is the first stop before the Dashboard.
  const welcome = useLocalSearchParams<{ welcome?: string }>().welcome === '1';
  const leave = useCallback(() => {
    if (!welcome && router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router, welcome]);
  // On the first-run guide there's nothing behind it, so Android's back button goes to the
  // Dashboard instead of closing the app.
  useFocusEffect(
    useCallback(() => {
      if (!welcome) return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        leave();
        return true;
      });
      return () => subscription.remove();
    }, [leave, welcome]),
  );
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const visibleTopics = useMemo(
    () => topics.filter((topic) => `${topic.title} ${topic.body}`.toLowerCase().includes(query.trim().toLowerCase())),
    [query],
  );

  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Pressable
          onPress={leave}
          accessibilityRole="button"
          accessibilityLabel={welcome ? 'Continue to Dashboard' : 'Go back'}
          hitSlop={12}
        >
          <Ionicons name="arrow-back" size={25} color={colors.headerText} />
        </Pressable>
        <Text style={styles.headerTitle}>User Guide</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Ionicons name="book-outline" size={27} color={colors.accent} />
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>How NotiCare protects you</Text>
            <Text style={styles.heroCopy}>
              {welcome
                ? "You're all set. Take a minute to learn how NotiCare works, then continue to your Dashboard."
                : 'Answers to common questions about how NotiCare works.'}
            </Text>
          </View>
        </View>
        <View style={styles.search}>
          <Ionicons name="search" size={20} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search the guide"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            accessibilityLabel="Search the user guide"
          />
        </View>
        {visibleTopics.map((topic) => {
          const open = expanded === topic.title;
          return (
            <Pressable
              key={topic.title}
              onPress={() => setExpanded(open ? null : topic.title)}
              style={styles.topic}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
            >
              <View style={styles.topicRow}>
                <Text style={styles.topicTitle}>{topic.title}</Text>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
              </View>
              {open ? <Text style={styles.topicBody}>{topic.body}</Text> : null}
            </Pressable>
          );
        })}
        {!visibleTopics.length ? <Text style={styles.empty}>No guide topics match your search.</Text> : null}
        {welcome ? (
          <Pressable onPress={leave} style={styles.continueButton} accessibilityRole="button">
            <Text style={styles.continueText}>Continue to Dashboard</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.accentContrast} />
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    header: {
      height: 62,
      backgroundColor: colors.headerBg,
      paddingHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerTitle: { color: colors.headerText, fontWeight: '800', fontSize: 18 },
    headerSpacer: { width: 25 },
    content: { padding: 16, gap: 10 },
    hero: {
      flexDirection: 'row',
      gap: 13,
      backgroundColor: colors.accentSoft,
      borderRadius: 14,
      padding: 17,
      alignItems: 'center',
      marginBottom: 4,
    },
    heroText: { flex: 1 },
    heroTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 16 },
    heroCopy: { color: colors.textSecondary, marginTop: 3 },
    search: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 13,
      height: 49,
      gap: 8,
      marginBottom: 4,
    },
    searchInput: { flex: 1, color: colors.textPrimary, fontSize: 15 },
    topic: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    topicRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    topicTitle: { color: colors.textPrimary, fontWeight: '700', fontSize: 15, flex: 1, paddingRight: 10 },
    topicBody: { color: colors.textSecondary, lineHeight: 21, marginTop: 12 },
    empty: { color: colors.textMuted, textAlign: 'center', marginTop: 35 },
    continueButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 14,
      paddingVertical: 15,
      borderRadius: 12,
      backgroundColor: colors.accent,
    },
    continueText: { color: colors.accentContrast, fontWeight: '800', fontSize: 15 },
  });
}
