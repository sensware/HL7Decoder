/**
 * Shared fixtures for the engine tests. Messages here are fictional.
 */
import * as fs from 'fs';
import * as path from 'path';

/** A small, valid ADT^A01 (admit) message in HL7's standard CR-separated form. */
export const ADT = [
  'MSH|^~\\&|SEND|FAC|RECV|FAC2|20240105143000||ADT^A01^ADT_A01|MSG1|P|2.5.1',
  'EVN|A01|20240105142500',
  'PID|1||123^^^HOSP^MR~456^^^SSA^SS||Doe^John^Q||19800214|M|||1 Main St^^Town^ST^12345',
  'PV1|1|I|4W^401^B',
].join('\r');

/** Builds a minimal message: an MSH for the given type/version plus the given segment lines. */
export function message(type: string, version: string, ...segments: string[]): string {
  return [`MSH|^~\\&|A|B|C|D|20240101||${type}|1|P|${version}`, ...segments].join('\r');
}

export const SAMPLES_DIR = path.join(__dirname, '../samples');

/** Reads one of the files in /samples. */
export const sample = (name: string) => fs.readFileSync(path.join(SAMPLES_DIR, name), 'utf8');
