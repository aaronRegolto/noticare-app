import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import { finalizeRiskScore, finalizeThreatResult, type ThreatResult } from '@/src/features/detection';
import { activeUserId, registerDevice } from '@/src/services/eventSync';
import { logDiagnostic, logError } from '@/src/services/logger';
import {
  ackCommunityReports,
  getPendingCommunityReports,
  isNativeMonitoringAvailable,
  notifyCommunityReportResult,
  type PendingCommunityReport,
} from '@/src/services/notificationListener';
import { isSupabaseConfigured, supabase } from '@/src/services/supabase';

const REPORT_QUEUE_KEY = 'noticare.phishing-report-queue.v1';
const FEEDBACK_RECORD_KEY = 'noticare.manual-feedback-record.v1';
const MAX_QUEUED_REPORTS = 50;
const MAX_FEEDBACK_RECORDS = 500;

export type ManualFeedbackKind = 'safe' | 'spam' | 'dangerous';
type FeedbackRecordEntry = { hash: string; kind: ManualFeedbackKind };

function normalizeMessageText(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function hashMessageText(text: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, normalizeMessageText(text));
}

function isFeedbackRecordEntry(value: unknown): value is FeedbackRecordEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.hash === 'string' && (entry.kind === 'safe' || entry.kind === 'spam' || entry.kind === 'dangerous')
  );
}

async function readFeedbackRecords(): Promise<FeedbackRecordEntry[]> {
  const raw = await AsyncStorage.getItem(FEEDBACK_RECORD_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isFeedbackRecordEntry) : [];
  } catch {
    return [];
  }
}

/**
 * Lets a repeat scan of the same text show what you already did about it —
 * "Marked as safe", "Labeled as spam", or "Reported and blocked" — instead of
 * showing the feedback buttons again as if it were a fresh result.
 */
export async function getMessageFeedbackRecord(messageText: string): Promise<ManualFeedbackKind | null> {
  const hash = await hashMessageText(messageText);
  const records = await readFeedbackRecords();
  return records.find((entry) => entry.hash === hash)?.kind ?? null;
}

/** Records which button you tapped for this exact text, independent of whether any network sync succeeds. */
export async function markMessageFeedback(messageText: string, kind: ManualFeedbackKind) {
  const hash = await hashMessageText(messageText);
  const records = await readFeedbackRecords();
  const next = records.filter((entry) => entry.hash !== hash);
  next.push({ hash, kind });
  await AsyncStorage.setItem(FEEDBACK_RECORD_KEY, JSON.stringify(next.slice(-MAX_FEEDBACK_RECORDS)));
}

/** Where a report came from: Manual Scan's Report & Block, or a real-time warning's Block & Report. */
export type ReportSource = 'manual' | 'realtime';
export type CommunityDetectedIn = 'manual' | 'messages' | 'messenger' | 'unknown';

export type PhishingVirality = { viralScore: number; reportCount: number; isFirstReporter: boolean };

type QueuedReport = {
  id: string;
  messageText: string;
  sampleSender: string | null;
  messageReceivedAt?: string;
  detectedIn?: CommunityDetectedIn;
  indicatorCodes: string[];
  ruleVersion: string;
  riskScore?: number | null;
  createdAt: string;
  attempts: number;
};

let queueWork: Promise<unknown> = Promise.resolve();
function serializeQueue<T>(operation: () => Promise<T>): Promise<T> {
  const next = queueWork.then(operation, operation);
  queueWork = next.catch(() => undefined);
  return next;
}

function isQueuedReport(value: unknown): value is QueuedReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as Record<string, unknown>;
  return (
    typeof report.id === 'string' &&
    typeof report.messageText === 'string' &&
    (report.sampleSender === null || typeof report.sampleSender === 'string') &&
    (report.messageReceivedAt === undefined || typeof report.messageReceivedAt === 'string') &&
    (report.detectedIn === undefined || isCommunityDetectedIn(report.detectedIn)) &&
    Array.isArray(report.indicatorCodes) &&
    typeof report.ruleVersion === 'string' &&
    typeof report.createdAt === 'string' &&
    typeof report.attempts === 'number'
  );
}

function isCommunityDetectedIn(value: unknown): value is CommunityDetectedIn {
  return value === 'manual' || value === 'messages' || value === 'messenger' || value === 'unknown';
}

async function readQueue(userId: string): Promise<QueuedReport[]> {
  const raw = await AsyncStorage.getItem(`${REPORT_QUEUE_KEY}.${userId}`);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
          .filter(isQueuedReport)
          .map((report) => ({ ...report, riskScore: publicRiskScore(report.riskScore, report.ruleVersion) }))
      : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedReport[], userId: string) {
  await AsyncStorage.setItem(`${REPORT_QUEUE_KEY}.${userId}`, JSON.stringify(queue.slice(-MAX_QUEUED_REPORTS)));
}

/**
 * PostgREST's "no function matches these arguments" error when the database has not applied
 * the migration adding a report RPC argument yet.
 */
