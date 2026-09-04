import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CommunityRange } from '@/backend/supabase/types/database.types';
import { getCommunityStats, summarizeCommunity, type CommunityPoint } from '@/src/services/community';
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

const navy = '#1E2D43';
const emerald = '#00B87C';

type CommunityState = {
  points: CommunityPoint[];
  source: 'network' | 'cache' | null;
  loading: boolean;
  error: string | null;
};

function ShieldMark({ size = 28, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <View style={[styles.shieldMark, { width: size + 14, height: size + 14 }, dark && styles.shieldMarkDark]}>
      <Ionicons name="shield-checkmark-outline" size={size} color={dark ? '#fff' : emerald} />
    </View>
  );
}

function statusDetails(status: MonitoringStatus | null) {
  if (!status)
    return {
      title: 'ANDROID BUILD REQUIRED',
      description: 'Install an Android development or release build to use real-time scanning.',
      color: '#C77700',
      active: false,
    };
  switch (status.status) {
    case 'active':
      return {
        title: 'MONITORING ACTIVE',
        description: `Checking ${status.defaultSmsAppName ?? 'your Messages app'} only.`,
        color: emerald,
        active: true,
      };
    case 'off':
      return {
        title: 'MONITORING OFF',
        description: 'Turn on Real-Time Scanning when you are ready.',
        color: '#D4DDE8',
        active: false,
      };
    case 'permission_required':
      return {
        title: 'PERMISSION REQUIRED',
        description: 'Allow Android Notification Access to turn on scanning.',
        color: '#FFB020',
        active: false,
      };
    case 'service_disconnected':
      return {
        title: 'SERVICE DISCONNECTED',
        description: 'Android has not connected the notification listener yet.',
        color: '#FFB020',
        active: false,
      };
    case 'sms_app_unavailable':
      return {
        title: 'MESSAGES APP UNAVAILABLE',
        description: 'Set a default SMS app in Android settings first.',
        color: '#FF6B6B',
        active: false,
      };
  }
}

function percentage(value: number, total: number) {
  return total ? `${Math.round((value / total) * 100)}%` : '0%';
}

