import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SummaryLine } from '../hl7';
import { colors } from './theme';

/** The message in plain English; tap a line to jump to its segment. */
export function SummaryView({ lines, onSelect }: { lines: SummaryLine[]; onSelect: (path: string) => void }) {
  return (
    <View style={styles.box}>
      {lines.map((l, i) => {
        const seg = l.segment;
        const path = seg ? (seg.occurrence > 1 ? `${seg.name}[${seg.occurrence}]` : seg.name) : undefined;
        return (
          <Pressable key={i} disabled={!path} onPress={() => path && onSelect(path)}
            style={({ pressed }) => [styles.line, l.indent && styles.indent, pressed && { opacity: 0.6 }]}>
            <Text style={[styles.text, i === 0 && styles.title, l.flagged && styles.flagged]}>{l.text}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: 14, gap: 2 },
  line: { paddingVertical: 4 },
  indent: { paddingLeft: 18 },
  text: { fontSize: 15, lineHeight: 22, color: colors.text },
  title: { fontWeight: '700', fontSize: 16 },
  flagged: { color: colors.error, fontWeight: '600' },
});
