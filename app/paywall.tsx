import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type BillingInterval, useSubscription } from '@/src/providers/SubscriptionProvider';
import type { QrphPayment } from '@/src/services/paymongo';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import type { ThemeColors } from '@/src/theme/palette';

type Feature = { title: string; description: string };

const featureLibrary = {
  automaticScansLimited: {
    title: '10 automatic scans / month',
    description:
      'NotiCare automatically scans incoming SMS notifications for phishing in the background. On the Free plan, this automatic protection covers your first 10 messages each calendar month; once used, incoming messages are no longer auto-scanned until next month (you can still check any message with Manual Scan).',
  },
  automaticScansUnlimited: {
    title: 'Unlimited automatic scans',
    description:
      'Every incoming SMS notification is automatically scanned for phishing in the background, all month long, with no monthly cap.',
  },
  historyLimited: {
    title: 'Last 20 messages kept',
    description:
      'NotiCare keeps a private, encrypted log of scanned messages so you can review risk scores and details later. On the Free plan, only your most recent 20 are kept — older ones are automatically removed to make room for new ones. Your real SMS messages in your Messages app are never touched.',
  },
  historyFull: {
    title: 'Full 500-message history',
    description:
      'Keeps your most recent 500 scanned messages in NotiCare’s private, encrypted log — a much longer backlog before anything is automatically removed. Your real SMS messages in your Messages app are never touched.',
  },
  manualScan: {
    title: 'Unlimited manual scan',
    description:
      'Paste any text into NotiCare to check it for phishing on demand, as many times as you like — this is never limited, on any plan.',
  },
  communityReport: {
    title: 'Report phishing to the community',
    description:
      'When NotiCare flags a message as Dangerous, you can tap Block & Report to suppress it and share that exact scam text so other NotiCare users can recognize it too. This is free for every plan.',
  },
  viralRanking: {
    title: 'Viral phishing ranking & stats',
    description:
      'See the Dashboard’s "Most Reported Phishing Messages" list — which scam texts are being reported most, and how their community score is climbing as more people confirm them.',
  },
  fullScreenWarnings: {
    title: 'Full-screen danger warnings',
    description:
      'When NotiCare catches a Dangerous message, show an immersive full-screen alert — even over a locked screen — instead of a regular notification banner, so you never miss it. Android may still fall back to a banner if it blocks the app from opening over the current screen.',
  },
} as const satisfies Record<string, Feature>;

const tierCopy = {
  free: {
    title: 'Free',
    features: [
      featureLibrary.automaticScansLimited,
      featureLibrary.historyLimited,
      featureLibrary.manualScan,
      featureLibrary.communityReport,
    ],
  },
  pro: {
    title: 'Pro',
    features: [
      featureLibrary.automaticScansUnlimited,
      featureLibrary.historyFull,
      featureLibrary.manualScan,
      featureLibrary.communityReport,
      featureLibrary.viralRanking,
      featureLibrary.fullScreenWarnings,
    ],
  },
} as const;

// Display-only — the actual charged amount always comes from this function's
// own PRICE_*_CENTAVOS secrets server-side (paymongo-create-qrph-payment),
// never from these strings.
const priceDisplay = {
  monthly: process.env.EXPO_PUBLIC_PAYMONGO_PRICE_MONTHLY ?? '—',
  annual: process.env.EXPO_PUBLIC_PAYMONGO_PRICE_ANNUAL ?? '—',
};

