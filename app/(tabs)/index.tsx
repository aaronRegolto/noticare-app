import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CommunityRange } from '@/backend/supabase/types/database.types';
import { BlockedTrendCard } from '@/src/components/blocked-trend-card';
import { SpotlightTour, type TourStep } from '@/src/components/spotlight-tour';
import { useSubscription } from '@/src/providers/SubscriptionProvider';
import { DASHBOARD_TOUR_KEY, useFirstVisitTour } from '@/src/hooks/use-first-visit-tour';
import { messagesTabRef, setActiveTourTab } from '@/src/navigation/tabBarRefs';
import { getCommunityStats, summarizeCommunity, type CommunityPoint } from '@/src/services/community';
import {
  flushNativeCommunityReports,
  flushQueuedPhishingReports,
  getViralPhishingRanking,
  RankingUnavailableError,
  type ReportSource,
  type ViralPhishingEntry,
} from '@/src/services/communityReports';
import { flushNativeTelemetry, flushQueuedThreatEvents } from '@/src/services/eventSync';
import { logError } from '@/src/services/logger';
import {
  getHistory,
  getMonitoringStatus,
  isNativeMonitoringAvailable,
  requestNotificationListenerAccess,
  setScanningEnabled,
  type HistorySummary,
  type MonitoringStatus,
} from '@/src/services/notificationListener';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import type { ThemeColors } from '@/src/theme/palette';

type CommunityState = {
  points: CommunityPoint[];
  source: 'network' | 'cache' | null;
  loading: boolean;
  error: string | null;
};

type ViralState = {
  entries: ViralPhishingEntry[];
  source: 'network' | 'cache' | null;
  loading: boolean;
  error: string | null;
  /** An expected, non-retryable state (for example, the database update isn't applied yet). */
  notice?: string | null;
};

function timeAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function ViralEntryRow({
  entry,
  rank,
  first = false,
  colors,
}: {
  entry: ViralPhishingEntry;
  rank: number;
  first?: boolean;
  colors: ThemeColors;
}) {
  const styles = useThemedStyles(colors);
  return (
    <View style={[styles.viralRow, first && styles.viralRowFirst]}>
      <View style={styles.viralRank}>
        <Text style={styles.viralRankText}>#{rank}</Text>
      </View>
      <View style={styles.flex}>
        <Text numberOfLines={2} style={styles.viralMessage}>
          {entry.messageText}
        </Text>
        <View style={styles.viralMetaRow}>
          <Text style={styles.viralMeta}>
            {entry.reportCount} {entry.reportCount === 1 ? 'report' : 'reports'} · {timeAgo(entry.lastReportedAt)}
          </Text>
        </View>
      </View>
      <View style={styles.viralScoreBox}>
        <Text style={styles.viralScoreValue}>{entry.viralScore}</Text>
        <Text style={styles.viralScoreMax}>/100</Text>
      </View>
    </View>
  );
}

function ShieldMark({ size = 28, dark = false, colors }: { size?: number; dark?: boolean; colors: ThemeColors }) {
  const styles = useThemedStyles(colors);
  return (
    <View style={[styles.shieldMark, { width: size + 14, height: size + 14 }, dark && styles.shieldMarkDark]}>
      <Ionicons name="shield-checkmark-outline" size={size} color={dark ? '#fff' : colors.accent} />
    </View>
  );
}

function statusDetails(status: MonitoringStatus | null, colors: ThemeColors) {
  if (!status)
    return {
      title: 'ANDROID APP REQUIRED',
      description: 'Real-time scanning is not available in this preview. Install the Android app to use it.',
      color: colors.warning,
      active: false,
    };
  switch (status.status) {
    case 'active':
      return {
        title: 'MONITORING ACTIVE',
        description: `Checking ${status.defaultSmsAppName ?? 'your Messages app'} only.`,
        color: colors.accent,
        active: true,
      };
    case 'off':
      return {
        title: 'MONITORING OFF',
        description: 'Real-Time Scanning is currently off.',
        color: colors.headerTextMuted,
        active: false,
      };
    case 'permission_required':
      return {
        title: 'PERMISSION REQUIRED',
        description: 'Allow Android Notification Access to turn on scanning.',
        color: colors.warning,
        active: false,
      };
    case 'service_disconnected':
      return {
        title: 'SERVICE DISCONNECTED',
        description: 'Android has not connected the notification listener yet.',
        color: colors.warning,
        active: false,
      };
    case 'sms_app_unavailable':
      return {
        title: 'MESSAGES APP UNAVAILABLE',
        description: 'Set a default SMS app in Android settings first.',
        color: colors.danger,
        active: false,
      };
  }
}

