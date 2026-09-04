import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  clearHistory,
  deleteHistoryRecord,
  getHistory,
  getHistoryRecord,
  isNativeMonitoringAvailable,
  type HistoryRecord,
  type HistorySummary,
} from '@/src/services/notificationListener';
import { logError } from '@/src/services/logger';

const navy = '#1E2D43';

function Header() {
  const router = useRouter();
  return (
    <View style={styles.appBar}>
      <View style={styles.shieldMark}>
        <Ionicons name="shield-checkmark-outline" size={25} color="#00C88B" />
      </View>
      <View style={styles.brandCopy}>
        <Text style={styles.brand}>NotiCare</Text>
        <Text style={styles.tagline}>Smishing Shield</Text>
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
  );
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp));
}

function monthName(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(timestamp));
}

function Counter({
  icon,
  value,
  label,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  label: string;
  tone: 'danger' | 'safe';
}) {
  const color = tone === 'danger' ? '#B42318' : '#007D59';
  const surface = tone === 'danger' ? '#FFE6E7' : '#D9F9E9';
  return (
    <View style={styles.counter}>
      <View style={[styles.counterIcon, { backgroundColor: surface }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={[styles.counterValue, { color }]}>{value}</Text>
      <Text style={styles.counterLabel}>{label}</Text>
    </View>
  );
}

function RecordCard({ record, onOpen }: { record: HistorySummary; onOpen: () => void }) {
  return (
    <Pressable
      onPress={onOpen}
      style={styles.recordCard}
      accessibilityRole="button"
      accessibilityLabel={`Open blocked SMS from ${record.maskedSender}`}
    >
      <View style={styles.recordTop}>
        <View style={styles.senderRow}>
          <View style={styles.senderIcon}>
            <Ionicons name="person-outline" size={18} color="#365A7B" />
          </View>
          <View>
            <Text style={styles.sender}>{record.maskedSender}</Text>
            <Text style={styles.date}>{formatDate(record.receivedAt)}</Text>
          </View>
        </View>
        <View style={styles.dangerBadge}>
          <Ionicons name="shield-checkmark" size={12} color="#B42318" />
          <Text style={styles.dangerBadgeText}>DANGEROUS</Text>
        </View>
      </View>
      <Text style={styles.redactedLabel}>CONTENT REDACTED</Text>
      <Text style={styles.redactedPreview} numberOfLines={2}>
        {record.redactedPreview}
      </Text>
      <View style={styles.recordFooter}>
        <Text style={styles.score}>Risk score {record.score}/100</Text>
        <Text style={styles.signs}>
          {record.warningSignCount} warning sign{record.warningSignCount === 1 ? '' : 's'}
        </Text>
      </View>
    </Pressable>
  );
}

function DetailModal({
  record,
  onClose,
  onDelete,
}: {
  record: HistoryRecord | null;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  if (!record) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalPage}>
        <View style={styles.modalHeader}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close history detail"
          >
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.modalTitle}>Blocked SMS details</Text>
          <Pressable
            onPress={() => onDelete(record.id)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Delete this history record"
          >
            <Ionicons name="trash-outline" size={23} color="#fff" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <View style={styles.detailHero}>
            <View style={styles.detailDangerIcon}>
              <Ionicons name="shield-checkmark" size={26} color="#B42318" />
            </View>
            <View>
              <Text style={styles.detailDanger}>Dangerous — notification suppressed</Text>
              <Text style={styles.detailDate}>
                {formatDate(record.receivedAt)} · Risk score {record.score}/100
              </Text>
            </View>
          </View>
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={20} color="#406382" />
            <Text style={styles.noticeText}>{record.originalSmsNotice}</Text>
          </View>
          <Text style={styles.detailLabel}>MASKED SENDER</Text>
          <Text style={styles.detailValue}>{record.maskedSender}</Text>
          <Text style={styles.detailLabel}>MESSAGE STORED ON THIS DEVICE</Text>
          <View style={styles.messageBox}>
            <Text selectable style={styles.messageText}>
              {record.message}
            </Text>
          </View>
          <Text style={styles.detailLabel}>WARNING SIGNS</Text>
          {record.reasons.map((reason) => (
            <View style={styles.reasonRow} key={reason.code}>
              <Ionicons name="alert-circle-outline" size={19} color="#B42318" />
              <View style={styles.reasonCopy}>
                <Text style={styles.reasonTitle}>{reason.label}</Text>
                <Text style={styles.reasonText}>{reason.description}</Text>
              </View>
              <Text style={styles.weight}>+{reason.weight}</Text>
            </View>
          ))}
          {record.urls.length ? (
            <>
              <Text style={styles.detailLabel}>LINKS FOUND — DO NOT OPEN</Text>
              {record.urls.map((url, index) => (
                <View style={styles.urlBox} key={`${url.display}-${index}`}>
                  <Ionicons name="link-outline" size={18} color="#A75C00" />
                  <Text selectable style={styles.urlText}>
                    {url.display}
                  </Text>
                </View>
              ))}
            </>
          ) : null}
          <Text style={styles.detailLabel}>SCAN DETAILS</Text>
          <View style={styles.detailsTable}>
            <Text style={styles.tableLabel}>Messages application</Text>
            <Text selectable style={styles.tableValue}>
              {record.sourcePackage}
            </Text>
            <Text style={styles.tableLabel}>Rule version</Text>
            <Text style={styles.tableValue}>{record.ruleVersion}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export default function HistoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ recordId?: string }>();
  const [records, setRecords] = useState<HistorySummary[]>([]);
  const [selected, setSelected] = useState<HistoryRecord | null>(null);
  const [query, setQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (openRecordId?: string) => {
    if (!isNativeMonitoringAvailable()) {
      setError(
        'Install an Android development or release build to view protected local History. Expo Go cannot use the encrypted native store.',
      );
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await getHistory();
      setRecords(next);
      if (openRecordId) {
        const detail = await getHistoryRecord(openRecordId);
        if (detail) setSelected(detail);
      }
    } catch (loadError) {
      logError('history-load-failed', loadError);
      setError('Protected local History is unavailable on this device. No raw SMS content is shown.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(typeof params.recordId === 'string' ? params.recordId : undefined);
    }, [load, params.recordId]),
  );

  const openRecord = useCallback(async (id: string) => {
    try {
      const detail = await getHistoryRecord(id);
      if (detail) setSelected(detail);
      else Alert.alert('Record unavailable', 'This protected History record is no longer available.');
    } catch (openError) {
      logError('history-detail-failed', openError);
      Alert.alert('Unable to open record', 'The protected record could not be decrypted on this device.');
    }
  }, []);

  const removeRecord = useCallback((id: string) => {
    Alert.alert(
      'Delete this record?',
      'This permanently deletes the protected local copy. The original SMS remains in your Messages inbox.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteHistoryRecord(id)
              .then(() => {
                setRecords((current) => current.filter((record) => record.id !== id));
                setSelected(null);
              })
              .catch(() => Alert.alert('Unable to delete', 'This protected record could not be deleted.'));
          },
        },
      ],
    );
  }, []);

  const removeAll = useCallback(() => {
    Alert.alert(
      'Clear all protected History?',
      'This permanently deletes all protected local copies of blocked notifications. It does not delete original SMS messages.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            void clearHistory()
              .then(() => {
                setRecords([]);
                setSelected(null);
              })
              .catch(() => Alert.alert('Unable to clear History', 'Protected local History could not be cleared.'));
          },
        },
      ],
    );
  }, []);

  const monthGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = records.filter((record) => {
      const matchesSearch =
        !normalizedQuery ||
        `${record.maskedSender} ${record.score} ${record.warningSignCount}`.toLowerCase().includes(normalizedQuery);
      const month = monthName(record.receivedAt);
      return matchesSearch && (!selectedMonth || selectedMonth === month);
    });
    return filtered.reduce<Record<string, HistorySummary[]>>((groups, record) => {
      const month = monthName(record.receivedAt);
      groups[month] ??= [];
      groups[month].push(record);
      return groups;
    }, {});
  }, [query, records, selectedMonth]);
  const months = useMemo(() => [...new Set(records.map((record) => monthName(record.receivedAt)))], [records]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="light" />
      <Header />
      <ScrollView
        style={styles.contentArea}
        contentContainerStyle={[styles.content, { paddingBottom: 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.historyIcon}>
          <Ionicons name="time-outline" size={38} color="#fff" />
        </View>
        <Text style={styles.heading}>Detection History</Text>
        <Text style={styles.subheading}>Successfully blocked SMS notifications on this device</Text>
        <View style={styles.counterRow}>
          <Counter icon="shield-checkmark-outline" value={records.length} label="Blocked" tone="danger" />
          <Counter icon="lock-closed-outline" value={records.length} label="Protected locally" tone="safe" />
        </View>
        <View style={styles.privacyBanner}>
          <Ionicons name="lock-closed-outline" size={19} color="#006DAB" />
          <Text style={styles.privacyText}>
            History contains only Dangerous real-time notifications Android successfully suppressed. Manual scans and
            visible messages are not saved here.
          </Text>
        </View>
        {records.length ? (
          <>
            <View style={styles.search}>
              <Ionicons name="search" size={19} color="#7186A5" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search masked sender or score"
                placeholderTextColor="#8294AA"
                style={styles.searchInput}
                accessibilityLabel="Search local history summaries"
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.months}>
              <Pressable
                onPress={() => setSelectedMonth(null)}
                style={[styles.monthChip, !selectedMonth && styles.monthChipActive]}
                accessibilityRole="button"
                accessibilityLabel="Show all history months"
                accessibilityState={{ selected: !selectedMonth }}
              >
                <Text style={[styles.monthText, !selectedMonth && styles.monthTextActive]}>All months</Text>
              </Pressable>
              {months.map((month) => (
                <Pressable
                  key={month}
                  onPress={() => setSelectedMonth(month)}
                  style={[styles.monthChip, selectedMonth === month && styles.monthChipActive]}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${month} history`}
                  accessibilityState={{ selected: selectedMonth === month }}
                >
                  <Text style={[styles.monthText, selectedMonth === month && styles.monthTextActive]}>{month}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.listHeader}>
              <Text style={styles.recentHeading}>Protected detections ({records.length})</Text>
              <Pressable onPress={removeAll} accessibilityRole="button">
                <Text style={styles.clearAll}>Clear All</Text>
              </Pressable>
            </View>
            {Object.entries(monthGroups).map(([month, entries]) => (
              <View key={month}>
                <Text style={styles.monthHeading}>{month}</Text>
                {entries.map((record) => (
                  <RecordCard key={record.id} record={record} onOpen={() => void openRecord(record.id)} />
                ))}
              </View>
            ))}
          </>
        ) : null}
        {loading ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Loading protected History…</Text>
          </View>
        ) : error ? (
          <View style={styles.emptyCard}>
            <Ionicons name="information-circle-outline" size={36} color="#8BA2C0" />
            <Text style={styles.emptyTitle}>{error}</Text>
            <Pressable
              onPress={() => void load()}
              style={styles.retryButton}
              accessibilityRole="button"
              accessibilityLabel="Retry loading protected History"
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : !records.length ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="time-outline" size={35} color="#8DA4C3" />
            </View>
            <Text style={styles.emptyTitle}>No blocked History yet</Text>
            <Text style={styles.emptyCopy}>
              Successfully suppressed Dangerous SMS notifications will appear here. The original SMS is never deleted.
            </Text>
            <Pressable onPress={() => router.push('/explore')} style={styles.scanLink} accessibilityRole="button">
              <Text style={styles.scanLinkText}>Try a Manual Scan</Text>
            </Pressable>
          </View>
        ) : !Object.keys(monthGroups).length ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No protected records match your search.</Text>
          </View>
        ) : null}
      </ScrollView>
      <DetailModal record={selected} onClose={() => setSelected(null)} onDelete={removeRecord} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Keep the top safe-area inset navy so white Android status icons remain legible.
  safeArea: { flex: 1, backgroundColor: navy },
  contentArea: { flex: 1, backgroundColor: '#F7F9FC' },
  appBar: {
    height: 68,
    backgroundColor: navy,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0E1726',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    zIndex: 10,
    elevation: 10,
  },
  shieldMark: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#334258',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandCopy: { marginLeft: 10 },
  brand: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  tagline: { color: '#CFD7E3', fontSize: 12, marginTop: 1 },
  menuButton: { marginLeft: 'auto', padding: 4 },
  content: { alignItems: 'center', paddingTop: 15, paddingHorizontal: 10 },
  historyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: navy,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#142038',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  heading: { color: '#13243C', fontSize: 24, fontWeight: '800', marginTop: 15 },
  subheading: { color: '#566F95', fontSize: 14, marginTop: 7, textAlign: 'center' },
  counterRow: { alignSelf: 'stretch', flexDirection: 'row', gap: 12, marginTop: 24 },
  counter: {
    flex: 1,
    minHeight: 120,
    backgroundColor: '#FFF',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1E2D43',
    shadowOpacity: 0.1,
    shadowRadius: 7,
    elevation: 2,
  },
  counterIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
  },
  counterValue: { fontWeight: '800', fontSize: 23 },
  counterLabel: { color: '#657D9F', fontSize: 12, marginTop: 3 },
  privacyBanner: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    backgroundColor: '#EDF5FD',
    borderRadius: 11,
    padding: 13,
    gap: 9,
    marginTop: 14,
  },
  privacyText: { color: '#537291', fontSize: 12, lineHeight: 17, flex: 1 },
  search: {
    alignSelf: 'stretch',
    height: 48,
    marginTop: 17,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E8F1',
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, color: '#253F5D', fontSize: 14 },
  months: { gap: 8, paddingVertical: 12 },
  monthChip: { backgroundColor: '#EAF0F6', borderRadius: 16, paddingVertical: 7, paddingHorizontal: 11 },
  monthChipActive: { backgroundColor: navy },
  monthText: { color: '#617B9A', fontSize: 12, fontWeight: '700' },
  monthTextActive: { color: '#fff' },
  listHeader: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  recentHeading: { color: '#344965', fontWeight: '800', fontSize: 15 },
  clearAll: { color: '#B42318', fontWeight: '800', fontSize: 12 },
  monthHeading: {
    alignSelf: 'stretch',
    color: '#607A9B',
    fontWeight: '800',
    fontSize: 13,
    marginTop: 16,
    marginBottom: 7,
  },
  recordCard: {
    alignSelf: 'stretch',
    backgroundColor: '#fff',
    borderRadius: 13,
    padding: 14,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: '#E4EBF2',
    shadowColor: '#1E2D43',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  recordTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 },
  senderIcon: {
    height: 33,
    width: 33,
    borderRadius: 17,
    backgroundColor: '#EEF4FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sender: { color: '#29425F', fontWeight: '800', fontSize: 14 },
  date: { color: '#758DAA', fontSize: 11, marginTop: 2 },
  dangerBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    backgroundColor: '#FFF0F0',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  dangerBadgeText: { color: '#B42318', fontWeight: '800', fontSize: 9 },
  redactedLabel: { color: '#7186A4', fontWeight: '800', fontSize: 10, letterSpacing: 0.5, marginTop: 13 },
  redactedPreview: { color: '#526B8A', lineHeight: 19, marginTop: 3, fontSize: 13 },
  recordFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 11,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F6',
  },
  score: { color: '#B42318', fontWeight: '800', fontSize: 12 },
  signs: { color: '#6F87A6', fontSize: 12 },
  emptyCard: {
    alignSelf: 'stretch',
    minHeight: 196,
    backgroundColor: '#FFF',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 17,
    padding: 22,
    shadowColor: '#1E2D43',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF4FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { color: '#536F93', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyCopy: { color: '#8197B6', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 },
  retryButton: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#EDF4FA',
    borderRadius: 8,
  },
  retryText: { color: '#006DAB', fontWeight: '800' },
  scanLink: { marginTop: 16, paddingHorizontal: 15, paddingVertical: 10, backgroundColor: '#E9FAF2', borderRadius: 8 },
  scanLinkText: { color: '#00845D', fontWeight: '800' },
  modalPage: { flex: 1, backgroundColor: '#F7F9FC' },
  modalHeader: {
    minHeight: 62,
    backgroundColor: navy,
    paddingHorizontal: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: { color: '#fff', fontWeight: '800', fontSize: 17 },
  modalContent: { padding: 16, paddingBottom: 36 },
  detailHero: {
    flexDirection: 'row',
    gap: 11,
    alignItems: 'center',
    backgroundColor: '#FFF0F0',
    borderRadius: 12,
    padding: 14,
  },
  detailDangerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFDADC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailDanger: { color: '#B42318', fontWeight: '800', fontSize: 15 },
  detailDate: { color: '#7D6770', fontSize: 12, marginTop: 3 },
  notice: { flexDirection: 'row', gap: 8, backgroundColor: '#EDF5FD', borderRadius: 10, padding: 12, marginTop: 13 },
  noticeText: { color: '#567693', fontSize: 12, lineHeight: 17, flex: 1 },
  detailLabel: {
    color: '#7186A4',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 7,
  },
  detailValue: { color: '#263F5E', fontWeight: '700' },
  messageBox: { backgroundColor: '#fff', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#E2E9F1' },
  messageText: { color: '#334E6C', lineHeight: 21 },
  reasonRow: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 7,
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#E9EEF3',
  },
  reasonCopy: { flex: 1 },
  reasonTitle: { color: '#334D6B', fontWeight: '800', fontSize: 13 },
  reasonText: { color: '#7186A3', fontSize: 12, lineHeight: 17, marginTop: 2 },
  weight: { color: '#B42318', fontWeight: '800', fontSize: 12 },
  urlBox: {
    backgroundColor: '#FFF8E9',
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginBottom: 7,
  },
  urlText: { color: '#795400', lineHeight: 18, flex: 1, fontSize: 12 },
  detailsTable: { backgroundColor: '#fff', borderRadius: 10, padding: 13, borderWidth: 1, borderColor: '#E7EDF3' },
  tableLabel: { color: '#7186A3', fontSize: 11, marginTop: 4 },
  tableValue: { color: '#334E6C', fontWeight: '700', fontSize: 12, marginTop: 2, marginBottom: 9 },
});
