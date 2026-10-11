import type { DecodedMessage, DecodedNode } from './decoder';
import { walk } from './decoder';
import { isValidHl7Date } from './datetime';
import type { Segment } from './model';
import { resolveVersion, Schema, StructureItem, table } from './schema';
import { segmentName } from './segmentNames';

export type Severity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: Severity;
  path: string;
  message: string;
  /** Offset of the offending text, or -1 when the problem is something missing. */
  start: number;
  length: number;
}

const issue = (severity: Severity, path: string, message: string, start = -1, length = 0): ValidationIssue =>
  ({ severity, path, message, start, length });

/** Checks a message against its version's definitions. */
export function validate(decoded: DecodedMessage): ValidationIssue[] {
  const { message: msg, schema } = decoded;
  const issues: ValidationIssue[] = [];
  if (msg.segments.length === 0) return [issue('error', '', 'The text contains no HL7 segments.')];

  const first = msg.segments[0];
  if (first.name !== 'MSH') issues.push(issue('error', first.name, 'A message must start with an MSH segment.', first.start, first.raw.length));
  if (msg.header) {
    if (msg.header.raw.length < 8) issues.push(issue('error', 'MSH', 'MSH is too short to declare its delimiters.', msg.header.start, msg.header.raw.length));
    if (!msg.version) issues.push(issue('warning', 'MSH-12', `No version in MSH-12; decoded as v${schema.version}.`));
    else if (resolveVersion(msg.version) !== msg.version) issues.push(issue('info', 'MSH-12', `No definitions bundled for v${msg.version}; using v${schema.version}.`));
  }

  for (const seg of msg.segments) validateSegment(seg, schema, issues);
  validateValues(decoded.segments, issues);
  validateStructure(decoded, issues);
  return issues;
}

function validateSegment(seg: Segment, schema: Schema, issues: ValidationIssue[]) {
  const segPath = seg.occurrence > 1 ? `${seg.name}[${seg.occurrence}]` : seg.name;
  if (!/^[A-Z0-9]{3}$/.test(seg.name)) {
    issues.push(issue('error', segPath, `'${seg.name}' is not a valid segment ID.`, seg.start, Math.min(3, seg.raw.length)));
    return;
  }
  const defs = schema.segment(seg.name);
  if (!defs) {
    if (!seg.name.startsWith('Z')) issues.push(issue('warning', segPath, `${seg.name} is not defined in v${schema.version}.`, seg.start, 3));
    return;
  }
  for (const def of defs) {
    const field = seg.fields[def.number - 1];
    const path = `${segPath}-${def.number}`;
    if (def.required && (!field || !field.raw))
      issues.push(issue('error', path, `Required field '${def.name}' is empty.`, field?.start ?? seg.start + seg.raw.length, 0));
    if (field && field.repetitions.length > 1 && !def.repeating)
      issues.push(issue('warning', path, `'${def.name}' repeats but is not a repeating field.`, field.start, field.raw.length));
    if (def.withdrawn && field?.raw)
      issues.push(issue('info', path, `Field ${def.number} was withdrawn in v${schema.version} but has a value.`, field.start, field.raw.length));
  }
  const extra = seg.fields.slice(defs.length).find((f) => f.raw);
  if (extra)
    issues.push(issue('warning', `${segPath}-${extra.number}`,
      `${seg.name} defines ${defs.length} fields in v${schema.version}; field ${extra.number} has data.`, extra.start, extra.raw.length));
}

function formatProblem(node: DecodedNode): string | undefined {
  const v = node.value;
  switch (node.dataType) {
    case 'NM': return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(v.trim()) ? undefined : `'${v}' is not a number.`;
    case 'SI': return /^\d+$/.test(v) ? undefined : `'${v}' is not a sequence number.`;
    case 'DT': return isValidHl7Date(v, 'DT') ? undefined : `'${v}' is not a date (YYYYMMDD).`;
    case 'DTM': case 'TS': return isValidHl7Date(v, 'DTM') ? undefined : `'${v}' is not a date/time (YYYYMMDDHHMMSS).`;
    case 'TM': return isValidHl7Date(v, 'TM') ? undefined : `'${v}' is not a time (HHMM[SS]).`;
  }
  return undefined;
}

function validateValues(segments: DecodedNode[], issues: ValidationIssue[]) {
  for (const node of walk(segments)) {
    if (node.kind === 'segment' || !node.raw || node.children.length > 0) continue; // check leaves only
    if (node.kind === 'field' && node.path.startsWith('MSH-') && node.number <= 2) continue;
    if (node.value === '""') continue;
    const problem = formatProblem(node);
    if (problem) {
      issues.push(issue('warning', node.path, `${node.name}: ${problem}`, node.start, node.length));
      continue;
    }
    // Codes missing from HL7-defined tables. Table values follow the latest HL7 release, so report as info.
    if (node.tableId && (node.dataType === 'ID' || node.dataType === 'CNE')) {
      const t = table(node.tableId);
      const codingSystemRef = node.tableId === '0396' && (/^HL7\d{4}$/i.test(node.value) || node.value.startsWith('99'));
      if (t && Object.keys(t.values).length > 0 && !(node.value in t.values) && !codingSystemRef)
        issues.push(issue('info', node.path, `'${node.value}' is not in HL7 table ${node.tableId} (${t.name}).`, node.start, node.length));
    }
  }
}

function validateStructure(decoded: DecodedMessage, issues: ValidationIssue[]) {
  const { message: msg, schema } = decoded;
  const id = schema.resolveStructure(msg.messageCode, msg.triggerEvent, msg.messageStructure);
  const structure = schema.structure(id);
  if (!id || !structure) return;

  const allowed = new Set<string>();
  const collect = (items: StructureItem[]) => items.forEach((i) => { if (i.segment) allowed.add(i.segment); collect(i.items); });
  collect(structure);

  const present = new Set(msg.segments.map((s) => s.name));
  for (const seg of msg.segments) {
    if (!allowed.has(seg.name) && !seg.name.startsWith('Z'))
      issues.push(issue('warning', seg.occurrence > 1 ? `${seg.name}[${seg.occurrence}]` : seg.name,
        `${seg.name} is not part of the ${id} structure.`, seg.start, 3));
  }
  const firstRequired = (g: StructureItem): string | undefined => {
    for (const i of g.items) {
      if (i.segment && i.min > 0) return i.segment;
      if (i.group && i.min > 0) return firstRequired(i);
    }
    return undefined;
  };
  for (const item of structure) {
    if (item.min <= 0) continue;
    const lead = item.segment ?? firstRequired(item);
    if (lead && !present.has(lead)) issues.push(issue('error', lead, `${id} requires segment ${lead} (${segmentName(lead)}).`));
  }
}
