/**
 * Summary and export tests (src/hl7/summary.ts, jsonExport.ts), plus an end-to-end pass over every
 * file in /samples to catch crashes on realistic and deliberately broken messages.
 */
import * as fs from 'fs';
import * as path from 'path';
import { decodeMessage, parseMessage, splitMessages, summarize, summaryText, toJson, validate } from '../src/hl7';
import { ADT, sample, SAMPLES_DIR } from './helpers';

describe('summary', () => {
  it('describes the sender, patient and visit', () => {
    const s = summaryText(parseMessage(ADT));
    expect(s).toContain('ADT message: Admit/visit notification (ADT^A01, v2.5.1)');
    expect(s).toContain('Sent by SEND at FAC to RECV at FAC2 on 5 Jan 2024 14:30:00');
    expect(s).toContain('Patient: John Q Doe, ID MR 123, SS 456, male, born 14 Feb 1980');
    expect(s).toContain('Visit: Inpatient, at 4W / 401 / B');
  });

  it('lists results under their test and flags abnormal ones', () => {
    const lines = summarize(parseMessage(sample('oru_r01.hl7')));
    const wbc = lines.find((l) => l.text.startsWith('White Blood Cell Count'))!;
    expect(wbc.text).toBe('White Blood Cell Count: 13.2 thousand per microliter [ref 4.5-11.0] (Above high normal)');
    expect(wbc).toMatchObject({ indent: true, flagged: true });
    expect(lines.find((l) => l.text.startsWith('Hemoglobin'))?.flagged).toBe(false);
  });

  it('explains acknowledgement errors', () => {
    const s = summaryText(parseMessage(sample('ack_error.hl7')));
    expect(s).toContain('Acknowledgement: Application Error (AE) for message LAB778899 - Unknown patient identifier.');
    expect(s).toContain('Error: Patient 123456 not found');
  });

  it('links each line to its segment', () => {
    const pid = summarize(parseMessage(ADT)).find((l) => l.text.startsWith('Patient'));
    expect(pid?.segment?.name).toBe('PID');
  });
});

describe('JSON export', () => {
  it('includes names, values and meanings', () => {
    const json = JSON.parse(toJson(decodeMessage(parseMessage(ADT))));
    expect(json).toMatchObject({ messageType: 'ADT^A01', schemaVersion: '2.5.1', controlId: 'MSG1' });
    const pid = json.segments.find((s: { path: string }) => s.path === 'PID');
    expect(pid.fields).toContainEqual(expect.objectContaining({ path: 'PID-8', name: 'Administrative Sex', value: 'M', meaning: 'Male' }));
  });
});

it('decodes, validates, summarises and exports every sample without throwing', () => {
  for (const f of fs.readdirSync(SAMPLES_DIR).filter((x) => x.endsWith('.hl7'))) {
    for (const text of splitMessages(fs.readFileSync(path.join(SAMPLES_DIR, f), 'utf8'))) {
      const d = decodeMessage(parseMessage(text), { includeEmpty: true });
      validate(d);
      summaryText(d.message);
      expect(() => JSON.parse(toJson(d))).not.toThrow();
    }
  }
});
