import { Delimiters, DEFAULT_DELIMITERS, delimitersFromHeader } from './delimiters';
import { decodeEscapes } from './escaping';
import { parsePath, readPath, HL7Path } from './path';

/** A run of characters in the source text; offsets point into the text given to the parser. */
interface Span {
  /** Text exactly as written, including escape sequences. */
  raw: string;
  /** Offset of the first character in the parsed text. */
  start: number;
}

export interface SubComponent extends Span {
  value: string;
}

export interface Component extends Span {
  value: string;
  subComponents: SubComponent[];
}

/** One occurrence of a field. Fields that do not repeat have exactly one. */
export interface Repetition extends Span {
  value: string;
  components: Component[];
  /** True for MSH-1/MSH-2, whose characters are delimiters rather than structure. */
  literal: boolean;
}

export interface Field extends Span {
  /** 1-based field number as written in paths like PID-5. */
  number: number;
  value: string;
  repetitions: Repetition[];
}

export interface Segment extends Span {
  /** Three-character segment ID such as MSH or PID. */
  name: string;
  /** Which occurrence of this ID this is within the message (1-based). */
  occurrence: number;
  /** 0-based line in the parsed text. */
  line: number;
  /** Fields 1..n (the segment ID is not a field). */
  fields: Field[];
}

export interface Message {
  text: string;
  delimiters: Delimiters;
  segments: Segment[];
  header?: Segment;
  version: string;
  messageCode: string;
  triggerEvent: string;
  messageStructure: string;
  controlId: string;
  /** "ADT^A01" style, or just the code when there is no trigger event. */
  messageType: string;
}

const START_BLOCK = '\x0b';
const END_BLOCK = '\x1c';

function splitSpans<T>(raw: string, sep: string, start: number, make: (raw: string, start: number) => T): T[] {
  if (!sep || !raw.includes(sep)) return [make(raw, start)];
  const out: T[] = [];
  let pos = 0;
  for (;;) {
    const next = raw.indexOf(sep, pos);
    const end = next < 0 ? raw.length : next;
    out.push(make(raw.slice(pos, end), start + pos));
    if (next < 0) break;
    pos = next + 1;
  }
  return out;
}

function makeComponent(raw: string, start: number, d: Delimiters, literal = false): Component {
  return {
    raw,
    start,
    value: literal ? raw : decodeEscapes(raw, d),
    subComponents: literal
      ? [{ raw, start, value: raw }]
      : splitSpans(raw, d.subComponent, start, (r, s) => ({ raw: r, start: s, value: decodeEscapes(r, d) })),
  };
}

function makeRepetition(raw: string, start: number, d: Delimiters, literal = false): Repetition {
  return {
    raw,
    start,
    literal,
    value: literal ? raw : decodeEscapes(raw, d),
    components: literal
      ? [makeComponent(raw, start, d, true)]
      : splitSpans(raw, d.component, start, (r, s) => makeComponent(r, s, d)),
  };
}

function makeField(raw: string, start: number, d: Delimiters, number: number, literal = false): Field {
  const repetitions = literal
    ? [makeRepetition(raw, start, d, true)]
    : splitSpans(raw, d.repetition, start, (r, s) => makeRepetition(r, s, d));
  return { raw, start, number, repetitions, value: repetitions.length === 1 ? repetitions[0].value : decodeEscapes(raw, d) };
}

const isHeaderId = (name: string) => name === 'MSH' || name === 'FHS' || name === 'BHS';

function parseSegment(raw: string, start: number, d: Delimiters, line: number): Segment {
  const nameEnd = raw.indexOf(d.field);
  const name = (nameEnd < 0 ? raw : raw.slice(0, nameEnd)).trim();
  const fields: Field[] = [];
  if (nameEnd >= 0) {
    let pos = nameEnd + 1;
    let number = 1;
    let done = false;
    if (isHeaderId(name)) {
      // MSH-1 is the field separator itself; MSH-2 holds the encoding characters verbatim.
      fields.push(makeField(d.field, start + nameEnd, d, 1, true));
      let encEnd = raw.indexOf(d.field, pos);
      if (encEnd < 0) encEnd = raw.length;
      fields.push(makeField(raw.slice(pos, encEnd), start + pos, d, 2, true));
      number = 3;
      done = encEnd >= raw.length;
      pos = encEnd + 1;
    }
    while (!done) {
      const next = raw.indexOf(d.field, pos);
      const end = next < 0 ? raw.length : next;
      fields.push(makeField(raw.slice(pos, end), start + pos, d, number++));
      if (next < 0) break;
      pos = next + 1;
    }
  }
  return { raw, start, name, occurrence: 1, line, fields };
}

