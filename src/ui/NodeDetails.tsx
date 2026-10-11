import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DecodedNode, tableName } from '../hl7';
import { colors, common, mono } from './theme';

/** The selected segment/field/component: what it is, what it holds and what that means. */
export function NodeDetails({ node, onSelect }: { node?: DecodedNode; onSelect: (path: string) => void }) {
  if (!node) {
    return (
      <View style={styles.box}>
        <Text style={styles.hint}>Tap any segment or field in the message to see what it means.</Text>
      </View>
    );
  }
  const flags = [node.required && 'Required', node.repeating && 'Repeating', !node.present && 'Not present'].filter(Boolean).join(' · ');
  const table = node.tableId ? `Table ${node.tableId}${tableName(node.tableId) ? ` (${tableName(node.tableId)})` : ''}` : '';
  return (
    <View style={styles.box}>
      <View style={styles.titleRow}>
        <Text style={styles.path}>{node.path}</Text>
        <Text style={styles.name}>{node.name}</Text>
      </View>
      <Text style={styles.meta}>{[node.dataType && `Type ${node.dataType}`, table, flags].filter(Boolean).join('  ·  ')}</Text>
      {node.kind !== 'segment' && (
        <Text style={styles.value} selectable>{node.value || '(empty)'}</Text>
      )}
      {node.meaning && node.meaning !== node.value ? <Text style={styles.meaning}>{node.meaning}</Text> : null}
      {node.children.length > 0 && node.kind !== 'segment' && (
        <View style={styles.children}>
          {node.children.map((c) => (
            <Pressable key={c.path} onPress={() => onSelect(c.path)} style={({ pressed }) => [styles.child, pressed && { opacity: 0.6 }]}>
              <Text style={styles.childPath}>{c.path.slice(c.path.lastIndexOf(c.kind === 'repetition' ? '[' : '.'))}</Text>
              <Text style={styles.childName} numberOfLines={1}>{c.name}</Text>
              <Text style={[styles.childValue, !c.present && { color: colors.faint }]} numberOfLines={1}>
                {c.value || '—'}{c.meaning && c.meaning !== c.value ? `  (${c.meaning})` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: 14, gap: 4, backgroundColor: colors.panel },
  hint: { color: colors.muted },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  path: { fontFamily: mono, fontWeight: '700', color: colors.accent, fontSize: 16 },
  name: { fontWeight: '600', fontSize: 16, color: colors.text, flexShrink: 1 },
  meta: { color: colors.muted, fontSize: 12 },
  value: { ...common.mono, fontSize: 14, color: colors.text, marginTop: 4 },
  meaning: { color: colors.accent, fontSize: 14 },
  children: { marginTop: 8, borderTopWidth: 1, borderTopColor: colors.line },
  child: { flexDirection: 'row', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line, alignItems: 'center' },
  childPath: { fontFamily: mono, color: colors.accent, width: 44 },
  childName: { width: 150, color: colors.text, fontSize: 13 },
  childValue: { flex: 1, fontFamily: mono, fontSize: 13, color: colors.text },
});
