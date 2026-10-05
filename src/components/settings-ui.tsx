import Ionicons from '@expo/vector-icons/Ionicons';
import { Children, Fragment, isValidElement, useMemo, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ThemeColors } from '@/src/theme/palette';

/**
 * Building blocks for the Settings screen: a labelled group of rows, a single row that shows its
 * current value, an inline alert for something that needs fixing, and a bottom sheet for choices.
 */

/** A labelled card of rows, separated by hairlines, with an optional footnote below it. */
export function SettingsSection({
  title,
  footnote,
  children,
  colors,
}: {
  title?: string;
  footnote?: string;
  children: ReactNode;
  colors: ThemeColors;
}) {
  const styles = useStyles(colors);
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.card}>
        {rows.map((row, index) => (
          <Fragment key={row.key ?? index}>
            {index > 0 ? <View style={styles.divider} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </View>
  );
}

type Tone = 'default' | 'positive' | 'warning' | 'danger' | 'muted';

/**
 * One settings row: icon, title, optional subtitle, and on the right either the current value with
 * a chevron (when it opens something) or a custom accessory such as a switch.
 */
export function SettingsItem({
  icon,
  title,
  subtitle,
  value,
  valueTone = 'muted',
  accessory,
  onPress,
  destructive = false,
  disabled = false,
  accessibilityLabel,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  value?: string;
  valueTone?: Tone;
  accessory?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  colors: ThemeColors;
}) {
  const styles = useStyles(colors);
  const toneColor = {
    default: colors.textPrimary,
    positive: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    muted: colors.textMuted,
  }[valueTone];
  const content = (
    <>
      <View style={[styles.icon, destructive && styles.iconDanger]}>
        <Ionicons name={icon} size={19} color={destructive ? colors.danger : colors.link} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, destructive && styles.titleDanger]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {value ? (
        <Text style={[styles.value, { color: toneColor }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {accessory}
      {onPress && !accessory ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.row} accessibilityLabel={accessibilityLabel}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed, disabled && styles.rowDisabled]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, value, subtitle].filter(Boolean).join('. ')}
      accessibilityState={{ disabled }}
    >
      {content}
    </Pressable>
  );
}

/** A compact notice inside a section for something that needs the user's attention, with one action. */
export function SettingsAlert({
  message,
  actionLabel,
  onAction,
  tone = 'warning',
  colors,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'warning' | 'danger';
  colors: ThemeColors;
}) {
  const styles = useStyles(colors);
  const color = tone === 'danger' ? colors.danger : colors.warning;
  return (
    <View style={[styles.alert, { backgroundColor: tone === 'danger' ? colors.dangerSoft : colors.warningSoft }]}>
      <Ionicons name="alert-circle" size={18} color={color} />
      <View style={styles.copy}>
        <Text style={[styles.alertText, { color }]}>{message}</Text>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button" style={styles.alertAction}>
            <Text style={[styles.alertActionText, { color }]}>{actionLabel}</Text>
            <Ionicons name="arrow-forward" size={14} color={color} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** A bottom sheet for picking or adjusting one setting, so choices don't crowd the main list. */
export function OptionSheet({
  visible,
  title,
  description,
  onClose,
  children,
  colors,
}: {
  visible: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  colors: ThemeColors;
}) {
  const styles = useStyles(colors);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheetRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Done">
              <Text style={styles.sheetDone}>Done</Text>
            </Pressable>
          </View>
          {description ? <Text style={styles.sheetDescription}>{description}</Text> : null}
          <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** A single-choice row inside an OptionSheet. */
export function SheetOption({
  label,
  description,
  selected,
  onPress,
  colors,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  colors: ThemeColors;
}) {
  const styles = useStyles(colors);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.rowPressed]}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={description ? `${label}. ${description}` : label}
    >
      <View style={styles.copy}>
        <Text style={styles.optionLabel}>{label}</Text>
        {description ? <Text style={styles.subtitle}>{description}</Text> : null}
      </View>
      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={selected ? colors.accent : colors.textMuted}
      />
    </Pressable>
  );
}

function useStyles(colors: ThemeColors) {
  return useMemo(
    () =>
      StyleSheet.create({
        section: { marginTop: 22 },
        sectionTitle: {
          color: colors.textMuted,
          fontSize: 12,
          fontWeight: '700',
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          marginBottom: 8,
          marginLeft: 4,
        },
        card: {
          backgroundColor: colors.surface,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 62 },
        footnote: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 8, marginHorizontal: 4 },
        row: {
          minHeight: 60,
          paddingHorizontal: 14,
          paddingVertical: 11,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        },
        rowPressed: { backgroundColor: colors.surfaceAlt },
        rowDisabled: { opacity: 0.5 },
        icon: {
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: colors.surfaceAlt,
          alignItems: 'center',
          justifyContent: 'center',
        },
        iconDanger: { backgroundColor: colors.dangerSoft },
        copy: { flex: 1 },
        title: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
        titleDanger: { color: colors.danger },
        subtitle: { color: colors.textMuted, fontSize: 12.5, lineHeight: 17, marginTop: 2 },
        value: { fontSize: 14, fontWeight: '600', maxWidth: 140 },
        alert: { flexDirection: 'row', gap: 10, margin: 12, marginTop: 4, padding: 12, borderRadius: 12 },
        alertText: { fontSize: 12.5, lineHeight: 18 },
        alertAction: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, alignSelf: 'flex-start' },
        alertActionText: { fontSize: 13, fontWeight: '700' },
        sheetRoot: { flex: 1, justifyContent: 'flex-end' },
        backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
        sheet: {
          maxHeight: '85%',
          backgroundColor: colors.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          paddingTop: 8,
        },
        handle: {
          alignSelf: 'center',
          width: 40,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.border,
          marginBottom: 8,
        },
        sheetHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingVertical: 8,
        },
        sheetTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
        sheetDone: { color: colors.link, fontSize: 15, fontWeight: '700' },
        sheetDescription: {
          color: colors.textSecondary,
          fontSize: 13,
          lineHeight: 19,
          paddingHorizontal: 20,
          marginBottom: 6,
        },
        sheetContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 8 },
        option: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        optionSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
        optionLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
      }),
    [colors],
  );
}
