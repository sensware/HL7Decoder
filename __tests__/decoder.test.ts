/**
 * Decoder and schema tests (src/hl7/decoder.ts, schema.ts, datetime.ts, readable.ts).
 * They check that parts get the right names, datatypes and meanings for their HL7 version, and that
 * the bundled definitions load and line up with the standard.
 */
import { decodeMessage, findNode, formatHl7Date, nodeAt, parseMessage, resolveVersion, Schema, VERSIONS } from '../src/hl7';
import { ADT, message } from './helpers';

describe('decodeMessage', () => {
  const d = decodeMessage(parseMessage(ADT));

  it('titles the message from MSH-9', () => {
    expect(d.title).toBe('ADT message: Admit/visit notification');
    expect(d.schema.version).toBe('2.5.1');
  });

  it('labels fields with names, types and table meanings', () => {
    expect(findNode(d, 'PID-8')).toMatchObject({ name: 'Administrative Sex', dataType: 'IS', tableId: '0001', meaning: 'Male' });
    expect(findNode(d, 'PV1-2')?.meaning).toBe('Inpatient');
    expect(findNode(d, 'PID-3')?.required).toBe(true);
  });

  it('renders composite values readably', () => {
    expect(findNode(d, 'PID-5')).toMatchObject({ dataType: 'XPN', meaning: 'John Q Doe' });
    expect(findNode(d, 'PID-11')?.meaning).toBe('1 Main St, Town, ST 12345');
    expect(findNode(d, 'PID-7')?.meaning).toBe('14 Feb 1980');
  });

  it('names components and repetitions', () => {
    expect(findNode(d, 'PID-5.1')?.name).toBe('Family Name');
    expect(findNode(d, 'PID-3[2]')).toMatchObject({ kind: 'repetition', value: '456^^^SSA^SS' });
    expect(findNode(d, 'PID-3[2].5')?.meaning).toBe('Social Security number');
  });

  it('maps text offsets to the deepest node', () => {
    expect(nodeAt(d, ADT.indexOf('John') + 1)?.path).toBe('PID-5.2');
    expect(nodeAt(d, ADT.indexOf('PV1') + 1)?.path).toBe('PV1');
  });

  it('includes empty defined fields only when asked', () => {
    expect(findNode(d, 'PID-2')).toBeUndefined();
    const all = decodeMessage(parseMessage(ADT), { includeEmpty: true });
    expect(findNode(all, 'PID-2')).toMatchObject({ name: 'Patient ID', present: true, value: '' });
  });

  it('takes the OBX-5 datatype from OBX-2', () => {
    const r = decodeMessage(parseMessage(message('ORU^R01', '2.5.1', 'OBX|1|CWE|X^Y||POS^Positive^L||||||F')));
    expect(findNode(r, 'OBX-5')).toMatchObject({ dataType: 'CWE', meaning: 'Positive' });
  });

  it('can be forced to another version', () => {
    expect(decodeMessage(parseMessage(ADT), { version: '2.3' }).schema.version).toBe('2.3');
  });

  it('labels custom Z-segments generically', () => {
    const z = decodeMessage(parseMessage(`${ADT}\rZXY|abc`));
    expect(findNode(z, 'ZXY')?.name).toBe('Custom (Z) segment');
    expect(findNode(z, 'ZXY-1')?.name).toBe('Custom field 1');
  });
});

describe('schema', () => {
  it.each(VERSIONS)('loads v%s', (v) => {
    const s = Schema.for(v);
    expect(s.hasSegment('PID')).toBe(true);
    expect(s.field('MSH', 10)?.name.toLowerCase()).toBe('message control id');
  });

  it('keeps field numbers where newer versions withdrew fields', () => {
    const s = Schema.for('2.8');
    expect(s.field('PID', 5)?.name).toBe('Patient Name');
    expect(s.field('PID', 2)?.withdrawn).toBe(true);
  });

  it('falls back to the nearest bundled version', () => {
    expect(resolveVersion('2.6')).toBe('2.5.1');
    expect(resolveVersion('2.7')).toBe('2.7.1');
    expect(resolveVersion('')).toBe('2.5.1');
    expect(resolveVersion('3.0')).toBe('2.9');
  });

  it('resolves shared message structures', () => {
    const s = Schema.for('2.5.1');
    expect(s.resolveStructure('ADT', 'A04', '')).toBe('ADT_A01');
    expect(s.resolveStructure('ORU', 'R01', '')).toBe('ORU_R01');
  });
});

describe('dates', () => {
  it.each([
    ['2024', 'DTM', '2024'],
    ['202401', 'DTM', 'Jan 2024'],
    ['20240105', 'DT', '5 Jan 2024'],
    ['202401051430', 'DTM', '5 Jan 2024 14:30'],
    ['20240105143000+0100', 'DTM', '5 Jan 2024 14:30:00 (+01:00)'],
    ['1430', 'TM', '14:30'],
  ] as const)('formats %s as %s', (value, type, expected) => {
    expect(formatHl7Date(value, type)).toBe(expected);
  });

  it.each(['20241305', '20240230', '1980-02-14', '2024010525'])('rejects %s', (value) => {
    expect(formatHl7Date(value, 'DTM')).toBeNull();
  });
});
