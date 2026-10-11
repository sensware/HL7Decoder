import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DecodedNode } from '../hl7';
import { colors, mono, sans } from './theme';

/** Every segment as a collapsible table of fields, components and subcomponents. */
export function FieldsView({ segments, selectedPath, onSelect }: {
  segments: DecodedNode[]; selectedPath?: string; onSelect: (path: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const selectedSegment = selectedPath?.split('-')[0];

  const row = (n: DecodedNode, depth: number): React.ReactNode => {
    const selected = n.path === selectedPath;
    return (
      <View key={n.path}>
        <Pressable
          onPress={() => onSelect(n.path)}
          style={({ pressed }) => [styles.row, selected && styles.selected, pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.path, { paddingLeft: depth * 12 }]} numberOfLines={1}>{n.path}</Text>
          <View style={styles.main}>
            <Text style={[styles.name, depth === 0 && styles.fieldName, !n.present && styles.absent]} numberOfLines={1}>
              {n.name}
              {n.dataType ? <Text style={styles.type}>  {n.dataType}{n.required ? ' · req' : ''}</Text> : null}
            </Text>
            {n.raw ? (
              <Text style={styles.value} numberOfLines={3}>
                {n.value}
                {n.meaning && n.meaning !== n.value ? <Text style={styles.meaning}>{'  '}{n.meaning}</Text> : null}
              </Text>
            ) : null}
          </View>
        </Pressable>
        {visibleChildren(n).map((c) => row(c, depth + 1))}
      </View>
    );
  };

  return (
    <View>
      {segments.map((seg) => {
        // A selected field always shows its segment, even if it was collapsed.
        const isCollapsed = collapsed[seg.path] && selectedSegment !== seg.path;
        return (
          <View key={seg.path} style={styles.segment}>
            <Pressable
              onPress={() => setCollapsed((c) => ({ ...c, [seg.path]: !isCollapsed }))}
              onLongPress={() => onSelect(seg.path)}
              style={styles.segHeader}
            >
              <Text style={styles.chevron}>{isCollapsed ? '▸' : '▾'}</Text>
              <Text style={styles.segId}>{seg.path}</Text>
              <Text style={styles.segName} numberOfLines={1}>{seg.name}</Text>
              <Text style={styles.count}>{seg.children.filter((c) => c.raw).length} fields</Text>
            </Pressable>
            {!isCollapsed && seg.children.map((f) => row(f, 0))}
          </View>
        );
      })}
    </View>
  );
}

/** Skip a lone component that just repeats its field (MSH-3 "EPICADT" → MSH-3.1 "EPICADT"). */
function visibleChildren(n: DecodedNode): DecodedNode[] {
  const present = n.children.filter((c) => c.present);
  if (n.children.length === 1 && present.length === 1 && present[0].raw === n.raw && present[0].children.length === 0) return [];
  return n.children;
}

const styles = StyleSheet.create({
  segment: { borderBottomWidth: 1, borderBottomColor: colors.line },
  segHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.panel },
  chevron: { color: colors.muted, width: 12 },
  segId: { fontFamily: mono, fontWeight: '700', color: colors.segment, fontSize: 15 },
  segName: { flex: 1, fontWeight: '600', color: colors.text },
  count: { color: colors.muted, fontSize: 12 },
  row: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.line, gap: 10 },
  selected: { backgroundColor: colors.select },
  path: { fontFamily: mono, fontSize: 12, color: colors.accent, width: 112, paddingTop: 2 },
  main: { flex: 1, gap: 2 },
  name: { color: colors.text, fontSize: 13 },
  fieldName: { fontWeight: '600' },
  absent: { color: colors.faint },
  type: { color: colors.faint, fontSize: 11, fontWeight: '400' },
  value: { fontFamily: mono, fontSize: 13, color: colors.text },
  meaning: { fontFamily: sans, color: colors.accent },
});
