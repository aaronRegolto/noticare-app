import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '@/src/components/brand-logo';
import {
  filterMessages,
  isMessageBlocked,
  messageSender,
  type MessageCategoryFilter,
  type MessageFilter,
} from '@/src/features/messages/inbox';
import { LANGUAGE_NAMES, localizeReason } from '@/src/features/translation';
import { useAuth } from '@/src/providers/AuthProvider';
import { logError } from '@/src/services/logger';
import {
  ensureLanguagePack,
  useMessageTranslationSettings,
  useTranslatedMessage,
  useWarningCopy,
} from '@/src/services/messageTranslation';
import {
  clearHistory,
  deleteHistoryRecord,
  getHistory,
  getHistoryRecord,
  isNativeMonitoringAvailable,
  markHistoryRead,
  supportsMessageInbox,
  type HistoryRecord,
  type HistorySummary,
} from '@/src/services/notificationListener';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import type { ThemeColors } from '@/src/theme/palette';

const navy = '#1E2D43';
const tones = {
  safe: { color: '#087653', surface: '#E5F6EE', label: 'Safe' },
  suspicious: { color: '#8A5C06', surface: '#FFF2D8', label: 'Suspicious' },
  dangerous: { color: '#B42332', surface: '#FDE9EC', label: 'Dangerous' },
};
const inboxFilters: MessageFilter[] = ['all', 'unread', 'suspicious', 'dangerous', 'blocked'];
const categoryFilters: MessageCategoryFilter[] = ['all', 'spam', 'threats', 'phishing'];
const categoryLabels = { spam: 'Spam', threats: 'Threats', phishing: 'Phishing' } as const;
const categoryTones = {
  spam: { color: '#9B4F00', surface: '#FFF2DE' },
  threats: { color: '#9F2630', surface: '#FDE9EC' },
  phishing: { color: '#5634A5', surface: '#F0EBFF' },
} as const;

