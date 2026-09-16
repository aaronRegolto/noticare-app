import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { evaluateThreat, type ThreatLevel, type ThreatResult } from '@/src/features/detection';
import { sendScanFeedback } from '@/src/services/feedback';
import { flushQueuedThreatEvents, queueThreatEvent } from '@/src/services/eventSync';
import { logError } from '@/src/services/logger';
import { isNativeMonitoringAvailable, scanTextLocally } from '@/src/services/notificationListener';

const navy = '#1E2D43';
const emerald = '#00B87C';
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
    title: 'Safe for now',
    explanation:
      'No meaningful phishing indicators were found. Keep using normal caution—NotiCare cannot guarantee every scam is detected.',
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
    title: 'Likely smishing',
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

function ScanTutorial({ onHide }: { onHide: () => void }) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = reduceMotion
      ? 1
      : withRepeat(withTiming(1.045, { duration: 820, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse, reduceMotion]);

  const animatedIcon = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const steps = [
    ['chatbubble-ellipses-outline', 'Long-press', 'Open the SMS in your Messages app and long-press it.'],
    ['copy-outline', 'Copy', 'Tap Copy. NotiCare does not read your clipboard automatically.'],
    ['scan-outline', 'Paste & scan', 'Come back here, tap Paste, then choose Scan Message.'],
  ] as const;

  return (
    <View style={styles.tutorial} accessibilityLabel="Three-step manual scan tutorial">
      <View style={styles.tutorialTitleRow}>
        <View>
          <Text style={styles.tutorialTitle}>How to scan an SMS</Text>
          <Text style={styles.tutorialCopy}>A safe, private three-step check</Text>
        </View>
        <Pressable onPress={onHide} accessibilityRole="button" accessibilityLabel="Hide scan tutorial" hitSlop={10}>
          <Ionicons name="close" size={21} color="#637998" />
        </Pressable>
      </View>
      <View style={styles.stepRow}>
        {steps.map(([icon, title, copy], index) => (
          <View style={styles.step} key={title}>
            <Animated.View style={[styles.stepIcon, index === 2 && animatedIcon]}>
              <Ionicons name={icon} size={23} color={index === 2 ? '#fff' : emerald} />
            </Animated.View>
            <Text style={styles.stepNumber}>STEP {index + 1}</Text>
            <Text style={styles.stepTitle}>{title}</Text>
            <Text style={styles.stepCopy}>{copy}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ResultCard({
  result,
  onFeedback,
  feedbackState,
}: {
  result: ThreatResult;
  onFeedback: (kind: 'safe' | 'dangerous') => void;
  feedbackState: 'idle' | 'sending' | 'sent' | 'saved_locally';
}) {
  const display = levelCopy[result.level];
  const scanTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
  return (
    <View style={[styles.resultCard, { borderColor: display.color }]} accessibilityLiveRegion="polite">
      <View style={[styles.resultHero, { backgroundColor: display.surface }]}>
        <Ionicons name={display.icon} size={29} color={display.color} />
        <View style={styles.resultHeroCopy}>
          <Text style={[styles.resultLevel, { color: display.color }]}>{display.title}</Text>
          <Text style={styles.score}>{result.score}/100 risk score</Text>
        </View>
      </View>
      <Text style={styles.resultExplanation}>{display.explanation}</Text>
      <Text style={styles.resultSectionTitle}>Warning signs found</Text>
      {result.reasons.length ? (
        result.reasons.map((reason) => (
          <View key={reason.code} style={styles.reasonRow}>
            <Ionicons name="alert-circle-outline" size={18} color={display.color} />
            <View style={styles.reasonCopy}>
              <Text style={styles.reasonTitle}>{reason.label}</Text>
              <Text style={styles.reasonText}>{reason.description}</Text>
            </View>
          </View>
        ))
      ) : (
        <Text style={styles.muted}>No meaningful warning signs were found.</Text>
      )}
      {result.urls.length ? (
        <>
          <Text style={styles.resultSectionTitle}>Links found — do not open</Text>
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
      {feedbackState === 'sent' || feedbackState === 'saved_locally' ? (
        <View style={styles.feedbackSent} accessibilityLiveRegion="polite">
          <Ionicons name="checkmark-circle" size={18} color="#007D59" />
          <Text style={styles.feedbackSentText}>
            {feedbackState === 'saved_locally'
              ? 'Report saved on this device only. It has not been sent to admin.'
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
            accessibilityLabel="Report smishing"
            accessibilityState={{ disabled: feedbackState === 'sending' }}
          >
            <Text style={styles.feedbackText}>Report smishing</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default function ScanScreen() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<ThreatResult | null>(null);
  const [tutorialVisible, setTutorialVisible] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [feedbackState, setFeedbackState] = useState<'idle' | 'sending' | 'sent' | 'saved_locally'>('idle');
  const feedbackBusy = useRef(false);
  const scanVersion = useRef(0);

  const onPaste = useCallback(async () => {
    const clipboardText = await Clipboard.getStringAsync();
    if (!clipboardText.trim()) {
      Alert.alert('Nothing to paste', 'Copy the SMS in your Messages app, then return here and tap Paste.');
      return;
    }
    setMessage(clipboardText.slice(0, maxCharacters));
    scanVersion.current++;
    setResult(null);
    setFeedbackState('idle');
  }, []);

  const handleScan = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed || scanning) return;
    setScanning(true);
    scanVersion.current++;
    setFeedbackState('idle');
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
        if (version === scanVersion.current) setFeedbackState(status);
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
    [feedbackState, result],
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
          <Ionicons name="scan-outline" size={37} color="#fff" />
        </View>
        <Text style={styles.heading}>Text Scanner</Text>
        <Text style={styles.subheading}>Paste a suspicious SMS here to verify</Text>
        {tutorialVisible ? (
          <ScanTutorial onHide={() => setTutorialVisible(false)} />
        ) : (
          <Pressable onPress={() => setTutorialVisible(true)} style={styles.helpLink} accessibilityRole="button">
            <Ionicons name="help-circle-outline" size={18} color="#006DAB" />
            <Text style={styles.helpLinkText}>Show scan tutorial</Text>
          </Pressable>
        )}

        <View style={styles.analysisCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Message Analysis</Text>
            <Text style={styles.count}>
              {message.length}/{maxCharacters}
            </Text>
          </View>
          <TextInput
            value={message}
            onChangeText={(text) => {
              setMessage(text.slice(0, maxCharacters));
              scanVersion.current++;
              setResult(null);
              setFeedbackState('idle');
            }}
            placeholder="Paste suspicious SMS here..."
            placeholderTextColor="#7B8AA3"
            multiline
            maxLength={maxCharacters}
            textAlignVertical="top"
            style={styles.input}
            accessibilityLabel="SMS message to scan"
          />
          <View style={styles.inputActions}>
            <Pressable
              onPress={onPaste}
              style={styles.secondaryButton}
              accessibilityRole="button"
              accessibilityLabel="Paste SMS from clipboard"
            >
              <Ionicons name="clipboard-outline" size={18} color="#006DAB" />
              <Text style={styles.secondaryText}>Paste</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setMessage('');
                scanVersion.current++;
                setResult(null);
                setFeedbackState('idle');
              }}
              disabled={!message}
              style={[styles.secondaryButton, !message && styles.secondaryDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Clear message"
            >
              <Ionicons name="close-circle-outline" size={18} color="#526B8C" />
              <Text style={styles.secondaryText}>Clear</Text>
            </Pressable>
          </View>
          <Text style={styles.privacyText}>
            <Ionicons name="lock-closed-outline" size={12} /> Your SMS is analyzed on this device. We do not upload its
            text, sender, or links.
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
            <Text style={styles.scanButtonText}>{scanning ? 'Scanning locally…' : 'Scan Message'}</Text>
          </Pressable>
        </View>

        {result ? <ResultCard result={result} onFeedback={handleFeedback} feedbackState={feedbackState} /> : null}
        <Pressable onPress={() => router.push('/guide')} style={styles.guideLink} accessibilityRole="button">
          <Ionicons name="book-outline" size={19} color="#006DAB" />
          <Text style={styles.guideLinkText}>Open the complete User Guide</Text>
        </Pressable>
      </ScrollView>
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
  content: { alignItems: 'center', paddingHorizontal: 10, paddingTop: 26 },
  scannerIcon: {
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
  heading: { color: '#13243C', fontSize: 24, fontWeight: '800', marginTop: 16, textAlign: 'center' },
  subheading: { color: '#566F95', fontSize: 14, marginTop: 8, textAlign: 'center' },
  tutorial: {
    alignSelf: 'stretch',
    backgroundColor: '#EFF8F5',
    borderRadius: 14,
    padding: 16,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#CDEEDC',
  },
  tutorialTitleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  tutorialTitle: { color: '#193754', fontWeight: '800', fontSize: 16 },
  tutorialCopy: { color: '#627B99', fontSize: 12, marginTop: 3 },
  stepRow: { flexDirection: 'row', gap: 7, marginTop: 16 },
  step: { flex: 1, alignItems: 'center' },
  stepIcon: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#BDE8D3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: { color: '#00825B', fontWeight: '800', fontSize: 10, marginTop: 8 },
  stepTitle: { color: '#29425F', fontWeight: '800', fontSize: 12, marginTop: 2 },
  stepCopy: { color: '#627B99', fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 4 },
  helpLink: { marginTop: 19, flexDirection: 'row', alignItems: 'center', gap: 6 },
  helpLinkText: { color: '#006DAB', fontWeight: '700' },
  analysisCard: {
    alignSelf: 'stretch',
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 20,
    marginTop: 24,
    shadowColor: '#1E2D43',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: '#111827', fontSize: 18, fontWeight: '700' },
  count: { color: '#7186A5', fontSize: 12 },
  input: {
    minHeight: 130,
    maxHeight: 240,
    backgroundColor: '#F1F4F8',
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingTop: 12,
    color: '#283A52',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 16,
  },
  inputActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  secondaryButton: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: '#D9E2EE',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryDisabled: { opacity: 0.5 },
  secondaryText: { color: '#36506E', fontWeight: '700' },
  privacyText: { color: '#7086AA', fontSize: 12, lineHeight: 17, marginTop: 13 },
  scanButton: {
    height: 51,
    backgroundColor: emerald,
    borderRadius: 9,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
  },
  scanButtonDisabled: { backgroundColor: '#939BA8' },
  scanButtonPressed: { opacity: 0.82 },
  scanButtonText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  resultCard: {
    alignSelf: 'stretch',
    backgroundColor: '#FFF',
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
  resultLevel: { fontWeight: '800', fontSize: 18 },
  score: { color: '#506A88', marginTop: 2, fontSize: 13 },
  resultExplanation: { color: '#536B89', lineHeight: 20, marginTop: 13 },
  resultSectionTitle: { color: '#263F5E', fontWeight: '800', marginTop: 17, marginBottom: 8 },
  reasonRow: { flexDirection: 'row', gap: 8, paddingVertical: 7 },
  reasonCopy: { flex: 1 },
  reasonTitle: { color: '#29425F', fontWeight: '700', fontSize: 13 },
  reasonText: { color: '#667E9E', fontSize: 12, lineHeight: 17, marginTop: 2 },
  muted: { color: '#6B83A3', fontSize: 13 },
  urlRow: {
    backgroundColor: '#FFF8E9',
    borderRadius: 7,
    padding: 9,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginTop: 6,
  },
  urlText: { color: '#7A5400', flex: 1, fontSize: 12, lineHeight: 17 },
  actionBox: { backgroundColor: '#F0F5FB', borderRadius: 9, padding: 12, marginTop: 18, flexDirection: 'row', gap: 9 },
  actionCopy: { flex: 1 },
  actionTitle: { color: navy, fontWeight: '800', fontSize: 13 },
  actionText: { color: '#576F8E', fontSize: 12, lineHeight: 17, marginTop: 3 },
  meta: { color: '#7288A5', fontSize: 11, marginTop: 13 },
  feedbackRow: { flexDirection: 'row', gap: 9, marginTop: 15 },
  feedbackButton: {
    flex: 1,
    minHeight: 41,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#C9D7E8',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackButtonDisabled: { opacity: 0.55 },
  feedbackText: { color: '#315273', fontWeight: '700', fontSize: 12, textAlign: 'center' },
  feedbackSent: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: '#E9FAF2',
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
