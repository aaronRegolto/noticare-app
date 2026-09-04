import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

type GuideTopic = { title: string; body: string };

const topics: GuideTopic[] = [
  {
    title: 'What NotiCare does',
    body: 'NotiCare checks notifications only from your current default Messages app. It looks for common phishing and credential-theft warning signs on your device.',
  },
  {
    title: 'Signing in with a one-time code',
    body: 'Choose your country code, enter your mobile number, then tap Send OTP. Enter the six-digit code that arrives by SMS. Your phone number is used for authentication; NotiCare does not upload your full SMS messages.',
  },
  {
    title: 'Notification access',
    body: 'Android requires Notification Access for real-time scanning. NotiCare checks the Messages app package before it reads notification text.',
  },
  {
    title: 'Turn Real-Time Scanning on or off',
    body: 'Open Dashboard settings and use the Real-Time Scanning switch. When turning it on, allow Notification Access in Android settings, return to NotiCare, and check that a default Messages app is detected.',
  },
  {
    title: 'Threat levels',
    body: 'Safe means no meaningful warning signs were found. Suspicious means caution is recommended. Dangerous means strong phishing evidence was found.',
  },
  {
    title: 'Choose Block or Ignore',
    body: 'For a Dangerous message, NotiCare explains the warning signs and asks you to Block or Ignore it. Block suppresses the notification when Android allows it; Ignore leaves it visible. Neither choice deletes the original SMS from your Messages inbox.',
  },
  {
    title: 'Manual Scan',
    body: 'Long-press an SMS in Messages, tap Copy, return to NotiCare, tap Paste, then choose Scan Message. NotiCare never opens links it finds.',
  },
  {
    title: 'History',
    body: 'History contains only Dangerous real-time notifications that NotiCare successfully suppressed. Manual scans, Safe messages, and visible Suspicious messages do not appear there.',
  },
  {
    title: 'Privacy',
    body: 'Full SMS content, sender numbers, notification titles, and raw links stay on your device. Community reporting contains only anonymous classification metadata.',
  },
  {
    title: 'Notification-permission troubleshooting',
    body: 'If scanning says Permission required, open Android Notification Access from Dashboard settings. Turn on NotiCare, then return to the app. Android may show the service as disconnected for a short time after access is granted.',
  },
  {
    title: 'Hidden notification previews',
    body: 'If Messages hides the preview text on your lock screen, NotiCare cannot safely guess the content. Unlock your device and check Messages directly. A status of content unavailable does not mean a message is Safe.',
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
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const visibleTopics = useMemo(
    () => topics.filter((topic) => `${topic.title} ${topic.body}`.toLowerCase().includes(query.trim().toLowerCase())),
    [query],
  );

  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={12}>
          <Ionicons name="arrow-back" size={25} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>User Guide</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Ionicons name="book-outline" size={27} color="#00B87C" />
          <View>
            <Text style={styles.heroTitle}>How NotiCare protects you</Text>
            <Text style={styles.heroCopy}>Simple answers to keep you safe.</Text>
          </View>
        </View>
        <View style={styles.search}>
          <Ionicons name="search" size={20} color="#7288A6" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search the guide"
            placeholderTextColor="#8497B0"
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
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color="#647B9A" />
              </View>
              {open ? <Text style={styles.topicBody}>{topic.body}</Text> : null}
            </Pressable>
          );
        })}
        {!visibleTopics.length ? <Text style={styles.empty}>No guide topics match your search.</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F6F8FC' },
  header: {
    height: 62,
    backgroundColor: '#1E2D43',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: '#fff', fontWeight: '800', fontSize: 18 },
  headerSpacer: { width: 25 },
  content: { padding: 16, gap: 10 },
  hero: {
    flexDirection: 'row',
    gap: 13,
    backgroundColor: '#ECFCF5',
    borderRadius: 14,
    padding: 17,
    alignItems: 'center',
    marginBottom: 4,
  },
  heroTitle: { color: '#193754', fontWeight: '800', fontSize: 16 },
  heroCopy: { color: '#607B99', marginTop: 3 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 13,
    height: 49,
    gap: 8,
    marginBottom: 4,
  },
  searchInput: { flex: 1, color: '#1F3653', fontSize: 15 },
  topic: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E7ECF3' },
  topicRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topicTitle: { color: '#253D5C', fontWeight: '700', fontSize: 15, flex: 1, paddingRight: 10 },
  topicBody: { color: '#637998', lineHeight: 21, marginTop: 12 },
  empty: { color: '#637998', textAlign: 'center', marginTop: 35 },
});
