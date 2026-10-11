import type { Component, Message, Repetition, Segment } from './model';
import { segmentValue } from './model';
import { compose } from './readable';
import { formatHl7Date } from './datetime';
import { lookupTable, Schema, table } from './schema';
import type { FieldDef } from './schema';
import { segmentName } from './segmentNames';

export type NodeKind = 'segment' | 'field' | 'repetition' | 'component' | 'subcomponent';

/** One labelled piece of a decoded message: what it is called, what it holds, and what that means. */
export interface DecodedNode {
  kind: NodeKind;
  /** Address such as "PID-5.1" or "OBX[2]-5". */
  path: string;
  /** Field/component number (or repeat number) within its parent. */
  number: number;
  /** The definition's name, e.g. "Patient Name". */
  name: string;
  dataType: string;
  tableId?: string;
  /** Decoded text (escape sequences resolved). */
  value: string;
  /** Text exactly as it appears in the message. */
  raw: string;
  /** Human-friendly meaning: a table description, a formatted date, a readable name ... */
  meaning?: string;
  required: boolean;
  repeating: boolean;
  /** False for defined slots that are absent from the message (shown when empty fields are included). */
  present: boolean;
  start: number;
  length: number;
  children: DecodedNode[];
}

export interface DecodeOptions {
  /** Force a schema version instead of reading MSH-12. */
  version?: string;
  /** Also emit nodes for defined fields and components that are absent. */
  includeEmpty?: boolean;
}

export interface DecodedMessage {
  message: Message;
  schema: Schema;
  /** e.g. "ADT message: Admit/visit notification". */
  title: string;
  segments: DecodedNode[];
}

const CODED = new Set(['CE', 'CWE', 'CNE', 'CF', 'ID', 'IS']);

/**
 * Describes a trigger event from HL7 table 0003, without the "ADT/ACK - " prefix many entries carry.
 * @example eventDescription('A01') // 'Admit/visit notification'
 */
export function eventDescription(trigger: string): string {
  let evt = lookupTable('0003', trigger) ?? trigger;
  const dash = evt.indexOf(' - ');
  if (dash > 0 && dash < 12) evt = evt.slice(dash + 3);
  return evt.trim();
}

/**
 * A one-line title for a message from MSH-9, using tables 0076 (message type) and 0003 (event).
 * @example describeMessageType(parseMessage(adt)) // 'ADT message: Admit/visit notification'
 */
export function describeMessageType(msg: Message): string {
  const code = lookupTable('0076', msg.messageCode) ?? msg.messageCode;
  if (!code) return 'HL7 message';
  if (msg.messageCode === 'ACK' || msg.messageCode === 'MCF') return code;
  const evt = eventDescription(msg.triggerEvent);
  return !evt || evt.toLowerCase() === code.toLowerCase() ? code : `${code}: ${evt}`;
}

/**
 * Labels every part of a parsed message using the HL7 definitions for its version.
 *
 * For each segment, field, repetition, component and subcomponent this adds the definition's name,
 * datatype, table and required/repeating flags, plus a human-friendly `meaning`: a code-table
 * description, a formatted date, or a readable name/address/phone. `OBX-5` (datatype "varies")
 * takes its datatype from `OBX-2`.
 *
 * @param message Result of {@link parseMessage}.
 * @param options `version` forces a schema instead of MSH-12; `includeEmpty` also returns defined but
 *   absent fields and components (with `present: false`), as the "Show empty" toggle does.
 * @returns The labelled tree, the schema used and a title.
 */
