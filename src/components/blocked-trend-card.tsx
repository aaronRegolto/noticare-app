import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';

import type { CommunityRange } from '@/backend/supabase/types/database.types';
import { axisTicks, blockedSeries, type BlockedBucket } from '@/src/features/community/blockedSeries';
import type { ThemeColors } from '@/src/theme/palette';

const RANGES: { key: CommunityRange; label: string; period: string }[] = [
  { key: 'last_24_hours', label: '24 hours', period: 'in the last 24 hours' },
  { key: 'last_7_days', label: '7 days', period: 'in the last 7 days' },
  { key: 'last_30_days', label: '30 days', period: 'in the last 30 days' },
  { key: 'last_6_months', label: '6 months', period: 'in the last 6 months' },
];

const CHART_HEIGHT = 168;
const MARGIN = { top: 10, right: 4, bottom: 26, left: 28 };

function bucketLabel(start: number, range: CommunityRange, long = false) {
  const date = new Date(start);
  if (range === 'last_24_hours' || range === 'today') {
    const hour = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(date);
    return long
      ? `${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)}, ${hour}`
      : hour;
  }
  if (range === 'last_6_months') {
    return new Intl.DateTimeFormat(undefined, {
      month: long ? 'long' : 'short',
      year: long ? 'numeric' : undefined,
      timeZone: 'UTC',
    }).format(date);
  }
  if (range === 'last_7_days' && !long)
    return new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }).format(date);
  return new Intl.DateTimeFormat(undefined, {
    weekday: long ? 'short' : undefined,
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** Which buckets get an x-axis label: every one for short ranges, evenly spaced otherwise. */
function labelIndexes(count: number, range: CommunityRange) {
  const every = range === 'last_24_hours' || range === 'today' ? 6 : range === 'last_30_days' ? 7 : 1;
  const indexes: number[] = [];
  for (let index = count - 1; index >= 0; index -= every) indexes.unshift(index);
  return indexes;
}

/** Column with a 4px rounded top and a square base on the baseline. */
function columnPath(x: number, y: number, width: number, height: number) {
  const radius = Math.min(4, width / 2, height);
  return `M${x},${y + height} V${y + radius} Q${x},${y} ${x + radius},${y} H${x + width - radius} Q${x + width},${y} ${x + width},${y + radius} V${y + height} Z`;
}

type Props = {
  points: { date: string; blocked_count: number }[];
  range: CommunityRange;
  onRangeChange: (range: CommunityRange) => void;
  loading: boolean;
  error: string | null;
  fromCache: boolean;
  colors: ThemeColors;
};

export function BlockedTrendCard({ points, range, onRangeChange, loading, error, fromCache, colors }: Props) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const series = useMemo(() => blockedSeries(points, range), [points, range]);
  const total = series.reduce((sum, bucket) => sum + bucket.blocked, 0);
  const period = RANGES.find((item) => item.key === range)?.period ?? '';
  const peakIndex = series.reduce((best, bucket, index) => (bucket.blocked > series[best].blocked ? index : best), 0);
  const focus: BlockedBucket | null = selected !== null ? (series[selected] ?? null) : total ? series[peakIndex] : null;

  const changeRange = (next: CommunityRange) => {
    setSelected(null);
    onRangeChange(next);
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconBadge}>
          <Ionicons name="shield-checkmark" size={18} color={colors.accent} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Blocked dangerous messages</Text>
          <Text style={styles.subtitle}>Community-wide · anonymous totals{fromCache ? ' · saved data' : ''}</Text>
        </View>
      </View>

      <View style={styles.headline}>
        <Text style={styles.total} accessibilityLabel={`${total} blocked ${period}`}>
          {total.toLocaleString()}
        </Text>
        <Text style={styles.totalCaption}>blocked {period}</Text>
      </View>

      <View style={styles.segmented} accessibilityRole="tablist">
        {RANGES.map((item) => {
          const active = item.key === range;
          return (
            <Pressable
              key={item.key}
              onPress={() => changeRange(item.key)}
              style={[styles.segment, active && styles.segmentActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.readout}>
        {focus ? (
          <>
            <Text style={styles.readoutLabel}>
              {selected !== null
                ? bucketLabel(focus.start, range, true)
                : `Peak · ${bucketLabel(focus.start, range, true)}`}
            </Text>
            <Text style={styles.readoutValue}>{focus.blocked.toLocaleString()} blocked</Text>
          </>
        ) : (
          <Text style={styles.readoutLabel}>
            {error ? 'Showing the last saved data.' : 'Tap a bar to see its total.'}
          </Text>
        )}
      </View>

      <View
        style={[styles.chart, loading && styles.chartLoading]}
        onLayout={(event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width))}
      >
        {width > 0 && !(error && !points.length) ? (
          <Chart
            series={series}
            range={range}
            width={width}
            selected={selected}
            onSelect={(index) => setSelected((current) => (current === index ? null : index))}
            colors={colors}
          />
        ) : null}
        {error && !points.length ? (
          <View style={styles.overlay}>
            <Ionicons name="cloud-offline-outline" size={26} color={colors.textMuted} />
            <Text style={styles.overlayText}>Community data is unavailable right now.</Text>
          </View>
        ) : !total && !loading ? (
          <View style={styles.overlay} pointerEvents="none">
            <Text style={styles.overlayText}>No blocked messages {period}</Text>
          </View>
        ) : null}
        {loading ? (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Chart({
  series,
  range,
  width,
  selected,
  onSelect,
  colors,
}: {
  series: BlockedBucket[];
  range: CommunityRange;
  width: number;
  selected: number | null;
  onSelect: (index: number) => void;
  colors: ThemeColors;
}) {
  const ticks = axisTicks(Math.max(0, ...series.map((bucket) => bucket.blocked)));
  const top = ticks[ticks.length - 1];
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
  const baseline = MARGIN.top + plotHeight;
  const band = plotWidth / series.length;
  const barWidth = Math.max(3, Math.min(24, band * 0.62));
  const center = (index: number) => MARGIN.left + band * index + band / 2;
  const labels = labelIndexes(series.length, range);

  return (
    <View>
      <Svg width={width} height={CHART_HEIGHT}>
        {ticks.map((tick) => {
          const y = baseline - (tick / top) * plotHeight;
          return (
            <Line
              key={`grid-${tick}`}
              x1={MARGIN.left}
              x2={width - MARGIN.right}
              y1={y}
              y2={y}
              stroke={colors.border}
              strokeWidth={1}
            />
          );
        })}
        {ticks.map((tick) => (
          <SvgText
            key={`tick-${tick}`}
            x={MARGIN.left - 8}
            y={baseline - (tick / top) * plotHeight + 4}
            fontSize={10}
            fill={colors.textMuted}
            textAnchor="end"
          >
            {tick.toLocaleString()}
          </SvgText>
        ))}
        {series.map((bucket, index) => {
          if (!bucket.blocked) return null;
          const height = Math.max(2, (bucket.blocked / top) * plotHeight);
          return (
            <Path
              key={bucket.start}
              d={columnPath(center(index) - barWidth / 2, baseline - height, barWidth, height)}
              fill={colors.accent}
              opacity={selected === null || selected === index ? 1 : 0.35}
            />
          );
        })}
        {labels.map((index) => {
          const x = Math.min(width - 18, Math.max(MARGIN.left + 10, center(index)));
          return (
            <SvgText
              key={`label-${series[index].start}`}
              x={x}
              y={baseline + 18}
              fontSize={10}
              fill={selected === index ? colors.textPrimary : colors.textMuted}
              fontWeight={selected === index ? '700' : '400'}
              textAnchor="middle"
            >
              {bucketLabel(series[index].start, range)}
            </SvgText>
          );
        })}
      </Svg>
      {/* Full-height tap targets, one per bucket, wider than the painted bar. */}
      <View style={[chartStyles.hits, { left: MARGIN.left, width: plotWidth, height: CHART_HEIGHT }]}>
        {series.map((bucket, index) => (
          <Pressable
            key={bucket.start}
            style={chartStyles.hit}
            onPress={() => onSelect(index)}
            accessibilityRole="button"
            accessibilityLabel={`${bucketLabel(bucket.start, range, true)}: ${bucket.blocked} blocked`}
            accessibilityState={{ selected: selected === index }}
          />
        ))}
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  hits: { position: 'absolute', top: 0, flexDirection: 'row' },
  hit: { flex: 1 },
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    iconBadge: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accentSoft,
    },
    headerText: { flex: 1 },
    title: { color: colors.textPrimary, fontWeight: '800', fontSize: 15 },
    subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    headline: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 16 },
    total: { color: colors.textPrimary, fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
    totalCaption: { color: colors.textSecondary, fontSize: 13, flexShrink: 1 },
    segmented: {
      flexDirection: 'row',
      padding: 3,
      marginTop: 14,
      borderRadius: 10,
      backgroundColor: colors.surfaceAlt,
    },
    segment: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
    segmentActive: {
      backgroundColor: colors.surface,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    segmentText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
    segmentTextActive: { color: colors.textPrimary, fontWeight: '800' },
    readout: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      minHeight: 20,
      marginTop: 14,
      marginBottom: 6,
    },
    readoutLabel: { color: colors.textMuted, fontSize: 12 },
    readoutValue: { color: colors.textPrimary, fontSize: 13, fontWeight: '800' },
    chart: { minHeight: CHART_HEIGHT },
    chartLoading: { opacity: 0.55 },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      bottom: MARGIN.bottom,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    overlayText: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  });
}
