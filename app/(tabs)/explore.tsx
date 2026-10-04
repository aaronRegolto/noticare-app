import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScoreBreakdown } from '@/src/components/score-breakdown';
import { BrandLogo } from '@/src/components/brand-logo';
import { evaluateThreat, type ThreatLevel, type ThreatResult } from '@/src/features/detection';
import {
  getMessageFeedbackRecord,
  getMessageVirality,
  markMessageFeedback,
  reportAndBlockMessage,
  type PhishingVirality,
} from '@/src/services/communityReports';
import { flushQueuedThreatEvents, queueThreatEvent } from '@/src/services/eventSync';
import {
  readMessageFromImage,
  readMessageFromPendingImage,
  type ImageTextResult,
  type ImageTextSource,
} from '@/src/services/cameraScan';
import { sendScanFeedback } from '@/src/services/feedback';
import { logError } from '@/src/services/logger';
import {
  isNativeMonitoringAvailable,
  isTextRecognitionAvailable,
  scanTextLocally,
} from '@/src/services/notificationListener';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import type { ThemeColors } from '@/src/theme/palette';

const navy = '#1E2D43';
const maxCharacters = 12_000;

const levelCopy: Record<
  ThreatLevel,
  {
    title: string;
    explanation: string;
    action: string;
    color: string;
    surface: string;
    icon: keyof typeof Ionicons.glyphMap;
  }
> = {
  safe: {
    title: 'Safe',
    explanation:
      'No significant phishing indicators were found. Stay cautious — NotiCare cannot guarantee every scam is detected.',
    action:
      'If a message asks for money or personal information later, verify it through the organization’s official app or website.',
    color: '#007D59',
    surface: '#E9FBF3',
    icon: 'checkmark-circle',
  },
  suspicious: {
    title: 'Suspicious',
    explanation: 'This message has warning signs but not enough evidence to call it a likely scam.',
    action: 'Do not tap links or reply with personal information. Verify the sender through an official channel first.',
    color: '#A75C00',
    surface: '#FFF6DF',
    icon: 'warning',
  },
  dangerous: {
    title: 'Dangerous',
    explanation: 'Several strong phishing indicators were found together. Treat this message as dangerous.',
    action:
      'Do not open links or share passwords, PINs, or OTPs. Contact the organization using its official app, website, or verified number.',
    color: '#B42318',
    surface: '#FFF0F0',
    icon: 'close-circle',
  },
};

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

/**
 * The risk score is always the detector's own score (the sum of the warning signs' points, capped
 * at 100), except that a Safe message always scores 0. How many people reported the same text is
 * shown separately as a badge, never as the score, so the number here matches the real-time
 * warning for the same message.
 */
function scoreDisplay(result: ThreatResult, virality: PhishingVirality | null, viralityLoading: boolean) {
  const reportBadge =
    result.level === 'dangerous' && virality && virality.reportCount > 0
      ? virality.reportCount === 1
        ? '1 report'
        : `${virality.reportCount} reports`
      : null;
  if (result.level === 'safe') {
    return {
      score: 0,
      badge: null as string | null,
      explanation: 'Safe messages always have a risk score of 0. No strong warning signs were found.',
    };
  }
  if (result.level === 'suspicious') {
    return {
      score: result.score,
      badge: null as string | null,
      explanation: `Scores from 30 to 69 are Suspicious. ${result.score}/100 means some warning signs were found, but not enough to call this a confirmed scam.`,
    };
  }
  const community = viralityLoading
    ? ' Checking whether other NotiCare users reported this exact message…'
    : virality && virality.reportCount > 0
      ? ` ${virality.reportCount === 1 ? '1 NotiCare user has' : `${virality.reportCount} NotiCare users have`} reported this exact message.`
      : ' No one has reported this exact message yet. Tap Report to warn other NotiCare users.';
  return {
    score: result.score,
    badge: reportBadge,
    explanation: `Scores of 70 and above are Dangerous. ${result.score}/100 means strong phishing signs were found.${community}`,
  };
}

