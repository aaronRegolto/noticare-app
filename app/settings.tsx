import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/src/providers/AuthProvider';
import { useOnboarding } from '@/src/providers/OnboardingProvider';
import { useSubscription } from '@/src/providers/SubscriptionProvider';
import { WarningAppearanceSelector } from '@/src/components/warning-appearance-selector';
import { AccentSwatchPicker, ThemeModeSelector } from '@/src/components/theme-selector';
import { detectPhilippineCarrier } from '@/src/features/auth/phone';
import type { MessageLanguage } from '@/src/features/translation';
import { logError } from '@/src/services/logger';
import {
  ensureLanguagePack,
  setMessageLanguage,
  useMessageTranslationSettings,
  type LanguagePackStatus,
} from '@/src/services/messageTranslation';
import { deleteAccount, isSupabaseConfigured, listLinkedPhones, unlinkPhone } from '@/src/services/supabase';
import {
  getInstalledBrowsers,
  isDefaultBrowser,
  isNativeLinkHandlerAvailable,
  requestDefaultBrowser,
  setPreferredBrowser,
  type InstalledBrowser,
} from '@/src/services/linkHandler';
import {
  clearHistory,
  getMonitoringStatus,
  isNativeMonitoringAvailable,
  openAppNotificationSettings,
  requestFullScreenIntentPermission,
  requestOverlayPermission,
  requestIgnoreBatteryOptimizations,
  requestNotificationListenerAccess,
  requestNotificationPolicyAccess,
  setScanningEnabled,
  setFullScreenWarnings,
  type MonitoringStatus,
} from '@/src/services/notificationListener';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import type { ThemeColors } from '@/src/theme/palette';

function maskPhone(phone: string | undefined) {
  if (!phone) return 'Signed in securely';
  const compact = phone.replace(/\s+/g, '');
  const lastFour = compact.replace(/\D/g, '').slice(-4);
  const countryCode = compact.startsWith('+63') ? '+63' : compact.startsWith('+1') ? '+1' : '+…';
  return lastFour ? `${countryCode} ••• ••• ${lastFour}` : 'Signed in securely';
}

function humanStatus(status: MonitoringStatus | null, colors: ThemeColors) {
  if (!status)
    return { title: 'Checking status', tone: colors.textMuted, message: 'Reading Android monitoring status…' };
  switch (status.status) {
    case 'active':
      return {
        title: 'Active',
        tone: colors.accent,
        message: `Monitoring ${status.defaultSmsAppName ?? 'your default Messages app'}.`,
      };
    case 'off':
      return { title: 'Off', tone: colors.textMuted, message: 'Real-Time Scanning is turned off on this device.' };
    case 'permission_required':
      return {
        title: 'Permission required',
        tone: colors.warning,
        message: 'Allow Android Notification Access to enable scanning.',
      };
    case 'service_disconnected':
      return {
        title: 'Service disconnected',
        tone: colors.warning,
        message: 'Android has not connected the notification listener yet.',
      };
    case 'sms_app_unavailable':
      return {
        title: 'Messages app unavailable',
        tone: colors.danger,
        message: 'Choose a default SMS app in Android settings first.',
      };
  }
}

