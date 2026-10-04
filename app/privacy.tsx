import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Linking, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const sections = [
  [
    'What stays on your device',
    'Scanned SMS notifications, including Safe, Suspicious, and Dangerous messages, are saved in your encrypted local Messages inbox. Sender names and previews appear in the inbox; full text and raw links stay on this device.',
  ],
  [
    'What can be shared anonymously',
    'Community reporting can include a random event ID, threat level, score bucket, warning-sign codes, URL count, rule version, time, and whether a realtime notification was suppressed.',
  ],
  [
    'What is never uploaded',
    'Notification titles, clipboard contents, OTPs, complete sender numbers, raw URLs, encryption keys, and hardware/advertising IDs are never uploaded. Message text is never uploaded either — with one exception below.',
  ],
  [
    'Reporting a message: the one exception',
    'Tapping Block & Report on a warning, or Report on a Manual Scan result, shares that exact message’s text and risk score so other NotiCare users can recognize the same scam. Reported messages appear on the Dashboard’s "Most Reported Phishing Messages" list without any information about who reported them. This only happens when you choose to report a message — never automatically.',
  ],
  [
    'Your controls',
    'You can turn scanning off, delete one captured message, clear your History, choose Ignore so nothing is shared, sign out, or permanently delete your account from Settings & Privacy at any time.',
  ],
];

const PRIVACY_POLICY_URL = 'https://admin.noticare.site/privacy';

export default function PrivacyScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={12}>
          <Ionicons name="arrow-back" color="#fff" size={25} />
        </Pressable>
        <Text style={styles.headerTitle}>Privacy information</Text>
        <View style={styles.spacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Ionicons name="lock-closed-outline" size={31} color="#00835D" />
          <Text style={styles.heroTitle}>Private by design</Text>
          <Text style={styles.heroCopy}>NotiCare minimizes data and keeps raw SMS material on your phone.</Text>
        </View>
        {sections.map(([title, copy]) => (
          <View key={title} style={styles.card}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardCopy}>{copy}</Text>
          </View>
        ))}
        <Pressable
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
          style={styles.policyLink}
          accessibilityRole="link"
        >
          <Ionicons name="document-text-outline" size={19} color="#00835D" />
          <Text style={styles.policyLinkText}>Read the full Privacy Policy</Text>
          <Ionicons name="open-outline" size={17} color="#00835D" />
        </Pressable>
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={19} color="#426485" />
          <Text style={styles.noteText}>
            NotiCare is a safety aid, not a guarantee. Do not tap suspicious links or share passwords, PINs, or OTPs.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F6F8FC' },
  header: {
    minHeight: 64,
    backgroundColor: '#1E2D43',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  spacer: { width: 25 },
  content: { padding: 16, gap: 11, paddingBottom: 36 },
  hero: { backgroundColor: '#E9FAF2', borderRadius: 14, alignItems: 'center', padding: 22 },
  heroTitle: { color: '#1C4A3A', fontSize: 21, fontWeight: '800', marginTop: 9 },
  heroCopy: { color: '#557969', textAlign: 'center', lineHeight: 19, marginTop: 6 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E3EAF2' },
  cardTitle: { color: '#29425F', fontWeight: '800', fontSize: 15 },
  cardCopy: { color: '#627A99', lineHeight: 20, marginTop: 7 },
  policyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: '#E3EAF2',
  },
  policyLinkText: { color: '#00835D', fontWeight: '800', flex: 1 },
  note: { flexDirection: 'row', gap: 8, backgroundColor: '#EDF5FD', borderRadius: 11, padding: 13, marginTop: 4 },
  noteText: { color: '#537291', flex: 1, lineHeight: 18, fontSize: 12 },
});
