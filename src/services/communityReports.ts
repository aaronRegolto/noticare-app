import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import type { ThreatResult } from '@/src/features/detection';
import { activeUserId, registerDevice } from '@/src/services/eventSync';
import { logError } from '@/src/services/logger';
import {
  ackCommunityReports,
  getPendingCommunityReports,
  isNativeMonitoringAvailable,
  notifyCommunityReportResult,
  type PendingCommunityReport,
} from '@/src/services/notificationListener';
import { isSupabaseConfigured, supabase } from '@/src/services/supabase';

const REPORT_QUEUE_KEY = 'noticare.phishing-report-queue.v1';
const RANKING_CACHE_KEY = 'noticare.viral-phishing-ranking.v2';
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
};

type QueuedReport = {
  id: string;
  messageText: string;
  sampleSender: string | null;
  indicatorCodes: string[];
  ruleVersion: string;
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
    return Array.isArray(parsed) ? parsed.filter(isQueuedReport) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedReport[], userId: string) {
  await AsyncStorage.setItem(`${REPORT_QUEUE_KEY}.${userId}`, JSON.stringify(queue.slice(-MAX_QUEUED_REPORTS)));
}

async function syncReport(report: QueuedReport, source: ReportSource): Promise<PhishingVirality> {
  const deviceId = await registerDevice(report.ruleVersion);
  const { data, error } = await supabase.rpc('record_phishing_report', {
    p_device_id: deviceId,
    p_message_text: report.messageText,
    p_sample_sender: report.sampleSender,
    p_indicator_codes: report.indicatorCodes,
    p_rule_version: report.ruleVersion,
    p_source: source,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error('The community report service returned no result.');
  return { viralScore: row.viral_score, reportCount: row.report_count, isFirstReporter: row.is_first_reporter };
}

/**
 * Saves a "Report & Block" tap to the on-device queue immediately (this always
 * succeeds, online or off), then tries to sync it right away. Only a Dangerous
 * result's exact text is ever queued here — this is the one path in the app
 * that intentionally uploads message content, and only on explicit user action.
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
    typeof entry.lastReportedAt === 'string'
  );
}

async function readRankingCache(source: ReportSource): Promise<ViralPhishingEntry[]> {
  const raw = await AsyncStorage.getItem(`${RANKING_CACHE_KEY}.${source}`);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isViralPhishingRow) : [];
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
  if (!isSupabaseConfigured) return { entries: await readRankingCache(reportSource), source: 'cache' };
  try {
    const { data, error } = await supabase.rpc('get_viral_phishing_ranking', {
      p_limit: limit,
      p_source: reportSource,
    });
    if (error) throw error;
    const entries: ViralPhishingEntry[] = (data ?? []).map((row) => ({
      reportId: row.report_id,
      messageText: row.message_text,
      sampleSender: row.sample_sender,
      viralScore: row.viral_score,
      reportCount: row.report_count,
      firstReportedAt: row.first_reported_at,
      lastReportedAt: row.last_reported_at,
    }));
    await AsyncStorage.setItem(`${RANKING_CACHE_KEY}.${reportSource}`, JSON.stringify(entries));
    return { entries, source: 'network' };
  } catch (error) {
    logError('viral-phishing-ranking-load-failed', error);
    return { entries: await readRankingCache(reportSource), source: 'cache' };
  }
}
