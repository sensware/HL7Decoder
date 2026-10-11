import { compose, personName } from './readable';
import { ageOn, formatHl7Date, parseHl7Date } from './datetime';
import { describeMessageType } from './decoder';
import type { Message, Segment } from './model';
import { segmentValue } from './model';
import { lookupTable } from './schema';

const first = (...values: Array<string | undefined | null>) => (values.find((v) => v && v.trim()) ?? '').trim();
const join = (sep: string, ...parts: string[]) => parts.filter((p) => p && p.trim()).join(sep);
const suffix = (s: string) => (s ? ` - ${s}` : '');
const truncate = (s: string, max: number) => (s.length <= max ? s : s.slice(0, max - 1) + '…');
/** Formats an HL7 date/time for prose, or '' when it isn't one. */
export const dateText = (v?: string) => (v ? formatHl7Date(v) ?? '' : '');
const dated = (v: string, word = 'on') => (dateText(v) ? ` ${word} ${dateText(v)}` : '');
const code = (c: string, text: string) => (c && text && c !== text ? ` [${c}]` : '');

/** First clause of a table description: "Final results; Can only be changed..." becomes "Final results". */
function short(description?: string): string {
  if (!description) return '';
  let d = description.trim();
  if (d.startsWith('Original mode: ')) {
    d = d.slice('Original mode: '.length);
    const dash = d.indexOf(' - ');
    if (dash > 0) d = d.slice(0, dash);
  }
  const cut = d.search(/[;.]/);
  return (cut > 0 ? d.slice(0, cut) : d).trim();
}

const party = (app: string, facility: string) => join(' at ', app, facility);

export interface SummaryLine {
  text: string;
  /** Segment the line came from, so a viewer can jump to it. */
  segment?: Segment;
  /** Nested lines (results under a test, resources under an appointment). */
  indent: boolean;
  /** Abnormal results and errors deserve attention. */
  flagged?: boolean;
}

/**
 * Builds a plain-English account of what a message says, one line per meaningful segment:
 * sender and time, patient, visit, orders, tests and results (abnormal ones flagged),
 * allergies, diagnoses, procedures, appointments, insurance, ACK outcomes and errors.
 * Segments it has nothing to say about are skipped.
 * @returns Lines in message order; each links back to its segment so a viewer can jump there.
 */
