import { NativeModules, Platform } from 'react-native';

export type MonitoringState = 'active' | 'off' | 'permission_required' | 'service_disconnected' | 'sms_app_unavailable';

export type ThreatLevel = 'safe' | 'suspicious' | 'dangerous';

export type SubscriptionTier = 'free' | 'pro';

export type ThreatReason = {
  code: string;
  label: string;
  description: string;
  weight: number;
};

export type ExtractedUrl = {
  /** Display-only text. The app must never automatically open this value. */
  display: string;
  normalizedDomain: string | null;
  indicators: string[];
};

export type LocalThreatResult = {
  level: ThreatLevel;
  score: number;
  reasons: ThreatReason[];
  urls: ExtractedUrl[];
  ruleVersion: string;
};

export type MonitoringStatus = {
  status: MonitoringState;
  /** Mirrored from PayMongo via setSubscriptionTier; drives the free-tier automatic-scan quota and History retention cap natively. */
  subscriptionTier: SubscriptionTier;
  scanningEnabled: boolean;
  fullScreenWarnings: boolean;
  notificationAccessGranted: boolean;
  serviceConnected: boolean;
  defaultSmsPackage: string | null;
  defaultSmsAppName: string | null;
  /** Whether an authenticated profile currently owns encrypted local History. */
  historyOwnerConfigured: boolean;
  historyStorageAvailable: boolean;
  historyStorageStatus: 'available' | 'unavailable';
  lastContentStatus: 'idle' | 'processed' | 'content_unavailable';
  appNotificationsGranted: boolean;
  /** False means Android's battery manager can kill NotiCare in the background and miss messages. */
  batteryOptimizationExempt: boolean;
  /** False (Android 14+ only) means the full-screen danger warning falls back to a heads-up banner. */
  fullScreenIntentPermitted: boolean;
  /** False means Dangerous-message alerts stay silent while the phone is in Do Not Disturb. */
  dndBypassGranted: boolean;
  /**
   * The true all-time blocked count, independent of how many detail records are currently kept —
   * only the newest `historyRetentionLimit` records per account are retained on-device so storage
   * and read/write cost stay bounded no matter how long NotiCare has been protecting the device.
   */
  lifetimeBlockedCount: number;
  historyRetentionLimit: number;
};

export type HistorySummary = {
  id: string;
  maskedSender: string;
  receivedAt: number;
  level: ThreatLevel;
  /** Available after rebuilding with the Messages inbox native module. */
  sender?: string;
  preview?: string;
  blocked?: boolean;
  isRead?: boolean;
  score: number;
  /** Fixed non-content label; never an SMS-derived excerpt. */
  redactedPreview: string;
  warningSignCount: number;
  sourcePackage: string;
  ruleVersion: string;
};

export type HistoryRecord = HistorySummary & {
  message: string;
  reasons: ThreatReason[];
  urls: ExtractedUrl[];
  originalSmsNotice: string;
};

export type PendingTelemetryEvent = {
  id: string;
  source: 'realtime';
  level: ThreatLevel;
  /** Integer 0–10, safe for the Supabase `smallint` score-bucket field. */
  scoreBucket: number;
  blocked: boolean;
  indicatorCodes: string[];
  urlCount: number;
  ruleVersion: string;
  occurredAt: number;
};

/**
 * A "Block & Report" tap queued by the real-time listener. Unlike
 * PendingTelemetryEvent, this intentionally carries the message text and
 * sender — see EncryptedCommunityReportQueue for why that's safe here.
 */
export type PendingCommunityReport = {
  id: string;
  messageText: string;
  sampleSender: string | null;
  indicatorCodes: string[];
  ruleVersion: string;
  createdAt: number;
};

type NotificationListenerNativeModule = {
  requestNotificationListenerAccess(): Promise<boolean>;
  openAppNotificationSettings(): Promise<boolean>;
  requestIgnoreBatteryOptimizations?(): Promise<boolean>;
  requestFullScreenIntentPermission?(): Promise<boolean>;
  requestNotificationPolicyAccess?(): Promise<boolean>;
  getMonitoringStatus(): Promise<MonitoringStatus>;
  setScanningEnabled(enabled: boolean): Promise<MonitoringStatus>;
  setFullScreenWarnings(enabled: boolean): Promise<MonitoringStatus>;
  setHistoryOwner(ownerId: string | null): Promise<MonitoringStatus>;
  setSubscriptionTier(tier: SubscriptionTier): Promise<MonitoringStatus>;
  scanText(text: string): Promise<LocalThreatResult>;
  getHistory(): Promise<HistorySummary[]>;
  getHistoryRecord(id: string): Promise<HistoryRecord | null>;
  markHistoryRead?(id: string): Promise<boolean>;
  deleteHistoryRecord(id: string): Promise<boolean>;
  clearHistory(): Promise<boolean>;
  getPendingTelemetry(): Promise<PendingTelemetryEvent[]>;
  ackTelemetry(ids: string[]): Promise<number>;
  getPendingCommunityReports?(): Promise<PendingCommunityReport[]>;
  ackCommunityReports?(ids: string[]): Promise<number>;
  notifyCommunityReportResult?(isNew: boolean, reportCount: number): Promise<boolean>;
};

const nativeModule = NativeModules.NotificationListenerModule as NotificationListenerNativeModule | undefined;

function requireAndroidNativeModule(): NotificationListenerNativeModule {
  if (Platform.OS !== 'android') {
    throw new Error('NotiCare real-time monitoring is available on Android only.');
  }
  if (!nativeModule) {
    throw new Error(
      'NotiCare native monitoring is unavailable. Install an Android development or release build; Expo Go cannot run the notification listener.',
    );
  }
  return nativeModule;
}

