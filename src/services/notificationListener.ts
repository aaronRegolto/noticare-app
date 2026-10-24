import { NativeModules, Platform } from 'react-native';

import { finalizeThreatResult } from '@/src/features/detection';
import { categoriesForCodes, type MessageCategory } from '@/src/features/messages/categories';

export type MonitoringState = 'active' | 'off' | 'permission_required' | 'service_disconnected' | 'sms_app_unavailable';

export type ThreatLevel = 'safe' | 'suspicious' | 'dangerous';

export type SubscriptionTier = 'free' | 'pro';
export type MonitoredAppId = 'sms' | 'messenger';
export type MonitoredApp = {
  id: MonitoredAppId;
  name: string;
  installed: boolean;
  enabled: boolean;
};

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
  categories?: MessageCategory[];
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
  contactsPermissionGranted: boolean;
  senderContactLookupEnabled: boolean;
  lastContentStatus: 'idle' | 'processed' | 'content_unavailable';
  appNotificationsGranted: boolean;
  /** False means Android's battery manager can kill NotiCare in the background and miss messages. */
  batteryOptimizationExempt: boolean;
  /** False (Android 14+ only) means the full-screen danger warning falls back to a heads-up banner. */
  fullScreenIntentPermitted: boolean;
  /**
   * False means full-screen warnings can't cover other apps while the phone is in use, and fall
   * back to a heads-up banner there. Absent on older installed builds.
   */
  overlayPermitted?: boolean;
  /** False means Dangerous-message alerts stay silent while the phone is in Do Not Disturb. */
  dndBypassGranted: boolean;
  /**
   * The true all-time blocked count, independent of how many detail records are currently kept —
   * only the newest `historyRetentionLimit` records per account are retained on-device so storage
   * and read/write cost stay bounded no matter how long NotiCare has been protecting the device.
   */
  lifetimeBlockedCount: number;
  historyRetentionLimit: number;
  monitoredApps?: MonitoredApp[];
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
  /** Local-only address-book match; null when contact identification was not enabled. */
  senderIsKnownContact?: boolean | null;
  categories?: MessageCategory[];
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
  /**
   * Integer 0–10, safe for the Supabase `smallint` score-bucket field. Safe is always 0; older
   * builds may have queued 1–2 for a Safe event, which flushNativeTelemetry sends as 0.
   */
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
  /**
   * The detector's risk score (Safe is always 0, otherwise 30–100); null for reports queued before
   * it was stored. Older builds may have queued a Safe 1–29, which is sent as 0.
   */
  riskScore?: number | null;
  createdAt: number;
};

type NotificationListenerNativeModule = {
  requestNotificationListenerAccess(): Promise<boolean>;
  openAppNotificationSettings(): Promise<boolean>;
  requestIgnoreBatteryOptimizations?(): Promise<boolean>;
  requestFullScreenIntentPermission?(): Promise<boolean>;
  requestOverlayPermission?(): Promise<boolean>;
  requestNotificationPolicyAccess?(): Promise<boolean>;
  getMonitoringStatus(): Promise<MonitoringStatus>;
  setScanningEnabled(enabled: boolean): Promise<MonitoringStatus>;
  setMonitoredAppEnabled?(sourceId: MonitoredAppId, enabled: boolean): Promise<MonitoringStatus>;
  setSenderContactLookupEnabled?(enabled: boolean): Promise<MonitoringStatus>;
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
  /** Missing from builds installed before Manual Scan could read photos. */
  recognizeTextInImage?(uri: string): Promise<RecognizedImageText>;
  /** The four translation methods are missing from builds installed before message translation. */
  identifyMessageLanguage?(text: string): Promise<string>;
  getTranslationModelStatus?(): Promise<'ready' | 'missing'>;
  downloadTranslationModels?(): Promise<'ready'>;
  translateSegments?(segments: string[], source: 'en' | 'tl', target: 'en' | 'tl'): Promise<string[]>;
  setMessageLanguagePreference?(language: 'default' | 'tl' | 'en'): Promise<boolean>;
};

/** Text read on this device from a photo or screenshot: paragraphs, each as its wrapped lines. */
export type RecognizedImageText = { blocks: { lines: string[] }[] };

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
 * Opens Android's "Display over other apps" screen so full-screen warnings can cover whatever app
 * is in use. Older installed builds resolve to false instead of throwing.
 */
