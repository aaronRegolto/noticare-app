/**
 * NotiCare design tokens.
 *
 * Accent color is a branding choice the user can customize in Settings. It
 * changes chrome such as links, switches, the active tab, and chart bars.
 * It never changes threat-level colors (Dangerous/Suspicious/Safe): those
 * stay fixed red/amber/green everywhere so a warning never looks decorative.
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type AccentId = 'emerald' | 'ocean' | 'sunset' | 'violet';

export type AccentDefinition = {
  id: AccentId;
  label: string;
  value: string;
  soft: { light: string; dark: string };
};

export const ACCENTS: readonly AccentDefinition[] = [
  { id: 'emerald', label: 'Emerald', value: '#00B87C', soft: { light: '#E8FAF2', dark: '#0F3A2C' } },
  { id: 'ocean', label: 'Ocean', value: '#0080C7', soft: { light: '#E6F4FC', dark: '#0E3350' } },
  { id: 'sunset', label: 'Sunset', value: '#E8722C', soft: { light: '#FDECDF', dark: '#4A2A12' } },
  { id: 'violet', label: 'Violet', value: '#7C5CFC', soft: { light: '#EFEAFE', dark: '#2E2350' } },
];

export const DEFAULT_ACCENT: AccentId = 'emerald';

export function getAccent(id: AccentId): AccentDefinition {
  return ACCENTS.find((accent) => accent.id === id) ?? ACCENTS[0];
}

/** Fixed threat-level semantics. Never customizable — safety-critical meaning. */
export const SEMANTIC = {
  danger: '#D92D20',
  dangerSoft: { light: '#FFF0F0', dark: '#3A1717' },
  warning: '#C77700',
  warningSoft: { light: '#FFF8E9', dark: '#3A2C10' },
  success: '#14804A',
  successSoft: { light: '#ECFCF5', dark: '#113626' },
};

export type ThemeColors = {
  scheme: 'light' | 'dark';
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  headerBg: string;
  headerSurface: string;
  headerText: string;
  headerTextMuted: string;
  accent: string;
  accentSoft: string;
  accentContrast: string;
  link: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  success: string;
  successSoft: string;
  overlay: string;
};

const NEUTRAL = {
  light: {
    background: '#F6F8FC',
    surface: '#FFFFFF',
    surfaceAlt: '#F0F4F8',
    border: '#E3EAF2',
    textPrimary: '#1E2D43',
    textSecondary: '#55708F',
    textMuted: '#7890AD',
    headerBg: '#1E2D43',
    headerSurface: '#273850',
    headerText: '#FFFFFF',
    headerTextMuted: '#CBD5E3',
    link: '#006DAB',
    overlay: 'rgba(10, 16, 28, 0.72)',
  },
  dark: {
    // Dark-mode elevation goes background < surfaceAlt < surface (each step lighter),
    // matching Material's convention so "selected"/elevated chips read as raised, not sunken.
    background: '#0E1420',
    surface: '#1C2738',
    surfaceAlt: '#141C2A',
    border: '#2E3A4E',
    textPrimary: '#EAF0F8',
    textSecondary: '#A9B8CC',
    textMuted: '#7C8CA3',
    headerBg: '#0B111B',
    headerSurface: '#161F2E',
    headerText: '#FFFFFF',
    headerTextMuted: '#94A4BC',
    link: '#5FBBEF',
    overlay: 'rgba(2, 5, 12, 0.8)',
  },
};

export function buildTheme(scheme: 'light' | 'dark', accentId: AccentId): ThemeColors {
  const neutral = NEUTRAL[scheme];
  const accent = getAccent(accentId);
  return {
    scheme,
    ...neutral,
    accent: accent.value,
    accentSoft: accent.soft[scheme],
    accentContrast: '#FFFFFF',
    danger: SEMANTIC.danger,
    dangerSoft: SEMANTIC.dangerSoft[scheme],
    warning: SEMANTIC.warning,
    warningSoft: SEMANTIC.warningSoft[scheme],
    success: SEMANTIC.success,
    successSoft: SEMANTIC.successSoft[scheme],
  };
}
