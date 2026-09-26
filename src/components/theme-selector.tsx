import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ACCENTS, type AccentId, type ThemeColors, type ThemeMode } from '@/src/theme/palette';

const MODES: { id: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'light', label: 'Light', icon: 'sunny-outline' },
  { id: 'dark', label: 'Dark', icon: 'moon-outline' },
  { id: 'system', label: 'System', icon: 'phone-portrait-outline' },
];

export function ThemeModeSelector({
  value,
  onChange,
  colors,
}: {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
  colors: ThemeColors;
}) {
  return (
    <View accessibilityRole="radiogroup" style={[styles.modeRow, { backgroundColor: colors.surfaceAlt }]}>
      {MODES.map((mode) => {
        const selected = value === mode.id;
        return (
          <Pressable
            key={mode.id}
            onPress={() => onChange(mode.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${mode.label} theme`}
            style={[
              styles.modeButton,
              selected && {
                backgroundColor: colors.surface,
                shadowColor: colors.scheme === 'dark' ? '#000' : '#1E2D43',
              },
            ]}
          >
            <Ionicons name={mode.icon} size={17} color={selected ? colors.accent : colors.textMuted} />
            <Text style={[styles.modeLabel, { color: selected ? colors.textPrimary : colors.textMuted }]}>
              {mode.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function AccentSwatchPicker({
  value,
  onChange,
  colors,
}: {
  value: AccentId;
  onChange: (accent: AccentId) => void;
  colors: ThemeColors;
}) {
  return (
    <View accessibilityRole="radiogroup" style={styles.swatchRow}>
      {ACCENTS.map((accent) => {
        const selected = value === accent.id;
        return (
          <Pressable
            key={accent.id}
            onPress={() => onChange(accent.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${accent.label} accent color`}
            style={styles.swatchItem}
          >
            <View
              style={[
                styles.swatchCircle,
                { backgroundColor: accent.value, borderColor: selected ? colors.textPrimary : 'transparent' },
              ]}
            >
              {selected ? <Ionicons name="checkmark" size={18} color="#FFF" /> : null}
            </View>
            <Text style={[styles.swatchLabel, { color: colors.textMuted }]}>{accent.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  modeRow: { flexDirection: 'row', borderRadius: 12, padding: 4, gap: 4 },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 9,
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  modeLabel: { fontWeight: '700', fontSize: 13 },
  swatchRow: { flexDirection: 'row', justifyContent: 'space-between' },
  swatchItem: { alignItems: 'center', gap: 6 },
  swatchCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchLabel: { fontSize: 11, fontWeight: '600' },
});