export function summarize(msg: Message): SummaryLine[] {
  const lines: SummaryLine[] = [];
  const add = (text: string, segment?: Segment, indent = false, flagged = false) => {
    if (text.trim()) lines.push({ text, segment, indent, flagged });
  };
  const hdr = msg.header;
  const h = (f: number, c = 1) => (hdr ? segmentValue(hdr, f, c) : '');
  add(`${describeMessageType(msg)} (${msg.messageType}${msg.version ? `, v${msg.version}` : ''})`, hdr);
  add(join(' ',
    party(h(3), h(4)) ? `Sent by ${party(h(3), h(4))}` : '',
    party(h(5), h(6)) ? `to ${party(h(5), h(6))}` : '',
    dateText(h(7)) ? `on ${dateText(h(7))}` : '',
    msg.controlId ? `(control ID ${msg.controlId})` : ''), hdr);

  for (const seg of msg.segments) {
    const g = (f: number, c = 0, s = 0) => segmentValue(seg, f, c, s);
    const nameAt = (f: number) => {
      const rep = seg.fields[f - 1]?.repetitions[0];
      if (!rep || !rep.raw) return '';
      const c = (n: number) => rep.components[n - 1]?.subComponents[0].value ?? '';
      return first(personName(c(2), c(3), c(4), c(5), c(6), c(7)), c(1));
    };
    const xpn = (f: number) => compose('XPN', seg.fields[f - 1]?.repetitions[0]) ?? '';
    const phone = (f: number) => compose('XTN', seg.fields[f - 1]?.repetitions[0]) ?? '';
    const location = (f: number) => {
      const rep = seg.fields[f - 1]?.repetitions[0];
      return first(rep?.components[8]?.value, compose('PL', rep));
    };

    switch (seg.name) {
      case 'MSA': {
        const a = short(lookupTable('0008', g(1)));
        add(`Acknowledgement: ${a ? `${a} (${g(1)})` : g(1)} for message ${g(2)}${suffix(g(3))}.`, seg, false, g(1).endsWith('E') || g(1).endsWith('R'));
        break;
      }
      case 'ERR':
        add(`Error: ${first(g(8), g(3, 2), g(1, 4, 2), g(1))}`, seg, false, true);
        break;
      case 'EVN':
        if (dateText(g(2, 1))) add(`Event recorded ${dateText(g(2, 1))}.`, seg);
        break;
      case 'PID': {
        const ids = (seg.fields[2]?.repetitions ?? [])
          .filter((r) => r.components[0]?.value)
          .map((r) => (r.components[4]?.value ? `${r.components[4].value} ${r.components[0].value}` : r.components[0].value))
          .join(', ');
        const sex = first(lookupTable('0001', g(8, 1))?.toLowerCase(), g(8) ? `sex ${g(8)}` : '');
        const dob = parseHl7Date(g(7, 1));
        let born = dob ? `born ${formatHl7Date(g(7, 1).slice(0, 8))}` : '';
        if (dob && !g(29, 1)) {
          const age = ageOn(dob);
          if (age >= 0 && age < 130) born += ` (age ${age})`;
        }
        const died = g(30) === 'Y' ? `deceased ${dateText(g(29, 1))}`.trim() : '';
        add(join(', ', `Patient: ${first(xpn(5), '(no name)')}`, ids ? `ID ${ids}` : '', sex, born, died,
          compose('XAD', seg.fields[10]?.repetitions[0]) ?? '') + '.', seg);
        break;
      }
      case 'NK1': {
        const rel = first(lookupTable('0063', g(3, 1)), g(3, 2), g(3, 1));
        add(`Contact: ${xpn(2)}${rel ? ` (${rel})` : ''}${suffix(phone(5))}.`, seg);
        break;
      }
      case 'PV1': {
        const cls = first(lookupTable('0004', g(2, 1)), g(2));
        add(join(', ', `Visit: ${first(cls, 'unspecified')}`,
          location(3) ? `at ${location(3)}` : '',
          nameAt(7) ? `attending ${nameAt(7)}` : '',
          g(19, 1) ? `visit number ${g(19, 1)}` : '',
          dateText(g(44, 1)) ? `admitted ${dateText(g(44, 1))}` : '',
          dateText(g(45, 1)) ? `discharged ${dateText(g(45, 1))}` : '') + '.', seg);
        break;
      }
      case 'AL1': {
        const sev = first(lookupTable('0128', g(4, 1)), g(4, 2), g(4, 1));
        add(`Allergy: ${first(g(3, 2), g(3, 1))}${sev ? `, ${sev.toLowerCase()}` : ''}${suffix(g(5))}.`, seg);
        break;
      }
      case 'DG1':
        add(`Diagnosis: ${first(g(3, 2), g(4), g(3, 1))}${code(g(3, 1), g(3, 2))}.`, seg);
        break;
      case 'PR1':
        add(`Procedure: ${first(g(3, 2), g(4), g(3, 1))}${dated(g(5, 1))}.`, seg);
        break;
      case 'ORC': {
        const control = short(lookupTable('0119', g(1)));
        const status = short(lookupTable('0038', g(5)));
        add(join(', ',
          join(' ', 'Order', g(2, 1) ? `#${g(2, 1)}` : '', g(3, 1) ? `(filler #${g(3, 1)})` : ''),
          control ? `${g(1)} (${control.toLowerCase()})` : g(1),
          status ? `status: ${status.toLowerCase()}` : '') + '.', seg);
        break;
      }
      case 'OBR': {
        const status = short(lookupTable('0123', g(25)));
        add(join(' ', `Test: ${first(g(4, 2), g(4, 1))}${code(g(4, 1), g(4, 2))}`,
          nameAt(16) ? `ordered by ${nameAt(16)}` : '',
          dateText(g(7, 1)) ? `collected ${dateText(g(7, 1))}` : '',
          status ? `(${status.toLowerCase()})` : '') + '.', seg);
        break;
      }
      case 'OBX':
        lines.push(observation(seg));
        break;
      case 'NTE':
        if (g(3)) add(`Note: ${truncate(g(3).replace(/\n/g, ' '), 160)}`, seg, true);
        break;
      case 'SCH': {
        const reason = first(g(7, 2), g(7, 1), g(8, 2), g(8, 1));
        const st = first(lookupTable('0278', g(25, 1)), g(25, 2));
        add(join(' ', 'Appointment', reason ? `for ${reason}` : '',
          dateText(g(11, 4)) ? `at ${dateText(g(11, 4))}` : '',
          g(9) ? `lasting ${g(9)} ${g(10, 1)}`.trim() : '',
          st ? `(${st.toLowerCase()})` : '') + '.', seg);
        break;
      }
      case 'AIL':
        add(`Location: ${location(3)}${dated(g(6, 1), 'from')}.`, seg, true);
        break;
      case 'AIP':
        add(`Clinician: ${nameAt(3)}${suffix(first(g(4, 2), g(4, 1)))}.`, seg, true);
        break;
      case 'AIS':
        add(`Service: ${first(g(3, 2), g(3, 1))}${dated(g(4, 1), 'at')}.`, seg, true);
        break;
      case 'IN1':
        add(join(' ', `Insurance: ${first(g(4, 1), g(3, 1))}`,
          first(g(8), g(36)) ? `policy ${first(g(8), g(36))}` : '',
          g(2, 1) ? `(plan ${first(g(2, 2), g(2, 1))})` : '') + '.', seg);
        break;
      case 'GT1':
        add(`Guarantor: ${xpn(3)}${suffix(phone(6))}.`, seg);
        break;
      case 'MRG':
        add(`Merge: previous patient ID ${g(1, 1)}${g(5, 1) ? `, previous visit ${g(5, 1)}` : ''}.`, seg);
        break;
      case 'RXA':
        add(join(' ', `Administered: ${first(g(5, 2), g(5, 1))}`,
          g(6) && g(6) !== '999' ? `${g(6)} ${first(g(7, 2), g(7, 1))}`.trim() : '',
          dateText(g(3, 1)) ? `on ${dateText(g(3, 1))}` : '',
          g(15) ? `lot ${g(15)}` : '') + '.', seg);
        break;
      case 'RXE': case 'RXO': {
        const f = seg.name === 'RXE' ? 2 : 1;
        add(`Medication order: ${first(g(f, 2), g(f, 1))}.`, seg);
        break;
      }
      case 'TXA':
        add(`Document: ${first(lookupTable('0270', g(2)), g(2))}${suffix(first(lookupTable('0271', g(17)), g(17)))}.`, seg);
        break;
      case 'SPM':
        add(`Specimen: ${first(g(4, 2), g(4, 1))}${dated(g(17, 1), 'collected')}.`, seg, true);
        break;
    }
  }
  return lines;
}