function dayLabel(point: CommunityPoint, range: CommunityRange) {
  const date = new Date(point.date);
  if (Number.isNaN(date.getTime())) return '';
  if (range === 'today') return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(date);
  if (range === 'last_6_months') return new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function CommunityChart({ points, range }: { points: CommunityPoint[]; range: CommunityRange }) {
  const bars = points.slice(-12);
  const maximum = Math.max(1, ...bars.map((point) => point.blocked_count));
  const width = 328;
  const height = 148;
  const baseline = 116;
  const gap = 7;
  const barWidth = Math.max(8, (width - gap * Math.max(0, bars.length - 1)) / Math.max(1, bars.length));
  return (
    <View accessibilityLabel="Chart of anonymously aggregated blocked dangerous messages">
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {[0, 1, 2].map((index) => (
          <Line
            key={index}
            x1="0"
            x2={width}
            y1={22 + index * 47}
            y2={22 + index * 47}
            stroke="#E4EBF2"
            strokeWidth="1"
          />
        ))}
        {bars.map((point, index) => {
          const value = point.blocked_count;
          const barHeight = Math.max(value ? 4 : 0, (value / maximum) * 90);
          const x = index * (barWidth + gap);
          return (
            <Rect
              key={`${point.date}-${index}`}
              x={x}
              y={baseline - barHeight}
              width={barWidth}
              height={barHeight}
              rx="3"
              fill={value ? emerald : '#D9E4EE'}
            />
          );
        })}
      </Svg>
      <View style={styles.chartLabels}>
        {bars
          .filter((_, index) => index === 0 || index === bars.length - 1 || index === Math.floor(bars.length / 2))
          .map((point, index) => (
            <Text key={`${point.date}-${index}`} style={styles.chartLabel}>
              {dayLabel(point, range)}
            </Text>
          ))}
      </View>
    </View>
  );
}

function Metric({
  icon,
  title,
  value,
  hint,
  green = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: string;
  hint: string;
  green?: boolean;
}) {
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
  const [monitoring, setMonitoring] = useState<MonitoringStatus | null>(null);
  const [savingSwitch, setSavingSwitch] = useState(false);
  const [history, setHistory] = useState<HistorySummary[]>([]);
  const [range, setRange] = useState<CommunityRange>('today');
  const [community, setCommunity] = useState<CommunityState>({ points: [], source: null, loading: true, error: null });

  const refreshMonitoringAndHistory = useCallback(async () => {
    if (!isNativeMonitoringAvailable()) {
      setMonitoring(null);
      setHistory([]);
      return;
    }
    const [nextStatus, records] = await Promise.all([getMonitoringStatus(), getHistory()]);
    setMonitoring(nextStatus);
    setHistory(records);
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

  useFocusEffect(
    useCallback(() => {
      void refreshMonitoringAndHistory().catch((error) => logError('dashboard-native-status-failed', error));
      void refreshCommunity(range);
      void flushQueuedThreatEvents();
      void flushNativeTelemetry();
    }, [range, refreshCommunity, refreshMonitoringAndHistory]),
  );

  const changeScanning = useCallback(
    async (enabled: boolean) => {
      if (!isNativeMonitoringAvailable()) {
        Alert.alert(
          'Android development build required',
          'Expo Go cannot run NotiCare’s Kotlin notification listener. Build and install the Android development build first.',
        );
        return;
      }
      if (enabled && !monitoring?.notificationAccessGranted) {
        Alert.alert(
          'Allow Notification Access?',
          'NotiCare must receive Android notification events before it can check the default Messages app. It ignores every other app before reading any content.',
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
          Alert.alert('Scanning is not active yet', statusDetails(next).description);
      } catch (error) {
        logError('scan-switch-failed', error);
        Alert.alert('Unable to change scanning', 'Please try again after checking Android settings.');
      } finally {
        setSavingSwitch(false);
      }
    },
    [monitoring],
  );

  const summary = useMemo(() => summarizeCommunity(community.points), [community.points]);
  const total = summary.safe + summary.suspicious + summary.dangerous;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const blockedToday = history.filter((record) => record.receivedAt >= todayStart).length;
  const blockedThisMonth = history.filter((record) => record.receivedAt >= monthStart).length;
  const monitor = statusDetails(monitoring);
  const ranges: [CommunityRange, string][] = [
    ['today', 'Today'],
    ['last_7_days', '7 days'],
    ['last_30_days', '30 days'],
    ['last_6_months', '6 months'],
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="light" />
      <View style={styles.appBar}>
        <ShieldMark size={25} />
        <View style={styles.brandCopy}>
          <Text style={styles.brand}>NotiCare</Text>
          <Text style={styles.tagline}>Smishing Shield</Text>
        </View>
        <Pressable
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
        style={styles.contentArea}
        contentContainerStyle={[styles.content, { paddingBottom: 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statusCard}>
          <View style={styles.statusHeading}>
            <View style={styles.statusHeadingCopy}>
              <Text style={styles.statusTitle}>NotiCare Smishing Shield</Text>
              <Text style={styles.statusDate}>Your Android SMS protection</Text>
            </View>
            <ShieldMark size={25} dark />
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
                <Ionicons name="power-outline" size={18} color="#D9E1EE" />
                <Text style={styles.scanText}>Real-time Scan</Text>
              </View>
              <Text style={styles.onText}>{monitoring?.scanningEnabled ? 'ON' : 'OFF'}</Text>
              <Switch
                value={Boolean(monitoring?.scanningEnabled)}
                disabled={savingSwitch}
                onValueChange={(value) => void changeScanning(value)}
                trackColor={{ false: '#8391A4', true: emerald }}
                thumbColor="#fff"
                accessibilityLabel="Turn real-time scanning on or off"
              />
            </View>
          </View>
          <Text style={styles.blockedNote}>
            “Blocked” means a dangerous notification was suppressed when Android allowed it. The original SMS is never
            deleted.
          </Text>
        </View>

        <View style={styles.matrixCard}>
          <View style={styles.matrixHeader}>
            <Ionicons name="warning-outline" size={22} color="#FF9F0A" />
            <Text style={styles.matrixTitle}>Community Threat Assessment</Text>
            <Pressable
              onPress={() =>
                Alert.alert(
                  'Threat levels',
                  'Dangerous: strong rule-based phishing evidence. Suspicious: warning signs or the on-device prototype need caution. Safe: lower estimated risk, never a guarantee. Counts are aggregated and anonymous.',
                )
              }
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Explain community threat levels"
            >
              <Ionicons name="information-circle-outline" size={20} color="#617A9B" />
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
                    : 'Anonymous aggregate data only — never individual messages.'}
                </Text>
                <View style={styles.summaryCards}>
                  <View style={[styles.summaryCard, styles.dangerSummary]}>
                    <Ionicons name="shield-outline" size={18} color="#B42318" />
                    <Text style={styles.summaryName}>Dangerous</Text>
                    <Text style={[styles.summaryValue, { color: '#B42318' }]}>{summary.dangerous}</Text>
                    <Text style={styles.summaryPercent}>{percentage(summary.dangerous, total)}</Text>
                  </View>
                  <View style={[styles.summaryCard, styles.warningSummary]}>
                    <Ionicons name="warning-outline" size={18} color="#A35C00" />
                    <Text style={styles.summaryName}>Suspicious</Text>
                    <Text style={[styles.summaryValue, { color: '#A35C00' }]}>{summary.suspicious}</Text>
                    <Text style={styles.summaryPercent}>{percentage(summary.suspicious, total)}</Text>
                  </View>
                  <View style={[styles.summaryCard, styles.safeSummary]}>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#007D59" />
                    <Text style={styles.summaryName}>Safe</Text>
                    <Text style={[styles.summaryValue, { color: '#007D59' }]}>{summary.safe}</Text>
                    <Text style={styles.summaryPercent}>{percentage(summary.safe, total)}</Text>
                  </View>
                </View>
              </>
            )}
          </View>
        </View>

        <View style={styles.chartCard}>
          <View style={styles.chartTitleRow}>
            <View>
              <Text style={styles.chartTitle}>Dangerous SMS successfully blocked</Text>
              <Text style={styles.chartCopy}>Anonymous community aggregate</Text>
            </View>
            <Text style={styles.chartTotal}>{summary.blocked}</Text>
          </View>
          <View style={styles.rangeRow}>
            {ranges.map(([key, label]) => (
              <Pressable
                key={key}
                onPress={() => {
                  setRange(key);
                  void refreshCommunity(key);
                }}
                style={[styles.rangeButton, range === key && styles.rangeButtonActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: range === key }}
              >
                <Text style={[styles.rangeText, range === key && styles.rangeTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {community.loading ? (
            <View style={styles.chartPlaceholder}>
              <Text style={styles.muted}>Loading chart…</Text>
            </View>
          ) : community.error ? (
            <View style={styles.chartPlaceholder}>
              <Text style={styles.muted}>No chart data available.</Text>
            </View>
          ) : community.points.length ? (
            <CommunityChart points={community.points} range={range} />
          ) : (
            <View style={styles.chartPlaceholder}>
              <Ionicons name="bar-chart-outline" size={32} color="#ABC0D5" />
              <Text style={styles.muted}>No anonymous blocked-message data for this range yet.</Text>
            </View>
          )}
        </View>

        <View style={styles.localTitleRow}>
          <Text style={styles.localTitle}>Your protected device</Text>
          <Pressable onPress={() => router.push('/history')} accessibilityRole="button">
            <Text style={styles.historyLink}>View History</Text>
          </Pressable>
        </View>
        <View style={styles.metrics}>
          <Metric icon="shield-outline" title="Blocked today" value={String(blockedToday)} hint="This device" />
          <Metric
            icon="trending-down"
            title="Blocked this month"
            value={String(blockedThisMonth)}
            hint="This device"
            green
          />
          <Metric
            icon="archive-outline"
            title="Total blocked"
            value={String(history.length)}
            hint="Protected History"
          />
        </View>
        <Pressable onPress={() => router.push('/guide')} style={styles.guideCard} accessibilityRole="button">
          <Ionicons name="book-outline" size={22} color="#006DAB" />
          <View style={styles.flex}>
            <Text style={styles.guideTitle}>Need help staying safe?</Text>
            <Text style={styles.guideText}>Read the beginner-friendly User Guide.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#6784A1" />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // The safe-area inset is part of the navy app header, not the page surface.
  // This keeps Android's status icons visible over the header on edge-to-edge devices.
  safeArea: { flex: 1, backgroundColor: navy },
  contentArea: { flex: 1, backgroundColor: '#F7F9FC' },
  appBar: {
    height: 66,
    backgroundColor: navy,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
    elevation: 10,
  },
  shieldMark: { borderRadius: 10, backgroundColor: '#334258', alignItems: 'center', justifyContent: 'center' },
  shieldMarkDark: { backgroundColor: emerald },
  brandCopy: { marginLeft: 10 },
  brand: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  tagline: { color: '#CFD7E3', fontSize: 12, marginTop: 1 },
  menuButton: { marginLeft: 'auto', padding: 4 },
  flex: { flex: 1 },
  content: { padding: 10, gap: 16 },
  statusCard: {
    backgroundColor: '#273850',
    borderRadius: 14,
    padding: 19,
    shadowColor: '#12233C',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  statusHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  statusHeadingCopy: { flex: 1, paddingRight: 8 },
  statusTitle: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  statusDate: { color: '#CBD5E3', marginTop: 5, fontSize: 13 },
  monitorPanel: {
    backgroundColor: '#405168',
    borderColor: '#627187',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginTop: 17,
  },
  monitorTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  panelLabel: { color: '#D3DBE5', fontSize: 11 },
  panelStatus: { fontSize: 16, fontWeight: '800', marginTop: 5 },
  liveDot: { width: 11, height: 11, borderRadius: 6 },
  monitorDescription: { color: '#D9E4F0', fontSize: 12, marginTop: 8, lineHeight: 17 },
  panelDivider: { backgroundColor: '#67768A', height: 1, marginVertical: 13 },
  scanRow: { flexDirection: 'row', alignItems: 'center' },
  scanLabel: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 },
  scanText: { color: '#E0E6EE', fontSize: 13 },
  onText: { color: '#FFF', fontWeight: '700', fontSize: 12, marginRight: 10 },
  blockedNote: { color: '#C7D5E5', fontSize: 11, lineHeight: 16, marginTop: 12 },
  matrixCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EDF0F4',
    shadowColor: '#1E2D43',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  matrixHeader: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'center',
    backgroundColor: '#F2F6FB',
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  matrixTitle: { fontWeight: '700', fontSize: 17, color: '#111827', flex: 1 },
  matrixBody: { padding: 16 },
  aggregateNotice: { color: '#6B83A3', fontSize: 12, lineHeight: 17 },
  summaryCards: { flexDirection: 'row', gap: 8, marginTop: 13 },
  summaryCard: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, minHeight: 112 },
  dangerSummary: { backgroundColor: '#FFF0F0', borderColor: '#FFD0D0' },
  warningSummary: { backgroundColor: '#FFF8E9', borderColor: '#FFE1A6' },
  safeSummary: { backgroundColor: '#ECFCF5', borderColor: '#B7F0D7' },
  summaryName: { color: '#516B89', fontWeight: '700', fontSize: 11, marginTop: 5 },
  summaryValue: { fontWeight: '800', fontSize: 22, marginTop: 6 },
  summaryPercent: { color: '#6F88A7', fontSize: 11, marginTop: 1 },
  muted: { color: '#7187A6', textAlign: 'center', lineHeight: 19, fontSize: 13 },
  errorText: { color: '#B42318', lineHeight: 19, fontSize: 13 },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#EDF4FA',
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 9,
    marginTop: 10,
  },
  retryText: { color: '#006DAB', fontWeight: '800', fontSize: 12 },
  chartCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E7EDF3' },
  chartTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  chartTitle: { color: '#243F5E', fontWeight: '800', fontSize: 15 },
  chartCopy: { color: '#7087A6', fontSize: 12, marginTop: 3 },
  chartTotal: { color: emerald, fontWeight: '800', fontSize: 23 },
  rangeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14, marginBottom: 13 },
  rangeButton: { borderRadius: 14, paddingHorizontal: 9, paddingVertical: 7, backgroundColor: '#F0F4F8' },
  rangeButtonActive: { backgroundColor: navy },
  rangeText: { color: '#5E7695', fontSize: 11, fontWeight: '700' },
  rangeTextActive: { color: '#fff' },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 1, marginTop: -12 },
  chartLabel: { color: '#7990AC', fontSize: 10 },
  chartPlaceholder: { height: 130, alignItems: 'center', justifyContent: 'center', gap: 8 },
  localTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  localTitle: { color: '#314866', fontWeight: '800', fontSize: 16 },
  historyLink: { color: '#006DAB', fontWeight: '700', fontSize: 12 },
  metrics: { flexDirection: 'row', gap: 8 },
  metricCard: {
    flex: 1,
    backgroundColor: '#FFF',
    minHeight: 142,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    shadowColor: '#1E2D43',
    shadowOpacity: 0.09,
    shadowRadius: 7,
    elevation: 2,
  },
  metricIcon: {
    width: 42,
    height: 42,
    borderRadius: 22,
    backgroundColor: navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
  },
  metricIconGreen: { backgroundColor: emerald },
  metricTitle: { color: '#314461', fontWeight: '700', fontSize: 11, textAlign: 'center' },
  metricValue: { color: navy, fontSize: 23, fontWeight: '800', marginTop: 5 },
  metricValueGreen: { color: '#00885F' },
  metricHint: { color: '#7087A8', fontSize: 10, marginTop: 2, textAlign: 'center' },
  guideCard: {
    backgroundColor: '#ECF5FC',
    borderRadius: 13,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  guideTitle: { color: '#1D4264', fontWeight: '800' },
  guideText: { color: '#607B99', fontSize: 12, marginTop: 2 },
});