export default function PaywallScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(colors);
  const { tier, startQrphPayment, checkPaymentNow } = useSubscription();
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('annual');
  const [generating, setGenerating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [payment, setPayment] = useState<QrphPayment | null>(null);

  // The realtime subscription in SubscriptionProvider flips `tier` to 'pro'
  // automatically once the webhook (or the manual check below) grants it.
  useEffect(() => {
    if (tier === 'pro' && payment) {
      setPayment(null);
      Alert.alert('Welcome to Pro', 'Your subscription is now active.');
      router.back();
    }
  }, [tier, payment, router]);

  const getQrCode = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const result = await startQrphPayment(billingInterval);
      setPayment(result);
    } catch (error) {
      Alert.alert('Unable to start payment', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const checkNow = async () => {
    if (!payment || checking) return;
    setChecking(true);
    try {
      const result = await checkPaymentNow(payment.paymentIntentId);
      if (result.status !== 'succeeded') {
        Alert.alert('Not paid yet', 'We haven’t received this payment yet. Scan the QR and try again in a moment.');
      }
    } catch (error) {
      Alert.alert('Unable to check payment', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={25} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>NotiCare Plans</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {(['free', 'pro'] as const).map((key) => {
          const copy = tierCopy[key];
          const isCurrent = tier === key;
          return (
            <View key={key} style={[styles.card, isCurrent && styles.cardCurrent]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{copy.title}</Text>
                {isCurrent ? <Text style={styles.currentBadge}>Current plan</Text> : null}
              </View>
              {copy.features.map((feature) => (
                <View key={feature.title} style={styles.bulletRow}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
                  <Text style={styles.bulletText}>{feature.title}</Text>
                  <Pressable
                    onPress={() => Alert.alert(feature.title, feature.description)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`What is ${feature.title}?`}
                  >
                    <Ionicons name="information-circle-outline" size={17} color={colors.textMuted} />
                  </Pressable>
                </View>
              ))}
              {key === 'pro' && !isCurrent ? (
                <>
                  <View style={styles.intervalToggle}>
                    <Pressable
                      onPress={() => setBillingInterval('monthly')}
                      disabled={Boolean(payment)}
                      style={[styles.intervalOption, billingInterval === 'monthly' && styles.intervalOptionActive]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: billingInterval === 'monthly' }}
                    >
                      <Text style={[styles.intervalText, billingInterval === 'monthly' && styles.intervalTextActive]}>
                        Monthly
                      </Text>
                      <Text style={[styles.intervalPrice, billingInterval === 'monthly' && styles.intervalTextActive]}>
                        {priceDisplay.monthly}/mo
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setBillingInterval('annual')}
                      disabled={Boolean(payment)}
                      style={[styles.intervalOption, billingInterval === 'annual' && styles.intervalOptionActive]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: billingInterval === 'annual' }}
                    >
                      <Text style={[styles.intervalText, billingInterval === 'annual' && styles.intervalTextActive]}>
                        Yearly
                      </Text>
                      <Text style={[styles.intervalPrice, billingInterval === 'annual' && styles.intervalTextActive]}>
                        {priceDisplay.annual}/yr
                      </Text>
                    </Pressable>
                  </View>

                  {payment ? (
                    <View style={styles.qrBlock}>
                      <Image source={{ uri: payment.qrImageUrl }} style={styles.qrImage} resizeMode="contain" />
                      <Text style={styles.qrHint}>
                        Scan this QR Ph code in your banking or e-wallet app to pay. This code expires after a few
                        minutes.
                      </Text>
                      <View style={styles.waitingRow}>
                        <ActivityIndicator size="small" color={colors.accent} />
                        <Text style={styles.waitingText}>Waiting for payment…</Text>
                      </View>
                      <Pressable
                        onPress={() => void checkNow()}
                        disabled={checking}
                        style={[styles.secondaryButton, checking && styles.buyButtonDisabled]}
                        accessibilityRole="button"
                      >
                        <Text style={styles.secondaryButtonText}>{checking ? 'Checking…' : "I've already paid"}</Text>
                      </Pressable>
                      <Pressable onPress={() => setPayment(null)} style={styles.cancelRow} accessibilityRole="button">
                        <Text style={styles.cancelText}>Cancel</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => void getQrCode()}
                      disabled={generating}
                      style={[styles.buyButton, generating && styles.buyButtonDisabled]}
                      accessibilityRole="button"
                    >
                      <Text style={styles.buyButtonText}>
                        {generating
                          ? 'Generating QR…'
                          : `Pay with QR Ph · ${billingInterval === 'annual' ? priceDisplay.annual + '/yr' : priceDisplay.monthly + '/mo'}`}
                      </Text>
                    </Pressable>
                  )}
                  <Text style={styles.disclaimer}>
                    Paid via QR Ph, a one-time payment. This isn’t auto-renewing — pay again before or after your plan
                    expires to keep Pro active.
                  </Text>
                </>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function useThemedStyles(colors: ThemeColors) {
  return useMemo(() => createStyles(colors), [colors]);
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    header: {
      minHeight: 64,
      backgroundColor: colors.headerBg,
      paddingHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerTitle: { color: '#fff', fontWeight: '800', fontSize: 18 },
    headerSpacer: { width: 25 },
    content: { padding: 16, paddingBottom: 36, gap: 14 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 8,
    },
    cardCurrent: { borderColor: colors.accent },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 18 },
    currentBadge: {
      color: colors.accent,
      fontWeight: '800',
      fontSize: 11,
      backgroundColor: colors.accentSoft,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    bulletText: { color: colors.textSecondary, fontSize: 13, flex: 1 },
    intervalToggle: { flexDirection: 'row', gap: 8, marginTop: 8 },
    intervalOption: {
      flex: 1,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
      padding: 10,
      gap: 2,
    },
    intervalOptionActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
    intervalText: { color: colors.textSecondary, fontWeight: '700', fontSize: 12 },
    intervalTextActive: { color: colors.accent },
    intervalPrice: { color: colors.textPrimary, fontWeight: '800', fontSize: 14 },
    qrBlock: { alignItems: 'center', gap: 10, marginTop: 8 },
    qrImage: { width: 220, height: 220, backgroundColor: '#fff', borderRadius: 8 },
    qrHint: { color: colors.textSecondary, fontSize: 12, textAlign: 'center', paddingHorizontal: 8 },
    waitingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    waitingText: { color: colors.textMuted, fontSize: 12 },
    secondaryButton: {
      alignSelf: 'stretch',
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    secondaryButtonText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
    cancelRow: { paddingVertical: 4 },
    cancelText: { color: colors.textMuted, fontSize: 12 },
    buyButton: {
      marginTop: 8,
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: colors.accent,
    },
    buyButtonDisabled: { opacity: 0.5 },
    buyButtonText: { color: '#fff', fontWeight: '800', fontSize: 14 },
    disclaimer: { color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 4 },
  });
}
