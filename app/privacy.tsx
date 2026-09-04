import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const sections = [
  [
    'What stays on your device',
    'Full SMS text, complete sender details, and raw links stay on this device. Dangerous notifications that Android successfully suppresses can be stored in encrypted local History.',
  ],
  [
    'What can be shared anonymously',
    'Community reporting can include a random event ID, threat level, score bucket, warning-sign codes, URL count, rule version, time, and whether a realtime notification was suppressed.',
  ],
  [
    'What is never uploaded',
    'NotiCare never uploads message text, notification titles, clipboard contents, OTPs, complete sender numbers, raw URLs, encryption keys, or hardware/advertising IDs.',
  ],
  [
    'Your controls',
    'You can turn scanning off, delete one protected History record, clear all protected local History, submit feedback without sharing a message, or sign out at any time.',
  ],
];

export default function PrivacyScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
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
  note: { flexDirection: 'row', gap: 8, backgroundColor: '#EDF5FD', borderRadius: 11, padding: 13, marginTop: 4 },
  noteText: { color: '#537291', flex: 1, lineHeight: 18, fontSize: 12 },
});
