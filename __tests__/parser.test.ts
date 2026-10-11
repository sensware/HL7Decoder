/**
 * Parser tests (src/hl7/model.ts, delimiters.ts, escaping.ts, path.ts).
 * They check that text becomes the right segment/field/component tree, that offsets point back into
 * the source (needed for tap-to-inspect), and that real-world formatting variations are tolerated.
 */
import {
  decodeEscapes, DEFAULT_DELIMITERS, encodeEscapes, formatPath, getSegment, getValue, looksLikeHl7,
  parseMessage, parsePath, splitMessages,
} from '../src/hl7';
import { ADT } from './helpers';

describe('parseMessage', () => {
  it('reads segments, fields, repetitions and components', () => {
    const msg = parseMessage(ADT);
    expect(msg.segments.map((s) => s.name)).toEqual(['MSH', 'EVN', 'PID', 'PV1']);
    expect(msg.messageType).toBe('ADT^A01');
    expect(msg.messageStructure).toBe('ADT_A01');
    expect(msg.version).toBe('2.5.1');
    expect(msg.controlId).toBe('MSG1');
    expect(getValue(msg, 'PID-5.1')).toBe('Doe');
    expect(getValue(msg, 'PID-3[2].1')).toBe('456');
  });

  it('treats MSH-1 and MSH-2 as literal delimiter text', () => {
    const msg = parseMessage(ADT);
    expect(getValue(msg, 'MSH-1')).toBe('|');
    expect(getValue(msg, 'MSH-2')).toBe('^~\\&');
    expect(getValue(msg, 'MSH-3')).toBe('SEND'); // numbering continues from 3
  });

  it('numbers repeated segments', () => {
    const msg = parseMessage(`${ADT}\rOBX|1|NM|A||1\rOBX|2|NM|B||2`);
    expect(getSegment(msg, 'OBX', 2)?.occurrence).toBe(2);
    expect(getValue(msg, 'OBX[2]-5')).toBe('2');
  });

  it('keeps offsets that point back into the original text', () => {
    const msg = parseMessage(ADT);
    const name = getSegment(msg, 'PID')!.fields[4];
    expect(ADT.substr(name.start, name.raw.length)).toBe('Doe^John^Q');
    const given = name.repetitions[0].components[1];
    expect(ADT.substr(given.start, given.raw.length)).toBe('John');
  });

  it('accepts LF line endings, MLLP framing and non-default delimiters', () => {
    const msg = parseMessage('\x0bMSH#*@!%#A#B#C#D#20240101##ORU*R01#1#P#2.4\nPID#1##77@88*X*Y\n\x1c\r');
    expect(msg.delimiters).toMatchObject({ field: '#', component: '*', repetition: '@', escape: '!', subComponent: '%' });
    expect(getValue(msg, 'PID-3[2].1')).toBe('88');
    expect(msg.messageType).toBe('ORU^R01');
  });

  it('never throws on junk input', () => {
    expect(parseMessage('').segments).toEqual([]);
    expect(parseMessage('hello world').segments[0].name).toBe('hello world');
    expect(parseMessage('MSH').messageType).toBe('');
  });
});

describe('splitMessages', () => {
  it('splits on each MSH and drops batch wrappers', () => {
    const batch = `FHS|^~\\&\rBHS|^~\\&\r${ADT}\r${ADT.replace('MSG1', 'MSG2')}\rBTS|2\rFTS|1`;
    const parts = splitMessages(batch);
    expect(parts).toHaveLength(2);
    expect(parseMessage(parts[1]).controlId).toBe('MSG2');
  });

  it('ignores blank lines and returns nothing for non-HL7 text', () => {
    expect(splitMessages(`\n\n${ADT}\n\n`)).toHaveLength(1);
    expect(looksLikeHl7('just some text')).toBe(false);
    expect(looksLikeHl7(ADT)).toBe(true);
  });
});

describe('escape sequences', () => {
  const d = DEFAULT_DELIMITERS;
  it('decodes delimiter, hex and line-break escapes', () => {
    expect(decodeEscapes('a\\F\\b\\S\\c\\T\\d\\R\\e\\E\\f', d)).toBe('a|b^c&d~e\\f');
    expect(decodeEscapes('line1\\.br\\line2', d)).toBe('line1\nline2');
    expect(decodeEscapes('\\X4142\\', d)).toBe('AB');
  });

  it('keeps unknown sequences as written', () => {
    expect(decodeEscapes('keep \\Zfoo\\ as is', d)).toBe('keep \\Zfoo\\ as is');
  });

  it('round-trips through encodeEscapes', () => {
    const original = 'x|y^z&w~v\\u\nnext';
    expect(decodeEscapes(encodeEscapes(original, d), d)).toBe(original);
  });

  it('is applied to parsed values but not raw text', () => {
    const msg = parseMessage(`${ADT}\rNTE|1||A \\T\\ B`);
    const nte = getSegment(msg, 'NTE')!.fields[2];
    expect(nte.value).toBe('A & B');
    expect(nte.raw).toBe('A \\T\\ B');
  });
});

describe('paths', () => {
  it('parses every supported form', () => {
    expect(parsePath('pid-5.1')).toMatchObject({ segment: 'PID', field: 5, component: 1 });
    expect(parsePath('MSH.9.2')).toMatchObject({ segment: 'MSH', field: 9, component: 2 });
    expect(parsePath('OBX[2]-5')).toMatchObject({ segmentOccurrence: 2, field: 5 });
    expect(parsePath('PID-3[2].4.1')).toMatchObject({ repetition: 2, component: 4, subComponent: 1 });
    expect(parsePath('not a path')).toBeNull();
  });

  it('formats paths canonically', () => {
    expect(formatPath(parsePath('pid.3[2].4')!)).toBe('PID-3[2].4');
    expect(formatPath(parsePath('OBX[1]-5')!)).toBe('OBX-5');
  });

  it('returns empty for paths with nothing there', () => {
    const msg = parseMessage(ADT);
    expect(getValue(msg, 'PID-30')).toBe('');
    expect(getValue(msg, 'ZZZ-1')).toBe('');
    expect(getValue(msg, 'garbage')).toBe('');
  });
});
