import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import { evaluateThreat, finalizeRiskScore, finalizeThreatResult, type ThreatResult } from '@/src/features/detection';
import { activeUserId, registerDevice } from '@/src/services/eventSync';
import { logDiagnostic, logError } from '@/src/services/logger';
import {
  ackCommunityReports,
  getPendingCommunityReports,
  isNativeMonitoringAvailable,
  notifyCommunityReportResult,
  scanTextLocally,
  type PendingCommunityReport,
} from '@/src/services/notificationListener';
import { isSupabaseConfigured, supabase } from '@/src/services/supabase';

const REPORT_QUEUE_KEY = 'noticare.phishing-report-queue.v1';
const RANKING_CACHE_KEY = 'noticare.viral-phishing-ranking.v2';
// The combined ranking cached before the Manual / Real-time split; still a valid Manual fallback.
const LEGACY_RANKING_CACHE_KEY = 'noticare.viral-phishing-ranking.v1';
const FEEDBACK_RECORD_KEY = 'noticare.manual-feedback-record.v1';
const MAX_QUEUED_REPORTS = 50;
const MAX_FEEDBACK_RECORDS = 500;

export type ManualFeedbackKind = 'safe' | 'dangerous';
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
  return typeof entry.hash === 'string' && (entry.kind === 'safe' || entry.kind === 'dangerous');
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
 * "Marked as safe" or "Reported and blocked" — instead of showing the Mark
 * as safe / Report & Block buttons again as if it were a fresh result.
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

export type PhishingVirality = { viralScore: number; reportCount: number; isFirstReporter: boolean };

export type ViralPhishingEntry = {
  reportId: string;
  messageText: string;
  sampleSender: string | null;
  viralScore: number;
  reportCount: number;
  firstReportedAt: string;
  lastReportedAt: string;
  /**
   * The detector's risk score (Safe is always 0, otherwise 30–100); null for reports filed before
   * it was stored. Older rows and cached rankings can hold a Safe 1–29, which reads as 0.
   */
  riskScore: number | null;
};

type QueuedReport = {
  id: string;
  messageText: string;
  sampleSender: string | null;
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
    Array.isArray(report.indicatorCodes) &&
    typeof report.ruleVersion === 'string' &&
    typeof report.createdAt === 'string' &&
    typeof report.attempts === 'number'
  );
}

async function readQueue(userId: string): Promise<QueuedReport[]> {
  const raw = await AsyncStorage.getItem(`${REPORT_QUEUE_KEY}.${userId}`);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(isQueuedReport).map((report) => ({ ...report, riskScore: publicRiskScore(report.riskScore) }))
      : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedReport[], userId: string) {
  await AsyncStorage.setItem(`${REPORT_QUEUE_KEY}.${userId}`, JSON.stringify(queue.slice(-MAX_QUEUED_REPORTS)));
}

/**
 * PostgREST's "no function matches these arguments" error: the database hasn't applied the
 * migration that added p_source (20260928000100_phishing_report_source.sql) yet.
 */
function isMissingSourceParameter(error: { code?: string } | null) {
  return error?.code === 'PGRST202';
}

/**
 * A stored or received risk score as 0-100, or null when absent. It has no level with it, but any
 * score under the Suspicious threshold is Safe, so the 1–29 that older builds queued and reported
 * for Safe messages (still held in queues, server rows, and cached rankings) reads as 0.
 */
function publicRiskScore(value: unknown): number | null {
  return typeof value === 'number' ? finalizeRiskScore(Math.max(0, Math.min(100, Math.round(value)))) : null;
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
  const riskScore = publicRiskScore(report.riskScore);
  let { data, error } = await supabase.rpc('record_phishing_report', {
    ...args,
    p_source: source,
    p_risk_score: riskScore,
  });
  // Older databases: drop the parameters they don't know yet rather than leaving the report queued.
  if (isMissingSourceParameter(error)) {
    ({ data, error } = await supabase.rpc('record_phishing_report', { ...args, p_source: source }));
  }
  if (isMissingSourceParameter(error)) ({ data, error } = await supabase.rpc('record_phishing_report', args));
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error('The community report service returned no result.');
  return { viralScore: row.viral_score, reportCount: row.report_count, isFirstReporter: row.is_first_reporter };
}

/**
 * Saves a "Report & Block" tap to the on-device queue immediately (this always
 * succeeds, online or off), then tries to sync it right away. It queues the
 * exact text of a message the user chose to report — Block & Report on a
 * warning, or Report on a Manual Scan result of any level. This is the one path
 * in the app that intentionally uploads message content, and only on explicit
 * user action.
 */