/** True only in an Android development/release build containing the Kotlin module. */
export function isNativeMonitoringAvailable(): boolean {
  return Platform.OS === 'android' && Boolean(nativeModule);
}

/** Opens Android's Notification Access screen. Call only after user confirmation. */
export function requestNotificationListenerAccess(): Promise<boolean> {
  return requireAndroidNativeModule().requestNotificationListenerAccess();
}

/** Opens the system screen where the user can allow NotiCare warning notifications. */
export function openAppNotificationSettings(): Promise<boolean> {
  return requireAndroidNativeModule().openAppNotificationSettings();
}

/**
 * Prompts Android's "ignore battery optimizations" dialog for NotiCare. Older installed builds
 * may not have this native method yet, so it resolves to false instead of throwing.
 */
export async function requestIgnoreBatteryOptimizations(): Promise<boolean> {
  const module = requireAndroidNativeModule();
  return (await module.requestIgnoreBatteryOptimizations?.()) ?? false;
}

/**
 * Opens the Android 14+ screen where the user can re-allow full-screen danger warnings. Older
 * installed builds, or Android versions below 14, resolve to false instead of throwing.
 */
export async function requestFullScreenIntentPermission(): Promise<boolean> {
  const module = requireAndroidNativeModule();
  return (await module.requestFullScreenIntentPermission?.()) ?? false;
}

/**
 * Opens the system screen where the user can let NotiCare's danger alerts sound/vibrate even
 * while the phone is in Do Not Disturb. Older installed builds resolve to false instead of throwing.
 */
export async function requestNotificationPolicyAccess(): Promise<boolean> {
  const module = requireAndroidNativeModule();
  return (await module.requestNotificationPolicyAccess?.()) ?? false;
}

/** Reads the persisted DataStore preference plus live permission/service state. */
export function getMonitoringStatus(): Promise<MonitoringStatus> {
  return requireAndroidNativeModule().getMonitoringStatus();
}

/**
 * Persists the requested real-time-scan state. An enabled preference is not
 * reported as Active until Notification Access, service connection, and a
 * default SMS app are all available.
 */
export function setScanningEnabled(enabled: boolean): Promise<MonitoringStatus> {
  return requireAndroidNativeModule().setScanningEnabled(enabled);
}

/** Chooses an immersive warning when possible; Android may still use a banner as a platform fallback. */
export function setFullScreenWarnings(enabled: boolean): Promise<MonitoringStatus> {
  return requireAndroidNativeModule().setFullScreenWarnings(enabled);
}

/**
 * Scopes encrypted History to the active signed-in profile. The native layer
 * hashes this identifier before persistence; passing null clears the scope and
 * turns monitoring off on a signed-out shared device.
 */
export function setHistoryOwner(ownerId: string | null): Promise<MonitoringStatus> {
  return requireAndroidNativeModule().setHistoryOwner(ownerId);
}

/** Mirrors the PayMongo-derived tier into native so the free-tier scan quota is enforced offline. */
export function setSubscriptionTier(tier: SubscriptionTier): Promise<MonitoringStatus> {
  return requireAndroidNativeModule().setSubscriptionTier(tier);
}

/** Runs the same offline Kotlin evaluator used by background monitoring. */
export function scanTextLocally(text: string): Promise<LocalThreatResult> {
  return requireAndroidNativeModule().scanText(text);
}

/** Lists captured SMS notifications for the active local profile, newest first. */
export function getHistory(): Promise<HistorySummary[]> {
  return requireAndroidNativeModule().getHistory();
}

/** Decrypts a full History record only after the user explicitly opens it. */
export function getHistoryRecord(id: string): Promise<HistoryRecord | null> {
  return requireAndroidNativeModule().getHistoryRecord(id);
}

/** Older installed native builds can still display their existing blocked history. */
export function supportsMessageInbox(): boolean {
  return isNativeMonitoringAvailable() && typeof nativeModule?.markHistoryRead === 'function';
}

export async function markHistoryRead(id: string): Promise<boolean> {
  return requireAndroidNativeModule().markHistoryRead?.(id) ?? false;
}

export function deleteHistoryRecord(id: string): Promise<boolean> {
  return requireAndroidNativeModule().deleteHistoryRecord(id);
}

export function clearHistory(): Promise<boolean> {
  return requireAndroidNativeModule().clearHistory();
}

/**
 * Returns only sanitized, locally queued metadata. It never contains an SMS
 * body, sender, notification title, raw URL, access token, or encryption key.
 */
export function getPendingTelemetry(): Promise<PendingTelemetryEvent[]> {
  return requireAndroidNativeModule().getPendingTelemetry();
}

/** Removes acknowledged telemetry event IDs after authenticated upload succeeds. */
export function ackTelemetry(ids: string[]): Promise<number> {
  return requireAndroidNativeModule().ackTelemetry(ids);
}

/** Reads "Block & Report" taps queued while the app was closed or offline. */
export async function getPendingCommunityReports(): Promise<PendingCommunityReport[]> {
  const module = requireAndroidNativeModule();
  return (await module.getPendingCommunityReports?.()) ?? [];
}

/** Removes acknowledged community-report IDs after the upload succeeds. */
export async function ackCommunityReports(ids: string[]): Promise<number> {
  const module = requireAndroidNativeModule();
  return (await module.ackCommunityReports?.(ids)) ?? 0;
}

/** Shows the async "your reported message was new" / report-count follow-up notification. */
export async function notifyCommunityReportResult(isNew: boolean, reportCount: number): Promise<boolean> {
  const module = requireAndroidNativeModule();
  return (await module.notifyCommunityReportResult?.(isNew, reportCount)) ?? false;
}
