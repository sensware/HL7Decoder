import type { Message } from './model';
import { getSegment } from './model';

/**
 * An address inside a message such as "PID-5.1", "OBX[2]-5", "PID-3[2].4.1" or "MSH.9.2".
 * Zero means "not specified" for every part after the segment.
 */
export interface HL7Path {
  segment: string;
  segmentOccurrence: number;
  field: number;
  repetition: number;
  component: number;
  subComponent: number;
}

const PATH_RE = /^\s*([A-Z0-9]{3})(?:\[(\d+)\])?(?:[-.](\d+)(?:\[(\d+)\])?(?:\.(\d+)(?:\.(\d+))?)?)?\s*$/i;

export function parsePath(text: string): HL7Path | null {
  const m = PATH_RE.exec(text ?? '');
  if (!m) return null;
  const n = (v: string | undefined, def: number) => (v === undefined ? def : Number(v));
  return {
    segment: m[1].toUpperCase(),
    segmentOccurrence: n(m[2], 1),
    field: n(m[3], 0),
    repetition: n(m[4], 0),
    component: n(m[5], 0),
    subComponent: n(m[6], 0),
  };
}

export function formatPath(p: HL7Path): string {
  let s = p.segment;
  if (p.segmentOccurrence > 1) s += `[${p.segmentOccurrence}]`;
  if (p.field > 0) {
    s += `-${p.field}`;
    if (p.repetition > 1) s += `[${p.repetition}]`;
    if (p.component > 0) {
      s += `.${p.component}`;
      if (p.subComponent > 0) s += `.${p.subComponent}`;
    }
  }
  return s;
}

/** Reads the decoded value at a path, or null if the message has nothing there. */
export function readPath(msg: Message, p: HL7Path): string | null {
  const seg = getSegment(msg, p.segment, p.segmentOccurrence);
  if (!seg) return null;
  if (p.field === 0) return seg.raw;
  const field = seg.fields[p.field - 1];
  if (!field) return null;
  if (p.repetition === 0 && p.component === 0) return field.value;
  const rep = field.repetitions[Math.max(1, p.repetition) - 1];
  if (!rep) return null;
  if (p.component === 0) return rep.value;
  const comp = rep.components[p.component - 1];
  if (!comp) return null;
  if (p.subComponent === 0) return comp.value;
  return comp.subComponents[p.subComponent - 1]?.value ?? null;
}
