import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '@/src/components/brand-logo';
import { getViralPhishingRanking, type ViralPhishingEntry } from '@/src/services/communityReports';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import type { ThemeColors } from '@/src/theme/palette';

function formatReportedTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function CommunityNotificationsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [entries, setEntries] = useState<ViralPhishingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const result = await getViralPhishingRanking('all', 50);
      setEntries(result.entries);
      setError(null);
    } catch {
      setEntries([]);
      setError('Community reports are temporarily unavailable.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <View style={styles.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <BrandLogo size={38} />
        <Text style={styles.title}>Community reports</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} />}
      >
        <View style={styles.notice}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.accent} />
          <Text style={styles.noticeText}>
            Reports are anonymous. Each item shows the received time and sender or number provided by the reporter.
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
          <View key={entry.reportId} style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="alert-circle-outline" size={20} color="#B42318" />
              <Text style={styles.sender}>{entry.sampleSender?.trim() || 'Unknown sender or number'}</Text>
            </View>
            <Text style={styles.time}>{formatReportedTime(entry.firstReportedAt)}</Text>
            <Text style={styles.count}>{entry.reportCount} {entry.reportCount === 1 ? 'report' : 'reports'}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    appBar: { height: 66, backgroundColor: colors.headerBg, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
    title: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '800' },
    content: { padding: 16, gap: 12 },
    notice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: colors.accentSoft, borderRadius: 12, padding: 12 },
    noticeText: { flex: 1, color: colors.textSecondary, lineHeight: 18 },
    error: { color: '#B42318', textAlign: 'center' },
    empty: { alignItems: 'center', padding: 36, gap: 8 },
    emptyTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 16 },
    emptyText: { color: colors.textMuted, textAlign: 'center' },
    card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 7 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    sender: { flex: 1, color: colors.textPrimary, fontWeight: '800' },
    time: { color: colors.textMuted, fontSize: 12 },
    message: { color: colors.textSecondary, lineHeight: 19 },
    count: { color: '#B42318', fontSize: 12, fontWeight: '800' },
  });
}
