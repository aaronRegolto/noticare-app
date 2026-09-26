import Ionicons from '@expo/vector-icons/Ionicons';
import type { RefObject } from 'react';
import { useEffect, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Mask, Rect } from 'react-native-svg';

import type { ThemeColors } from '@/src/theme/palette';

/**
 * A GCash-style guided tour: dims the whole screen except a cut-out "spotlight"
 * around a real, currently-rendered element, with a tooltip explaining it.
 *
 * Usage: attach `ref` to the View/Pressable you want to explain, collect them
 * into `steps`, and render `<SpotlightTour>` as a sibling of (not inside) the
 * screen's `SafeAreaView`, with `visible` tied to a "have I shown this before"
 * flag.
 *
 * Deliberately NOT a `<Modal>`: Android Modals open in a separate window, and
 * that window's own status-bar handling (`statusBarTranslucent`) can drift out
 * of sync with `expo-status-bar`'s handling of the same physical status bar —
 * which shifts the Modal's coordinate origin away from the real window's.
 * `measureInWindow` always measures against the real window, so a target
 * measured there and a hole drawn inside a Modal can end up in different
 * coordinate spaces. Rendering the spotlight directly in the screen's own
 * tree keeps both in the exact same space.
 */
export type TourStep = {
  key: string;
  title: string;
  description: string;
  // This is structural rather than View-specific so a tour can target a native
  // control such as Switch directly. Android can flatten layout-only Views,
  // which makes a parent wrapper an unreliable anchor for a precise cut-out.
  targetRef: RefObject<{ measureInWindow: View['measureInWindow'] } | null>;
  /** 'circle' suits round icon buttons; 'rect' (default) suits cards and rows. */
  shape?: 'circle' | 'rect';
  /** Fine-tunes a native control's measured anchor when its platform bounds drift from its visible track. */
  spotlightOffset?: { x?: number; y?: number };
  /** Use the target's own elevated focus treatment instead of an SVG cut-out. */
  hideCutout?: boolean;
  /** Keeps a target's own visual focus treatment in sync with the active tour step. */
  onEnter?: () => void;
  onExit?: () => void;
  /**
   * Called right before this step is measured. Use it to scroll the target
   * into view (e.g. `scrollRef.current?.scrollTo(...)`) when it lives inside
   * a ScrollView — without this, a target below the fold gets measured at
   * its un-scrolled position, landing the spotlight hole somewhere unrelated.
   * Scrolling logic is deliberately left to the screen: React Native's
   * `measureLayout` relative-node API is not reliable across the old and new
   * architectures, so this component only relies on the arch-agnostic
   * `measureInWindow`.
   */
  beforeMeasure?: () => void;
};

type Measured = { x: number; y: number; width: number; height: number };

const HOLE_PADDING = 10;
const TOOLTIP_HEIGHT_ESTIMATE = 190;

