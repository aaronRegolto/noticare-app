import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppUpdate } from '@/src/providers/AppUpdateProvider';
import type { ThemeColors } from '@/src/theme/palette';
import { useAppTheme } from '@/src/theme/ThemeProvider';

function releaseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** "Update available": what the new version is for, what changed, and a link to download it. */
export function UpdatePrompt() {
  const { update, promptVisible, installed, dismiss } = useAppUpdate();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [downloadStarted, setDownloadStarted] = useState(false);

  if (!update) return null;
  const released = releaseDate(update.publishedAt);

  const download = async () => {
    try {
      await Linking.openURL(update.apkUrl);
      setDownloadStarted(true);
    } catch {
      Alert.alert('Could not open the download', 'Check your connection and try again.');
    }
  };

  return (
    <Modal
      visible={promptVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={update.required ? () => undefined : dismiss}
    >
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.icon}>
            <Ionicons name="cloud-download-outline" size={26} color={colors.accent} />
          </View>
          <Text style={styles.heading} accessibilityRole="header">
            {update.required ? 'Update required' : 'Update available'}
          </Text>
          <Text style={styles.version}>
            NotiCare {update.versionName}
            {installed.name ? ` · you have ${installed.name}` : ''}
          </Text>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <Text style={styles.label}>What this update is for</Text>
            <Text style={styles.title}>{update.title}</Text>

            <Text style={[styles.label, styles.labelSpaced]}>What&apos;s new</Text>
            {update.changes.map((change, index) => (
              <View key={index} style={styles.change}>
                <Ionicons name="checkmark-circle" size={17} color={colors.success} style={styles.changeIcon} />
                <Text style={styles.changeText}>{change}</Text>
              </View>
            ))}
            {released ? <Text style={styles.released}>Released {released}</Text> : null}

            {update.required ? (
              <View style={[styles.notice, { backgroundColor: colors.warningSoft }]}>
                <Ionicons name="alert-circle" size={17} color={colors.warning} />
                <Text style={[styles.noticeText, { color: colors.warning }]}>
                  This update is required to keep NotiCare protecting you.
                </Text>
              </View>
            ) : null}
            {downloadStarted ? (
              <View style={[styles.notice, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="information-circle" size={17} color={colors.link} />
                <Text style={[styles.noticeText, { color: colors.textPrimary }]}>
                  When the download finishes, open the file and tap Update. If Android asks, allow installs from your
                  browser. Your history, settings, and plan stay on your phone.
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <Pressable
            onPress={download}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Ionicons name="download-outline" size={18} color={colors.accentContrast} />
            <Text style={styles.primaryText}>{downloadStarted ? 'Download again' : 'Download update'}</Text>
          </Pressable>
          {update.required ? null : (
            <Pressable onPress={dismiss} style={styles.secondary} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.secondaryText}>{downloadStarted ? 'Close' : 'Later'}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 20 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 22,
      padding: 20,
      maxHeight: '88%',
      borderWidth: 1,
      borderColor: colors.border,
    },
    icon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
    },
    heading: { color: colors.textPrimary, fontSize: 20, fontWeight: '800', textAlign: 'center', marginTop: 12 },
    version: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 },
    body: { marginTop: 16, flexGrow: 0 },
    bodyContent: { paddingBottom: 4 },
    label: {
      color: colors.textMuted,
      fontSize: 11.5,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      marginBottom: 6,
    },
    labelSpaced: { marginTop: 16 },
    title: { color: colors.textPrimary, fontSize: 16, fontWeight: '700', lineHeight: 22 },
    change: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    changeIcon: { marginTop: 1 },
    changeText: { flex: 1, color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
    released: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
    notice: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, marginTop: 14 },
    noticeText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
    primary: {
      marginTop: 18,
      minHeight: 50,
      borderRadius: 14,
      backgroundColor: colors.accent,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    pressed: { opacity: 0.85 },
    primaryText: { color: colors.accentContrast, fontSize: 15, fontWeight: '800' },
    secondary: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 24, marginTop: 2 },
    secondaryText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
  });
}
