import { Platform, StyleSheet } from 'react-native';

export const colors = {
  bg: '#FFFFFF',
  panel: '#F8FAFC',
  line: '#E2E8F0',
  text: '#0F172A',
  muted: '#64748B',
  faint: '#94A3B8',
  accent: '#0F766E',
  accentSoft: '#CCFBF1',
  select: '#FEF3C7',
  error: '#B91C1C',
  errorSoft: '#FEE2E2',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  info: '#1D4ED8',
  infoSoft: '#DBEAFE',
  // Raw message colouring, one per delimiter level
  segment: '#0F766E',
  fieldSep: '#2563EB',
  compSep: '#EA580C',
  repSep: '#9333EA',
  subSep: '#16A34A',
};

export const sans = Platform.select({ web: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', default: undefined });

export const mono = Platform.select({ android: 'monospace', web: 'Consolas, Menlo, monospace', default: 'Menlo' });

export const severityColor = { error: colors.error, warning: colors.warning, info: colors.info } as const;
export const severitySoft = { error: colors.errorSoft, warning: colors.warningSoft, info: colors.infoSoft } as const;

export const common = StyleSheet.create({
  card: { backgroundColor: colors.bg, borderColor: colors.line, borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  label: { fontSize: 12, color: colors.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  mono: { fontFamily: mono },
});
