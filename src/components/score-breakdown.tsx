import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ThreatLevel } from '@/src/features/detection';
import { ENGLISH_WARNING_COPY, type WarningCopy } from '@/src/features/translation';
import type { ThemeColors } from '@/src/theme/palette';

type Reason = { code: string; label: string; description: string; weight: number };

const BANDS: { level: ThreatLevel; range: string }[] = [
  { level: 'safe', range: '0' },
  { level: 'suspicious', range: '30–69' },
  { level: 'dangerous', range: '70–100' },
];

/**
 * Shows how a risk score was reached: each warning sign with the points it added, the total,
 * and which band (Safe / Suspicious / Dangerous) the total falls in. The score is the sum of the
 * signs' points, capped at 100 — the same rule both detectors use — except that a Safe message
 * always scores 0, so it lists no signs or points at all.
 */
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
