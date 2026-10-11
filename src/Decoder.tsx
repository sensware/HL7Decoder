import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import {
  decodeMessage, findNode, formatPath, parseMessage, parsePath, splitMessages, summarize, toJson, validate, VERSIONS,
} from './hl7';
import { pickTextFiles, readClipboard, Screen, writeClipboard } from './platform';
import { SAMPLES } from './samples';
import { Button } from './ui/Button';
import { FieldsView } from './ui/FieldsView';
import { IssuesView } from './ui/IssuesView';
import { NodeDetails } from './ui/NodeDetails';
import { RawView } from './ui/RawView';
import { SummaryView } from './ui/SummaryView';
import { colors, common, mono } from './ui/theme';

type Tab = 'fields' | 'summary' | 'issues' | 'json';

/**
 * The single screen. State lives here: the list of message texts, which one is open, the selected
 * path, the active tab and the decode options. Every message is decoded on change (they are small)
 * so the list can show a status dot for each.
 *
 * Layout: at 900px and wider, three columns (message list | message + details | tabs);
 * narrower screens stack them in one scrolling column with the list as horizontal chips.
 */
export function Decoder() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  const [messages, setMessages] = useState<string[]>(() => SAMPLES.map((s) => s.text));
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab>('fields');
  const [version, setVersion] = useState<string>('auto');
  const [showEmpty, setShowEmpty] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | undefined>('PID-5');
  const [pathInput, setPathInput] = useState('');
  const [notice, setNotice] = useState('');
  const tabScroll = useRef<ScrollView>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The list length as of the latest render. Paste and Open file add messages after an await (the macOS
  // Open panel is not modal, so the list can change meanwhile), when the `messages` they closed over is stale.
  const messageCount = useRef(messages.length);
  messageCount.current = messages.length;

  const text = messages[index] ?? '';
  const options = { version: version === 'auto' ? undefined : version, includeEmpty: showEmpty };

  // Every message is decoded so the list can show which ones have problems.
  const all = useMemo(() => messages.map((t) => {
    const decoded = decodeMessage(parseMessage(t), options);
    return { decoded, issues: validate(decoded) };
  }), [messages, version, showEmpty]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = all[index];
  const decoded = current?.decoded;
  const summary = useMemo(() => (decoded ? summarize(decoded.message) : []), [decoded]);
  const json = useMemo(() => (decoded && tab === 'json' ? toJson(decoded) : ''), [decoded, tab]);
  const selectedNode = decoded && selectedPath ? findNode(decoded, selectedPath) : undefined;

  const flash = (msg: string) => {
    setNotice(msg);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 3500);
  };

  const addMessages = (raw: string, source: string) => {
    const found = splitMessages(raw);
    if (found.length === 0) {
      flash(`No HL7 messages found in ${source} (expected text starting with MSH).`);
      return;
    }
    setMessages((m) => [...m, ...found]);
    setIndex(messageCount.current);
    setEditing(false);
    setSelectedPath(undefined);
    flash(`Added ${found.length} message${found.length > 1 ? 's' : ''} from ${source}.`);
  };

  /** Runs a clipboard or file action, showing its error as a notice instead of failing silently. */
  const attempt = (action: () => Promise<void>) => () => {
    action().catch((e: unknown) => flash(e instanceof Error ? e.message : String(e)));
  };

  const paste = attempt(async () => {
    addMessages(await readClipboard(), 'the clipboard');
  });

  const openFile = attempt(async () => {
    const files = await pickTextFiles();
    if (!files?.length) return;
    addMessages(files.map((f) => f.text).join('\n'), files.length === 1 ? files[0].name : `${files.length} files`);
  });

  const copyJson = attempt(async () => {
    await writeClipboard(json);
    flash('JSON copied.');
  });

  const newMessage = () => {
    setMessages((m) => [...m, `MSH|^~\\&|||||||ADT^A01|1|P|2.5.1\nPID|1||`]);
    setIndex(messages.length);
    setEditing(true);
  };

  const remove = () => {
    if (messages.length === 0) return;
    setMessages((m) => m.filter((_, i) => i !== index));
    setIndex((i) => Math.max(0, Math.min(i, messages.length - 2)));
    setSelectedPath(undefined);
  };

  const goToPath = () => {
    const p = parsePath(pathInput);
    if (!p) {
      flash(`"${pathInput}" is not a path. Try PID-5.1 or OBX[2]-5.`);
      return;
    }
    const path = formatPath(p);
    setSelectedPath(path);
    if (decoded && !findNode(decoded, path)) flash(`${path} has no value in this message.`);
  };

  const select = (path: string) => {
    setSelectedPath(path);
    if (editing) setEditing(false);
  };

  const toolbar = (
    <View style={styles.toolbar}>
      <View style={styles.brand}>
        <View style={styles.logo}><Text style={styles.logoText}>H7</Text></View>
        <Text style={styles.title}>HL7 Decoder</Text>
      </View>
      <View style={styles.actions}>
        <Button label="Paste" onPress={paste} primary />
        <Button label="Open file" onPress={openFile} />
        <Button label="New" onPress={newMessage} />
        <Button label="Samples" onPress={() => { setMessages(SAMPLES.map((s) => s.text)); setIndex(0); setSelectedPath('PID-5'); }} />
      </View>
    </View>
  );

  const messageList = (
    <ScrollView horizontal={!wide} style={wide ? styles.listWide : styles.listNarrow}
      contentContainerStyle={wide ? undefined : styles.listNarrowContent} showsHorizontalScrollIndicator={false}>
      {all.map(({ decoded: d, issues }, i) => {
        const errors = issues.filter((x) => x.severity === 'error').length;
        const warnings = issues.filter((x) => x.severity === 'warning').length;
        const dot = errors ? colors.error : warnings ? colors.warning : colors.subSep;
        return (
          <Pressable key={i} onPress={() => { setIndex(i); setEditing(false); }}
            style={[styles.msgItem, wide ? styles.msgItemWide : styles.msgItemNarrow, i === index && styles.msgItemActive]}>
            <View style={[styles.dot, { backgroundColor: dot }]} />
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.msgType} numberOfLines={1}>{i + 1}. {d.message.messageType || 'No MSH'}</Text>
              <Text style={styles.msgSub} numberOfLines={1}>{d.title}</Text>
              {wide && <Text style={styles.msgSub} numberOfLines={1}>
                {errors ? `${errors} error${errors > 1 ? 's' : ''}` : warnings ? `${warnings} warning${warnings > 1 ? 's' : ''}` : 'Valid'}
                {d.message.controlId ? ` · ${d.message.controlId}` : ''}
              </Text>}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const messageCard = (
    <View style={common.card}>
      <View style={styles.cardHeader}>
        <Text style={common.label}>Message {messages.length ? index + 1 : 0} of {messages.length}</Text>
        <View style={styles.row}>
          <Button small label={editing ? 'Done' : 'Edit'} onPress={() => setEditing((e) => !e)} active={editing} />
          <Button small label="Remove" onPress={remove} />
        </View>
      </View>
      {editing ? (
        <TextInput
          style={styles.editor}
          multiline
          value={text}
          onChangeText={(t) => setMessages((m) => m.map((x, i) => (i === index ? t : x)))}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          placeholder="Paste or type an HL7 v2 message, one segment per line"
          textAlignVertical="top"
        />
      ) : decoded && decoded.message.segments.length > 0 ? (
        <RawView message={decoded.message} selectedPath={selectedPath} onSelect={select} />
      ) : (
        <Text style={styles.empty}>No message yet. Paste one, open a file, or tap New.</Text>
      )}
      <NodeDetails node={selectedNode} onSelect={select} />
    </View>
  );

  const issueCount = current?.issues.filter((i) => i.severity !== 'info').length ?? 0;
  const tabs = (
    <View style={[common.card, wide && { flex: 1 }]}>
      <View style={styles.tabBar}>
        {([['fields', 'Fields'], ['summary', 'Summary'], ['issues', `Validation${issueCount ? ` (${issueCount})` : ''}`], ['json', 'JSON']] as Array<[Tab, string]>)
          .map(([key, label]) => (
            <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabActive]}>
              <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
            </Pressable>
          ))}
      </View>
      <View style={styles.tabTools}>
        <TextInput style={styles.pathInput} value={pathInput} onChangeText={setPathInput} onSubmitEditing={goToPath}
          placeholder="Go to path, e.g. PID-5.1" autoCapitalize="characters" autoCorrect={false} returnKeyType="go" />
        <Button small label="Go" onPress={goToPath} />
        <Button small label={showEmpty ? 'Hide empty' : 'Show empty'} onPress={() => setShowEmpty((s) => !s)} active={showEmpty} />
        <VersionPicker version={version} detected={decoded?.schema.version} onChange={setVersion} />
        {tab === 'json' && <Button small label="Copy JSON" onPress={copyJson} />}
      </View>
      {decoded ? (
        <ScrollView ref={tabScroll} style={wide ? { flex: 1 } : undefined} nestedScrollEnabled>
          {tab === 'fields' && (
            <FieldsView segments={decoded.segments} selectedPath={selectedPath} onSelect={select}
              // On phones the whole page scrolls instead, so only scroll the tab in the wide layout.
              scrollTo={wide ? (y) => tabScroll.current?.scrollTo({ y, animated: true }) : undefined} />
          )}
          {tab === 'summary' && <SummaryView lines={summary} onSelect={select} />}
          {tab === 'issues' && <IssuesView issues={current.issues} onSelect={select} />}
          {tab === 'json' && <ScrollView horizontal><Text selectable style={styles.json}>{json}</Text></ScrollView>}
        </ScrollView>
      ) : null}
    </View>
  );

  return (
    <Screen style={styles.screen}>
      {toolbar}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {wide ? (
        <View style={styles.wide}>
          <View style={styles.sidebar}>
            <Text style={[common.label, { marginBottom: 6 }]}>Messages</Text>
            {messageList}
          </View>
          <View style={styles.leftCol}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 12 }}>{messageCard}</ScrollView>
          </View>
          <View style={styles.rightCol}>{tabs}</View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.narrow}>
          {messageList}
          {messageCard}
          {tabs}
        </ScrollView>
      )}
    </Screen>
  );
}

