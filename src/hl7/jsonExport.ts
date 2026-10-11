import type { DecodedMessage, DecodedNode } from './decoder';

/** The decoded message as JSON, with names and meanings alongside values. */
export function toJson(decoded: DecodedMessage): string {
  const node = (n: DecodedNode): Record<string, unknown> => {
    const o: Record<string, unknown> = { path: n.path, name: n.name };
    if (n.dataType) o.type = n.dataType;
    if (n.kind !== 'segment') o.value = n.value;
    if (n.meaning) o.meaning = n.meaning;
    if (n.tableId) o.table = n.tableId;
    if (n.children.length) o[n.kind === 'segment' ? 'fields' : 'parts'] = n.children.map(node);
    return o;
  };
  const m = decoded.message;
  return JSON.stringify({
    messageType: m.messageType,
    description: decoded.title,
    version: m.version,
    schemaVersion: decoded.schema.version,
    controlId: m.controlId,
    segments: decoded.segments.map(node),
  }, null, 2);
}
