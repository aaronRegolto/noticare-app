import Ionicons from '@expo/vector-icons/Ionicons';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
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
  disableCommunityNotifications,
  enableCommunityNotifications,
  isCommunityNotificationsEnabled,
} from '@/src/services/communityPushNotifications';
import {
  getCommunityReportFeed,
  type CommunityDetectedIn,
  type CommunityReportFeedEntry,
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
      return 'Unknown app';
  }
}

export default function CommunityNotificationsScreen() {
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
        } else {
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
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <View style={styles.appBar}>
        <BrandLogo size={38} />
        <Text style={styles.title}>Community alerts</Text>
      </View>
      <ScrollView
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
            Message previews redact links and contact details. Sender names are never shown; the detecting app is
            identified when known.
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
              <Ionicons name="alert-circle-outline" size={20} color="#B42318" />
              <Text style={styles.source}>Detected in {detectedInLabel(entry.detectedIn)}</Text>
            </View>
            <Text style={styles.message} numberOfLines={6}>
              {entry.messagePreview}
            </Text>
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
    page: { flex: 1, backgroundColor: colors.background },
    appBar: {
      height: 66,
      backgroundColor: colors.headerBg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
    },
    title: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '800' },
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
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    source: { flex: 1, color: colors.textPrimary, fontWeight: '800' },
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
