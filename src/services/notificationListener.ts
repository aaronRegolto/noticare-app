import { NativeModules, Platform } from 'react-native';

export type MonitoringState = 'active' | 'off' | 'permission_required' | 'service_disconnected' | 'sms_app_unavailable';

export type ThreatLevel = 'safe' | 'suspicious' | 'dangerous';

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
};

export type HistorySummary = {
  id: string;
  maskedSender: string;
  receivedAt: number;
  level: 'dangerous';
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

type NotificationListenerNativeModule = {
  requestNotificationListenerAccess(): Promise<boolean>;
  openAppNotificationSettings(): Promise<boolean>;
  getMonitoringStatus(): Promise<MonitoringStatus>;
  setScanningEnabled(enabled: boolean): Promise<MonitoringStatus>;
  setFullScreenWarnings(enabled: boolean): Promise<MonitoringStatus>;
  setHistoryOwner(ownerId: string | null): Promise<MonitoringStatus>;
  scanText(text: string): Promise<LocalThreatResult>;
  getHistory(): Promise<HistorySummary[]>;
  getHistoryRecord(id: string): Promise<HistoryRecord | null>;
  deleteHistoryRecord(id: string): Promise<boolean>;
  clearHistory(): Promise<boolean>;
  getPendingTelemetry(): Promise<PendingTelemetryEvent[]>;
  ackTelemetry(ids: string[]): Promise<number>;
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

/** Runs the same offline Kotlin evaluator used by background monitoring. */
export function scanTextLocally(text: string): Promise<LocalThreatResult> {
  return requireAndroidNativeModule().scanText(text);
}

/** Lists only dangerous real-time notifications that Android accepted for suppression. */
export function getHistory(): Promise<HistorySummary[]> {
  return requireAndroidNativeModule().getHistory();
}

/** Decrypts a full History record only after the user explicitly opens it. */
export function getHistoryRecord(id: string): Promise<HistoryRecord | null> {
  return requireAndroidNativeModule().getHistoryRecord(id);
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