export async function requestOverlayPermission(): Promise<boolean> {
  const module = requireAndroidNativeModule();
  return (await module.requestOverlayPermission?.()) ?? false;
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

export function setMonitoredAppEnabled(sourceId: MonitoredAppId, enabled: boolean): Promise<MonitoringStatus> {
  const module = requireAndroidNativeModule();
  if (!module.setMonitoredAppEnabled) {
    return Promise.reject(new Error('Per-app notification scanning requires a newer Android build.'));
  }
  return module.setMonitoredAppEnabled(sourceId, enabled);
}

export function setSenderContactLookupEnabled(enabled: boolean): Promise<MonitoringStatus> {
  const module = requireAndroidNativeModule();
  if (!module.setSenderContactLookupEnabled) {
    return Promise.reject(new Error('Sender identification requires a newer Android build.'));
  }
  return module.setSenderContactLookupEnabled(enabled);
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

/**
 * Runs the same offline Kotlin evaluator used by background monitoring. Finalizing here too means
 * a Safe result always scores 0, even from a native build that still returns the raw 1–29.
 */
export function scanTextLocally(text: string): Promise<LocalThreatResult> {
  return requireAndroidNativeModule()
    .scanText(text)
    .then((result) => ({
      ...finalizeThreatResult(result),
      categories: result.categories ?? categoriesForCodes(result.reasons.map((reason) => reason.code)),
    }));
}

/** True in a native build that can read text from a photo for Manual Scan. */
export function isTextRecognitionAvailable(): boolean {
  return Platform.OS === 'android' && typeof nativeModule?.recognizeTextInImage === 'function';
}

/** Reads the text in a local image with the on-device recognizer. The image is not uploaded. */
export function recognizeTextInImage(uri: string): Promise<RecognizedImageText> {
  const native = requireAndroidNativeModule();
  if (!native.recognizeTextInImage) {
    return Promise.reject(new Error('This NotiCare build cannot read text from photos. Install the latest build.'));
  }
  return native.recognizeTextInImage(uri);
}

/**
 * Tells the native warning screen and notifications which language to use. A no-op outside an
 * Android build, or in one installed before warnings were translated.
 */
export async function setNativeMessageLanguage(language: 'default' | 'tl' | 'en'): Promise<void> {
  if (Platform.OS !== 'android' || !nativeModule?.setMessageLanguagePreference) return;
  await nativeModule.setMessageLanguagePreference(language);
}

/** True in a native build that can translate captured messages on this device. */
export function isMessageTranslationAvailable(): boolean {
  return Platform.OS === 'android' && typeof nativeModule?.translateSegments === 'function';
}

function requireTranslation() {
  const native = requireAndroidNativeModule();
  if (
    !native.identifyMessageLanguage ||
    !native.getTranslationModelStatus ||
    !native.downloadTranslationModels ||
    !native.translateSegments
  ) {
    throw new Error('This NotiCare build cannot translate messages. Install the latest build.');
  }
  return native as Required<
    Pick<
      NotificationListenerNativeModule,
      'identifyMessageLanguage' | 'getTranslationModelStatus' | 'downloadTranslationModels' | 'translateSegments'
    >
  >;
}

/** ML Kit's language code for a message ("en", "fil", ...), or "und" when it can't tell. */
export function identifyMessageLanguage(text: string): Promise<string> {
  return Promise.resolve().then(() => requireTranslation().identifyMessageLanguage(text));
}

/** Whether the English and Tagalog language pack is on this device. */
export function getTranslationModelStatus(): Promise<'ready' | 'missing'> {
  return Promise.resolve().then(() => requireTranslation().getTranslationModelStatus());
}

/** Downloads the language pack over Wi-Fi only; rejects with code "wifi_required" otherwise. */
export function downloadTranslationModels(): Promise<'ready'> {
  return Promise.resolve().then(() => requireTranslation().downloadTranslationModels());
}

/** Translates message segments on this device; rejects with code "model_missing" before download. */
export function translateSegments(segments: string[], source: 'en' | 'tl', target: 'en' | 'tl'): Promise<string[]> {
  return Promise.resolve().then(() => requireTranslation().translateSegments(segments, source, target));
}

/** Older builds stored Safe records with their raw 1–29 score; they read as 0 like every Safe result. */
function finalizeHistorySummary(record: HistorySummary): HistorySummary {
  return record.level === 'safe' ? { ...record, score: 0 } : record;
}

/** Lists captured SMS notifications for the active local profile, newest first. */
export function getHistory(): Promise<HistorySummary[]> {
  return requireAndroidNativeModule()
    .getHistory()
    .then((records) => records.map(finalizeHistorySummary));
}

/** Decrypts a full History record only after the user explicitly opens it. Safe records read as 0. */
export function getHistoryRecord(id: string): Promise<HistoryRecord | null> {
  return requireAndroidNativeModule()
    .getHistoryRecord(id)
    .then((record) => record && finalizeThreatResult(record));
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