function PhoneChip({
  phone,
  primary = false,
  colors,
  onRemove,
}: {
  phone: string;
  primary?: boolean;
  colors: ThemeColors;
  onRemove?: () => void;
}) {
  const styles = useThemedStyles(colors);
  const carrier = detectPhilippineCarrier(phone);
  return (
    <View style={[styles.phoneChip, primary && styles.phoneChipPrimary]}>
      <View>
        <Text style={styles.phoneChipNumber}>{maskPhone(phone)}</Text>
        <Text style={styles.phoneChipMeta}>
          {primary ? 'Primary' : 'Linked'}
          {carrier ? ` · ${carrier}` : ''}
        </Text>
      </View>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${phone}`}>
          <Ionicons name="close-circle" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const MESSAGE_LANGUAGE_OPTIONS: { value: MessageLanguage; label: string; description: string }[] = [
  { value: 'default', label: 'Default', description: 'Messages exactly as received; warnings in English' },
  { value: 'tl', label: 'Tagalog', description: 'Messages translated to Tagalog; warnings in Tagalog' },
  { value: 'en', label: 'English', description: 'Messages translated to English; warnings in English' },
];

function languagePackCopy(pack: LanguagePackStatus) {
  switch (pack) {
    case 'ready':
      return 'Language pack ready. Translation works offline.';
    case 'downloading':
      return 'Downloading the language pack (about 60 MB) on Wi-Fi… Messages show as received until it finishes.';
    case 'wifi-required':
      return 'Connect to Wi-Fi to download the language pack (about 60 MB). Messages show as received until then.';
    case 'failed':
      return 'The language pack couldn’t download. Check your Wi-Fi connection and try again.';
    default:
      return 'Checking the language pack…';
  }
}

function SettingRow({
  icon,
  title,
  subtitle,
  onPress,
  destructive = false,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  destructive?: boolean;
  colors: ThemeColors;
}) {
  const styles = useThemedStyles(colors);
  return (
    <Pressable onPress={onPress} style={styles.settingRow} accessibilityRole="button">
      <View style={[styles.settingIcon, destructive && styles.settingIconDanger]}>
        <Ionicons name={icon} size={20} color={destructive ? colors.danger : colors.link} />
      </View>
      <View style={styles.settingCopy}>
        <Text style={[styles.settingTitle, destructive && styles.dangerText]}>{title}</Text>
        {subtitle ? <Text style={styles.settingSubtitle}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { session, signOut, isDevelopmentPhoneLogin } = useAuth();
  const { tier: subscriptionTier } = useSubscription();
  const { colors, mode, accent, setMode, setAccent } = useAppTheme();
  const styles = useThemedStyles(colors);
  const [status, setStatus] = useState<MonitoringStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [linkedPhones, setLinkedPhones] = useState<string[]>([]);
  const [browsers, setBrowsers] = useState<InstalledBrowser[]>([]);
  const [browsersError, setBrowsersError] = useState<string | null>(null);
  const [defaultBrowserActive, setDefaultBrowserActive] = useState<boolean | null>(null);
  const translation = useMessageTranslationSettings();

  // Check the language pack (and finish a download that was waiting for Wi-Fi) when Settings opens.
  useEffect(() => {
    if (translation.available && translation.language !== 'default') void ensureLanguagePack();
  }, [translation.available, translation.language]);

  const refreshLinkedPhones = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      const rows = await listLinkedPhones();
      setLinkedPhones(rows.map((row) => row.phone_e164));
    } catch (error) {
      logError('linked-phones-load-failed', error);
    }
  }, []);

  const confirmUnlinkPhone = useCallback(
    (phone: string) => {
      Alert.alert('Remove this number?', `${phone} will no longer be able to sign in to this account.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void unlinkPhone(phone)
              .then(() => refreshLinkedPhones())
              .catch((error) => {
                logError('unlink-phone-failed', error);
                Alert.alert('Unable to remove number', 'Please try again.');
              });
          },
        },
      ]);
    },
    [refreshLinkedPhones],
  );

  const refreshStatus = useCallback(async () => {
    if (!isNativeMonitoringAvailable()) {
      setStatus(null);
      setStatusError('Real-time scanning is not available in this preview. Install the Android app to manage it.');
      return;
    }
    try {
      setStatus(await getMonitoringStatus());
      setStatusError(null);
    } catch {
      setStatus(null);
      setStatusError(
        'NotiCare could not read Android monitoring status. Try again after checking Notification Access.',
      );
    }
  }, []);

  const refreshBrowsers = useCallback(async () => {
    if (!isNativeLinkHandlerAvailable()) {
      setBrowsers([]);
      setBrowsersError('Browser protection is not available in this preview. Install the Android app to manage it.');
      return;
    }
    try {
      setBrowsers(await getInstalledBrowsers());
      setBrowsersError(null);
    } catch {
      setBrowsers([]);
      setBrowsersError('Unable to list installed browsers.');
    }
  }, []);

  const choosePreferredBrowser = useCallback(
    async (packageName: string) => {
      try {
        await setPreferredBrowser(packageName);
        await refreshBrowsers();
      } catch (error) {
        logError('preferred-browser-failed', error);
        Alert.alert('Unable to save', 'Please try again.');
      }
    },
    [refreshBrowsers],
  );

  const refreshDefaultBrowserStatus = useCallback(async () => {
    if (!isNativeLinkHandlerAvailable()) {
      setDefaultBrowserActive(null);
      return;
    }
    try {
      setDefaultBrowserActive(await isDefaultBrowser());
    } catch {
      setDefaultBrowserActive(null);
    }
  }, []);

  const fixDefaultBrowser = useCallback(() => {
    Alert.alert(
      'Set NotiCare as your default browser?',
      'To protect you when you tap links, set NotiCare as your default browser. Safe links will still open in your normal browser — NotiCare only steps in to warn you about risky ones first.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Open settings',
          onPress: () => {
            void requestDefaultBrowser().catch(() =>
              Alert.alert('Settings unavailable', 'Android default browser settings could not be opened.'),
            );
          },
        },
      ],
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshStatus();
      void refreshLinkedPhones();
      void refreshBrowsers();
      void refreshDefaultBrowserStatus();
    }, [refreshStatus, refreshLinkedPhones, refreshBrowsers, refreshDefaultBrowserStatus]),
  );

  // useFocusEffect alone only re-checks when this screen regains navigation focus. Returning
  // from Android's default-apps settings while this screen never lost focus (e.g. via the
  // system back gesture rather than switching apps) still fires an AppState change, so this
  // covers the "re-check every time the app is opened" requirement onResume would on native Android.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void refreshDefaultBrowserStatus();
      // Also picks up permissions granted in Android settings (e.g. "Display over other apps").
      void refreshStatus();
    });
    return () => subscription.remove();
  }, [refreshDefaultBrowserStatus, refreshStatus]);

  const changeScanning = useCallback(
    async (enabled: boolean) => {
      if (saving) return;
      if (!isNativeMonitoringAvailable()) {
        Alert.alert(
          'Android app required',
          'Real-time scanning is not available in this preview. Install the Android app to turn it on.',
        );
        return;
      }
      if (enabled && !status?.notificationAccessGranted) {
        Alert.alert(
          'Allow Notification Access?',
          'NotiCare needs Android Notification Access to check notifications from your Messages app.',
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Open settings',
              onPress: () => {
                void setScanningEnabled(true)
                  .then(setStatus)
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
      setSaving(true);
      try {
        const next = await setScanningEnabled(enabled);
        setStatus(next);
        if (enabled && next.status !== 'active')
          Alert.alert('Scanning could not turn on', humanStatus(next, colors).message);
      } catch {
        Alert.alert('Unable to update scanning', 'Check Android’s notification settings and try again.');
      } finally {
        setSaving(false);
      }
    },
    [saving, status, colors],
  );

  const changeWarningStyle = useCallback(
    async (fullScreen: boolean) => {
      if (saving || !status) return;
      if (fullScreen && subscriptionTier !== 'pro') {
        Alert.alert(
          'Full-screen warnings are a Pro feature',
          'Upgrade to NotiCare Pro for immersive, full-screen phishing warnings instead of a banner alert.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'See Pro', onPress: () => router.push('/paywall') },
          ],
        );
        return;
      }
      setSaving(true);
      try {
        const next = await setFullScreenWarnings(fullScreen);
        setStatus(next);
        // Go straight to the one Android permission page still missing, so turning on Full-screen
        // is a single switch for the user. The status refreshes when they come back (AppState).
        const openPermission =
          fullScreen && next.overlayPermitted === false
            ? requestOverlayPermission
            : fullScreen && next.fullScreenIntentPermitted === false
              ? requestFullScreenIntentPermission
              : null;
        await openPermission?.().catch(() =>
          Alert.alert(
            'Settings unavailable',
            'Open Android Settings > Apps > NotiCare and allow "Display over other apps" to use full-screen warnings.',
          ),
        );
      } catch {
        Alert.alert('Unable to save warning style', 'Please try again.');
      } finally {
        setSaving(false);
      }
    },
    [saving, status, subscriptionTier, router],
  );

  const confirmClearHistory = useCallback(() => {
    Alert.alert(
      'Clear your message history?',
      'This permanently deletes all captured messages. The original SMS messages stay in your Messages app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear history',
          style: 'destructive',
          onPress: () => {
            void clearHistory()
              .then(() => Alert.alert('History cleared', 'Your message history has been deleted.'))
              .catch(() => Alert.alert('Unable to clear history', 'Your message history could not be cleared.'));
          },
        },
      ],
    );
  }, []);

  const { restart: restartOnboarding } = useOnboarding();
  // Signing out also resets onboarding, so whoever signs in next on this phone gets the full
  // first-run flow (onboarding, then the User Guide) instead of landing on the Dashboard.
  const signOutAndResetOnboarding = useCallback(
    () =>
      signOut()
        .then(() => restartOnboarding())
        .catch((error) => {
          logError('sign-out-failed', error);
          Alert.alert('Unable to sign out', 'Please check your connection and try again.');
        }),
    [signOut, restartOnboarding],
  );

  const confirmSignOut = useCallback(() => {
    Alert.alert(
      'Sign out?',
      'Real-Time Scanning will turn off. Any history you keep stays encrypted and locked to this account — other accounts on this phone can’t see it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out and keep history',
          onPress: () => {
            void setScanningEnabled(false)
              .catch(() => undefined)
              .finally(() => {
                void signOutAndResetOnboarding();
              });
          },
        },
        {
          text: 'Sign out and delete history',
          style: 'destructive',
          onPress: () => {
            void setScanningEnabled(false)
              .catch(() => undefined)
              .then(() => clearHistory())
              .catch(() => undefined)
              .finally(() => {
                void signOutAndResetOnboarding();
              });
          },
        },
      ],
    );
  }, [signOutAndResetOnboarding]);

  const [deleting, setDeleting] = useState(false);
  const deleteAccountNow = useCallback(async () => {
    setDeleting(true);
    try {
      await deleteAccount();
    } catch (error) {
      setDeleting(false);
      logError('delete-account-failed', error);
      Alert.alert(
        'Unable to delete account',
        'Your account was not deleted. Check your connection and try again, or see admin.noticare.site/delete-account.',
      );
      return;
    }
    // The account is gone; wipe what this phone still holds for it and start fresh at Login.
    await setScanningEnabled(false).catch(() => undefined);
    await clearHistory().catch(() => undefined);
    await restartOnboarding().catch(() => undefined);
  }, [restartOnboarding]);

  const confirmDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your NotiCare account, your linked phone numbers, your plan, and your saved message history on this phone. Scam messages you already reported stay in the community list without your account attached. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Are you sure?', 'Your account will be deleted right away.', [
              { text: 'Keep account', style: 'cancel' },
              { text: 'Delete account', style: 'destructive', onPress: () => void deleteAccountNow() },
            ]),
        },
      ],
    );
  }, [deleteAccountNow]);

  const current = statusError
    ? { title: 'Unavailable', tone: colors.danger, message: statusError }
    : humanStatus(status, colors);

  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close settings"
        >
          <Ionicons name="arrow-back" size={25} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Settings & Privacy</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profile}>
          <View style={styles.profileHeaderRow}>
            <View style={styles.profileIcon}>
              <Ionicons name="person-outline" size={24} color={colors.textPrimary} />
            </View>
            <Text style={styles.profileTitle}>Your account</Text>
          </View>
          <View style={styles.phoneChipsRow}>
            {session?.user.phone ? (
              <PhoneChip phone={session.user.phone} primary colors={colors} />
            ) : (
              <Text style={styles.profilePhone}>{maskPhone(session?.user.phone)}</Text>
            )}
            {linkedPhones.map((phone) => (
              <PhoneChip key={phone} phone={phone} colors={colors} onRemove={() => confirmUnlinkPhone(phone)} />
            ))}
            {!isDevelopmentPhoneLogin ? (
              <Pressable
                onPress={() => router.push('/link-phone')}
                style={styles.addPhoneChip}
                accessibilityRole="button"
                accessibilityLabel="Add another phone number"
              >
                <Ionicons name="add" size={18} color={colors.accent} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <Text style={styles.sectionLabel}>PLAN</Text>
        <View style={styles.card}>
          <SettingRow
            icon="star-outline"
            title={subscriptionTier === 'free' ? 'Free plan' : 'Pro plan'}
            subtitle={
              subscriptionTier === 'free'
                ? '10 automatic scans/month · Upgrade for unlimited protection'
                : 'Unlimited scans, full history, viral phishing ranking'
            }
            onPress={() => router.push('/paywall')}
            colors={colors}
          />
        </View>

        <Text style={styles.sectionLabel}>REAL-TIME PROTECTION</Text>
        <View style={styles.card}>
          <View style={styles.scanRow}>
            <View style={styles.scanLabel}>
              <View style={[styles.statusDot, { backgroundColor: current.tone }]} />
              <View>
                <Text style={styles.cardTitle}>Real-Time Scanning</Text>
                <Text style={styles.cardSubtitle}>{current.title}</Text>
              </View>
            </View>
            <Switch
              value={Boolean(status?.scanningEnabled)}
              disabled={saving || !status}
              onValueChange={(value) => void changeScanning(value)}
              trackColor={{ false: '#AFBBCB', true: colors.accent }}
              thumbColor={status?.scanningEnabled ? colors.accent : '#fff'}
              accessibilityLabel="Turn real-time scanning on or off"
            />
          </View>
          <Text style={styles.statusCopy}>{current.message}</Text>
          {statusError ? (
            <Pressable
              onPress={() => void refreshStatus()}
              style={styles.retryStatusButton}
              accessibilityRole="button"
              accessibilityLabel="Retry Android monitoring status"
            >
              <Ionicons name="refresh-outline" size={17} color={colors.link} />
              <Text style={styles.retryStatusText}>Retry status</Text>
            </Pressable>
          ) : null}
          <View style={styles.messagesApp}>
            <Ionicons name="chatbubble-outline" size={19} color={colors.textSecondary} />
            <View style={styles.flex}>
              <Text style={styles.messagesTitle}>Current Messages app</Text>
              <Text style={styles.messagesValue}>
                {status?.defaultSmsAppName ?? 'Not detected'}
                {status?.defaultSmsPackage ? ` · ${status.defaultSmsPackage}` : ''}
              </Text>
            </View>
          </View>
          {status && !status.appNotificationsGranted ? (
            <Pressable
              onPress={() => void openAppNotificationSettings()}
              style={styles.permissionButton}
              accessibilityRole="button"
            >
              <Text style={styles.permissionText}>Turn on warning notifications</Text>
            </Pressable>
          ) : null}
          {status?.historyStorageAvailable === false ? (
            <Text style={styles.storageWarning}>
              Message history is unavailable right now. Full message content will not be saved until this is fixed.
            </Text>
          ) : null}
          {status?.batteryOptimizationExempt === false ? (
            <View style={styles.batteryWarning}>
              <Text style={styles.batteryWarningText}>
                Android’s battery manager can pause NotiCare in the background and delay or miss new messages. In App
                info, open Battery and choose Unrestricted to keep scanning reliable.
              </Text>
              <Pressable
                onPress={() => void requestIgnoreBatteryOptimizations().then(() => void refreshStatus())}
                style={styles.batteryWarningButton}
                accessibilityRole="button"
              >
                <Text style={styles.batteryWarningButtonText}>Open App info</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>SAFE LINK PROTECTION</Text>
        <View style={styles.card}>
          <Pressable
            onPress={defaultBrowserActive === false ? fixDefaultBrowser : undefined}
            style={styles.scanRow}
            accessibilityRole={defaultBrowserActive === false ? 'button' : undefined}
            accessibilityLabel={
              !isNativeLinkHandlerAvailable()
                ? 'Browser protection is not available in this preview.'
                : defaultBrowserActive
                  ? 'Protection on. NotiCare is your default browser.'
                  : 'Protection off. Tap to set NotiCare as your default browser.'
            }
          >
            <View style={styles.scanLabel}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: !isNativeLinkHandlerAvailable()
                      ? colors.textMuted
                      : defaultBrowserActive
                        ? colors.accent
                        : colors.warning,
                  },
                ]}
              />
              <View>
                <Text style={styles.cardTitle}>
                  {!isNativeLinkHandlerAvailable()
                    ? 'Protection unavailable'
                    : defaultBrowserActive === null
                      ? 'Checking…'
                      : defaultBrowserActive
                        ? 'Protection ON'
                        : 'Protection OFF'}
                </Text>
                <Text style={styles.cardSubtitle}>
                  {!isNativeLinkHandlerAvailable()
                    ? 'Install the Android app to manage this.'
                    : defaultBrowserActive === null
                      ? 'Checking…'
                      : defaultBrowserActive
                        ? 'NotiCare checks links before they open.'
                        : 'Tap to fix — set NotiCare as your default browser.'}
                </Text>
              </View>
            </View>
          </Pressable>
          <View style={styles.scanRow}>
            <View style={styles.scanLabel}>
              <Ionicons name="shield-checkmark-outline" size={19} color={colors.textSecondary} />
              <View>
                <Text style={styles.cardTitle}>Open safe links in</Text>
                <Text style={styles.cardSubtitle}>
                  {browsers.find((browser) => browser.isPreferred)?.label ?? 'No browser chosen yet'}
                </Text>
              </View>
            </View>
          </View>
          {browsersError ? (
            <Text style={styles.statusCopy}>{browsersError}</Text>
          ) : browsers.length === 0 ? (
            <Text style={styles.statusCopy}>
              No other browser is installed on this device. Install one (e.g. Chrome) to open safe links.
            </Text>
          ) : (
            browsers.map((browser) => (
              <Pressable
                key={browser.packageName}
                onPress={() => void choosePreferredBrowser(browser.packageName)}
                style={styles.browserRow}
                accessibilityRole="button"
                accessibilityLabel={`Use ${browser.label} for safe links`}
              >
                <Text style={styles.browserLabel}>{browser.label}</Text>
                {browser.isPreferred ? <Ionicons name="checkmark-circle" size={19} color={colors.accent} /> : null}
              </Pressable>
            ))
          )}
        </View>

        <Text style={styles.sectionLabel}>ALERT STYLE</Text>
        <View style={styles.appearanceCard}>
          <Text style={styles.appearanceTitle}>How should phishing warnings appear?</Text>
          <Text style={styles.appearanceSubtitle}>
            Choose the alert style that feels right for you.
            {subscriptionTier !== 'pro' ? ' Full-screen warnings require NotiCare Pro.' : ''}
          </Text>
          <WarningAppearanceSelector
            value={status?.fullScreenWarnings ? 'full-screen' : 'banner'}
            disabled={saving || !status}
            onChange={(mode) => void changeWarningStyle(mode === 'full-screen')}
          />
          {status?.fullScreenWarnings && status.overlayPermitted === false ? (
            <View style={styles.batteryWarning}>
              <Text style={styles.batteryWarningText}>
                Full-screen warnings can only cover other apps with the &quot;Display over other apps&quot; permission.
                Until it is allowed, warnings show as a banner while you are using your phone.
              </Text>
              <Pressable
                onPress={() => void requestOverlayPermission().then(() => void refreshStatus())}
                style={styles.batteryWarningButton}
                accessibilityRole="button"
              >
                <Text style={styles.batteryWarningButtonText}>Allow display over other apps</Text>
              </Pressable>
            </View>
          ) : null}
          {status?.fullScreenWarnings && status.fullScreenIntentPermitted === false ? (
            <View style={styles.batteryWarning}>
              <Text style={styles.batteryWarningText}>
                Android is currently blocking full-screen warnings for NotiCare, so dangerous messages will only show as
                a banner. Allow full-screen notifications to restore the immersive warning.
              </Text>
              <Pressable
                onPress={() => void requestFullScreenIntentPermission().then(() => void refreshStatus())}
                style={styles.batteryWarningButton}
                accessibilityRole="button"
              >
                <Text style={styles.batteryWarningButtonText}>Allow full-screen notifications</Text>
              </Pressable>
            </View>
          ) : null}
          {status?.dndBypassGranted === false ? (
            <View style={styles.batteryWarning}>
              <Text style={styles.batteryWarningText}>
                Dangerous-message alerts currently stay silent while your phone is in Do Not Disturb. Allow Do Not
                Disturb access so NotiCare can still sound and vibrate for phishing warnings.
              </Text>
              <Pressable
                onPress={() => void requestNotificationPolicyAccess().then(() => void refreshStatus())}
                style={styles.batteryWarningButton}
                accessibilityRole="button"
              >
                <Text style={styles.batteryWarningButtonText}>Allow Do Not Disturb access</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {translation.available ? (
          <>
            <Text style={styles.sectionLabel}>MESSAGE LANGUAGE</Text>
            <View style={styles.card}>
              <View style={styles.languageIntro}>
                <Text style={styles.appearanceTitle}>Messages and warnings in</Text>
                <Text style={styles.appearanceSubtitle}>
                  Applies to captured messages, scam warning pop-ups and notifications, and scan results. Messages are
                  translated on this phone; links stay exactly as received, and scanning always uses the original
                  message.
                </Text>
              </View>
              {MESSAGE_LANGUAGE_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => void setMessageLanguage(option.value)}
                  style={styles.browserRow}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: translation.language === option.value }}
                  accessibilityLabel={`${option.label}. ${option.description}`}
                >
                  <View style={styles.flex}>
                    <Text style={styles.browserLabel}>{option.label}</Text>
                    <Text style={styles.cardSubtitle}>{option.description}</Text>
                  </View>
                  <Ionicons
                    name={translation.language === option.value ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={translation.language === option.value ? colors.accent : colors.textMuted}
                  />
                </Pressable>
              ))}
              {translation.language !== 'default' ? (
                <View style={styles.languagePack}>
                  <Text style={styles.retentionNote}>{languagePackCopy(translation.pack)}</Text>
                  {translation.pack === 'wifi-required' || translation.pack === 'failed' ? (
                    <Pressable
                      onPress={() => void ensureLanguagePack()}
                      style={styles.retryStatusButton}
                      accessibilityRole="button"
                    >
                      <Ionicons name="cloud-download-outline" size={15} color={colors.link} />
                      <Text style={styles.retryStatusText}>Try again</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        <Text style={styles.sectionLabel}>APPEARANCE</Text>
        <View style={styles.appearanceCard}>
          <Text style={styles.appearanceTitle}>Theme</Text>
          <Text style={styles.appearanceSubtitle}>Choose Light, Dark, or match your device automatically.</Text>
          <ThemeModeSelector value={mode} onChange={setMode} colors={colors} />

          <Text style={[styles.appearanceTitle, styles.accentTitle]}>Accent color</Text>
          <Text style={styles.appearanceSubtitle}>
            Personalize buttons, links, and charts. Danger/warning/safe colors never change.
          </Text>
          <AccentSwatchPicker value={accent} onChange={setAccent} colors={colors} />
        </View>

        <Text style={styles.sectionLabel}>HELP & PRIVACY</Text>
        <View style={styles.card}>
          <SettingRow
            icon="book-outline"
            title="User Guide"
            subtitle="Learn how to use NotiCare safely"
            onPress={() => router.push('/guide')}
            colors={colors}
          />
          <View style={styles.divider} />
          <SettingRow
            icon="lock-closed-outline"
            title="Privacy information"
            subtitle="What stays on your device"
            onPress={() => router.push('/privacy')}
            colors={colors}
          />
          <View style={styles.divider} />
          <SettingRow
            icon="information-circle-outline"
            title="About NotiCare"
            subtitle="SMS protection for Android"
            onPress={() => router.push('/about')}
            colors={colors}
          />
        </View>

        <Text style={styles.sectionLabel}>LOCAL DATA</Text>
        {status?.historyRetentionLimit ? (
          <Text style={styles.retentionNote}>
            NotiCare keeps your most recent {status.historyRetentionLimit.toLocaleString()} messages in full detail on
            this device. Older messages are automatically removed to keep the app fast. Your all-time &ldquo;Total
            blocked&rdquo; count on the Dashboard is not affected.
          </Text>
        ) : null}
        <View style={styles.card}>
          <SettingRow
            icon="trash-outline"
            title="Clear message history"
            subtitle="Delete all captured messages"
            onPress={confirmClearHistory}
            destructive
            colors={colors}
          />
        </View>
        <View style={styles.card}>
          <SettingRow
            icon="log-out-outline"
            title="Sign out"
            subtitle="Turn off scanning for this profile"
            onPress={confirmSignOut}
            destructive
            colors={colors}
          />
        </View>
        {session && !isDevelopmentPhoneLogin && isSupabaseConfigured ? (
          <View style={styles.card}>
            <SettingRow
              icon="person-remove-outline"
              title={deleting ? 'Deleting account…' : 'Delete account'}
              subtitle="Permanently delete your account and its data"
              onPress={deleting ? () => undefined : confirmDeleteAccount}
              destructive
              colors={colors}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function useThemedStyles(colors: ThemeColors) {
  return useMemo(() => createStyles(colors), [colors]);
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    header: {
      minHeight: 64,
      backgroundColor: colors.headerBg,
      paddingHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerTitle: { color: '#fff', fontWeight: '800', fontSize: 18 },
    headerSpacer: { width: 25 },
    content: { padding: 16, paddingBottom: 36 },
    profile: {
      gap: 12,
      backgroundColor: colors.accentSoft,
      borderRadius: 14,
      padding: 16,
    },
    profileHeaderRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    profileIcon: {
      height: 48,
      width: 48,
      borderRadius: 24,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 16 },
    profilePhone: { color: colors.textSecondary, marginTop: 3 },
    phoneChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    phoneChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    phoneChipPrimary: { borderColor: colors.accent },
    phoneChipNumber: { color: colors.textPrimary, fontWeight: '700', fontSize: 12 },
    phoneChipMeta: { color: colors.textMuted, fontSize: 10, marginTop: 1 },
    addPhoneChip: {
      width: 38,
      height: 38,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.7,
      marginTop: 23,
      marginBottom: 8,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    scanRow: { padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    scanLabel: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    statusDot: { width: 11, height: 11, borderRadius: 6 },
    cardTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 15 },
    cardSubtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
    statusCopy: { color: colors.textSecondary, lineHeight: 19, paddingHorizontal: 16, paddingBottom: 14 },
    retryStatusButton: {
      alignSelf: 'flex-start',
      marginHorizontal: 16,
      marginBottom: 14,
      paddingHorizontal: 11,
      paddingVertical: 9,
      borderRadius: 8,
      backgroundColor: colors.surfaceAlt,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    retryStatusText: { color: colors.link, fontWeight: '800', fontSize: 12 },
    messagesApp: {
      marginHorizontal: 16,
      marginBottom: 16,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 9,
      padding: 12,
      flexDirection: 'row',
      gap: 9,
    },
    flex: { flex: 1 },
    languageIntro: { padding: 16, paddingBottom: 12 },
    languagePack: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
    messagesTitle: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' },
    messagesValue: { color: colors.textPrimary, fontSize: 12, marginTop: 3 },
    permissionButton: {
      marginHorizontal: 16,
      marginBottom: 16,
      alignItems: 'center',
      padding: 12,
      borderRadius: 8,
      backgroundColor: colors.surfaceAlt,
    },
    permissionText: { color: colors.link, fontWeight: '800', fontSize: 12 },
    browserRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 13,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    browserLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
    retentionNote: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      marginBottom: 8,
    },
    storageWarning: {
      color: colors.warning,
      backgroundColor: colors.warningSoft,
      margin: 16,
      marginTop: 0,
      borderRadius: 8,
      padding: 10,
      fontSize: 12,
      lineHeight: 17,
    },
    batteryWarning: {
      margin: 16,
      marginTop: 0,
      borderRadius: 8,
      padding: 10,
      backgroundColor: colors.warningSoft,
    },
    batteryWarningText: { color: colors.warning, fontSize: 12, lineHeight: 17 },
    batteryWarningButton: {
      alignSelf: 'flex-start',
      marginTop: 9,
      paddingHorizontal: 11,
      paddingVertical: 8,
      borderRadius: 7,
      backgroundColor: colors.surface,
    },
    batteryWarningButtonText: { color: colors.warning, fontWeight: '800', fontSize: 12 },
    settingRow: { minHeight: 68, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 11 },
    settingIcon: {
      height: 37,
      width: 37,
      borderRadius: 10,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    settingIconDanger: { backgroundColor: colors.dangerSoft },
    settingCopy: { flex: 1 },
    settingTitle: { color: colors.textPrimary, fontWeight: '700', fontSize: 14 },
    dangerText: { color: colors.danger },
    settingSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    divider: { height: 1, backgroundColor: colors.border, marginLeft: 64 },
    appearanceCard: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 5,
    },
    appearanceTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 17 },
    accentTitle: { marginTop: 20 },
    appearanceSubtitle: { color: colors.textSecondary, fontSize: 13, paddingBottom: 12 },
  });
}
