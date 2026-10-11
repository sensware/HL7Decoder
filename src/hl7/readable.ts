import type { Repetition } from './model';
import { formatHl7Date } from './datetime';

const join = (sep: string, parts: string[]) => parts.filter((p) => p.length > 0).join(sep);

/** Joins name parts in reading order: prefix, given, middle, family, suffix, degree. */
export function personName(family: string, given: string, middle: string, suffix: string, prefix: string, degree: string): string {
  return join(' ', [prefix, given, middle, family, suffix, degree]);
}

/**
 * Renders a composite value as one readable line, for the "meaning" column and the summary.
 * Handles names (XPN, XCN), addresses (XAD), phones (XTN), locations (PL), timestamps and quantities.
 * @param type The HL7 datatype of the value.
 * @param rep One repetition of the field.
 * @returns The text, or `undefined` for types it does not know or values with nothing to show.
 * @example compose('XPN', <Doe^John^Q^Jr^Dr>) // 'Dr John Q Doe Jr'
 */
export function compose(type: string, rep?: Repetition): string | undefined {
  if (!rep) return undefined;
  const c = (n: number) => (rep.components[n - 1]?.subComponents[0].value ?? '').trim();
  let result: string | undefined | null;
  switch (type) {
    case 'XPN': case 'PN':
      result = personName(c(1), c(2), c(3), c(4), c(5), c(6)); break;
    case 'XCN': case 'CN': case 'CNN': case 'NDL':
      result = join(' ', [personName(c(2), c(3), c(4), c(5), c(6), c(7)), c(1) ? `(${c(1)})` : '']); break;
    case 'XAD': case 'AD':
      result = join(', ', [c(1), c(2), c(3), join(' ', [c(4), c(5)]), c(6)]); break;
    case 'XTN': case 'TN':
      result = c(1) || join(' ', [c(5) ? '+' + c(5) : '', c(6), c(7), c(8) ? 'x' + c(8) : '', c(4)]); break;
    case 'XON': result = c(1); break;
    case 'PL': result = join(' / ', [c(1), c(2), c(3), c(4)]); break;
    case 'TS': case 'DTM': result = formatHl7Date(c(1)); break;
    case 'CQ': case 'MO': case 'FC': result = join(' ', [c(1), c(2)]); break;
    case 'SN': result = join(' ', [c(1), c(2), c(3), c(4)]); break;
  }
  return result && result.trim() ? result : undefined;
}
