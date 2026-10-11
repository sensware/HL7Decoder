/** Reads HL7 DT/TM/DTM/TS values: YYYY[MM[DD[HH[MM[SS[.S+]]]]]][+/-ZZZZ]. */
const DTM_RE = /^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:\.(\d{1,4}))?([+-]\d{4})?$/;
const TM_RE = /^(\d{2})(\d{2})?(\d{2})?(?:\.(\d{1,4}))?([+-]\d{4})?$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const zone = (z?: string) => (z ? ` (${z.slice(0, 3)}:${z.slice(3)})` : '');
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Formats a value for display, e.g. "20240105143000" becomes "5 Jan 2024 14:30:00". Null if invalid. */
export function formatHl7Date(value: string, type: 'DT' | 'TM' | 'DTM' = 'DTM'): string | null {
  if (!value) return null;
  if (type === 'TM') {
    const t = TM_RE.exec(value);
    if (!t) return null;
    const [h, mi, s] = [Number(t[1]), Number(t[2] ?? 0), Number(t[3] ?? 0)];
    if (h > 23 || mi > 59 || s > 59) return null;
    return `${pad(h)}:${pad(mi)}${t[3] ? `:${pad(s)}` : ''}${zone(t[5])}`;
  }
  const m = DTM_RE.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = m[2] ? Number(m[2]) : 0;
  const day = m[3] ? Number(m[3]) : 0;
  if (m[2] && (month < 1 || month > 12)) return null;
  if (m[3] && (day < 1 || day > daysIn(year, month))) return null;
  if (type === 'DT' && m[4]) return null;
  const date = !month ? `${year}` : !day ? `${MONTHS[month - 1]} ${year}` : `${day} ${MONTHS[month - 1]} ${year}`;
  if (!m[4]) return date;
  const [hh, mm, ss] = [Number(m[4]), Number(m[5] ?? 0), Number(m[6] ?? 0)];
  if (hh > 23 || mm > 59 || ss > 59) return null;
  return `${date} ${pad(hh)}:${pad(mm)}${m[6] ? `:${pad(ss)}` : ''}${zone(m[8])}`;
}

export const isValidHl7Date = (value: string, type: 'DT' | 'TM' | 'DTM') => formatHl7Date(value, type) !== null;

/** Parses the date part (needs at least YYYYMMDD). */
export function parseHl7Date(value: string): Date | null {
  const m = DTM_RE.exec(value ?? '');
  if (!m || !m[2] || !m[3] || formatHl7Date(value) === null) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
}

export function ageOn(dob: Date, today = new Date()): number {
  let age = today.getFullYear() - dob.getFullYear();
  const before = today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate());
  if (before) age--;
  return age;
}
