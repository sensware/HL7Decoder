/**
 * Validator tests (src/hl7/validator.ts): each rule is shown firing on a bad message and staying
 * quiet on a good one.
 */
import { decodeMessage, parseMessage, validate, ValidationIssue } from '../src/hl7';
import { ADT, message } from './helpers';

const check = (text: string): ValidationIssue[] => validate(decodeMessage(parseMessage(text)));

it('passes a valid message with no errors or warnings', () => {
  expect(check(ADT).filter((i) => i.severity !== 'info')).toEqual([]);
});

it('requires MSH first', () => {
  expect(check('PID|1')).toContainEqual(expect.objectContaining({ severity: 'error', message: expect.stringContaining('start with an MSH') }));
});

it('flags empty required fields', () => {
  expect(check(message('ADT^A01', '2.5.1', 'EVN|A01|20240101', 'PID|1', 'PV1|1|I')))
    .toContainEqual(expect.objectContaining({ path: 'PID-3', severity: 'error' }));
});

it('flags malformed dates and numbers', () => {
  const issues = check(message('ORU^R01', '2.5.1', 'PID|abc||1||Doe||1980-02-14', 'OBX|1|NM|X||high'));
  expect(issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: 'PID-1', message: expect.stringContaining('not a sequence number') }),
    expect.objectContaining({ path: 'PID-7.1', message: expect.stringContaining('not a date') }),
    expect.objectContaining({ path: 'OBX-5', message: expect.stringContaining('not a number') }),
  ]));
});

it('flags unknown segments but not Z-segments', () => {
  const issues = check(`${ADT}\rFOO|x\rZAB|ok`);
  expect(issues).toContainEqual(expect.objectContaining({ path: 'FOO', message: expect.stringContaining('not defined') }));
  expect(issues.find((i) => i.path === 'ZAB')).toBeUndefined();
});

it('checks segments against the message structure', () => {
  const issues = check(message('ADT^A01', '2.5.1', 'PID|1||1||Doe', 'PV1|1|I'));
  expect(issues).toContainEqual(expect.objectContaining({ path: 'EVN', message: expect.stringContaining('requires segment EVN') }));
});

it('flags a non-repeating field that repeats', () => {
  expect(check(`${ADT.replace('|M|', '|M~F|')}`)).toContainEqual(expect.objectContaining({ path: 'PID-8', severity: 'warning' }));
});

it('reports unknown table codes as info only', () => {
  const issues = check(message('ORU^R01', '2.5.1', 'OBX|1|QQ|X||1'));
  expect(issues).toContainEqual(expect.objectContaining({ path: 'OBX-2', severity: 'info' }));
});

it('gives offsets that point at the problem text', () => {
  const text = message('ORU^R01', '2.5.1', 'OBX|1|NM|X||high');
  const bad = check(text).find((i) => i.path === 'OBX-5')!;
  expect(text.substr(bad.start, bad.length)).toBe('high');
});