/** Drop-down for forcing a schema version; "Auto" uses MSH-12. */
function VersionPicker({ version, detected, onChange }: { version: string; detected?: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Button small label={version === 'auto' ? `v${detected ?? '?'} (auto)` : `v${version}`} onPress={() => setOpen((o) => !o)} />
      {open && (
        <View style={styles.menu}>
          {['auto', ...VERSIONS].map((v) => (
            <Pressable key={v} onPress={() => { onChange(v); setOpen(false); }} style={styles.menuItem}>
              <Text style={[styles.menuText, v === version && { color: colors.accent, fontWeight: '700' }]}>
                {v === 'auto' ? 'Auto (MSH-12)' : `v${v}`}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.panel },
  toolbar: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 30, height: 30, borderRadius: 7, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  notice: { backgroundColor: colors.accentSoft, color: colors.accent, paddingHorizontal: 16, paddingVertical: 8 },
  wide: { flex: 1, flexDirection: 'row', gap: 12, padding: 12 },
  sidebar: { width: 230 },
  leftCol: { flex: 1, minWidth: 0 },
  rightCol: { flex: 1, minWidth: 0 },
  narrow: { padding: 12, gap: 12 },
  listWide: { flex: 1 },
  listNarrow: { flexGrow: 0 },
  listNarrowContent: { gap: 8 },
  msgItem: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  msgItemWide: { marginBottom: 8 },
  msgItemNarrow: { width: 210 },
  msgItemActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 5 },
  msgType: { fontWeight: '700', color: colors.text },
  msgSub: { color: colors.muted, fontSize: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  row: { flexDirection: 'row', gap: 6 },
  editor: { fontFamily: mono, fontSize: 13, minHeight: 220, padding: 12, color: colors.text, backgroundColor: colors.bg },
  empty: { padding: 16, color: colors.muted },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line },
  tab: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.accent },
  tabText: { color: colors.muted, fontWeight: '600' },
  tabTextActive: { color: colors.accent },
  tabTools: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.line, alignItems: 'center', zIndex: 10 },
  pathInput: { fontFamily: mono, borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, minWidth: 170, flexGrow: 1, maxWidth: 240, color: colors.text },
  json: { fontFamily: mono, fontSize: 12, padding: 12, color: colors.text },
  menu: {
    position: 'absolute', top: 34, left: 0, zIndex: 20, elevation: 6, backgroundColor: colors.bg, borderWidth: 1,
    borderColor: colors.line, borderRadius: 8, paddingVertical: 4, minWidth: 140,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  menuItem: { paddingHorizontal: 12, paddingVertical: 7 },
  menuText: { color: colors.text },
});
