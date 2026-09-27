import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { openInRealBrowser } from '@/src/services/linkHandler';
import { logError } from '@/src/services/logger';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import type { ThemeColors } from '@/src/theme/palette';

type Verdict = 'SUSPICIOUS' | 'DANGEROUS';

// English for now; centralized here so a future Filipino translation only has to change this one object.
const COPY = {
  DANGEROUS: {
    title: "Don't open this link",
    subtitle: 'This link is DANGEROUS',
  },
  SUSPICIOUS: {
    title: 'Be careful with this link',
    subtitle: 'This link looks SUSPICIOUS',
  },
  goBack: 'Go back',
  openAnyway: 'Open anyway',
  confirmTitle: 'Are you sure?',
  confirmBody: 'NotiCare flagged this link as risky. Opening it anyway could expose your accounts or personal information.',
  confirmCancel: 'Cancel',
  confirmProceed: 'Open anyway',
  openFailedTitle: 'Could not open this link',
  openFailedBody: 'Please try again, or check that a browser is installed on this device.',
};

function extractHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Renders [url] with its host visually emphasized so the risky part stands out. */
function HighlightedUrl({ url, host, colors }: { url: string; host: string | null; colors: ThemeColors }) {
  if (!host) {
    return <Text style={[styles.url, { color: colors.textPrimary }]}>{url}</Text>;
  }
  const hostIndex = url.indexOf(host);
  if (hostIndex === -1) {
    return <Text style={[styles.url, { color: colors.textPrimary }]}>{url}</Text>;
  }
  const before = url.slice(0, hostIndex);
  const after = url.slice(hostIndex + host.length);
  return (
    <Text style={[styles.url, { color: colors.textPrimary }]}>
      {before}
      <Text style={styles.urlHost}>{host}</Text>
      {after}
    </Text>
  );
}

export default function LinkWarningScreen() {
  const { url, verdict: rawVerdict, reason } = useLocalSearchParams<{ url?: string; verdict?: string; reason?: string }>();
  const router = useRouter();
  const { colors } = useAppTheme();

  // A malformed/missing verdict defaults to the more cautious DANGEROUS treatment.
  const verdict: Verdict = rawVerdict === 'SUSPICIOUS' ? 'SUSPICIOUS' : 'DANGEROUS';
  const isDangerous = verdict === 'DANGEROUS';
  const tone = isDangerous ? colors.danger : colors.warning;
  const toneSoft = isDangerous ? colors.dangerSoft : colors.warningSoft;
  const host = useMemo(() => (url ? extractHost(url) : null), [url]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const openAnyway = () => {
    Alert.alert(COPY.confirmTitle, COPY.confirmBody, [
      { text: COPY.confirmCancel, style: 'cancel' },
      {
        text: COPY.confirmProceed,
        style: 'destructive',
        onPress: () => {
          if (!url) return;
          openInRealBrowser(url)
            .then(() => goBack())
            .catch((error) => {
              logError('open-anyway-failed', error);
              Alert.alert(COPY.openFailedTitle, COPY.openFailedBody);
            });
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: toneSoft }]}>
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: tone }]}>
          <Ionicons name={isDangerous ? 'warning' : 'alert-circle'} size={40} color="#fff" />
        </View>

        <Text style={[styles.subtitle, { color: tone }]}>{COPY[verdict].subtitle}</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{COPY[verdict].title}</Text>

        <View style={[styles.urlCard, { backgroundColor: colors.surface, borderColor: tone }]}>
          <HighlightedUrl url={url ?? ''} host={host} colors={colors} />
        </View>

        {reason ? (
          <Text style={[styles.reason, { color: colors.textSecondary }]}>{reason}</Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={goBack}
          style={[styles.primaryButton, { backgroundColor: tone }]}
          accessibilityRole="button"
          accessibilityLabel={COPY.goBack}
        >
          <Text style={styles.primaryButtonText}>{COPY.goBack}</Text>
        </Pressable>
        <Pressable onPress={openAnyway} style={styles.secondaryButton} accessibilityRole="button">
          <Text style={[styles.secondaryButtonText, { color: colors.textMuted }]}>{COPY.openAnyway}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  subtitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8, textTransform: 'uppercase' },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 22 },
  urlCard: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 16,
  },
  url: { fontSize: 14, lineHeight: 20 },
  urlHost: { fontWeight: '800' },
  reason: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  actions: { paddingHorizontal: 28, paddingBottom: 28, gap: 14 },
  primaryButton: { borderRadius: 14, paddingVertical: 17, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  secondaryButton: { alignItems: 'center', paddingVertical: 8 },
  secondaryButtonText: { fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
});