function splitLines(text: string): Array<[number, number]> {
  const lines: Array<[number, number]> = [];
  let pos = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\r' || c === '\n') {
      lines.push([pos, i - pos]);
      if (c === '\r' && text[i + 1] === '\n') i++;
      pos = i + 1;
    }
  }
  lines.push([pos, text.length - pos]);
  return lines;
}

const isWs = (c: string) => c === ' ' || c === '\t' || c === '\f' || c === '\v';

/**
 * Parses one message. Segments may be separated by CR, LF or CRLF; MLLP framing is tolerated.
 * Offsets on every element refer to `text` as given, so a viewer can highlight what was tapped.
 */
export function parseMessage(text: string): Message {
  text = text ?? '';
  const lines = splitLines(text);
  const clean = (s: number, len: number) => text.slice(s, s + len).trim().replace(/^\x0b/, '');
  const headerLine = lines.find(([s, l]) => {
    const t = clean(s, l);
    return t.length > 4 && isHeaderId(t.slice(0, 3));
  });
  const delimiters = headerLine ? delimitersFromHeader(clean(headerLine[0], headerLine[1])) : DEFAULT_DELIMITERS;

  const segments: Segment[] = [];
  const counts = new Map<string, number>();
  lines.forEach(([start, length], lineNo) => {
    let s = start;
    let e = start + length;
    while (s < e && (isWs(text[s]) || text[s] === START_BLOCK)) s++;
    while (e > s && (isWs(text[e - 1]) || text[e - 1] === END_BLOCK || text[e - 1] === '\0')) e--;
    if (e <= s) return;
    const seg = parseSegment(text.slice(s, e), s, delimiters, lineNo);
    const n = (counts.get(seg.name) ?? 0) + 1;
    counts.set(seg.name, n);
    seg.occurrence = n;
    segments.push(seg);
  });

  const header = segments.find((s) => s.name === 'MSH');
  const get = (f: number, c = 1) => (header ? segmentValue(header, f, c) : '');
  const messageCode = get(9, 1);
  const triggerEvent = get(9, 2);
  return {
    text,
    delimiters,
    segments,
    header,
    version: get(12, 1),
    messageCode,
    triggerEvent,
    messageStructure: get(9, 3),
    controlId: get(10, 0),
    messageType: triggerEvent ? `${messageCode}^${triggerEvent}` : messageCode,
  };
}

/** Value of a field/component/subcomponent in a segment (first repetition unless given); '' when absent. */
export function segmentValue(seg: Segment, field: number, component = 0, sub = 0, repetition = 1): string {
  const rep = seg.fields[field - 1]?.repetitions[repetition - 1];
  if (!rep) return '';
  if (component <= 0) return rep.value;
  const comp = rep.components[component - 1];
  if (!comp) return '';
  if (sub <= 0) return comp.value;
  return comp.subComponents[sub - 1]?.value ?? '';
}

export function getSegment(msg: Message, name: string, occurrence = 1): Segment | undefined {
  return msg.segments.filter((s) => s.name === name)[occurrence - 1];
}

/** Reads a value by path, e.g. "PID-5.1", "OBX[2]-5", "PID-3[2].4.1". */
export function getValue(msg: Message, path: string | HL7Path): string {
  const p = typeof path === 'string' ? parsePath(path) : path;
  return p ? readPath(msg, p) ?? '' : '';
}

/**
 * Splits a file or paste that may hold many messages (one per MSH, with optional batch
 * FHS/BHS/BTS/FTS wrappers and MLLP framing) into individual message texts, one segment per line.
 */
export function splitMessages(text: string): string[] {
  const result: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length) result.push(current.join('\n'));
    current = [];
  };
  for (const [s, l] of splitLines(text ?? '')) {
    const line = text.slice(s, s + l).trim().replace(/^[\x0b\x1c\0]+|[\x0b\x1c\0]+$/g, '').trim();
    if (!line) continue;
    const id = line.slice(0, 3);
    if (id === 'FHS' || id === 'BHS' || id === 'BTS' || id === 'FTS') {
      flush();
      continue;
    }
    if (id === 'MSH') flush();
    current.push(line);
  }
  flush();
  return result;
}

export function looksLikeHl7(text: string): boolean {
  const t = text.trimStart().replace(/^\x0b/, '');
  return t.length > 8 && isHeaderId(t.slice(0, 3));
}
