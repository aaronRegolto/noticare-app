import Ionicons from '@expo/vector-icons/Ionicons';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '@/src/components/brand-logo';
import {
  CommunityNotificationPermissionError,
  CommunityNotificationSetupError,
  disableCommunityNotifications,
  enableCommunityNotifications,
  isCommunityNotificationsEnabled,
} from '@/src/services/communityPushNotifications';
import {
  getCommunityReportFeed,
  type CommunityDetectedIn,
  type CommunityReportFeedEntry,
  type CommunityReportType,
} from '@/src/services/communityReports';
import { logError } from '@/src/services/logger';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import type { ThemeColors } from '@/src/theme/palette';

const feedPageSize = 100;

function detectedInLabel(source: CommunityDetectedIn) {
  switch (source) {
    case 'manual':
      return 'Manual Scan';
    case 'messages':
      return 'Messages';
    case 'messenger':
      return 'Messenger';
    case 'unknown':
      return 'Source not recorded';
  }
}

function reportTypeLabel(type: CommunityReportType) {
  switch (type) {
    case 'phishing':
      return 'Phishing';
    case 'spam':
      return 'Spam';
    case 'threat':
      return 'Threat';
    case 'unknown':
      return 'Unknown type';
  }
}

export default function CommunityNotificationsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [entries, setEntries] = useState<CommunityReportFeedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const nextEntries = await getCommunityReportFeed(feedPageSize);
      setEntries(nextEntries);
      setHasMore(nextEntries.length === feedPageSize);
      setLoadMoreError(false);
      setError(null);
    } catch (loadError) {
      logError('community-report-feed-load-failed', loadError);
      setEntries([]);
      setError('Community alerts are temporarily unavailable. Check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const nextEntries = await getCommunityReportFeed(feedPageSize, entries.length);
      setEntries((current) => {
        const knownIds = new Set(current.map((entry) => entry.reportEventId));
        return [...current, ...nextEntries.filter((entry) => !knownIds.has(entry.reportEventId))];
      });
      setHasMore(nextEntries.length === feedPageSize);
    } catch (loadError) {
      logError('community-report-feed-next-page-failed', loadError);
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [entries.length, hasMore, loadingMore]);

  useFocusEffect(
    useCallback(() => {
      void load();
      void isCommunityNotificationsEnabled()
        .then(setNotificationsEnabled)
        .catch((loadError) => logError('community-notification-preference-read-failed', loadError));
      const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
        if (notification.request.content.data?.screen === 'community') void load(true);
      });
      return () => receivedSubscription.remove();
    }, [load]),
  );

  const toggleNotifications = useCallback(
    async (enabled: boolean) => {
      if (notificationsBusy) return;
      setNotificationsBusy(true);
      try {
        if (enabled) {
          await enableCommunityNotifications();
          setNotificationsEnabled(true);
        } else {
          await disableCommunityNotifications();
          setNotificationsEnabled(false);
        }
      } catch (toggleError) {
        if (toggleError instanceof CommunityNotificationPermissionError) {
          Alert.alert('Allow notifications', 'Android notification permission is needed to receive community alerts.', [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open settings', onPress: () => void Linking.openSettings() },
          ]);
        } else if (toggleError instanceof CommunityNotificationSetupError) {
          logError('community-notification-enable-failed', toggleError);
          if (toggleError.stage === 'project-config') {
            Alert.alert(
              'App setup required',
              'This build is missing the Expo project ID. Rebuild the app with its current Expo configuration.',
            );
          } else if (toggleError.stage === 'push-token') {
            Alert.alert(
              'Push setup required',
              'Could not create a push token. Use an installed development or release build on a physical Android device (not Expo Go), check your internet connection, and make sure FCM v1 credentials are configured for the Expo project. Rebuild after changing credentials.',
            );
          } else {
            Alert.alert(
              'Could not register alerts',
              'The device could not be registered with NotiCare. Check your internet connection and sign-in, then try again. If it persists, the community push-token database migration may not be applied.',
            );
          }
        } else {
          logError('community-notification-enable-failed', toggleError);
          Alert.alert(
            enabled ? 'Could not enable alerts' : 'Could not turn off alerts',
            'Please check your connection and try again.',
          );
        }
      } finally {
        setNotificationsBusy(false);
      }
    },
    [notificationsBusy],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="light" />
      <View style={styles.appBar}>
        <BrandLogo size={44} />
        <View style={styles.brandCopy}>
          <Text style={styles.brand}>NotiCare</Text>
        </View>
        <Pressable
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          hitSlop={12}
          style={styles.menuButton}
        >
          <Ionicons name="menu" color="#fff" size={29} />
        </Pressable>
      </View>
      <ScrollView
        style={styles.contentArea}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
          />
        }
      >
        <View style={styles.notificationPreference}>
          <View style={styles.preferenceCopy}>
            <Text style={styles.preferenceTitle}>Receive community alerts</Text>
            <Text style={styles.preferenceDescription}>
              Get a notification when another user reports a suspicious message. Alerts do not include message text.
            </Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={(enabled) => void toggleNotifications(enabled)}
            disabled={notificationsBusy}
            trackColor={{ false: colors.border, true: colors.accent }}
            accessibilityLabel="Receive community alerts"
          />
        </View>
        <View style={styles.notice}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.accent} />
          <Text style={styles.noticeText}>
            Reported messages appear below with links and contact details redacted where detected. Redaction may miss
            personal information. Sender names are never shown; the detecting app is identified when known. Categories
            use recorded scanner indicators; Safe-message spam labels stay on this device.
          </Text>
        </View>
        {loading ? <ActivityIndicator size="large" color={colors.accent} /> : null}
        {!loading && error ? <Text style={styles.error}>{error}</Text> : null}
        {!loading && !error && !entries.length ? (
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={36} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No community reports yet</Text>
            <Text style={styles.emptyText}>New anonymous reports will appear here.</Text>
          </View>
        ) : null}
        {entries.map((entry) => (
          <View key={entry.reportEventId} style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons
                name="alert-circle-outline"
                size={20}
                color={
                  entry.reportType === 'phishing'
                    ? '#B42318'
                    : entry.reportType === 'threat'
                      ? '#A75C00'
                      : entry.reportType === 'spam'
                        ? '#6941C6'
                        : colors.textMuted
                }
              />
              <Text
                style={[
                  styles.typeBadge,
                  entry.reportType === 'phishing'
                    ? styles.phishingBadge
                    : entry.reportType === 'threat'
                      ? styles.threatBadge
                      : entry.reportType === 'spam'
                        ? styles.spamBadge
                        : styles.unknownBadge,
                ]}
              >
                {reportTypeLabel(entry.reportType)}
              </Text>
              <Text style={styles.source}>Detected in {detectedInLabel(entry.detectedIn)}</Text>
            </View>
            <Text style={styles.messageLabel}>Reported message (redacted)</Text>
            <Text style={styles.message}>{entry.messagePreview}</Text>
          </View>
        ))}
        {loadMoreError ? <Text style={styles.error}>Could not load older reports. Try again.</Text> : null}
        {hasMore && !loading ? (
          <Pressable
            onPress={() => void loadMore()}
            disabled={loadingMore}
            style={styles.loadMoreButton}
            accessibilityRole="button"
          >
            {loadingMore ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={styles.loadMoreText}>Load older reports</Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.headerBg },
    contentArea: { flex: 1, backgroundColor: colors.background },
    appBar: {
      height: 66,
      backgroundColor: colors.headerBg,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      shadowColor: '#0E1726',
      shadowOpacity: 0.18,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    brandCopy: { marginLeft: 10 },
    brand: { color: '#FFF', fontWeight: '800', fontSize: 16 },
    menuButton: { marginLeft: 'auto', padding: 4 },
    content: { padding: 16, gap: 12 },
    notificationPreference: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
    },
    preferenceCopy: { flex: 1, gap: 4 },
    preferenceTitle: { color: colors.textPrimary, fontWeight: '800' },
    preferenceDescription: { color: colors.textSecondary, lineHeight: 18, fontSize: 12 },
    notice: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'flex-start',
      backgroundColor: colors.accentSoft,
      borderRadius: 12,
      padding: 12,
    },
    noticeText: { flex: 1, color: colors.textSecondary, lineHeight: 18 },
    error: { color: '#B42318', textAlign: 'center' },
    empty: { alignItems: 'center', padding: 36, gap: 8 },
    emptyTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 16 },
    emptyText: { color: colors.textMuted, textAlign: 'center' },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 7,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
    typeBadge: {
      borderRadius: 999,
      overflow: 'hidden',
      paddingHorizontal: 9,
      paddingVertical: 4,
      fontSize: 11,
      fontWeight: '800',
    },
    phishingBadge: { backgroundColor: '#FEE4E2', color: '#B42318' },
    threatBadge: { backgroundColor: '#FEF0C7', color: '#A75C00' },
    spamBadge: { backgroundColor: '#F4EBFF', color: '#6941C6' },
    unknownBadge: { backgroundColor: colors.border, color: colors.textSecondary },
    source: { flex: 1, color: colors.textPrimary, fontWeight: '800' },
    messageLabel: { color: colors.textPrimary, fontWeight: '700', fontSize: 12 },
    message: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
    loadMoreButton: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 13,
    },
    loadMoreText: { color: colors.accent, fontWeight: '800' },
  });
}