export function SpotlightTour({
  steps,
  visible,
  onDone,
  colors,
}: {
  steps: TourStep[];
  visible: boolean;
  onDone: () => void;
  colors: ThemeColors;
}) {
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<Measured | null>(null);
  const screen = Dimensions.get('window');

  useEffect(() => {
    if (visible) setIndex(0);
  }, [visible]);

  // Drop the previous hole immediately on step change so a stale, wrongly
  // positioned cutout never flashes while the new target is being measured.
  useEffect(() => {
    setTarget(null);
  }, [index]);

  useEffect(() => {
    if (!visible) return;
    const step = steps[index];
    step?.onEnter?.();
    return () => step?.onExit?.();
  }, [visible, index, steps]);

  // Poll measureInWindow instead of trusting a fixed delay after scrolling: a fixed delay is a
  // guess about how long layout takes to settle after `beforeMeasure` runs, and guessing wrong on
  // a slower device leaves the hole drawn from a mid-scroll position while the real content keeps
  // moving underneath it. Polling until two consecutive reads agree (or a ~1.2s cap is hit)
  // converges regardless of device speed, and updating `target` on every poll means the hole
  // visibly tracks toward its final spot rather than freezing on a stale one.
  useEffect(() => {
    if (!visible) return;
    const step = steps[index];
    if (!step) return;
    step.beforeMeasure?.();

    let cancelled = false;
    let attempts = 0;
    let last: Measured | null = null;
    let timer: ReturnType<typeof setTimeout>;
    const MAX_ATTEMPTS = 15;
    const POLL_MS = 80;

    const poll = () => {
      if (cancelled) return;
      attempts += 1;
      const node = step.targetRef.current;
      if (!node || typeof node.measureInWindow !== 'function') {
        if (attempts < MAX_ATTEMPTS) timer = setTimeout(poll, POLL_MS);
        else setTarget(null);
        return;
      }
      node.measureInWindow((x, y, width, height) => {
        if (cancelled) return;
        if (width <= 0 || height <= 0) {
          if (attempts < MAX_ATTEMPTS) timer = setTimeout(poll, POLL_MS);
          return;
        }
        const current = { x, y, width, height };
        const stable =
          last &&
          Math.abs(last.x - x) < 0.5 &&
          Math.abs(last.y - y) < 0.5 &&
          Math.abs(last.width - width) < 0.5 &&
          Math.abs(last.height - height) < 0.5;
        setTarget(current);
        last = current;
        if (!stable && attempts < MAX_ATTEMPTS) timer = setTimeout(poll, POLL_MS);
      });
    };

    timer = setTimeout(poll, 16);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [visible, index, steps]);

  if (!visible || steps.length === 0) return null;
  const step = steps[index];
  const isLast = index === steps.length - 1;

  const anchor = target
    ? {
        x: Math.max(0, target.x + (step.spotlightOffset?.x ?? 0) - HOLE_PADDING),
        y: Math.max(0, target.y + (step.spotlightOffset?.y ?? 0) - HOLE_PADDING),
        width: target.width + HOLE_PADDING * 2,
        height: target.height + HOLE_PADDING * 2,
      }
    : null;
  const hole = step.hideCutout ? null : anchor;

  const spaceBelow = anchor ? screen.height - (anchor.y + anchor.height) : screen.height;
  const placeBelow = !anchor || spaceBelow > TOOLTIP_HEIGHT_ESTIMATE || anchor.y < TOOLTIP_HEIGHT_ESTIMATE;
  const tooltipTop = anchor
    ? placeBelow
      ? Math.min(screen.height - TOOLTIP_HEIGHT_ESTIMATE - 24, anchor.y + anchor.height + 18)
      : Math.max(60, anchor.y - TOOLTIP_HEIGHT_ESTIMATE - 18)
    : screen.height / 2 - TOOLTIP_HEIGHT_ESTIMATE / 2;

  return (
    <View style={styles.overlayRoot} pointerEvents="box-none">
      <Svg width={screen.width} height={screen.height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <Mask id="spotlight-hole">
            <Rect x={0} y={0} width={screen.width} height={screen.height} fill="#fff" />
            {hole ? (
              step.shape === 'circle' ? (
                <Circle
                  cx={hole.x + hole.width / 2}
                  cy={hole.y + hole.height / 2}
                  r={Math.max(hole.width, hole.height) / 2}
                  fill="#000"
                />
              ) : (
                <Rect x={hole.x} y={hole.y} width={hole.width} height={hole.height} rx={14} fill="#000" />
              )
            ) : null}
          </Mask>
        </Defs>
        <Rect
          x={0}
          y={0}
          width={screen.width}
          height={screen.height}
          fill={colors.overlay}
          mask="url(#spotlight-hole)"
        />
        {hole ? (
          step.shape === 'circle' ? (
            <Circle
              cx={hole.x + hole.width / 2}
              cy={hole.y + hole.height / 2}
              r={Math.max(hole.width, hole.height) / 2}
              fill="none"
              stroke={colors.accent}
              strokeWidth={2.5}
            />
          ) : (
            <Rect
              x={hole.x}
              y={hole.y}
              width={hole.width}
              height={hole.height}
              rx={14}
              fill="none"
              stroke={colors.accent}
              strokeWidth={2.5}
            />
          )
        ) : null}
      </Svg>

      {/* Anywhere outside the card still advances the tour, like a GCash coach mark. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityLabel="Dismiss tutorial hint"
        onPress={() => (isLast ? onDone() : setIndex((current) => current + 1))}
      />

      <View
        style={[styles.tooltip, { top: tooltipTop, backgroundColor: colors.surface, borderColor: colors.border }]}
        accessibilityLiveRegion="polite"
      >
        <View style={styles.headerRow}>
          <View style={[styles.stepBadge, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.stepBadgeText, { color: colors.accent }]}>
              {index + 1} / {steps.length}
            </Text>
          </View>
          <Pressable onPress={onDone} hitSlop={10} accessibilityRole="button" accessibilityLabel="Skip tutorial">
            <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip</Text>
          </Pressable>
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{step.title}</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>{step.description}</Text>
        <View style={styles.footerRow}>
          <View style={styles.dots}>
            {steps.map((s, dotIndex) => (
              <View
                key={s.key}
                style={[
                  styles.dot,
                  { backgroundColor: dotIndex === index ? colors.accent : colors.border },
                  dotIndex === index && styles.dotActive,
                ]}
              />
            ))}
          </View>
          <Pressable
            onPress={() => (isLast ? onDone() : setIndex((current) => current + 1))}
            style={[styles.nextButton, { backgroundColor: colors.accent }]}
            accessibilityRole="button"
            accessibilityLabel={isLast ? 'Finish tutorial' : 'Next tip'}
          >
            <Text style={styles.nextText}>{isLast ? 'Got it' : 'Next'}</Text>
            <Ionicons name={isLast ? 'checkmark' : 'arrow-forward'} size={16} color="#FFF" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    // Android reorders siblings by elevation, and other cards on this screen
    // use up to ~10 — this must paint above all of them.
    elevation: 50,
    zIndex: 50,
  },
  tooltip: {
    position: 'absolute',
    left: 18,
    right: 18,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  stepBadgeText: { fontSize: 11, fontWeight: '800' },
  skipText: { fontSize: 13, fontWeight: '700' },
  title: { fontSize: 17, fontWeight: '800', marginTop: 12 },
  description: { fontSize: 13.5, lineHeight: 20, marginTop: 6 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 4 },
  dotActive: { width: 16 },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  nextText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
});
