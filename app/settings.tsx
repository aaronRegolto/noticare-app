import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppUpdate } from '@/src/providers/AppUpdateProvider';
import { useAuth } from '@/src/providers/AuthProvider';
import { useOnboarding } from '@/src/providers/OnboardingProvider';
import { useSubscription } from '@/src/providers/SubscriptionProvider';
import { WarningAppearanceSelector } from '@/src/components/warning-appearance-selector';
import { OptionSheet, SettingsAlert, SettingsItem, SettingsSection, SheetOption } from '@/src/components/settings-ui';
import { AccentSwatchPicker, ThemeModeSelector } from '@/src/components/theme-selector';
import { formatVersion } from '@/src/features/app-update/release';
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
  openDefaultAppsSettings,
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
import { ACCENTS, type ThemeColors, type ThemeMode } from '@/src/theme/palette';

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

const THEME_MODE_LABELS: Record<ThemeMode, string> = { light: 'Light', dark: 'Dark', system: 'System' };

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

export default function SettingsScreen() {
  const router = useRouter();
  const { session, signOut, isDevelopmentPhoneLogin } = useAuth();
  const { tier: subscriptionTier } = useSubscription();
  const appUpdate = useAppUpdate();
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
  const [sheet, setSheet] = useState<'browser' | 'alerts' | 'language' | 'appearance' | null>(null);

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

  const openDefaultApps = useCallback(() => {
    void openDefaultAppsSettings().catch(() =>
      Alert.alert('Settings unavailable', 'Android default browser settings could not be opened.'),
    );
  }, []);

  /** Shows Android's own "Set NotiCare as your default browser app?" dialog. */
  const enableLinkProtection = useCallback(async () => {
    try {
      const result = await requestDefaultBrowser();
      if (result === 'granted') {
        setDefaultBrowserActive(true);
        Alert.alert(
          'Safe Link Protection is on',
          'Links you tap in any app are now checked first. Risky links show a warning; safe links open in your usual browser.',
        );
      } else if (result === 'declined') {
        Alert.alert(
          "NotiCare isn't your default browser yet",
          'Android may not ask again after you decline. Open Default apps, tap Browser app, and choose NotiCare.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Default apps', onPress: openDefaultApps },
          ],
        );
      }
      // 'settings': Android's Default apps screen opened; the status refreshes when the user returns.
    } catch {
      Alert.alert('Settings unavailable', 'Android default browser settings could not be opened.');
    }
  }, [openDefaultApps]);

  const manageLinkProtection = useCallback(() => {
    if (defaultBrowserActive === false) {
      void enableLinkProtection();
      return;
    }
    Alert.alert(
      'Safe Link Protection is on',
      'NotiCare is your default browser, so it checks links before they open. To turn this off, choose a different browser in Default apps.',
      [
        { text: 'OK', style: 'cancel' },
        { text: 'Open Default apps', onPress: openDefaultApps },
      ],
    );
  }, [defaultBrowserActive, enableLinkProtection, openDefaultApps]);

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

  const checkForUpdates = async () => {
    if (appUpdate.update) return appUpdate.showPrompt();
    if (appUpdate.installed.code === null) {
      Alert.alert('Update check unavailable', "This build can't read its version number.");
      return;
    }
    const result = await appUpdate.checkNow();
    if (result === 'available') appUpdate.showPrompt();
    else if (result === 'failed') Alert.alert("Couldn't check for updates", 'Check your connection and try again.');
    else Alert.alert("You're up to date", `NotiCare ${formatVersion(appUpdate.installed)} is the latest version.`);
  };

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

  const linkProtection = !isNativeLinkHandlerAvailable()
    ? { value: 'Unavailable', tone: 'muted' as const, subtitle: 'Install the Android app to use this.' }
    : defaultBrowserActive === null
      ? { value: 'Checking…', tone: 'muted' as const, subtitle: 'Checks links before they open' }
      : defaultBrowserActive
        ? { value: 'On', tone: 'positive' as const, subtitle: 'Checks links before they open' }
        : { value: 'Off', tone: 'warning' as const, subtitle: "Links aren't checked yet" };
  const primaryCarrier = session?.user.phone ? detectPhilippineCarrier(session.user.phone) : null;
  const preferredBrowser = browsers.find((browser) => browser.isPreferred)?.label;
  const languageLabel = MESSAGE_LANGUAGE_OPTIONS.find((option) => option.value === translation.language)?.label;
  const appearanceLabel = `${THEME_MODE_LABELS[mode]} · ${ACCENTS.find((item) => item.id === accent)?.label ?? ''}`;

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
        <View style={styles.account}>
          <View style={styles.accountRow}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={22} color={colors.accent} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.accountTitle}>Your account</Text>
              <Text style={styles.accountPhone}>
                {maskPhone(session?.user.phone)}
                {primaryCarrier ? ` · ${primaryCarrier}` : ''}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push('/paywall')}
              style={[styles.planBadge, subscriptionTier === 'pro' && styles.planBadgePro]}
              accessibilityRole="button"
              accessibilityLabel={`${subscriptionTier === 'pro' ? 'Pro' : 'Free'} plan. View plans`}
            >
              <Ionicons
                name={subscriptionTier === 'pro' ? 'star' : 'star-outline'}
                size={13}
                color={subscriptionTier === 'pro' ? colors.accentContrast : colors.accent}
              />
              <Text style={[styles.planBadgeText, subscriptionTier === 'pro' && styles.planBadgeTextPro]}>
                {subscriptionTier === 'pro' ? 'Pro' : 'Free'}
              </Text>
            </Pressable>
          </View>
          {linkedPhones.length || !isDevelopmentPhoneLogin ? (
            <View style={styles.phoneChipsRow}>
              {linkedPhones.map((phone) => (
                <PhoneChip key={phone} phone={phone} colors={colors} onRemove={() => confirmUnlinkPhone(phone)} />
              ))}
              {!isDevelopmentPhoneLogin ? (
                <Pressable
                  onPress={() => router.push('/link-phone')}
                  style={styles.addPhone}
                  accessibilityRole="button"
                  accessibilityLabel="Add another phone number"
                >
                  <Ionicons name="add" size={16} color={colors.accent} />
                  <Text style={styles.addPhoneText}>Add number</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        <SettingsSection title="Protection" colors={colors}>
          <SettingsItem
            icon="shield-checkmark-outline"
            title="Real-Time Scanning"
            subtitle={current.message}
            accessory={
              <Switch
                value={Boolean(status?.scanningEnabled)}
                disabled={saving || !status}
                onValueChange={(value) => void changeScanning(value)}
                trackColor={{ false: '#AFBBCB', true: colors.accent }}
                thumbColor={status?.scanningEnabled ? colors.accent : '#fff'}
                accessibilityLabel="Turn real-time scanning on or off"
              />
            }
            colors={colors}
          />
          {statusError ? (
            <SettingsAlert
              message={statusError}
              actionLabel="Retry"
              onAction={() => void refreshStatus()}
              tone="danger"
              colors={colors}
            />
          ) : null}
          {status && !status.appNotificationsGranted ? (
            <SettingsAlert
              message="Warning notifications are turned off, so NotiCare can't alert you."
              actionLabel="Turn on notifications"
              onAction={() => void openAppNotificationSettings()}
              colors={colors}
            />
          ) : null}
          {status?.historyStorageAvailable === false ? (
            <SettingsAlert
              message="Message history is unavailable right now. Full message content won't be saved until this is fixed."
              tone="danger"
              colors={colors}
            />
          ) : null}
          {status?.batteryOptimizationExempt === false ? (
            <SettingsAlert
              message="Android's battery saver can pause NotiCare and delay or miss new messages. Set Battery to Unrestricted."
              actionLabel="Open App info"
              onAction={() => void requestIgnoreBatteryOptimizations().then(() => void refreshStatus())}
              colors={colors}
            />
          ) : null}
          <SettingsItem
            icon="link-outline"
            title="Safe Link Protection"
            subtitle={linkProtection.subtitle}
            value={linkProtection.value}
            valueTone={linkProtection.tone}
            onPress={defaultBrowserActive === null ? undefined : manageLinkProtection}
            colors={colors}
          />
          {defaultBrowserActive === false ? (
            <SettingsAlert
              message="Make NotiCare your default browser so a risky link shows a warning the moment you tap it, in Messages, email, and other apps that open links in your browser. Safe links still open in your usual browser."
              actionLabel="Set as default browser"
              onAction={() => void enableLinkProtection()}
              colors={colors}
            />
          ) : null}
          {isNativeLinkHandlerAvailable() ? (
            <SettingsItem
              icon="globe-outline"
              title="Open safe links in"
              value={preferredBrowser ?? 'Choose'}
              valueTone={preferredBrowser ? 'muted' : 'warning'}
              onPress={() => setSheet('browser')}
              colors={colors}
            />
          ) : null}
          <SettingsItem
            icon="notifications-outline"
            title="Warning style"
            value={status?.fullScreenWarnings ? 'Full-screen' : 'Banner'}
            onPress={() => setSheet('alerts')}
            disabled={!status}
            colors={colors}
          />
          {status?.fullScreenWarnings && status.overlayPermitted === false ? (
            <SettingsAlert
              message="Full-screen warnings need “Display over other apps”. Until it's allowed, warnings show as a banner while you use your phone."
              actionLabel="Allow"
              onAction={() => void requestOverlayPermission().then(() => void refreshStatus())}
              colors={colors}
            />
          ) : null}
          {status?.fullScreenWarnings && status.fullScreenIntentPermitted === false ? (
            <SettingsAlert
              message="Android is blocking full-screen warnings, so dangerous messages only show as a banner."
              actionLabel="Allow full-screen notifications"
              onAction={() => void requestFullScreenIntentPermission().then(() => void refreshStatus())}
              colors={colors}
            />
          ) : null}
          {status?.dndBypassGranted === false ? (
            <SettingsAlert
              message="Danger alerts stay silent in Do Not Disturb. Allow access so NotiCare can still sound and vibrate."
              actionLabel="Allow Do Not Disturb access"
              onAction={() => void requestNotificationPolicyAccess().then(() => void refreshStatus())}
              colors={colors}
            />
          ) : null}
        </SettingsSection>

        <SettingsSection title="Preferences" colors={colors}>
          {translation.available ? (
            <SettingsItem
              icon="language-outline"
              title="Message language"
              subtitle={
                translation.language !== 'default' && translation.pack !== 'ready'
                  ? languagePackCopy(translation.pack)
                  : undefined
              }
              value={languageLabel}
              onPress={() => setSheet('language')}
              colors={colors}
            />
          ) : null}
          <SettingsItem
            icon="color-palette-outline"
            title="Appearance"
            value={appearanceLabel}
            onPress={() => setSheet('appearance')}
            colors={colors}
          />
        </SettingsSection>

        <SettingsSection title="Help & privacy" colors={colors}>
          <SettingsItem icon="book-outline" title="User Guide" onPress={() => router.push('/guide')} colors={colors} />
          <SettingsItem
            icon="lock-closed-outline"
            title="Privacy information"
            onPress={() => router.push('/privacy')}
            colors={colors}
          />
          <SettingsItem
            icon="information-circle-outline"
            title="About NotiCare"
            onPress={() => router.push('/about')}
            colors={colors}
          />
          <SettingsItem
            icon={appUpdate.update ? 'cloud-download-outline' : 'refresh-outline'}
            title={appUpdate.update ? 'Update available' : 'App version'}
            subtitle={
              appUpdate.update
                ? `NotiCare ${appUpdate.update.versionName}: ${appUpdate.update.title}`
                : appUpdate.checking
                  ? 'Checking for updates…'
                  : 'Tap to check for updates'
            }
            value={formatVersion(appUpdate.installed)}
            valueTone={appUpdate.update ? 'positive' : 'muted'}
            onPress={checkForUpdates}
            disabled={appUpdate.checking}
            colors={colors}
          />
        </SettingsSection>

        <SettingsSection
          title="Data & account"
          footnote={
            status?.historyRetentionLimit
              ? `NotiCare keeps your most recent ${status.historyRetentionLimit.toLocaleString()} messages on this device; older ones are removed automatically. The Dashboard's total blocked count isn't affected.`
              : undefined
          }
          colors={colors}
        >
          <SettingsItem
            icon="trash-outline"
            title="Clear message history"
            onPress={confirmClearHistory}
            destructive
            colors={colors}
          />
          <SettingsItem
            icon="log-out-outline"
            title="Sign out"
            subtitle="Turns off scanning for this profile"
            onPress={confirmSignOut}
            destructive
            colors={colors}
          />
          {session && !isDevelopmentPhoneLogin && isSupabaseConfigured ? (
            <SettingsItem
              icon="person-remove-outline"
              title={deleting ? 'Deleting account…' : 'Delete account'}
              subtitle="Permanently delete your account and its data"
              onPress={confirmDeleteAccount}
              disabled={deleting}
              destructive
              colors={colors}
            />
          ) : null}
        </SettingsSection>
      </ScrollView>

      <OptionSheet
        visible={sheet === 'browser'}
        title="Open safe links in"
        description="After NotiCare checks a link and finds it safe, it opens in this browser."
        onClose={() => setSheet(null)}
        colors={colors}
      >
        {browsersError ? (
          <Text style={styles.sheetNote}>{browsersError}</Text>
        ) : browsers.length === 0 ? (
          <Text style={styles.sheetNote}>
            No other browser is installed on this device. Install one, such as Chrome, to open safe links.
          </Text>
        ) : (
          browsers.map((browser) => (
            <SheetOption
              key={browser.packageName}
              label={browser.label}
              selected={browser.isPreferred}
              onPress={() => void choosePreferredBrowser(browser.packageName)}
              colors={colors}
            />
          ))
        )}
      </OptionSheet>

      <OptionSheet
        visible={sheet === 'alerts'}
        title="Warning style"
        description={`How phishing warnings appear.${subscriptionTier !== 'pro' ? ' Full-screen warnings require NotiCare Pro.' : ''}`}
        onClose={() => setSheet(null)}
        colors={colors}
      >
        <WarningAppearanceSelector
          value={status?.fullScreenWarnings ? 'full-screen' : 'banner'}
          disabled={saving || !status}
          onChange={(nextMode) => void changeWarningStyle(nextMode === 'full-screen')}
        />
      </OptionSheet>

      <OptionSheet
        visible={sheet === 'language'}
        title="Message language"
        description="Applies to captured messages, warnings, and scan results. Messages are translated on this phone; links stay as received, and scanning always uses the original."
        onClose={() => setSheet(null)}
        colors={colors}
      >
        {MESSAGE_LANGUAGE_OPTIONS.map((option) => (
          <SheetOption
            key={option.value}
            label={option.label}
            description={option.description}
            selected={translation.language === option.value}
            onPress={() => void setMessageLanguage(option.value)}
            colors={colors}
          />
        ))}
        {translation.language !== 'default' ? (
          <View style={styles.sheetStatus}>
            <Text style={styles.sheetNote}>{languagePackCopy(translation.pack)}</Text>
            {translation.pack === 'wifi-required' || translation.pack === 'failed' ? (
              <Pressable
                onPress={() => void ensureLanguagePack()}
                style={styles.retryButton}
                accessibilityRole="button"
              >
                <Ionicons name="cloud-download-outline" size={15} color={colors.link} />
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </OptionSheet>

      <OptionSheet visible={sheet === 'appearance'} title="Appearance" onClose={() => setSheet(null)} colors={colors}>
        <Text style={styles.sheetLabel}>Theme</Text>
        <ThemeModeSelector value={mode} onChange={setMode} colors={colors} />
        <Text style={[styles.sheetLabel, styles.sheetLabelSpaced]}>Accent color</Text>
        <Text style={styles.sheetNote}>Danger, warning, and safe colors never change.</Text>
        <AccentSwatchPicker value={accent} onChange={setAccent} colors={colors} />
      </OptionSheet>
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
    flex: { flex: 1 },
    account: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 12,
    },
    accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    accountTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
    accountPhone: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
    planBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    planBadgePro: { backgroundColor: colors.accent },
    planBadgeText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
    planBadgeTextPro: { color: colors.accentContrast },
    phoneChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginLeft: 56 },
    phoneChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    phoneChipPrimary: { borderWidth: 1, borderColor: colors.accent },
    phoneChipNumber: { color: colors.textPrimary, fontWeight: '700', fontSize: 12 },
    phoneChipMeta: { color: colors.textMuted, fontSize: 10, marginTop: 1 },
    addPhone: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.accent,
    },
    addPhoneText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
    sheetLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: '800' },
    sheetLabelSpaced: { marginTop: 14 },
    sheetNote: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
    sheetStatus: { marginTop: 6, gap: 8 },
    retryButton: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.surfaceAlt,
    },
    retryText: { color: colors.link, fontWeight: '800', fontSize: 12 },
  });
}
