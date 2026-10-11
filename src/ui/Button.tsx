import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from './theme';

export function Button({ label, onPress, primary, small, active }: {
  label: string; onPress: () => void; primary?: boolean; small?: boolean; active?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        small && styles.small,
        primary && styles.primary,
        active && styles.active,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.text, small && styles.smallText, (primary || active) && styles.primaryText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.bg, minHeight: 36, justifyContent: 'center',
  },
  small: { paddingHorizontal: 10, paddingVertical: 5, minHeight: 30 },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  active: { backgroundColor: colors.accent, borderColor: colors.accent },
  text: { color: colors.text, fontSize: 14, fontWeight: '500' },
  smallText: { fontSize: 13 },
  primaryText: { color: '#FFFFFF' },
});