function percentage(value: number, total: number) {
  return total ? `${Math.round((value / total) * 100)}%` : '0%';
}

function Metric({
  icon,
  title,
  value,
  hint,
  green = false,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: string;
  hint: string;
  green?: boolean;
  colors: ThemeColors;
}) {
  const styles = useThemedStyles(colors);
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, green && styles.metricIconGreen]}>
        <Ionicons name={icon} size={24} color="#fff" />
      </View>
      <Text style={styles.metricTitle}>{title}</Text>
      <Text style={[styles.metricValue, green && styles.metricValueGreen]}>{value}</Text>
      <Text style={styles.metricHint}>{hint}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(colors);
  const { tier: subscriptionTier } = useSubscription();
  const [monitoring, setMonitoring] = useState<MonitoringStatus | null>(null);
  const [savingSwitch, setSavingSwitch] = useState(false);
  const [history, setHistory] = useState<HistorySummary[]>([]);
  const [range, setRange] = useState<CommunityRange>('today');
  const [community, setCommunity] = useState<CommunityState>({ points: [], source: null, loading: true, error: null });
  const [viral, setViral] = useState<ViralState>({ entries: [], source: null, loading: true, error: null });
  const [viralSource, setViralSource] = useState<ReportSource>('manual');
  const viralSourceRef = useRef<ReportSource>('manual');
  const tour = useFirstVisitTour(DASHBOARD_TOUR_KEY);

  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const settingsButtonRef = useRef<View>(null);
  const scanToggleRef = useRef<View>(null);
  const communityCardRef = useRef<View>(null);

  // Scrolls a tour target to the same fixed band below the header on every step, unconditionally.
  // An "only scroll if not already visible" check sounds cheaper, but it means each step's framing
  // depends on wherever the previous step happened to leave the scroll position — which is how a
  // sliver of the prior card ended up lingering right above the highlighted one. Scrolling is
  // instant (not animated) so there is no animation-duration race with the measurement that follows.
  // Uses `measureInWindow` (arch-agnostic) rather than `measureLayout`, whose relative-node
  // argument behaves differently between React Native's old and new architectures.
  const scrollTargetIntoView = useCallback((targetRef: React.RefObject<View | null>) => {
    const node = targetRef.current;
    if (!node) return;
    node.measureInWindow((_x, y) => {
      const targetOffsetFromHeader = 110;
      const delta = y - targetOffsetFromHeader;
      if (Math.abs(delta) < 4) return; // near enough; skip a no-op scroll
      scrollRef.current?.scrollTo({ y: Math.max(0, scrollOffsetRef.current + delta), animated: false });
    });
  }, []);

  const refreshMonitoringAndHistory = useCallback(async () => {
    if (!isNativeMonitoringAvailable()) {
      setMonitoring(null);
      setHistory([]);
      return;
    }
    const [nextStatus, records] = await Promise.all([getMonitoringStatus(), getHistory()]);
    setMonitoring(nextStatus);
    setHistory(records.filter((record) => record.blocked ?? true));
  }, []);

  const refreshCommunity = useCallback(async (selectedRange: CommunityRange) => {
    setCommunity((current) => ({ ...current, loading: true, error: null }));
    try {
      const result = await getCommunityStats(selectedRange);
      setCommunity({ points: result.points, source: result.source, loading: false, error: null });
    } catch (error) {
      logError('community-stats-load-failed', error);
      setCommunity((current) => ({
        ...current,
        loading: false,
        error: 'Community data is unavailable. Check your connection and try again.',
      }));
    }
  }, []);

  const refreshViralRanking = useCallback(async (reportSource: ReportSource = viralSourceRef.current) => {
    setViral((current) => ({ ...current, loading: true, error: null }));
    try {
      const { entries, source } = await getViralPhishingRanking(reportSource, 10);
      // Ignore a slower response for a tab the user has already switched away from.
      if (reportSource !== viralSourceRef.current) return;
      setViral({ entries, source, loading: false, error: null });
    } catch (error) {
      logError('viral-ranking-load-failed', error);
      if (reportSource !== viralSourceRef.current) return;
      if (error instanceof RankingUnavailableError) {
        setViral({ entries: [], source: null, loading: false, error: null, notice: error.message });
        return;
      }
      setViral((current) => ({
        ...current,
        loading: false,
        error: 'Unable to load the most-reported phishing messages.',
      }));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshMonitoringAndHistory().catch((error) => logError('dashboard-native-status-failed', error));
      void refreshCommunity(range);
      void flushQueuedThreatEvents();
      void flushNativeTelemetry();
      // Upload queued reports first (real-time Block & Report taps wait in the native queue until
      // the app opens), then load the ranking, so a fresh report is in the list on this visit.
      // The ranking RPC is Pro-gated server-side; skip it entirely for Free so it doesn't error.
      void Promise.allSettled([flushQueuedPhishingReports(), flushNativeCommunityReports()]).then(() => {
        if (subscriptionTier === 'pro') void refreshViralRanking();
      });
      tour.checkNow();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [range, refreshCommunity, refreshMonitoringAndHistory, refreshViralRanking, subscriptionTier]),
  );

  const changeScanning = useCallback(
    async (enabled: boolean) => {
      if (!isNativeMonitoringAvailable()) {
        Alert.alert(
          'Android app required',
          'Real-time scanning is not available in this preview. Install the Android app to turn it on.',
        );
        return;
      }
      if (enabled && !monitoring?.notificationAccessGranted) {
        Alert.alert(
          'Allow Notification Access?',
          'NotiCare needs Android Notification Access to check your default Messages app. It ignores every other app.',
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Open settings',
              onPress: () => {
                // The user has explicitly switched scanning on. Persist that intent so
                // Android can become Active as soon as access is granted and the app
                // returns, while the listener still sees permission-required until then.
                void setScanningEnabled(true)
                  .then(setMonitoring)
                  .then(() => requestNotificationListenerAccess())
                  .catch(() =>
                    Alert.alert('Settings unavailable', 'Android Notification Access settings could not be opened.'),
                  );
              },
            },
          ],
        );
        return;
      }
      setSavingSwitch(true);
      try {
        const next = await setScanningEnabled(enabled);
        setMonitoring(next);
        if (enabled && next.status !== 'active')
          Alert.alert('Scanning could not turn on', statusDetails(next, colors).description);
      } catch (error) {
        logError('scan-switch-failed', error);
        Alert.alert('Unable to change scanning', 'Check Android’s notification settings and try again.');
      } finally {
        setSavingSwitch(false);
      }
    },
    [monitoring, colors],
  );

  const summary = useMemo(() => summarizeCommunity(community.points), [community.points]);
  const total = summary.safe + summary.suspicious + summary.dangerous;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const blockedToday = history.filter((record) => record.receivedAt >= todayStart).length;
  const blockedThisMonth = history.filter((record) => record.receivedAt >= monthStart).length;
  const monitor = statusDetails(monitoring, colors);

  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        key: 'scan-toggle',
        title: 'Real-Time Scanning',
        description:
          'This switch turns Real-Time Scanning on or off. When it is on, NotiCare checks new SMS notifications from your default Messages app in the background.',
        targetRef: scanToggleRef,
        spotlightOffset: { y: 32 },
      },
      {
        key: 'community',
        title: 'Community Threat Assessment',
        description:
          'These anonymous, aggregated counts show how many messages were rated Dangerous, Suspicious, or Safe — never your own message contents.',
        targetRef: communityCardRef,
        beforeMeasure: () => scrollTargetIntoView(communityCardRef),
        // Align the Android ScrollView measurement with the rendered card.
        spotlightOffset: { y: 48 },
      },
      {
        key: 'messages',
        title: 'Messages',
        description:
          'Blocked notifications are saved in your encrypted, on-device Messages inbox. Open this tab anytime to review what NotiCare caught.',
        targetRef: messagesTabRef,
        // The real tab button renders an elevated outline while this step is active.
        // Avoid a second SVG cut-out: navigator coordinates can drift from its visible button.
        hideCutout: true,
        onEnter: () => setActiveTourTab('messages'),
        onExit: () => setActiveTourTab(null),
      },
      {
        key: 'settings',
        title: 'Settings',
        description:
          'Manage permissions, choose a warning style, switch between light and dark themes, and pick an accent color.',
        targetRef: settingsButtonRef,
        shape: 'circle',
        // Header press targets report above their visible Android position; align to the hamburger.
        spotlightOffset: { y: 48 },
      },
    ],
    [scrollTargetIntoView],
  );

  return (
    // SpotlightTour is a sibling of SafeAreaView, not a child of it: SafeAreaView pads for the
    // top inset, which would shift the overlay's coordinate origin away from the true window
    // origin that `measureInWindow` (used to find each tour target) measures against.
    <>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.appBar}>
          <ShieldMark size={25} colors={colors} />
          <View style={styles.brandCopy}>
            <Text style={styles.brand}>NotiCare</Text>
            <Text style={styles.tagline}>Smishing Shield</Text>
          </View>
          <Pressable
            ref={settingsButtonRef}
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            style={styles.menuButton}
            hitSlop={10}
          >
            <Ionicons name="menu" color="#fff" size={29} />
          </Pressable>
        </View>
        <ScrollView
          ref={scrollRef}
          style={styles.contentArea}
          contentContainerStyle={[styles.content, { paddingBottom: 24 }]}
          showsVerticalScrollIndicator={false}
          onScroll={(event) => {
            scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
        >
          <View style={styles.statusCard}>
            <View style={styles.statusHeading}>
              <View style={styles.statusHeadingCopy}>
                <Text style={styles.statusTitle}>NotiCare Smishing Shield</Text>
                <Text style={styles.statusDate}>Your Android SMS protection</Text>
              </View>
              <ShieldMark size={25} dark colors={colors} />
            </View>
            <View style={styles.monitorPanel}>
              <View style={styles.monitorTop}>
                <View style={styles.flex}>
                  <Text style={styles.panelLabel}>SYSTEM STATUS</Text>
                  <Text style={[styles.panelStatus, { color: monitor.color }]}>{monitor.title}</Text>
                </View>
                <View style={[styles.liveDot, { backgroundColor: monitor.color }]} />
              </View>
              <Text style={styles.monitorDescription}>{monitor.description}</Text>
              <View style={styles.panelDivider} />
              <View style={styles.scanRow}>
                <View style={styles.scanLabel}>
                  <Ionicons name="power-outline" size={18} color={colors.headerTextMuted} />
                  <Text style={styles.scanText}>Real-Time Scanning</Text>
                </View>
                <View ref={scanToggleRef} style={styles.scanControl} collapsable={false}>
                  <Text style={styles.onText}>{monitoring?.scanningEnabled ? 'ON' : 'OFF'}</Text>
                  <Switch
                    value={Boolean(monitoring?.scanningEnabled)}
                    disabled={savingSwitch}
                    onValueChange={(value) => void changeScanning(value)}
                    trackColor={{ false: '#8391A4', true: colors.accent }}
                    thumbColor="#fff"
                    accessibilityLabel="Turn real-time scanning on or off"
                  />
                </View>
              </View>
            </View>
          </View>

          <View style={styles.matrixCard} ref={communityCardRef} collapsable={false}>
            <View style={styles.matrixHeader}>
              <Ionicons name="warning-outline" size={22} color={colors.warning} />
              <Text style={styles.matrixTitle}>Community Threat Assessment</Text>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    'Threat levels',
                    'Dangerous: strong evidence of phishing. Suspicious: some warning signs, but not enough to confirm a scam. Safe: lower estimated risk — never a guarantee. All counts are anonymous and aggregated.',
                  )
                }
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Explain community threat levels"
              >
                <Ionicons name="information-circle-outline" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <View style={styles.matrixBody}>
              {community.loading ? (
                <Text style={styles.muted}>Loading anonymous community data…</Text>
              ) : community.error ? (
                <View>
                  <Text style={styles.errorText}>{community.error}</Text>
                  <Pressable
                    onPress={() => void refreshCommunity(range)}
                    style={styles.retryButton}
                    accessibilityRole="button"
                  >
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <Text style={styles.aggregateNotice}>
                    {community.source === 'cache'
                      ? 'Showing cached anonymous aggregate data (offline).'
                      : 'Anonymous community data.'}
                  </Text>
                  <View style={styles.summaryCards}>
                    <View style={[styles.summaryCard, styles.dangerSummary]}>
                      <Ionicons name="shield-outline" size={18} color={colors.danger} />
                      <Text style={styles.summaryName}>Dangerous</Text>
                      <Text style={[styles.summaryValue, { color: colors.danger }]}>{summary.dangerous}</Text>
                      <Text style={styles.summaryPercent}>{percentage(summary.dangerous, total)}</Text>
                    </View>
                    <View style={[styles.summaryCard, styles.warningSummary]}>
                      <Ionicons name="warning-outline" size={18} color={colors.warning} />
                      <Text style={styles.summaryName}>Suspicious</Text>
                      <Text style={[styles.summaryValue, { color: colors.warning }]}>{summary.suspicious}</Text>
                      <Text style={styles.summaryPercent}>{percentage(summary.suspicious, total)}</Text>
                    </View>
                    <View style={[styles.summaryCard, styles.safeSummary]}>
                      <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
                      <Text style={styles.summaryName}>Safe</Text>
                      <Text style={[styles.summaryValue, { color: colors.success }]}>{summary.safe}</Text>
                      <Text style={styles.summaryPercent}>{percentage(summary.safe, total)}</Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          </View>

          <BlockedTrendCard
            points={community.points}
            range={range}
            onRangeChange={(next) => {
              setRange(next);
              void refreshCommunity(next);
            }}
            loading={community.loading}
            error={community.error}
            fromCache={community.source === 'cache'}
            colors={colors}
          />

          <View style={styles.viralCard}>
            <View style={styles.matrixHeader}>
              <Ionicons name="flame-outline" size={22} color={colors.danger} />
              <Text style={styles.matrixTitle}>Most Reported Phishing Messages</Text>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    'Most reported phishing messages',
                    'When someone reports a dangerous message, its exact text is shared here so other NotiCare users can recognize it.\n\nManual scans: reported with Report & Block after a Manual Scan.\nReal-time: reported with Block & Report on a real-time warning.\n\nA score rises toward 100 as more people report the same message from that source.',
                  )
                }
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Explain the viral phishing ranking"
              >
                <Ionicons name="information-circle-outline" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <View style={styles.matrixBody}>
              {subscriptionTier === 'pro' ? (
                <View style={styles.viralTabs} accessibilityRole="tablist">
                  {(
                    [
                      ['manual', 'Manual scans', 'scan-outline'],
                      ['realtime', 'Real-time', 'flash-outline'],
                    ] as const
                  ).map(([key, label, icon]) => {
                    const active = viralSource === key;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => {
                          if (active) return;
                          viralSourceRef.current = key;
                          setViralSource(key);
                          void refreshViralRanking(key);
                        }}
                        style={[styles.viralTab, active && styles.viralTabActive]}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                      >
                        <Ionicons name={icon} size={14} color={active ? colors.textPrimary : colors.textSecondary} />
                        <Text style={[styles.viralTabText, active && styles.viralTabTextActive]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              {subscriptionTier !== 'pro' ? (
                <View>
                  <Text style={styles.muted}>
                    Viral phishing ranking is a Pro feature. Upgrade to see which scam messages are spreading most
                    widely. Reporting phishing with Block & Report is free for everyone.
                  </Text>
                  <Pressable
                    onPress={() => router.push('/paywall')}
                    style={styles.retryButton}
                    accessibilityRole="button"
                  >
                    <Text style={styles.retryText}>Upgrade to Pro</Text>
                  </Pressable>
                </View>
              ) : viral.loading ? (
                <Text style={styles.muted}>Loading reported messages…</Text>
              ) : viral.error ? (
                <View>
                  <Text style={styles.errorText}>{viral.error}</Text>
                  <Pressable
                    onPress={() => void refreshViralRanking(viralSource)}
                    style={styles.retryButton}
                    accessibilityRole="button"
                  >
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                </View>
              ) : viral.notice ? (
                <Text style={styles.muted}>{viral.notice}</Text>
              ) : viral.entries.length ? (
                <>
                  {viral.source === 'cache' ? (
                    <Text style={styles.aggregateNotice}>Showing cached data (offline).</Text>
                  ) : null}
                  {viral.entries.map((entry, index) => (
                    <ViralEntryRow
                      key={entry.reportId}
                      entry={entry}
                      rank={index + 1}
                      first={index === 0}
                      colors={colors}
                    />
                  ))}
                </>
              ) : (
                <Text style={styles.muted}>
                  {viralSource === 'manual'
                    ? 'No Manual Scan reports yet. Messages reported with Report & Block after a Manual Scan appear here.'
                    : 'No real-time reports yet. Messages reported with Block & Report on a real-time warning appear here.'}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.localTitleRow}>
            <Text style={styles.localTitle}>On this device</Text>
            <Pressable onPress={() => router.push('/history')} accessibilityRole="button">
              <Text style={styles.historyLink}>View Messages</Text>
            </Pressable>
          </View>
          <View style={styles.metrics}>
            <Metric
              icon="shield-outline"
              title="Blocked today"
              value={String(blockedToday)}
              hint="This device"
              colors={colors}
            />
            <Metric
              icon="trending-down"
              title="Blocked this month"
              value={String(blockedThisMonth)}
              hint="This device"
              green
              colors={colors}
            />
            <Metric
              icon="archive-outline"
              title="Total blocked"
              // The lifetime count, not history.length: only the newest messages are kept as full
              // detail records on-device (see Settings), but this stat keeps counting all-time.
              value={String(monitoring?.lifetimeBlockedCount ?? history.length)}
              hint="All time"
              colors={colors}
            />
          </View>
          <Pressable onPress={() => router.push('/guide')} style={styles.guideCard} accessibilityRole="button">
            <Ionicons name="book-outline" size={22} color={colors.link} />
            <View style={styles.flex}>
              <Text style={styles.guideTitle}>New to NotiCare?</Text>
              <Text style={styles.guideCopy}>Read the User Guide.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>
        </ScrollView>
      </SafeAreaView>
      <SpotlightTour steps={tourSteps} visible={tour.visible} onDone={tour.dismiss} colors={colors} />
    </>
  );
}

function useThemedStyles(colors: ThemeColors) {
  return useMemo(() => createStyles(colors), [colors]);
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // The safe-area inset is part of the dark app header, not the page surface.
    // This keeps Android's status icons visible over the header on edge-to-edge devices.
    safeArea: { flex: 1, backgroundColor: colors.headerBg },
    contentArea: { flex: 1, backgroundColor: colors.background },
    appBar: {
      height: 66,
      backgroundColor: colors.headerBg,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      zIndex: 10,
      elevation: 10,
    },
    shieldMark: {
      borderRadius: 10,
      backgroundColor: colors.headerSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    shieldMarkDark: { backgroundColor: colors.accent },
    brandCopy: { marginLeft: 10 },
    brand: { color: '#FFF', fontWeight: '800', fontSize: 16 },
    tagline: { color: colors.headerTextMuted, fontSize: 12, marginTop: 1 },
    menuButton: { marginLeft: 'auto', padding: 4 },
    flex: { flex: 1 },
    content: { padding: 10, gap: 16 },
    statusCard: {
      backgroundColor: colors.headerSurface,
      borderRadius: 14,
      padding: 19,
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 8,
      elevation: 4,
    },
    statusHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    statusHeadingCopy: { flex: 1, paddingRight: 8 },
    statusTitle: { color: '#FFF', fontSize: 22, fontWeight: '800' },
    statusDate: { color: colors.headerTextMuted, marginTop: 5, fontSize: 13 },
    monitorPanel: {
      backgroundColor: colors.scheme === 'dark' ? '#26344A' : '#405168',
      borderColor: colors.scheme === 'dark' ? '#3C4C66' : '#627187',
      borderWidth: 1,
      borderRadius: 10,
      padding: 14,
      marginTop: 17,
    },
    monitorTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    panelLabel: { color: colors.headerTextMuted, fontSize: 11 },
    panelStatus: { fontSize: 16, fontWeight: '800', marginTop: 5 },
    liveDot: { width: 11, height: 11, borderRadius: 6 },
    monitorDescription: { color: colors.headerTextMuted, fontSize: 12, marginTop: 8, lineHeight: 17 },
    panelDivider: { backgroundColor: colors.border, height: 1, marginVertical: 13 },
    scanRow: { flexDirection: 'row', alignItems: 'center' },
    scanLabel: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 },
    scanText: { color: '#E0E6EE', fontSize: 13 },
    scanControl: { flexDirection: 'row', alignItems: 'center', height: 24 },
    onText: { color: '#FFF', fontWeight: '700', fontSize: 12, marginRight: 10 },
    matrixCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOpacity: 0.07,
      shadowRadius: 8,
      elevation: 2,
    },
    matrixHeader: {
      flexDirection: 'row',
      gap: 9,
      alignItems: 'center',
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: 18,
      paddingVertical: 18,
    },
    matrixTitle: { fontWeight: '700', fontSize: 17, color: colors.textPrimary, flex: 1 },
    matrixBody: { padding: 16 },
    aggregateNotice: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
    summaryCards: { flexDirection: 'row', gap: 8, marginTop: 13 },
    summaryCard: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, minHeight: 112 },
    dangerSummary: { backgroundColor: colors.dangerSoft, borderColor: colors.danger + '33' },
    warningSummary: { backgroundColor: colors.warningSoft, borderColor: colors.warning + '33' },
    safeSummary: { backgroundColor: colors.successSoft, borderColor: colors.success + '33' },
    summaryName: { color: colors.textSecondary, fontWeight: '700', fontSize: 11, marginTop: 5 },
    summaryValue: { fontWeight: '800', fontSize: 22, marginTop: 6 },
    summaryPercent: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
    muted: { color: colors.textMuted, textAlign: 'center', lineHeight: 19, fontSize: 13 },
    errorText: { color: colors.danger, lineHeight: 19, fontSize: 13 },
    retryButton: {
      alignSelf: 'flex-start',
      backgroundColor: colors.surfaceAlt,
      borderRadius: 8,
      paddingHorizontal: 13,
      paddingVertical: 9,
      marginTop: 10,
    },
    retryText: { color: colors.link, fontWeight: '800', fontSize: 12 },
    viralCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOpacity: 0.07,
      shadowRadius: 8,
      elevation: 2,
    },
    viralRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 11,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    viralRowFirst: { borderTopWidth: 0 },
    viralTabs: {
      flexDirection: 'row',
      padding: 3,
      marginBottom: 12,
      borderRadius: 10,
      backgroundColor: colors.surfaceAlt,
    },
    viralTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      borderRadius: 8,
    },
    viralTabActive: {
      backgroundColor: colors.surface,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    viralTabText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
    viralTabTextActive: { color: colors.textPrimary, fontWeight: '800' },
    viralRank: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    viralRankText: { color: colors.textSecondary, fontWeight: '800', fontSize: 11 },
    viralMessage: { color: colors.textPrimary, fontSize: 13, lineHeight: 18 },
    viralMetaRow: { flexDirection: 'row', marginTop: 4 },
    viralMeta: { color: colors.textMuted, fontSize: 11 },
    viralScoreBox: { flexDirection: 'row', alignItems: 'flex-end' },
    viralScoreValue: { color: colors.danger, fontWeight: '800', fontSize: 18 },
    viralScoreMax: { color: colors.textMuted, fontSize: 11, marginBottom: 2 },
    localTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
    localTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 16 },
    historyLink: { color: colors.link, fontWeight: '700', fontSize: 12 },
    metrics: { flexDirection: 'row', gap: 8 },
    metricCard: {
      flex: 1,
      backgroundColor: colors.surface,
      minHeight: 142,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 8,
      shadowColor: '#000',
      shadowOpacity: 0.09,
      shadowRadius: 7,
      elevation: 2,
    },
    metricIcon: {
      width: 42,
      height: 42,
      borderRadius: 22,
      backgroundColor: colors.headerBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 7,
    },
    metricIconGreen: { backgroundColor: colors.accent },
    metricTitle: { color: colors.textSecondary, fontWeight: '700', fontSize: 11, textAlign: 'center' },
    metricValue: { color: colors.textPrimary, fontSize: 23, fontWeight: '800', marginTop: 5 },
    metricValueGreen: { color: colors.success },
    metricHint: { color: colors.textMuted, fontSize: 10, marginTop: 2, textAlign: 'center' },
    guideCard: {
      backgroundColor: colors.accentSoft,
      borderRadius: 13,
      padding: 14,
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
    },
    guideTitle: { color: colors.textPrimary, fontWeight: '800' },
    guideCopy: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  });
}