export async function reportAndBlockMessage(
  messageText: string,
  sampleSender: string | null,
  result: ThreatResult,
): Promise<PhishingVirality | null> {
  const userId = await activeUserId();
  const report: QueuedReport = {
    id: Crypto.randomUUID(),
    messageText: messageText.slice(0, 4000),
    sampleSender,
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
  for (const report of pending) {
    try {
      const virality = await syncReport(
        {
          id: report.id,
          messageText: report.messageText,
          sampleSender: report.sampleSender,
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
    synced: acknowledged.length,
  });
  return { synced: acknowledged.length, pending: pending.length - acknowledged.length };
}

/** Best-effort lookup of a message's current community standing; never files a new report. */
export async function getMessageVirality(messageText: string): Promise<PhishingVirality | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase.rpc('get_phishing_message_virality', { p_message_text: messageText });
    if (error) throw error;
    const row = data?.[0];
    if (!row) return null;
    return { viralScore: row.viral_score, reportCount: row.report_count, isFirstReporter: false };
  } catch (error) {
    logError('phishing-virality-lookup-failed', error);
    return null;
  }
}

function isViralPhishingRow(value: unknown): value is ViralPhishingEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.reportId === 'string' &&
    typeof entry.messageText === 'string' &&
    (entry.sampleSender === null || typeof entry.sampleSender === 'string') &&
    typeof entry.viralScore === 'number' &&
    typeof entry.reportCount === 'number' &&
    typeof entry.firstReportedAt === 'string' &&
    typeof entry.lastReportedAt === 'string' &&
    (entry.riskScore === undefined || entry.riskScore === null || typeof entry.riskScore === 'number')
  );
}

async function readRankingCache(source: ReportSource): Promise<ViralPhishingEntry[]> {
  const raw =
    (await AsyncStorage.getItem(`${RANKING_CACHE_KEY}.${source}`)) ??
    (source === 'manual' ? await AsyncStorage.getItem(LEGACY_RANKING_CACHE_KEY) : null);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(isViralPhishingRow).map((entry) => ({ ...entry, riskScore: publicRiskScore(entry.riskScore) }))
      : [];
  } catch {
    return [];
  }
}

/**
 * The Dashboard's "Most reported phishing messages" ranking for one report source, cached per
 * source for offline viewing. Counts and scores cover that source's reporters only.
 */
export async function getViralPhishingRanking(
  reportSource: ReportSource,
  limit = 20,
): Promise<{ entries: ViralPhishingEntry[]; source: 'network' | 'cache' }> {
  if (!isSupabaseConfigured) {
    return { entries: await fillMissingRiskScores(await readRankingCache(reportSource)), source: 'cache' };
  }
  try {
    let { data, error } = await supabase.rpc('get_viral_phishing_ranking', { p_limit: limit, p_source: reportSource });
    if (isMissingSourceParameter(error)) {
      // Older database: reports have no source yet, so its combined ranking is the Manual list.
      if (reportSource === 'realtime') {
        throw new RankingUnavailableError('Real-time reports appear here once the latest database update is applied.');
      }
      ({ data, error } = await supabase.rpc('get_viral_phishing_ranking', { p_limit: limit }));
    }
    if (error) throw error;
    const entries: ViralPhishingEntry[] = (data ?? []).map((row) => ({
      reportId: row.report_id,
      messageText: row.message_text,
      sampleSender: row.sample_sender,
      viralScore: row.viral_score,
      reportCount: row.report_count,
      firstReportedAt: row.first_reported_at,
      lastReportedAt: row.last_reported_at,
      // Absent until the risk-score migration is applied.
      riskScore: publicRiskScore(row.risk_score),
    }));
    const scored = await fillMissingRiskScores(entries);
    await AsyncStorage.setItem(`${RANKING_CACHE_KEY}.${reportSource}`, JSON.stringify(scored));
    return { entries: scored, source: 'network' };
  } catch (error) {
    logError('viral-phishing-ranking-load-failed', error);
    const cached = await readRankingCache(reportSource);
    // Without a saved copy, surface the failure instead of an empty list that looks like no data.
    if (!cached.length) throw error;
    return { entries: await fillMissingRiskScores(cached), source: 'cache' };
  }
}

/**
 * Reports filed before risk scores were stored come back without one. The score depends only on
 * the message text, so re-running the same detector Manual Scan and real-time scanning use
 * reproduces it exactly: the native Kotlin evaluator on Android, else the parity-tested TS one.
 */
async function fillMissingRiskScores(entries: ViralPhishingEntry[]): Promise<ViralPhishingEntry[]> {
  return Promise.all(
    entries.map(async (entry) => {
      if (entry.riskScore !== null) return entry;
      try {
        const result = isNativeMonitoringAvailable()
          ? await scanTextLocally(entry.messageText)
          : evaluateThreat(entry.messageText);
        return { ...entry, riskScore: result.score };
      } catch (error) {
        logError('viral-risk-score-fill-failed', error);
        return entry;
      }
    }),
  );
}

/** A ranking failure whose message is safe and useful to show the user as-is. */
export class RankingUnavailableError extends Error {}
