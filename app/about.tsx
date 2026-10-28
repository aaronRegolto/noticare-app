import Constants from 'expo-constants';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '@/src/components/brand-logo';
export default function AboutScreen() {
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? '1.0.0';
  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={12}>
          <Ionicons name="arrow-back" color="#fff" size={25} />
        </Pressable>
        <Text style={styles.headerTitle}>About NotiCare</Text>
        <View style={styles.spacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <BrandLogo size={96} />
        <Text style={styles.name}>NotiCare</Text>
        <Text style={styles.tagline}>Version {version}</Text>
        <View style={styles.card}>
          <Text style={styles.title}>SMS protection for Android</Text>
          <Text style={styles.copy}>
            NotiCare checks available notifications from your current default Messages app. It uses offline rules to
            identify common phishing patterns and never becomes your default SMS app.
          </Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.title}>Important limitation</Text>
          <Text style={styles.copy}>
            NotiCare cannot guarantee detection of every phishing message. Hidden previews may prevent analysis, and
            Android or the Messages app may not permit notification suppression.
          </Text>
        </View>
        <Text style={styles.footer}>NotiCare is built to help you spot scam texts before you act on them.</Text>
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
  content: { padding: 22, alignItems: 'center', gap: 13 },
  logo: {
    height: 90,
    width: 90,
    borderRadius: 27,
    backgroundColor: '#E8FAF2',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  name: { color: '#1E2D43', fontSize: 28, fontWeight: '800', marginTop: 3 },
  tagline: { color: '#66809F', marginTop: -8 },
  card: {
    alignSelf: 'stretch',
    backgroundColor: '#fff',
    borderRadius: 13,
    padding: 17,
    borderWidth: 1,
    borderColor: '#E2EAF2',
    marginTop: 5,
  },
  title: { color: '#29425F', fontWeight: '800', fontSize: 16 },
  copy: { color: '#617B99', lineHeight: 21, marginTop: 7 },
  footer: { color: '#7B90AB', textAlign: 'center', fontSize: 12, marginTop: 10 },
});