function isMissingReportParameter(error: { code?: string } | null) {
  return error?.code === 'PGRST202';
}

/**
 * A stored or received risk score as 0-100, or null when absent. Rule versions before 2026.10.26
 * used 1–29 for Safe; scores in the current Suspicious band must remain nonzero.
 */
function publicRiskScore(value: unknown, ruleVersion?: string): number | null {
  return typeof value === 'number'
    ? finalizeRiskScore(Math.max(0, Math.min(100, Math.round(value))), ruleVersion)
    : null;
}

async function syncReport(report: QueuedReport, source: ReportSource): Promise<PhishingVirality> {
  const deviceId = await registerDevice(report.ruleVersion);
  const args = {
    p_device_id: deviceId,
    p_message_text: report.messageText,
    p_sample_sender: report.sampleSender,
    p_indicator_codes: report.indicatorCodes,
    p_rule_version: report.ruleVersion,
  };
  const riskScore = publicRiskScore(report.riskScore, report.ruleVersion);
  if (riskScore === 0) throw new Error('Safe messages cannot be submitted as community reports.');
  let { data, error } = await supabase.rpc('record_phishing_report', {
    ...args,
    p_source: source,
    p_risk_score: riskScore,
    p_message_received_at: report.messageReceivedAt ?? null,
    p_detected_in: report.detectedIn ?? (source === 'manual' ? 'manual' : 'unknown'),
  });
  // Older databases: drop only the parameters they do not know yet.
  if (isMissingReportParameter(error)) {
    ({ data, error } = await supabase.rpc('record_phishing_report', {
      ...args,
      p_source: source,
      p_risk_score: riskScore,
      p_message_received_at: report.messageReceivedAt ?? null,
    }));
  }
  if (isMissingReportParameter(error)) {
    ({ data, error } = await supabase.rpc('record_phishing_report', {
      ...args,
      p_source: source,
      p_risk_score: riskScore,
    }));
  }
  if (isMissingReportParameter(error)) {
    ({ data, error } = await supabase.rpc('record_phishing_report', { ...args, p_source: source }));
  }
  if (isMissingReportParameter(error)) ({ data, error } = await supabase.rpc('record_phishing_report', args));
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error('The community report service returned no result.');
  if (typeof row.notification_event_id === 'string') {
    const { error: dispatchError } = await supabase.functions.invoke('send-community-report-alert', {
      body: { eventId: row.notification_event_id },
    });
    if (dispatchError) logError('community-notification-dispatch-failed', dispatchError);
  }
  return { viralScore: row.viral_score, reportCount: row.report_count, isFirstReporter: row.is_first_reporter };
}

/**
 * Saves a "Report & Block" tap to the on-device queue immediately (this always
 * succeeds, online or off), then tries to sync it right away. It queues the
 * exact text of a message the user chose to report — Block & Report on a
 * warning, or Report on a Suspicious or Dangerous Manual Scan result. This is the one path
 * in the app that intentionally uploads message content, and only on explicit
 * user action.
 */
