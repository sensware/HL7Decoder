import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ValidationIssue } from '../hl7';
import { colors, mono, severityColor, severitySoft } from './theme';

/** Validation results as a list; tapping one selects its path in the message. */
export function IssuesView({ issues, onSelect }: { issues: ValidationIssue[]; onSelect: (path: string) => void }) {
  if (issues.length === 0) return <Text style={styles.ok}>No problems found.</Text>;
  return (
    <View>
      {issues.map((i, k) => (
        <Pressable key={k} onPress={() => i.path && onSelect(i.path)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
          <Text style={[styles.badge, { color: severityColor[i.severity], backgroundColor: severitySoft[i.severity] }]}>
            {i.severity}
          </Text>
          <Text style={styles.path}>{i.path}</Text>
          <Text style={styles.message}>{i.message}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  ok: { padding: 16, color: colors.accent, fontSize: 15 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.line },
  badge: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden', minWidth: 62, textAlign: 'center' },
  path: { fontFamily: mono, color: colors.accent, width: 84, fontSize: 13 },
  message: { flex: 1, color: colors.text, fontSize: 14 },
});
