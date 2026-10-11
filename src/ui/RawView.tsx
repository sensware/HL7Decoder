import { memo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Message, Segment } from '../hl7';
import { colors, mono } from './theme';

/**
 * The message as written, coloured by delimiter like HL7 Soup's editor.
 * Tapping a segment ID selects the segment; tapping a field selects that field.
 */
export const RawView = memo(function RawView({ message, selectedPath, onSelect }: {
  message: Message; selectedPath?: string; onSelect: (path: string) => void;
}) {
  const d = message.delimiters;
  const selField = selectedPath?.match(/^([A-Z0-9]{3}(?:\[\d+\])?)(?:-(\d+))?/i);

  const renderSegment = (seg: Segment) => {
    const segPath = seg.occurrence > 1 ? `${seg.name}[${seg.occurrence}]` : seg.name;
    const segSelected = selField?.[1]?.toUpperCase() === segPath;
    const header = seg.name === 'MSH' || seg.name === 'FHS' || seg.name === 'BHS';
    return (
      <Text key={`${seg.start}`} style={styles.line} selectable>
        <Text style={[styles.segName, segSelected && !selField?.[2] && styles.selected]} onPress={() => onSelect(segPath)}>
          {seg.name}
        </Text>
        {seg.fields.map((f) => {
          const selected = segSelected && Number(selField?.[2]) === f.number;
          // MSH-1 is the separator itself, so it is drawn once as the field.
          const sep = header && f.number === 1 ? null : <Text style={styles.fieldSep}>{d.field}</Text>;
          return (
            <Text key={f.number}>
              {sep}
              <Text onPress={() => onSelect(`${segPath}-${f.number}`)} style={selected ? styles.selected : undefined}>
                {header && f.number <= 2 ? <Text style={styles.fieldSep}>{f.raw}</Text> : colourise(f.raw, d)}
              </Text>
            </Text>
          );
        })}
      </Text>
    );
  };

  return (
    <ScrollView horizontal contentContainerStyle={styles.content}>
      <View>{message.segments.map(renderSegment)}</View>
    </ScrollView>
  );
});

function colourise(raw: string, d: Message['delimiters']) {
  if (!raw) return null;
  const parts: React.ReactNode[] = [];
  let buf = '';
  raw.split('').forEach((ch, i) => {
    const style = ch === d.component ? styles.compSep : ch === d.repetition ? styles.repSep : ch === d.subComponent ? styles.subSep : null;
    if (style) {
      if (buf) parts.push(buf);
      buf = '';
      parts.push(<Text key={i} style={style}>{ch}</Text>);
    } else buf += ch;
  });
  if (buf) parts.push(buf);
  return parts;
}

const styles = StyleSheet.create({
  content: { padding: 12 },
  line: { fontFamily: mono, fontSize: 13, lineHeight: 21, color: colors.text },
  segName: { color: colors.segment, fontWeight: '700' },
  fieldSep: { color: colors.fieldSep, fontWeight: '700' },
  compSep: { color: colors.compSep, fontWeight: '700' },
  repSep: { color: colors.repSep, fontWeight: '700' },
  subSep: { color: colors.subSep, fontWeight: '700' },
  selected: { backgroundColor: colors.select },
});
