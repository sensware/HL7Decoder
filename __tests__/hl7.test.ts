import * as fs from 'fs';
import * as path from 'path';
import {
  decodeEscapes, decodeMessage, DEFAULT_DELIMITERS, encodeEscapes, findNode, getSegment, getValue, nodeAt,
  parseMessage, resolveVersion, Schema, splitMessages, summaryText, toJson, validate, VERSIONS,
} from '../src/hl7';

const ADT = [
  'MSH|^~\\&|SEND|FAC|RECV|FAC2|20240105143000||ADT^A01^ADT_A01|MSG1|P|2.5.1',
  'EVN|A01|20240105142500',
  'PID|1||123^^^HOSP^MR~456^^^SSA^SS||Doe^John^Q||19800214|M|||1 Main St^^Town^ST^12345',
  'PV1|1|I|4W^401^B',
].join('\r');

describe('parser', () => {
  it('reads segments, fields, repetitions and components', () => {
    const msg = parseMessage(ADT);
    expect(msg.segments).toHaveLength(4);
    expect(msg.messageType).toBe('ADT^A01');
    expect(msg.version).toBe('2.5.1');
    expect(getValue(msg, 'PID-5.1')).toBe('Doe');
    expect(getValue(msg, 'PID-3[2].1')).toBe('456');
    expect(getValue(msg, 'MSH-1')).toBe('|');
    expect(getValue(msg, 'MSH-2')).toBe('^~\\&');
    expect(getValue(msg, 'MSH.10')).toBe('MSG1');
  });

  it('keeps offsets that point back into the text', () => {
    const msg = parseMessage(ADT);
    const name = getSegment(msg, 'PID')!.fields[4];
    expect(ADT.substr(name.start, name.raw.length)).toBe('Doe^John^Q');
    const decoded = decodeMessage(msg);
    expect(nodeAt(decoded, ADT.indexOf('John') + 1)?.path).toBe('PID-5.2');
  });

  it('handles LF endings, MLLP framing and custom delimiters', () => {
    const msg = parseMessage('\x0bMSH#*@!%#A#B#C#D#20240101##ORU*R01#1#P#2.4\nPID#1##77@88*X*Y\n\x1c\r');
    expect(msg.delimiters.field).toBe('#');
    expect(getValue(msg, 'PID-3[2].1')).toBe('88');
    expect(msg.messageType).toBe('ORU^R01');
  });

  it('decodes escape sequences', () => {
    const d = DEFAULT_DELIMITERS;
    expect(decodeEscapes('a\\F\\b\\S\\c\\T\\d\\R\\e\\E\\f', d)).toBe('a|b^c&d~e\\f');
    expect(decodeEscapes('line1\\.br\\line2', d)).toBe('line1\nline2');
    expect(decodeEscapes('\\X4142\\', d)).toBe('AB');
    expect(decodeEscapes('keep \\Zfoo\\ as is', d)).toBe('keep \\Zfoo\\ as is');
    const original = 'x|y^z&w~v\\u';
    expect(decodeEscapes(encodeEscapes(original, d), d)).toBe(original);
  });

  it('splits batches into messages', () => {
    const batch = `FHS|^~\\&\rBHS|^~\\&\r${ADT}\r${ADT.replace('MSG1', 'MSG2')}\rBTS|2\rFTS|1`;
    const parts = splitMessages(batch);
    expect(parts).toHaveLength(2);
    expect(parseMessage(parts[1]).controlId).toBe('MSG2');
  });
});

describe('decoder', () => {
  it('labels fields with names, types and meanings', () => {
    const d = decodeMessage(parseMessage(ADT));
    expect(d.title).toBe('ADT message: Admit/visit notification');
    expect(findNode(d, 'PID-8')).toMatchObject({ name: 'Administrative Sex', meaning: 'Male' });
    expect(findNode(d, 'PID-5')).toMatchObject({ dataType: 'XPN', meaning: 'John Q Doe' });
    expect(findNode(d, 'PID-5.1')?.name).toBe('Family Name');
    expect(findNode(d, 'PID-7')?.meaning).toBe('14 Feb 1980');
    expect(findNode(d, 'PV1-2')?.meaning).toBe('Inpatient');
  });

  it('takes the OBX-5 type from OBX-2', () => {
    const d = decodeMessage(parseMessage('MSH|^~\\&|A|B|C|D|20240101||ORU^R01|1|P|2.5.1\rOBX|1|CWE|X^Y||POS^Positive^L||||||F'));
    expect(findNode(d, 'OBX-5')).toMatchObject({ dataType: 'CWE', meaning: 'Positive' });
  });

  it('keeps field numbers in versions that drop withdrawn fields', () => {
    const s = Schema.for('2.8');
    expect(s.field('PID', 5)?.name).toBe('Patient Name');
    expect(s.field('PID', 2)?.withdrawn).toBe(true);
    expect(resolveVersion('2.6')).toBe('2.5.1');
    expect(resolveVersion('2.7')).toBe('2.7.1');
  });

  it.each(VERSIONS)('loads v%s', (v) => {
    const s = Schema.for(v);
    expect(s.hasSegment('PID')).toBe(true);
    expect(s.field('MSH', 10)?.name.toLowerCase()).toBe('message control id');
  });
});

describe('validator', () => {
  it('flags missing required fields, bad dates and unknown segments', () => {
    const issues = validate(decodeMessage(parseMessage('MSH|^~\\&|A|B|C|D|20241305||ADT^A01|1|P|2.5.1\rPID|1\rFOO|x\rZAB|ok')));
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'PID-3', severity: 'error' }),
      expect.objectContaining({ path: 'MSH-7.1', message: expect.stringContaining('not a date') }),
      expect.objectContaining({ path: 'FOO', message: expect.stringContaining('not defined') }),
      expect.objectContaining({ message: expect.stringContaining('requires segment EVN') }),
    ]));
    expect(issues.find((i) => i.path === 'ZAB')).toBeUndefined();
  });

  it('passes a valid message', () => {
    expect(validate(decodeMessage(parseMessage(ADT))).filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('summary', () => {
  it('reads like sentences', () => {
    const s = summaryText(parseMessage(ADT));
    expect(s).toContain('Patient: John Q Doe');
    expect(s).toContain('male');
    expect(s).toContain('Visit: Inpatient');
  });

  it('flags abnormal results', () => {
    const s = summaryText(parseMessage(fs.readFileSync(path.join(__dirname, '../samples/oru_r01.hl7'), 'utf8')));
    expect(s).toContain('White Blood Cell Count: 13.2 thousand per microliter [ref 4.5-11.0] (Above high normal)');
  });
});

it('decodes every sample end to end', () => {
  const dir = path.join(__dirname, '../samples');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.hl7'))) {
    for (const text of splitMessages(fs.readFileSync(path.join(dir, f), 'utf8'))) {
      const d = decodeMessage(parseMessage(text), { includeEmpty: true });
      validate(d);
      summaryText(d.message);
      expect(() => JSON.parse(toJson(d))).not.toThrow();
    }
  }
});
