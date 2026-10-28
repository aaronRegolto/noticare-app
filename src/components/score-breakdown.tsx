import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { EvidenceSpan, ThreatLevel } from '@/src/features/detection';
import { ENGLISH_WARNING_COPY, type WarningCopy } from '@/src/features/translation';
import type { ThemeColors } from '@/src/theme/palette';

type Reason = { code: string; label: string; description: string; weight: number };

const BANDS: { level: ThreatLevel; range: string }[] = [
  { level: 'safe', range: '0' },
  { level: 'suspicious', range: '1–59' },
  { level: 'dangerous', range: '60–100' },
];

/**
 * Shows how a risk score was reached: each warning sign with the points it added, the total,
 * and which band (Safe / Suspicious / Dangerous) the total falls in. The score is the sum of the
 * signs' points, capped at 100 — the same rule both detectors use — except that a Safe message
 * always scores 0, so it lists no signs or points at all.
 */
export function HighlightedMessage({
  message,
  highlights,
  colors,
}: {
  message: string;
  highlights: EvidenceSpan[];
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const segments = useMemo(() => {
    const sorted = highlights
      .filter((span) => span.start >= 0 && span.end <= message.length && span.end > span.start)
      .sort((left, right) => left.start - right.start);
    const pieces: { text: string; highlighted: boolean }[] = [];
    let cursor = 0;
    sorted.forEach((span) => {
      const start = Math.max(cursor, span.start);
      if (start >= span.end) return;
      if (cursor < start) pieces.push({ text: message.slice(cursor, start), highlighted: false });
      pieces.push({ text: message.slice(start, span.end), highlighted: true });
      cursor = span.end;
    });
    if (cursor < message.length) pieces.push({ text: message.slice(cursor), highlighted: false });
    return pieces;
  }, [highlights, message]);

  if (!segments.some((segment) => segment.highlighted)) return null;
  return (
    <View style={styles.highlightCard}>
      <Text style={styles.highlightTitle}>Message text that triggered the warning</Text>
      <Text selectable style={styles.highlightText}>
        {segments.map((segment, index) => (
          <Text key={`${index}-${segment.text}`} style={segment.highlighted ? styles.highlightedText : undefined}>
            {segment.text}
          </Text>
        ))}
      </Text>
    </View>
  );
}

export function ScoreBreakdown({
  reasons,
  score,
  level,
  accent,
  colors,
  copy = ENGLISH_WARNING_COPY,
}: {
  /** Already in the chosen language (see localizeReason). */
  reasons: Reason[];
  score: number;
  level: ThreatLevel;
  accent: string;
  colors: ThemeColors;
  copy?: WarningCopy;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Also covers a Safe result that still carries weighted reasons, e.g. from an older native build.
  const listed = level === 'safe' ? [] : reasons;
  const shownScore = level === 'safe' ? 0 : score;
  const rawTotal = listed.reduce((sum, reason) => sum + reason.weight, 0);
  const bandColor = { safe: colors.success, suspicious: colors.warning, dangerous: colors.danger };

  return (
    <View>
      {listed.length ? (
        listed.map((reason) => (
          <View key={reason.code} style={styles.row}>
            <Ionicons name="alert-circle-outline" size={18} color={accent} />
            <View style={styles.copy}>
              <Text style={styles.title}>{reason.label}</Text>
              <Text style={styles.description}>{reason.description}</Text>
            </View>
            <Text style={styles.points} accessibilityLabel={copy.pointsAccessibility(reason.weight)}>
              +{reason.weight}
            </Text>
          </View>
        ))
      ) : (
        <Text style={styles.description}>{copy.noMeaningfulSigns}</Text>
      )}

      {listed.length ? (
        <View style={styles.sumRow}>
          <Text style={styles.sumLabel}>
            {copy.total}
            {listed.length > 1 ? ` (${listed.map((reason) => reason.weight).join(' + ')})` : ''}
          </Text>
          <Text style={styles.sumValue} accessibilityLabel={`${copy.total} ${copy.pointsAccessibility(rawTotal)}`}>
            {rawTotal}
          </Text>
        </View>
      ) : null}

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{copy.riskScore}</Text>
        <Text style={[styles.totalValue, { color: bandColor[level] }]}>{shownScore}/100</Text>
      </View>
      {rawTotal > 100 ? <Text style={styles.note}>{copy.cappedNote(rawTotal)}</Text> : null}

      <View style={styles.bands} accessibilityLabel={copy.bandsAccessibility(level)}>
        {BANDS.map((band) => {
          const active = band.level === level;
          return (
            <View
              key={band.level}
              style={[
                styles.band,
                active && { backgroundColor: bandColor[band.level], borderColor: bandColor[band.level] },
              ]}
            >
              <Text style={[styles.bandLabel, active && styles.bandLabelActive]}>{copy.bands[band.level]}</Text>
              <Text style={[styles.bandRange, active && styles.bandLabelActive]}>{band.range}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    highlightCard: {
      marginTop: 12,
      marginBottom: 14,
      padding: 13,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    highlightTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 13, marginBottom: 7 },
    highlightText: { color: colors.textPrimary, fontSize: 14, lineHeight: 22 },
    highlightedText: {
      color: colors.textPrimary,
      fontWeight: '700',
      textDecorationLine: 'underline',
      textDecorationColor: colors.warning,
      backgroundColor: 'transparent',
    },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 7 },
    copy: { flex: 1 },
    title: { color: colors.textPrimary, fontWeight: '700', fontSize: 13 },
    description: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
    points: { color: colors.textPrimary, fontWeight: '800', fontSize: 13, minWidth: 34, textAlign: 'right' },
    sumRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    sumLabel: { flex: 1, color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
    sumValue: { color: colors.textPrimary, fontWeight: '800', fontSize: 13, minWidth: 34, textAlign: 'right' },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 8,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    totalLabel: { color: colors.textPrimary, fontWeight: '800', fontSize: 14 },
    totalValue: { fontWeight: '800', fontSize: 16 },
    note: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
    bands: { flexDirection: 'row', gap: 6, marginTop: 12 },
    band: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 7,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bandLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
    bandRange: { color: colors.textMuted, fontSize: 10, marginTop: 1 },
    bandLabelActive: { color: '#fff' },
  });
}
