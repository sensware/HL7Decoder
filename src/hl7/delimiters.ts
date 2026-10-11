/** The separator and escape characters a message declares in MSH-1 and MSH-2. */
export interface Delimiters {
  field: string;
  component: string;
  repetition: string;
  escape: string;
  subComponent: string;
  truncation?: string;
}

export const DEFAULT_DELIMITERS: Delimiters = {
  field: '|',
  component: '^',
  repetition: '~',
  escape: '\\',
  subComponent: '&',
};

/**
 * Reads the delimiters a message declares at the start of its MSH, FHS or BHS segment.
 * MSH-1 is the character after "MSH"; MSH-2 lists component, repetition, escape, subcomponent
 * and (from v2.7) truncation characters. Missing characters fall back to the HL7 defaults.
 * @example delimitersFromHeader('MSH|^~\\&|...').component // '^'
 */
export function delimitersFromHeader(header: string): Delimiters {
  if (header.length < 4) return DEFAULT_DELIMITERS;
  const field = header[3];
  const end = header.indexOf(field, 4);
  const enc = end < 0 ? header.slice(4) : header.slice(4, end);
  const at = (i: number, fallback: string) => (i < enc.length ? enc[i] : fallback);
  return {
    field,
    component: at(0, '^'),
    repetition: at(1, '~'),
    escape: at(2, '\\'),
    subComponent: at(3, '&'),
    truncation: enc.length > 4 ? enc[4] : undefined,
  };
}