function observation(obx: Segment): SummaryLine {
  const g = (f: number, c = 0) => segmentValue(obx, f, c);
  const what = first(g(3, 2), g(3, 1), 'Result');
  const type = g(2);
  const values = (obx.fields[4]?.repetitions ?? []).map((r) => {
    const c = (n: number) => r.components[n - 1]?.value ?? '';
    if (type === 'CE' || type === 'CWE') return first(c(2), c(1));
    if (type === 'SN') return compose('SN', r) ?? r.value;
    if (type === 'ED') return `[encapsulated ${first(c(2), 'data')}, ${c(5).length} chars]`;
    if (type === 'TS' || type === 'DTM' || type === 'DT') return dateText(c(1)) || r.value;
    return r.value.replace(/\n/g, ' ');
  });
  const value = truncate(values.filter(Boolean).join('; '), 200);
  const flags = (obx.fields[7]?.repetitions ?? [])
    .map((r) => r.components[0]?.value ?? '')
    .filter((f) => f && f !== 'N')
    .map((f) => lookupTable('0078', f) ?? f);
  const status = ({ P: 'preliminary', C: 'corrected', X: 'cannot be obtained' } as Record<string, string>)[g(11)] ?? '';
  return {
    text: join(' ', `${what}: ${first(value, '(no value)')}`, first(g(6, 2), g(6, 1)),
      g(7) ? `[ref ${g(7)}]` : '', flags.length ? `(${flags.join(', ')})` : '', status ? `(${status})` : ''),
    segment: obx,
    indent: true,
    flagged: flags.length > 0,
  };
}

/** The summary as plain text, one line per item, results indented. */
export const summaryText = (msg: Message) =>
  summarize(msg).map((l) => (l.indent ? '  ' : '') + l.text).join('\n');
