import { Delimiters } from './delimiters';

/** Converts HL7 escape sequences (\F\, \S\, \X0D\, \.br\ ...) to plain text. Unknown sequences are kept. */
export function decodeEscapes(raw: string, d: Delimiters): string {
  if (!raw.includes(d.escape)) return raw;
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    const close = c === d.escape ? raw.indexOf(d.escape, i + 1) : -1;
    if (close < 0) {
      out += c;
      i++;
      continue;
    }
    const decoded = decodeSequence(raw.slice(i + 1, close), d);
    out += decoded ?? raw.slice(i, close + 1);
    i = close + 1;
  }
  return out;
}

function decodeSequence(seq: string, d: Delimiters): string | null {
  switch (seq) {
    case 'F': return d.field;
    case 'S': return d.component;
    case 'T': return d.subComponent;
    case 'R': return d.repetition;
    case 'E': return d.escape;
    case 'P': return d.truncation ?? '#';
    case 'H': case 'N': return ''; // highlight on/off
    case '.br': case '.sp': return '\n';
    case '.fi': case '.nf': case '.ce': return '';
  }
  const sp = /^\.sp\s*(\d+)$/.exec(seq);
  if (sp) return '\n'.repeat(Math.max(1, Number(sp[1])));
  if (/^\.(in|ti|sk)/.test(seq)) return '';
  if (/^X([0-9A-Fa-f]{2})+$/.test(seq)) {
    let s = '';
    for (let i = 1; i < seq.length; i += 2) s += String.fromCharCode(parseInt(seq.slice(i, i + 2), 16));
    return s;
  }
  return null; // \Cxxyy\, \Mxxyyzz\, \Zxx\ and anything unknown
}

export function encodeEscapes(text: string, d: Delimiters): string {
  let out = '';
  for (const c of text) {
    if (c === d.escape) out += `${d.escape}E${d.escape}`;
    else if (c === d.field) out += `${d.escape}F${d.escape}`;
    else if (c === d.component) out += `${d.escape}S${d.escape}`;
    else if (c === d.subComponent) out += `${d.escape}T${d.escape}`;
    else if (c === d.repetition) out += `${d.escape}R${d.escape}`;
    else if (c === '\r') out += `${d.escape}X0D${d.escape}`;
    else if (c === '\n') out += `${d.escape}.br${d.escape}`;
    else out += c;
  }
  return out;
}