function Header() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(colors);
  return (
    <View style={styles.appBar}>
      <BrandLogo size={44} />
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
  const { colors } = useAppTheme();
  const styles = useThemedStyles(colors);
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

const RecordCard = memo(function RecordCard({
  record,
  onOpen,
}: {
  record: HistorySummary;
  onOpen: (id: string) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(colors);
  const tone = tones[record.level];
  // Only the SMS excerpt is translated; the redacted fallback is NotiCare's own text.
  const translation = useTranslatedMessage(record.preview);
  const translated = translation?.status === 'translated';
  return (
    <Pressable
      onPress={() => onOpen(record.id)}
      style={({ pressed }) => [styles.recordCard, pressed && { backgroundColor: '#F1F6FA' }]}
      accessibilityRole="button"
      accessibilityLabel={`${record.isRead ? '' : 'Unread, '}${tone.label} message from ${messageSender(record)}. Open message`}
    >
      <View style={styles.recordTop}>
        <View style={styles.senderRow}>
          <View style={[styles.senderIcon, { backgroundColor: tone.surface }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={tone.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[styles.sender, { fontWeight: record.isRead ? '500' : '800' }]}>
              {messageSender(record)}
            </Text>
            <Text style={styles.date}>{formatDate(record.receivedAt)}</Text>
          </View>
        </View>
        <View style={[styles.dangerBadge, { backgroundColor: tone.surface }]}>
          <Text style={[styles.dangerBadgeText, { color: tone.color }]}>{tone.label}</Text>
        </View>
      </View>
      {record.senderIsKnownContact !== null && record.senderIsKnownContact !== undefined ? (
        <View style={styles.senderIdentity}>
          <Ionicons
            name={record.senderIsKnownContact ? 'person-circle-outline' : 'person-remove-outline'}
            size={14}
            color={record.senderIsKnownContact ? '#087653' : '#8A5C06'}
          />
          <Text style={styles.senderIdentityText}>
            {record.senderIsKnownContact ? 'Saved contact' : 'Not found in Contacts'}
          </Text>
        </View>
      ) : null}
      <Text style={styles.redactedPreview} numberOfLines={2}>
        {translated ? translation.text : (record.preview ?? record.redactedPreview)}
      </Text>
      {record.categories?.length ? (
        <View style={styles.categoryRow}>
          {record.categories.map((category) => {
            const categoryTone = categoryTones[category];
            return (
              <View key={category} style={[styles.categoryBadge, { backgroundColor: categoryTone.surface }]}>
                <Text style={[styles.categoryBadgeText, { color: categoryTone.color }]}>
                  {categoryLabels[category]}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
      <View style={styles.recordFooter}>
        <Text style={[styles.score, { color: tone.color }]}>
          {isMessageBlocked(record) ? 'Notification blocked' : `Risk score ${record.score}/100`}
        </Text>
        <Text style={styles.signs}>
          {translated ? 'Translated · ' : ''}
          {record.isRead ? 'Read' : '● Unread'}
        </Text>
      </View>
    </Pressable>
  );
});

function DetailModal({
  record,
  onClose,
  onDelete,
}: {
  record: HistoryRecord | null;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(colors);
  const { language } = useMessageTranslationSettings();
  const copy = useWarningCopy();
  const translation = useTranslatedMessage(record?.message);
  const [showOriginal, setShowOriginal] = useState(false);
  useEffect(() => setShowOriginal(false), [record?.id]);
  if (!record) return null;
  const tone = tones[record.level];
  const translated = translation?.status === 'translated' ? translation : null;
  // A Safe message always scores 0 (getHistoryRecord also zeroes older records), so it lists no warning signs.
  const reasons = record.level === 'safe' ? [] : record.reasons.map((reason) => localizeReason(reason, copy));
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
          <Text style={styles.modalTitle}>Message details</Text>
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
          <View style={[styles.detailHero, { backgroundColor: tone.surface }]}>
            <View style={[styles.detailDangerIcon, { backgroundColor: tone.surface }]}>
              <Ionicons name="shield-checkmark" size={26} color={tone.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.detailDanger, { color: tone.color }]}>
                {tone.label} · {isMessageBlocked(record) ? 'Notification blocked' : 'Not blocked'}
              </Text>
              <Text style={styles.detailDate}>
                {formatDate(record.receivedAt)} · Risk score {record.score}/100
              </Text>
            </View>
          </View>
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={20} color="#406382" />
            <Text style={styles.noticeText}>{record.originalSmsNotice}</Text>
          </View>
          <Text style={styles.detailLabel}>FROM</Text>
          <Text selectable style={styles.detailValue}>
            {messageSender(record)}
          </Text>
          {record.senderIsKnownContact !== null && record.senderIsKnownContact !== undefined ? (
            <Text style={styles.senderIdentityDetail}>
              {record.senderIsKnownContact
                ? 'This sender matched a contact saved on your phone.'
                : 'This sender did not match a contact saved on your phone.'}
            </Text>
          ) : null}
          <Text style={styles.detailLabel}>MESSAGE STORED ON THIS DEVICE</Text>
          {translated ? (
            <View style={styles.translationBar}>
              <Ionicons name="language-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.translationText}>
                {showOriginal ? 'Original message' : `Translated from ${LANGUAGE_NAMES[translated.from]}`}
              </Text>
              <Pressable
                onPress={() => setShowOriginal((value) => !value)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={showOriginal ? 'Show translation' : 'Show original message'}
              >
                <Text style={styles.translationToggle}>{showOriginal ? 'Show translation' : 'Show original'}</Text>
              </Pressable>
            </View>
          ) : null}
          {translation?.status === 'pack-missing' && language !== 'default' ? (
            <View style={styles.translationBar}>
              <Ionicons name="cloud-download-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.translationText}>
                Shown as received. The {LANGUAGE_NAMES[language]} translation appears once the language pack downloads
                on Wi-Fi.
              </Text>
            </View>
          ) : null}
          <View style={styles.messageBox}>
            <Text selectable style={styles.messageText}>
              {translated && !showOriginal ? translated.text : record.message}
            </Text>
          </View>
          <Text style={styles.detailLabel}>{copy.warningSigns}</Text>
          {!reasons.length && <Text style={styles.reasonText}>{copy.noSignificantSigns}</Text>}
          {reasons.map((reason) => (
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
              <Text style={styles.detailLabel}>LINKS FOUND</Text>
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
  const { colors } = useAppTheme();
  const styles = useThemedStyles(colors);
  const router = useRouter();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ recordId?: string }>();
  const [records, setRecords] = useState<HistorySummary[]>([]);
  const [selected, setSelected] = useState<HistoryRecord | null>(null);
  const [query, setQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [filter, setFilter] = useState<MessageFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<MessageCategoryFilter>('all');
  const focused = useRef(false);
  const request = useRef(0);
  const detailRequest = useRef(0);
  const openedLink = useRef<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { language: messageLanguage, pack: languagePack } = useMessageTranslationSettings();

  // Finish a language pack download that was waiting for Wi-Fi.
  useEffect(() => {
    if (messageLanguage !== 'default' && languagePack !== 'ready' && languagePack !== 'downloading') {
      void ensureLanguagePack();
    }
  }, [messageLanguage, languagePack]);

  const load = useCallback(async (openRecordId?: string, quiet = false) => {
    const current = ++request.current;
    if (!isNativeMonitoringAvailable()) {
      setError('This feature is not available in this preview. Install the Android app to view your message history.');
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const next = await getHistory();
      if (!focused.current || current !== request.current) return;
      setRecords(next);
      if (openRecordId) {
        const detail = await getHistoryRecord(openRecordId);
        if (!focused.current || current !== request.current) return;
        if (detail) {
          setSelected(detail);
          if (await markHistoryRead(openRecordId)) {
            if (focused.current && current === request.current)
              setRecords((items) => items.map((item) => (item.id === openRecordId ? { ...item, isRead: true } : item)));
          }
        }
      }
    } catch (loadError) {
      logError('history-load-failed', loadError);
      if (focused.current && current === request.current) setError('Your message history could not be loaded.');
    } finally {
      if (focused.current && current === request.current) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!session?.user.id) {
        setRecords([]);
        setSelected(null);
        return;
      }
      focused.current = true;
      const recordId =
        typeof params.recordId === 'string' && openedLink.current !== params.recordId ? params.recordId : undefined;
      openedLink.current = params.recordId;
      void load(recordId);
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') void load(undefined, true);
      });
      const timer = setInterval(() => {
        if (AppState.currentState === 'active') void load(undefined, true);
      }, 5000);
      return () => {
        focused.current = false;
        request.current++;
        detailRequest.current++;
        clearInterval(timer);
        subscription.remove();
        setSelected(null);
        setRecords([]);
      };
    }, [load, params.recordId, session?.user.id]),
  );

  const openRecord = useCallback(async (id: string) => {
    const current = ++detailRequest.current;
    try {
      const detail = await getHistoryRecord(id);
      if (!focused.current || current !== detailRequest.current) return;
      if (detail) {
        setSelected(detail);
        if (await markHistoryRead(id)) {
          if (focused.current && current === detailRequest.current)
            setRecords((items) => items.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
        }
      } else Alert.alert('Message unavailable', 'This message is no longer available.');
    } catch (openError) {
      logError('history-detail-failed', openError);
      Alert.alert('Unable to open message', 'This message could not be decrypted on this device.');
    }
  }, []);

  const removeRecord = useCallback((id: string) => {
    Alert.alert(
      'Delete this message?',
      'This permanently deletes the saved copy on this device. The original SMS stays in your Messages app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteHistoryRecord(id)
              .then(() => {
                if (!focused.current) return;
                request.current++;
                detailRequest.current++;
                setRecords((current) => current.filter((record) => record.id !== id));
                setSelected(null);
              })
              .catch(() => Alert.alert('Unable to delete', 'This message could not be deleted.'));
          },
        },
      ],
    );
  }, []);

  const removeAll = useCallback(() => {
    Alert.alert(
      'Clear your message history?',
      'This permanently deletes all captured messages from NotiCare. It will not delete the original texts from your phone’s SMS app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: () => {
            void clearHistory()
              .then(() => {
                if (!focused.current) return;
                request.current++;
                detailRequest.current++;
                setRecords([]);
                setSelected(null);
              })
              .catch(() => Alert.alert('Unable to clear history', 'Your message history could not be cleared.'));
          },
        },
      ],
    );
  }, []);

  const monthGroups = useMemo(() => {
    const filtered = filterMessages(records, filter, query, categoryFilter).filter((record) => {
      const month = monthName(record.receivedAt);
      return !selectedMonth || selectedMonth === month;
    });
    return filtered.reduce<Record<string, HistorySummary[]>>((groups, record) => {
      const month = monthName(record.receivedAt);
      groups[month] ??= [];
      groups[month].push(record);
      return groups;
    }, {});
  }, [query, records, selectedMonth, filter, categoryFilter]);
  const months = useMemo(() => [...new Set(records.map((record) => monthName(record.receivedAt)))], [records]);
  const sections = useMemo(() => Object.entries(monthGroups).map(([title, data]) => ({ title, data })), [monthGroups]);
  const totalFiltered = useMemo(() => sections.reduce((sum, section) => sum + section.data.length, 0), [sections]);

  const listHeader = (
    <View style={styles.listHeaderContainer}>
      <View style={styles.historyIcon}>
        <Ionicons name="chatbubbles-outline" size={38} color={colors.headerText} />
      </View>
      <Text style={styles.heading}>Messages</Text>
      <Text style={styles.subheading}>Only messages with warning signs are kept here</Text>
      <View style={styles.counterRow}>
        <Counter icon="shield-checkmark-outline" value={records.length} label="Alerts" tone="danger" />
        <Counter
          icon="mail-unread-outline"
          value={records.filter((record) => !record.isRead).length}
          label="Unread"
          tone="safe"
        />
      </View>
      <View style={styles.privacyBanner}>
        <Ionicons name="lock-closed-outline" size={19} color="#006DAB" />
        <Text style={styles.privacyText}>
          Safe conversations are checked on-device and discarded. Only Suspicious or Dangerous alerts are saved in
          encrypted History; message text is not uploaded.
        </Text>
      </View>
      {isNativeMonitoringAvailable() && !supportsMessageInbox() && (
        <View style={styles.privacyBanner}>
          <Text style={styles.privacyText}>
            Update the Android app to view all flagged alerts. This older build only shows messages you block.
          </Text>
        </View>
      )}
      {records.length ? (
        <>
          <View style={styles.search}>
            <Ionicons name="search" size={19} color="#7186A5" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search alert sender or message"
              placeholderTextColor="#8294AA"
              style={styles.searchInput}
              accessibilityLabel="Search alert senders and messages"
            />
          </View>
          <View style={styles.filterPanel}>
            <Text style={styles.filterLabel}>CATEGORY</Text>
            <View style={styles.categorySegment}>
              {categoryFilters.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setCategoryFilter(item)}
                  style={[styles.categorySegmentItem, categoryFilter === item && styles.categorySegmentItemActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: categoryFilter === item }}
                >
                  <Text
                    style={[styles.categorySegmentText, categoryFilter === item && styles.categorySegmentTextActive]}
                  >
                    {item === 'all' ? 'All' : categoryLabels[item]}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.filterLabel}>RISK & STATUS</Text>
            <View style={styles.filterOptions}>
              {inboxFilters.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setFilter(item)}
                  style={[styles.monthChip, filter === item && styles.monthChipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: filter === item }}
                >
                  <Text style={[styles.monthText, filter === item && styles.monthTextActive]}>
                    {item.charAt(0).toUpperCase() + item.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.dateFilterHeader}>
              <Text style={styles.filterLabel}>DATE</Text>
              {selectedMonth ? (
                <Pressable onPress={() => setSelectedMonth(null)} accessibilityRole="button">
                  <Text style={styles.resetDate}>Reset</Text>
                </Pressable>
              ) : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateOptions}>
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
          </View>
          <View style={styles.listHeader}>
            <Text style={styles.recentHeading}>Messages ({totalFiltered})</Text>
            <Pressable onPress={removeAll} accessibilityRole="button">
              <Text style={styles.clearAll}>Clear all</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );

  const listEmpty = (
    <View style={styles.emptyWrap}>
      {loading ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Loading messages…</Text>
        </View>
      ) : error ? (
        <View style={styles.emptyCard}>
          <Ionicons name="information-circle-outline" size={36} color="#8BA2C0" />
          <Text style={styles.emptyTitle}>{error}</Text>
          <Pressable
            onPress={() => void load()}
            style={styles.retryButton}
            accessibilityRole="button"
            accessibilityLabel="Retry loading messages"
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : !records.length ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons name="time-outline" size={35} color="#8DA4C3" />
          </View>
          <Text style={styles.emptyTitle}>No alerts yet</Text>
          <Text style={styles.emptyCopy}>
            Turn on real-time scanning and allow Notification Access. Safe conversations are checked on-device and
            discarded; only messages with warning signs appear here.
          </Text>
          <Pressable onPress={() => router.push('/settings')} style={styles.scanLink} accessibilityRole="button">
            <Text style={styles.scanLinkText}>Go to Settings</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No messages match your filters</Text>
          <Pressable
            onPress={() => {
              setFilter('all');
              setCategoryFilter('all');
              setQuery('');
              setSelectedMonth(null);
            }}
            style={styles.retryButton}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Reset filters</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="light" />
      <Header />
      <SectionList
        style={styles.contentArea}
        contentContainerStyle={[styles.content, { paddingBottom: 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        sections={sections}
        keyExtractor={(record) => record.id}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        renderSectionHeader={({ section }) => <Text style={styles.monthHeading}>{section.title}</Text>}
        renderItem={({ item }) => <RecordCard record={item} onOpen={openRecord} />}
        stickySectionHeadersEnabled={false}
        // ~152px per row (measured from recordCard padding/content) lets getItemLayout skip
        // on-the-fly measurement, keeping scroll smooth as History grows toward its retention cap.
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
      />
      <DetailModal
        record={selected}
        onClose={() => {
          detailRequest.current++;
          setSelected(null);
        }}
        onDelete={removeRecord}
      />
    </SafeAreaView>
  );
}

function useThemedStyles(colors: ThemeColors) {
  return useMemo(() => createStyles(colors), [colors]);
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // Keep the top safe-area inset navy so white Android status icons remain legible.
    safeArea: { flex: 1, backgroundColor: colors.headerBg },
    contentArea: { flex: 1, backgroundColor: colors.background },
    appBar: {
      height: 66,
      backgroundColor: colors.headerBg,
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
      width: 39,
      height: 39,
      borderRadius: 10,
      backgroundColor: colors.headerSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    brandCopy: { marginLeft: 10 },
    brand: { color: '#FFF', fontWeight: '800', fontSize: 16 },
    tagline: { color: '#CFD7E3', fontSize: 12, marginTop: 1 },
    menuButton: { marginLeft: 'auto', padding: 4 },
    content: { flexGrow: 1, alignItems: 'stretch', paddingTop: 20, paddingHorizontal: 18 },
    emptyWrap: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' },
    listHeaderContainer: { alignSelf: 'stretch', alignItems: 'center' },
    historyIcon: {
      alignSelf: 'center',
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.headerBg,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#142038',
      shadowOpacity: 0.22,
      shadowRadius: 8,
      elevation: 4,
    },
    heading: { alignSelf: 'center', color: colors.textPrimary, fontSize: 24, fontWeight: '800', marginTop: 15 },
    subheading: { color: colors.textSecondary, fontSize: 14, marginTop: 7, textAlign: 'center' },
    counterRow: { alignSelf: 'stretch', flexDirection: 'row', gap: 12, marginTop: 18 },
    counter: {
      flex: 1,
      minHeight: 100,
      backgroundColor: colors.surface,
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
    counterLabel: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
    privacyBanner: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      backgroundColor: colors.accentSoft,
      borderRadius: 11,
      padding: 14,
      gap: 9,
      marginTop: 20,
    },
    privacyText: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, flex: 1 },
    search: {
      alignSelf: 'stretch',
      height: 48,
      marginTop: 17,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    searchInput: { flex: 1, color: colors.textPrimary, fontSize: 14 },
    filterPanel: {
      alignSelf: 'stretch',
      marginTop: 14,
      padding: 14,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 10,
    },
    filterLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
    categorySegment: {
      flexDirection: 'row',
      padding: 4,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 12,
      gap: 3,
    },
    categorySegmentItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 36,
      paddingHorizontal: 4,
      borderRadius: 9,
    },
    categorySegmentItemActive: {
      backgroundColor: colors.headerBg,
      shadowColor: '#0B203A',
      shadowOpacity: 0.16,
      shadowRadius: 4,
      elevation: 2,
    },
    categorySegmentText: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
    categorySegmentTextActive: { color: '#fff' },
    filterOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    dateFilterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    resetDate: { color: colors.accent, fontSize: 11, fontWeight: '700' },
    dateOptions: { gap: 7, paddingRight: 2 },
    monthChip: { backgroundColor: colors.surfaceAlt, borderRadius: 16, paddingVertical: 7, paddingHorizontal: 11 },
    monthChipActive: { backgroundColor: colors.headerBg },
    monthText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
    monthTextActive: { color: '#fff' },
    listHeader: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 2,
    },
    recentHeading: { color: colors.textPrimary, fontWeight: '800', fontSize: 15 },
    clearAll: { color: '#B42318', fontWeight: '800', fontSize: 12 },
    monthHeading: {
      alignSelf: 'stretch',
      color: colors.textSecondary,
      fontWeight: '800',
      fontSize: 13,
      marginTop: 16,
      marginBottom: 7,
    },
    recordCard: {
      alignSelf: 'stretch',
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 15,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#1E2D43',
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 1,
    },
    recordTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    senderRow: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 },
    senderIcon: {
      height: 42,
      width: 42,
      borderRadius: 14,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sender: { color: colors.textPrimary, fontWeight: '800', fontSize: 14 },
    senderIdentity: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 10,
      marginLeft: 51,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 9,
    },
    senderIdentityText: { color: colors.textSecondary, fontSize: 10, fontWeight: '700' },
    senderIdentityDetail: { color: colors.textMuted, fontSize: 12, marginTop: 5 },
    date: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
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
    redactedPreview: { color: colors.textSecondary, lineHeight: 20, marginTop: 9, fontSize: 13, marginLeft: 51 },
    categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, marginLeft: 51 },
    categoryBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
    categoryBadgeText: { fontSize: 10, fontWeight: '800' },
    recordFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 11,
      paddingTop: 10,
      marginLeft: 51,
    },
    score: { color: '#B42318', fontWeight: '800', fontSize: 12 },
    signs: { color: colors.textMuted, fontSize: 12 },
    emptyCard: {
      alignSelf: 'stretch',
      minHeight: 196,
      backgroundColor: colors.surface,
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
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    emptyTitle: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
    emptyCopy: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 },
    retryButton: {
      marginTop: 14,
      paddingHorizontal: 14,
      paddingVertical: 9,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 8,
    },
    retryText: { color: '#006DAB', fontWeight: '800' },
    scanLink: {
      marginTop: 16,
      paddingHorizontal: 15,
      paddingVertical: 10,
      backgroundColor: '#E9FAF2',
      borderRadius: 8,
    },
    scanLinkText: { color: '#00845D', fontWeight: '800' },
    modalPage: { flex: 1, backgroundColor: colors.background },
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
      backgroundColor: colors.dangerSoft,
      borderRadius: 12,
      padding: 14,
    },
    detailDangerIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.dangerSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    detailDanger: { color: '#B42318', fontWeight: '800', fontSize: 15 },
    detailDate: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
    notice: {
      flexDirection: 'row',
      gap: 8,
      backgroundColor: colors.accentSoft,
      borderRadius: 10,
      padding: 12,
      marginTop: 13,
    },
    noticeText: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, flex: 1 },
    detailLabel: {
      color: colors.textMuted,
      fontWeight: '800',
      fontSize: 11,
      letterSpacing: 0.5,
      marginTop: 20,
      marginBottom: 7,
    },
    detailValue: { color: colors.textPrimary, fontWeight: '700' },
    messageBox: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderTopLeftRadius: 4,
      padding: 20,
      boxShadow: '0 2px 8px #1e2d4308',
    },
    messageText: { color: colors.textPrimary, fontSize: 16, lineHeight: 25 },
    translationBar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    translationText: { flex: 1, color: colors.textSecondary, fontSize: 12.5, lineHeight: 17 },
    translationToggle: { color: colors.link, fontSize: 12.5, fontWeight: '700' },
    reasonRow: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 12,
      marginBottom: 7,
      flexDirection: 'row',
      gap: 9,
      alignItems: 'flex-start',
      borderWidth: 1,
      borderColor: colors.border,
    },
    reasonCopy: { flex: 1 },
    reasonTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 13 },
    reasonText: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
    weight: { color: '#B42318', fontWeight: '800', fontSize: 12 },
    urlBox: {
      backgroundColor: colors.warningSoft,
      borderRadius: 8,
      padding: 10,
      flexDirection: 'row',
      gap: 8,
      alignItems: 'flex-start',
      marginBottom: 7,
    },
    urlText: { color: colors.warning, lineHeight: 18, flex: 1, fontSize: 12 },
    detailsTable: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 13,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tableLabel: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
    tableValue: { color: colors.textPrimary, fontWeight: '700', fontSize: 12, marginTop: 2, marginBottom: 9 },
  });
}