export function decodeMessage(message: Message, options: DecodeOptions = {}): DecodedMessage {
  const schema = Schema.for(options.version || message.version);
  const includeEmpty = !!options.includeEmpty;

  const describeValue = (value: string, type: string, tableId?: string, hasParts = false): string | undefined => {
    if (!value || hasParts) return undefined;
    if (value === '""') return 'Explicit null (delete the stored value)';
    const looked = lookupTable(tableId, value);
    if (looked) return tableId === '0354' ? `Structure shared by events ${looked}` : looked;
    if (type === 'DT' || type === 'DTM' || type === 'TS' || type === 'TM')
      return formatHl7Date(value, type === 'TS' ? 'DTM' : type) ?? undefined;
    return undefined;
  };

  const describeRep = (rep: Repetition, type: string, tableId?: string): string | undefined => {
    if (rep.literal) return undefined;
    const defs = schema.dataType(type);
    if (defs && defs.length > 1) {
      if (CODED.has(type)) {
        return lookupTable(tableId, rep.components[0]?.value) ?? (rep.components[1]?.value.trim() || undefined);
      }
      if (type === 'MSG' || type === 'CM_MSG') {
        const parts = [lookupTable('0076', rep.components[0]?.value), lookupTable('0003', rep.components[1]?.value)];
        return parts.filter(Boolean).join(' / ') || undefined;
      }
      return compose(type, rep);
    }
    return describeValue(rep.value, type, tableId, rep.components.length > 1);
  };

  const subComponents = (comp: Component, type: string, path: string): DecodedNode[] => {
    const defs = schema.dataType(type);
    const composite = !!defs && defs.length > 1;
    if (comp.subComponents.length <= 1 && !(composite && includeEmpty)) return [];
    const out: DecodedNode[] = [];
    const count = Math.max(comp.subComponents.length, composite && includeEmpty ? defs!.length : 0);
    for (let s = 1; s <= count; s++) {
      const sub = comp.subComponents[s - 1];
      const def = composite ? defs![s - 1] : undefined;
      if ((!sub || !sub.raw) && !includeEmpty) continue;
      out.push({
        kind: 'subcomponent', path: `${path}.${s}`, number: s, name: def?.name || `Subcomponent ${s}`,
        dataType: def?.dataType ?? '', tableId: def?.tableId, value: sub?.value ?? '', raw: sub?.raw ?? '',
        meaning: sub ? describeValue(sub.value, def?.dataType ?? '', def?.tableId) : undefined,
        required: false, repeating: false, present: !!sub, start: sub?.start ?? comp.start + comp.raw.length,
        length: sub?.raw.length ?? 0, children: [],
      });
    }
    return out;
  };

  const components = (rep: Repetition, type: string, fieldTable: string | undefined, path: string): DecodedNode[] => {
    if (rep.literal) return [];
    const defs = schema.dataType(type);
    const composite = !!defs && defs.length > 1;
    if (!composite && rep.components.length <= 1 && rep.components[0].subComponents.length <= 1) return [];
    const out: DecodedNode[] = [];
    const count = Math.max(rep.components.length, composite && includeEmpty ? defs!.length : 0);
    for (let c = 1; c <= count; c++) {
      const comp = rep.components[c - 1];
      const def = composite ? defs![c - 1] : undefined;
      if ((!comp || !comp.raw) && !includeEmpty) continue;
      let ctype = def?.dataType ?? (composite ? '' : c === 1 ? type : '');
      if (type === 'TS' && c === 1) ctype = 'DTM'; // pre-2.5 schemas type TS.1 as ST
      // A coded field's first component is the code the field's table describes.
      const tableId = def?.tableId ?? (c === 1 && CODED.has(type) ? fieldTable : undefined);
      const p = `${path}.${c}`;
      out.push({
        kind: 'component', path: p, number: c, name: def?.name || `Component ${c}`, dataType: ctype, tableId,
        value: comp?.value ?? '', raw: comp?.raw ?? '',
        meaning: comp ? describeValue(comp.value, ctype, tableId, comp.subComponents.length > 1) : undefined,
        required: false, repeating: false, present: !!comp, start: comp?.start ?? rep.start + rep.raw.length,
        length: comp?.raw.length ?? 0, children: comp ? subComponents(comp, ctype, p) : [],
      });
    }
    return out;
  };

  const resolveVaries = (seg: Segment, field: number): string => {
    let declared = '';
    if (seg.name === 'OBX' && field === 5) declared = segmentValue(seg, 2);
    else if (seg.name === 'MFE' && field === 4) declared = segmentValue(seg, 5);
    declared = declared.trim().toUpperCase();
    return declared || 'varies';
  };

  const decodeSegment = (seg: Segment): DecodedNode => {
    const segPath = seg.occurrence > 1 ? `${seg.name}[${seg.occurrence}]` : seg.name;
    const defs = schema.segment(seg.name);
    const children: DecodedNode[] = [];
    const count = Math.max(seg.fields.length, includeEmpty ? defs?.length ?? 0 : 0);
    for (let n = 1; n <= count; n++) {
      const field = seg.fields[n - 1];
      const def: FieldDef | undefined = defs?.[n - 1];
      const path = `${segPath}-${n}`;
      let type = def?.dataType ?? '';
      if (type === 'varies' || (!type && seg.name === 'OBX' && n === 5)) type = resolveVaries(seg, n);
      const base = {
        kind: 'field' as const, path, number: n,
        name: def?.name || (seg.name.startsWith('Z') ? `Custom field ${n}` : `Undefined field ${n}`),
        dataType: type, tableId: def?.tableId, required: !!def?.required, repeating: !!def?.repeating,
      };
      if (!field || !field.raw) {
        if (includeEmpty)
          children.push({ ...base, value: '', raw: '', present: !!field, start: field?.start ?? seg.start + seg.raw.length, length: 0, children: [] });
        continue;
      }
      const reps = field.repetitions;
      const node: DecodedNode = {
        ...base, value: field.value, raw: field.raw, present: true, start: field.start, length: field.raw.length,
        meaning: reps.length === 1 ? describeRep(reps[0], type, def?.tableId) : `${reps.length} repeats`,
        children: [],
      };
      if (reps.length > 1) {
        reps.forEach((rep, i) => {
          const rp = `${path}[${i + 1}]`;
          node.children.push({
            kind: 'repetition', path: rp, number: i + 1, name: `${node.name} #${i + 1}`, dataType: type, tableId: def?.tableId,
            value: rep.value, raw: rep.raw, meaning: describeRep(rep, type, def?.tableId), required: false, repeating: true,
            present: true, start: rep.start, length: rep.raw.length, children: components(rep, type, def?.tableId, rp),
          });
        });
      } else {
        node.children = components(reps[0], type, def?.tableId, path);
      }
      children.push(node);
    }
    return {
      kind: 'segment', path: segPath, number: seg.occurrence, name: segmentName(seg.name), dataType: '', value: seg.name,
      raw: seg.raw, required: false, repeating: false, present: true, start: seg.start, length: seg.raw.length, children,
    };
  };

  return { message, schema, title: describeMessageType(message), segments: message.segments.map(decodeSegment) };
}

/** Visits nodes depth-first, parents before children. */
export function* walk(nodes: DecodedNode[]): Generator<DecodedNode> {
  for (const n of nodes) {
    yield n;
    yield* walk(n.children);
  }
}

/**
 * Finds a node by its path, ignoring case.
 * @returns `undefined` when the message has nothing at that path (or it is empty and empties were not included).
 * @example findNode(decoded, 'PID-5.1')?.value // 'Doe'
 */
export function findNode(decoded: DecodedMessage, path: string): DecodedNode | undefined {
  const p = path.trim().toUpperCase();
  for (const n of walk(decoded.segments)) if (n.path.toUpperCase() === p) return n;
  return undefined;
}

/**
 * The deepest node covering a character offset in the original text.
 * Used to turn a tap or caret position into a path.
 */
export function nodeAt(decoded: DecodedMessage, offset: number): DecodedNode | undefined {
  let best: DecodedNode | undefined;
  for (const n of walk(decoded.segments)) {
    if (n.present && offset >= n.start && offset <= n.start + n.length) best = n;
  }
  return best;
}

/** The name of an HL7 table, e.g. `tableName('0001')` is 'Administrative Sex'. */
export function tableName(id?: string): string | undefined {
  return table(id)?.name || undefined;
}