function ResultCard({
  result,
  onFeedback,
  feedbackState,
  feedbackKind,
  virality,
  viralityLoading,
}: {
  result: ThreatResult;
  onFeedback: (kind: 'safe' | 'dangerous') => void;
  feedbackState: 'idle' | 'sending' | 'sent' | 'saved_locally' | 'already_marked_safe' | 'already_reported';
  /** The button tapped: Report uploads the message text at any level, Mark as safe never does. */
  feedbackKind: 'safe' | 'dangerous';
  virality: PhishingVirality | null;
  viralityLoading: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(colors);
  const display = levelCopy[result.level];
  const scanTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
  const scored = scoreDisplay(result, virality, viralityLoading);
  return (
    <View style={[styles.resultCard, { borderColor: display.color }]} accessibilityLiveRegion="polite">
      <View style={[styles.resultHero, { backgroundColor: display.surface }]}>
        <Ionicons name={display.icon} size={29} color={display.color} />
        <View style={styles.resultHeroCopy}>
          <View style={styles.resultLevelRow}>
            <Text style={[styles.resultLevel, { color: display.color }]}>{display.title}</Text>
            {scored.badge ? (
              <View style={[styles.newBadge, { backgroundColor: display.color }]}>
                <Text style={styles.newBadgeText}>{scored.badge}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.score}>{scored.score}/100 risk score</Text>
        </View>
      </View>
      <Text style={styles.resultExplanation}>{display.explanation}</Text>
      <Text style={styles.scoreExplanation}>{scored.explanation}</Text>
      <Text style={styles.resultSectionTitle}>How the score was calculated</Text>
      <ScoreBreakdown
        reasons={result.reasons}
        score={scored.score}
        level={result.level}
        accent={display.color}
        colors={colors}
      />
      {result.urls.length ? (
        <>
          <Text style={styles.resultSectionTitle}>Links found</Text>
          {result.urls.map((url, index) => (
            <View key={`${url.display}-${index}`} style={styles.urlRow}>
              <Ionicons name="link-outline" size={17} color="#A75C00" />
              <Text selectable style={styles.urlText}>
                {url.display}
              </Text>
            </View>
          ))}
        </>
      ) : null}
      <View style={styles.actionBox}>
        <Ionicons name="shield-outline" size={21} color={navy} />
        <View style={styles.actionCopy}>
          <Text style={styles.actionTitle}>Recommended action</Text>
          <Text style={styles.actionText}>{display.action}</Text>
        </View>
      </View>
      <Text style={styles.meta}>
        Scanned {scanTime} · Rule set {result.ruleVersion}
      </Text>
      {feedbackState !== 'idle' && feedbackState !== 'sending' ? (
        <View style={styles.feedbackSent} accessibilityLiveRegion="polite">
          <Ionicons name="checkmark-circle" size={18} color="#007D59" />
          <Text style={styles.feedbackSentText}>
            {feedbackState === 'already_marked_safe'
              ? 'You already marked this exact message as safe.'
              : feedbackState === 'already_reported'
                ? 'You already reported this exact message.'
                : feedbackState === 'saved_locally'
                  ? feedbackKind === 'dangerous'
                    ? 'Done'
                    : 'Saved on this device only — it was not submitted to NotiCare’s servers.'
                  : feedbackKind === 'dangerous'
                    ? 'Reported. This exact message text was shared so other NotiCare users can be warned.'
                    : 'Report sent. Your message text was not uploaded.'}
          </Text>
        </View>
      ) : (
        <View style={styles.feedbackRow}>
          <Pressable
            disabled={feedbackState === 'sending'}
            onPress={() => onFeedback('safe')}
            style={[styles.feedbackButton, feedbackState === 'sending' && styles.feedbackButtonDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Mark as safe"
            accessibilityState={{ disabled: feedbackState === 'sending' }}
          >
            <Text style={styles.feedbackText}>{feedbackState === 'sending' ? 'Saving report…' : 'Mark as safe'}</Text>
          </Pressable>
          <Pressable
            disabled={feedbackState === 'sending'}
            onPress={() => onFeedback('dangerous')}
            style={[styles.feedbackButton, feedbackState === 'sending' && styles.feedbackButtonDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Report this message"
            accessibilityState={{ disabled: feedbackState === 'sending' }}
          >
            <Text style={styles.feedbackText}>{feedbackState === 'sending' ? 'Reporting…' : 'Report'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default function ScanScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(colors);
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<ThreatResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [feedbackState, setFeedbackState] = useState<
    'idle' | 'sending' | 'sent' | 'saved_locally' | 'already_marked_safe' | 'already_reported'
  >('idle');
  const [feedbackKind, setFeedbackKind] = useState<'safe' | 'dangerous'>('safe');
  const [virality, setVirality] = useState<PhishingVirality | null>(null);
  const [viralityLoading, setViralityLoading] = useState(false);
  const feedbackBusy = useRef(false);
  const scanVersion = useRef(0);
  const canReadPhotos = useMemo(() => isTextRecognitionAvailable(), []);
  const [readingImage, setReadingImage] = useState(false);
  // Text read from a photo can contain misread characters, so the user is asked to check it.
  const [textFromPhoto, setTextFromPhoto] = useState(false);

  const onPaste = useCallback(async () => {
    const clipboardText = await Clipboard.getStringAsync();
    if (!clipboardText.trim()) {
      Alert.alert('Nothing to paste', 'Copy a message in your Messages app, then tap Paste again.');
      return;
    }
    setMessage(clipboardText.slice(0, maxCharacters));
    setTextFromPhoto(false);
    scanVersion.current++;
    setResult(null);
    setFeedbackState('idle');
    setVirality(null);
    setViralityLoading(false);
  }, []);

  const applyImageText = useCallback((read: ImageTextResult) => {
    switch (read.status) {
      case 'ok':
        setMessage(read.text.slice(0, maxCharacters));
        setTextFromPhoto(true);
        scanVersion.current++;
        setResult(null);
        setFeedbackState('idle');
        setVirality(null);
        setViralityLoading(false);
        return;
      case 'no-text':
        Alert.alert(
          'No text found',
          'Fill the frame with the message, turn the other screen’s brightness up, and avoid glare, then try again.',
        );
        return;
      case 'permission-denied':
        Alert.alert(
          'Camera access needed',
          'NotiCare uses the camera only to read a message you photograph. The photo stays on this phone.',
          read.canAskAgain
            ? [{ text: 'OK' }]
            : [
                { text: 'Not now', style: 'cancel' },
                { text: 'Open settings', onPress: () => void Linking.openSettings() },
              ],
        );
        return;
      case 'unavailable':
        Alert.alert('Not available', 'Install the latest NotiCare build to read text from photos.');
        return;
      case 'error':
        Alert.alert('Could not read the photo', 'Try again, or paste the message text instead.');
        return;
      case 'canceled':
        return;
    }
  }, []);

  const readImage = useCallback(
    async (source: ImageTextSource) => {
      setReadingImage(true);
      try {
        applyImageText(await readMessageFromImage(source));
      } finally {
        setReadingImage(false);
      }
    },
    [applyImageText],
  );

  const onPhoto = useCallback(() => {
    Alert.alert('Scan text from a photo', 'The photo is read on this phone, then deleted. It is never uploaded.', [
      { text: 'Take photo', onPress: () => void readImage('camera') },
      { text: 'Choose screenshot', onPress: () => void readImage('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [readImage]);

  // Android can close the app while the camera is open; finish reading the photo on return.
  useEffect(() => {
    if (!canReadPhotos) return;
    let active = true;
    void readMessageFromPendingImage().then((read) => {
      if (active && read) applyImageText(read);
    });
    return () => {
      active = false;
    };
  }, [applyImageText, canReadPhotos]);

  const handleScan = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed || scanning) return;
    setScanning(true);
    const version = ++scanVersion.current;
    setFeedbackState('idle');
    setVirality(null);
    setViralityLoading(false);
    try {
      // In an Android development/release build this calls the same Kotlin
      // evaluator used by the notification listener. Expo Go falls back to the
      // parity-tested TypeScript evaluator so Manual Scan remains usable.
      const assessment: ThreatResult = isNativeMonitoringAvailable()
        ? await scanTextLocally(trimmed)
        : evaluateThreat(trimmed);
      setResult(assessment);
      // Metadata-only community event; manual scans are explicitly never blocked.
      try {
        await queueThreatEvent(assessment, 'manual', false);
        void flushQueuedThreatEvents();
      } catch (error) {
        logError('manual-scan-metadata-queue-failed', error);
        Alert.alert(
          'Scan completed',
          'Your result is ready, but anonymous community metadata could not be saved right now. Your message was not uploaded.',
        );
      }
      // Only a Dangerous result's community score is looked up: it's the only
      // level a report can ever raise, and Safe/Suspicious never carry one.
      if (assessment.level === 'dangerous') {
        setViralityLoading(true);
        getMessageVirality(trimmed)
          .then((found) => {
            if (version === scanVersion.current) setVirality(found);
          })
          .finally(() => {
            if (version === scanVersion.current) setViralityLoading(false);
          });
      }
      // Re-scanning text you already gave feedback on shows that status
      // instead of the buttons again, so it can't look like a fresh result.
      void getMessageFeedbackRecord(trimmed).then((record) => {
        if (!record || version !== scanVersion.current) return;
        setFeedbackState(record === 'safe' ? 'already_marked_safe' : 'already_reported');
      });
    } catch (error) {
      logError('manual-scan-failed', error);
      Alert.alert(
        'Unable to scan',
        'NotiCare could not scan this text locally. Please try again. Your message was not uploaded.',
      );
    } finally {
      setScanning(false);
    }
  }, [message, scanning]);

  const handleFeedback = useCallback(
    async (kind: 'safe' | 'dangerous') => {
      if (!result || feedbackState !== 'idle' || feedbackBusy.current) return;
      feedbackBusy.current = true;
      const version = scanVersion.current;
      setFeedbackState('sending');
      try {
        const status = await sendScanFeedback(kind, result);
        await markMessageFeedback(message.trim(), kind);
        if (kind === 'dangerous') {
          try {
            const updated = await reportAndBlockMessage(message.trim(), null, result);
            if (updated && version === scanVersion.current) setVirality(updated);
          } catch (error) {
            logError('manual-report-and-block-failed', error);
          }
        }
        if (version === scanVersion.current) {
          setFeedbackKind(kind);
          setFeedbackState(status);
        }
      } catch (error) {
        logError('manual-feedback-failed', error);
        if (version === scanVersion.current) {
          Alert.alert(
            'Report not saved',
            'Check your connection and sign-in status, then try again. Your message text was not uploaded.',
          );
          setFeedbackState('idle');
        }
      } finally {
        feedbackBusy.current = false;
      }
    },
    [feedbackState, message, result],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="light" />
      <Header />
      <ScrollView
        style={styles.contentArea}
        contentContainerStyle={[styles.content, { paddingBottom: 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.scannerIcon}>
          <Ionicons name="scan-outline" size={38} color={colors.headerText} />
        </View>
        <Text style={styles.heading}>Text Scanner</Text>
        <Text style={styles.subheading}>Paste a suspicious message to check it for scam warning signs</Text>

        <View style={styles.summaryRow}>
          <View style={styles.summaryChip}>
            <Ionicons name="shield-checkmark" size={14} color={colors.accent} />
            <Text style={styles.summaryChipText}>Privacy-first</Text>
          </View>
          <View style={styles.summaryChip}>
            <Ionicons name="flash" size={14} color={colors.accent} />
            <Text style={styles.summaryChipText}>Instant scan</Text>
          </View>
          <View style={styles.summaryChip}>
            <Ionicons name="people" size={14} color={colors.accent} />
            <Text style={styles.summaryChipText}>Community alerts</Text>
          </View>
        </View>

        <View style={styles.analysisCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Message Analysis</Text>
            <Text style={styles.count}>
              {message.length}/{maxCharacters}
            </Text>
          </View>
          <View style={styles.inputWrap}>
            <TextInput
              value={message}
              onChangeText={(text) => {
                setMessage(text.slice(0, maxCharacters));
                if (!text) setTextFromPhoto(false);
                scanVersion.current++;
                setResult(null);
                setFeedbackState('idle');
                setVirality(null);
                setViralityLoading(false);
              }}
              placeholder="Paste your message here…"
              placeholderTextColor="#7B8AA3"
              multiline
              maxLength={maxCharacters}
              textAlignVertical="top"
              style={styles.input}
              accessibilityLabel="SMS message to scan"
            />
          </View>
          <View style={styles.inputActions}>
            <Pressable
              onPress={onPaste}
              style={styles.secondaryButton}
              accessibilityRole="button"
              accessibilityLabel="Paste SMS from clipboard"
            >
              <Ionicons name="clipboard-outline" size={18} color={colors.link} />
              <Text style={styles.secondaryText}>Paste</Text>
            </Pressable>
            {canReadPhotos ? (
              <Pressable
                onPress={onPhoto}
                disabled={readingImage}
                style={[styles.secondaryButton, readingImage && styles.secondaryDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Scan text from a photo or screenshot"
                accessibilityState={{ disabled: readingImage, busy: readingImage }}
              >
                <Ionicons name="camera-outline" size={18} color={colors.link} />
                <Text style={styles.secondaryText}>{readingImage ? 'Reading…' : 'Photo'}</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => {
                setMessage('');
                setTextFromPhoto(false);
                scanVersion.current++;
                setResult(null);
                setFeedbackState('idle');
                setVirality(null);
                setViralityLoading(false);
              }}
              disabled={!message}
              style={[styles.secondaryButton, !message && styles.secondaryDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Clear message"
            >
              <Ionicons name="close-circle-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.secondaryText}>Clear</Text>
            </Pressable>
          </View>
          {textFromPhoto && message ? (
            <View style={styles.photoNote} accessibilityLiveRegion="polite">
              <Ionicons name="camera-outline" size={15} color={colors.warning} />
              <Text style={styles.photoNoteText}>
                Text read from a photo. Check it matches the message — especially any links — then tap Scan.
              </Text>
            </View>
          ) : null}
          <Text style={styles.privacyText}>
            <Ionicons name="lock-closed-outline" size={12} /> Your SMS is analyzed on this device and its text is never
            uploaded — unless you tap Report, which shares that exact message so other NotiCare users can be warned
            about it.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan message"
            disabled={!message.trim() || scanning}
            onPress={handleScan}
            style={({ pressed }) => [
              styles.scanButton,
              (!message.trim() || scanning) && styles.scanButtonDisabled,
              pressed && message.trim() && styles.scanButtonPressed,
            ]}
          >
            <Ionicons name="scan-outline" size={19} color="#fff" />
            <Text style={styles.scanButtonText}>{scanning ? 'Scanning locally…' : 'Scan message'}</Text>
          </Pressable>
        </View>

        {result ? (
          <ResultCard
            result={result}
            onFeedback={handleFeedback}
            feedbackState={feedbackState}
            feedbackKind={feedbackKind}
            virality={virality}
            viralityLoading={viralityLoading}
          />
        ) : null}
        <Pressable onPress={() => router.push('/guide')} style={styles.guideLink} accessibilityRole="button">
          <Ionicons name="book-outline" size={19} color="#006DAB" />
          <Text style={styles.guideLinkText}>Open the User Guide</Text>
        </Pressable>
      </ScrollView>
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
    content: { alignItems: 'center', paddingHorizontal: 10, paddingTop: 26 },
    scannerIcon: {
      width: 72,
      height: 72,
      borderRadius: 24,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#142038',
      shadowOpacity: 0.18,
      shadowRadius: 10,
      elevation: 6,
    },
    heading: { color: colors.textPrimary, fontSize: 24, fontWeight: '800', marginTop: 16, textAlign: 'center' },
    subheading: { color: colors.textSecondary, fontSize: 14, marginTop: 8, textAlign: 'center', maxWidth: 300 },
    summaryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 8,
      marginTop: 18,
    },
    summaryChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.border,
    },
    summaryChipText: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
    analysisCard: {
      alignSelf: 'stretch',
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 18,
      marginTop: 22,
      shadowColor: '#1E2D43',
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
    count: { color: colors.textMuted, fontSize: 12 },
    inputWrap: {
      marginTop: 16,
      borderRadius: 14,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    input: {
      minHeight: 130,
      maxHeight: 240,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 14,
      paddingHorizontal: 13,
      paddingTop: 12,
      color: colors.textPrimary,
      fontSize: 14,
      lineHeight: 20,
    },
    inputActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
    secondaryButton: {
      flex: 1,
      height: 42,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.surfaceAlt,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    secondaryDisabled: { opacity: 0.45 },
    secondaryText: { color: colors.textSecondary, fontWeight: '700' },
    photoNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 12 },
    photoNoteText: { flex: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
    privacyText: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 13 },
    scanButton: {
      height: 52,
      backgroundColor: colors.accent,
      borderRadius: 12,
      marginTop: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 11,
      shadowColor: '#0D3C39',
      shadowOpacity: 0.16,
      shadowRadius: 8,
      elevation: 4,
    },
    scanButtonDisabled: { backgroundColor: '#939BA8' },
    scanButtonPressed: { opacity: 0.82 },
    scanButtonText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
    resultCard: {
      alignSelf: 'stretch',
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 17,
      marginTop: 16,
      borderWidth: 1,
      shadowColor: '#1E2D43',
      shadowOpacity: 0.08,
      shadowRadius: 7,
      elevation: 2,
    },
    resultHero: { borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
    resultHeroCopy: { flex: 1 },
    resultLevelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    resultLevel: { fontWeight: '800', fontSize: 18 },
    newBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
    newBadgeText: { color: '#fff', fontWeight: '800', fontSize: 10, letterSpacing: 0.4 },
    score: { color: colors.textSecondary, marginTop: 2, fontSize: 13 },
    resultExplanation: { color: colors.textSecondary, lineHeight: 20, marginTop: 13 },
    scoreExplanation: { color: colors.textMuted, lineHeight: 18, marginTop: 8, fontSize: 12.5, fontStyle: 'italic' },
    resultSectionTitle: { color: colors.textPrimary, fontWeight: '800', marginTop: 17, marginBottom: 8 },
    reasonRow: { flexDirection: 'row', gap: 8, paddingVertical: 7 },
    reasonCopy: { flex: 1 },
    reasonTitle: { color: colors.textPrimary, fontWeight: '700', fontSize: 13 },
    reasonText: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
    muted: { color: colors.textMuted, fontSize: 13 },
    urlRow: {
      backgroundColor: colors.warningSoft,
      borderRadius: 7,
      padding: 9,
      flexDirection: 'row',
      gap: 8,
      alignItems: 'flex-start',
      marginTop: 6,
    },
    urlText: { color: colors.warning, flex: 1, fontSize: 12, lineHeight: 17 },
    actionBox: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 9,
      padding: 12,
      marginTop: 18,
      flexDirection: 'row',
      gap: 9,
    },
    actionCopy: { flex: 1 },
    actionTitle: { color: navy, fontWeight: '800', fontSize: 13 },
    actionText: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
    meta: { color: colors.textMuted, fontSize: 11, marginTop: 13 },
    feedbackRow: { flexDirection: 'row', gap: 9, marginTop: 15 },
    feedbackButton: {
      flex: 1,
      minHeight: 41,
      paddingHorizontal: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    feedbackButtonDisabled: { opacity: 0.55 },
    feedbackText: { color: colors.textSecondary, fontWeight: '700', fontSize: 12, textAlign: 'center' },
    feedbackSent: {
      minHeight: 42,
      borderRadius: 8,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 7,
      marginTop: 15,
      paddingHorizontal: 10,
    },
    feedbackSentText: { color: '#007D59', fontWeight: '700', fontSize: 12, textAlign: 'center' },
    guideLink: { marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 10 },
    guideLinkText: { color: '#006DAB', fontWeight: '700' },
  });
}