export async function reportAndBlockMessage(
  messageText: string,
  sampleSender: string | null,
  result: ThreatResult,
): Promise<PhishingVirality | null> {
  if (result.level === 'safe') throw new Error('Safe messages cannot be submitted as community reports.');
  const userId = await activeUserId();
  const report: QueuedReport = {
    id: Crypto.randomUUID(),
    messageText: messageText.slice(0, 4000),
    sampleSender,
    detectedIn: 'manual',
    indicatorCodes: result.reasons.map((reason) => reason.code).slice(0, 32),
    ruleVersion: result.ruleVersion,
    riskScore: finalizeThreatResult(result).score,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  await serializeQueue(async () => {
    const queue = await readQueue(userId);
    queue.push(report);
    await writeQueue(queue, userId);
  });

  if (!isSupabaseConfigured) return null;
  try {
    const virality = await syncReport(report, 'manual');
    await serializeQueue(async () => {
      const queue = await readQueue(userId);
      await writeQueue(
        queue.filter((item) => item.id !== report.id),
        userId,
      );
    });
    return virality;
  } catch (error) {
    logError('phishing-report-sync-failed', error);
    return null;
  }
}

/** Retries any reports that could not sync immediately (for example while offline). */
export async function flushQueuedPhishingReports() {
  return serializeQueue(flushUserQueue);
}
async function flushUserQueue() {
  if (!isSupabaseConfigured) return { synced: 0, pending: 0 };
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { synced: 0, pending: 0 };
  const userId = sessionData.session.user.id;

  const queued = await readQueue(userId);
  const remaining: QueuedReport[] = [];
  let synced = 0;
  for (const report of queued) {
    if (publicRiskScore(report.riskScore, report.ruleVersion) === 0) {
      logDiagnostic('safe-community-report-discarded', { reportId: report.id });
      continue;
    }
    try {
      await syncReport(report, 'manual');
      synced += 1;
    } catch (error) {
      logError('phishing-report-retry-failed', error);
      remaining.push({ ...report, attempts: report.attempts + 1 });
    }
  }
  await writeQueue(remaining, userId);
  return { synced, pending: remaining.length };
}

/**
 * Uploads "Block & Report" taps queued natively by the real-time listener
 * while the app was closed or offline (see EncryptedCommunityReportQueue).
 * Once each one syncs, this shows the same "New" / report-count follow-up
 * Manual Scan shows instantly — delayed here since a background notification
 * tap has no UI to show it in until the app is next opened.
 */
export async function flushNativeCommunityReports(): Promise<{ synced: number; pending: number }> {
  if (!isSupabaseConfigured || !isNativeMonitoringAvailable()) return { synced: 0, pending: 0 };
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { synced: 0, pending: 0 };

  let pending: PendingCommunityReport[];
  try {
    pending = await getPendingCommunityReports();
  } catch (error) {
    logError('native-community-report-read-failed', error);
    return { synced: 0, pending: 0 };
  }

  const acknowledged: string[] = [];
  let synced = 0;
  for (const report of pending) {
    if (publicRiskScore(report.riskScore, report.ruleVersion) === 0) {
      logDiagnostic('safe-native-community-report-discarded', { reportId: report.id });
      acknowledged.push(report.id);
      continue;
    }
    try {
      const virality = await syncReport(
        {
          id: report.id,
          messageText: report.messageText,
          sampleSender: report.sampleSender,
          detectedIn: report.detectedIn ?? 'unknown',
          ...(report.messageReceivedAt == null
            ? {}
            : { messageReceivedAt: new Date(report.messageReceivedAt).toISOString() }),
          indicatorCodes: report.indicatorCodes,
          ruleVersion: report.ruleVersion,
          riskScore: report.riskScore ?? null,
          createdAt: new Date(report.createdAt).toISOString(),
          attempts: 0,
        },
        'realtime',
      );
      await markMessageFeedback(report.messageText, 'dangerous');
      await notifyCommunityReportResult(virality.reportCount <= 1, virality.reportCount);
      acknowledged.push(report.id);
      synced += 1;
    } catch (error) {
      logError('native-community-report-sync-failed', error);
    }
  }

  if (acknowledged.length) {
    try {
      await ackCommunityReports(acknowledged);
    } catch (error) {
      // The RPC is idempotent, so a failed acknowledgement merely retries the upload later.
      logError('native-community-report-ack-failed', error);
    }
  }
  logDiagnostic('native-community-reports-flushed', {
    claimed: pending.length,
    synced,
  });
  return { synced, pending: pending.length - acknowledged.length };
}

export type CommunityReportFeedEntry = {
  reportEventId: string;
  messagePreview: string;
  detectedIn: CommunityDetectedIn;
};

export type ViralPhishingEntry = {
  reportId: string;
  messagePreview: string;
  detectedIn: CommunityDetectedIn[];
  reportCount: number;
};

export class ViralPhishingRankingUnavailableError extends Error {}

export async function getViralPhishingRanking(source: ReportSource, limit = 10): Promise<ViralPhishingEntry[]> {
  if (!isSupabaseConfigured) throw new Error('Viral phishing rankings require a configured account.');
  const { data, error } = await supabase.rpc('get_viral_phishing_message_ranking', {
    p_limit: limit,
    p_source: source,
  });
  if (error?.code === 'PGRST202') {
    throw new ViralPhishingRankingUnavailableError(
      'Viral Phishing is restored, but message previews need the latest server update before reports can load.',
    );
  }
  if (error) throw error;
  return (data ?? []).map((row) => {
    const detectedIn = row.detected_in.filter(isCommunityDetectedIn);
    return {
      reportId: row.report_id,
      messagePreview: row.message_preview,
      detectedIn: detectedIn.length ? detectedIn : ['unknown'],
      reportCount: row.report_count,
    };
  });
}

export async function getCommunityReportFeed(limit = 100, offset = 0): Promise<CommunityReportFeedEntry[]> {
  if (!isSupabaseConfigured) throw new Error('Community alerts require a configured account.');
  const { data, error } = await supabase.rpc('get_community_report_message_feed', { p_limit: limit, p_offset: offset });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    reportEventId: row.report_event_id,
    messagePreview: row.message_preview,
    detectedIn: isCommunityDetectedIn(row.detected_in) ? row.detected_in : 'unknown',
  }));
}

export async function flushPendingCommunityNotifications() {
  if (!isSupabaseConfigured) return { attempted: 0 };
  const { data, error } = await supabase.rpc('get_pending_community_notification_events');
  if (error) {
    logError('community-notification-outbox-read-failed', error);
    return { attempted: 0 };
  }
  let attempted = 0;
  for (const event of data ?? []) {
    const { error: dispatchError } = await supabase.functions.invoke('send-community-report-alert', {
      body: { eventId: event.event_id },
    });
    attempted += 1;
    if (dispatchError) logError('community-notification-retry-failed', dispatchError);
  }
  return { attempted };
}
