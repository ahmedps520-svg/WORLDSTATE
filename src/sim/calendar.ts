export const START_DATE = Date.UTC(2026, 10, 19);
const DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function dateOf(day: number) { return new Date(START_DATE + Math.floor(day) * DAY); }
export function fmtDate(day: number) { const d = dateOf(day); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
export function fmtDateLong(day: number) { const d = dateOf(day); return `${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
export function fmtMonth(day: number) { const d = dateOf(day); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
export function yearOf(day: number) { return dateOf(day).getUTCFullYear(); }
export function dayOfDate(y: number, m: number, d: number) { return Math.round((Date.UTC(y, m, d) - START_DATE) / DAY); }
export function isMonthStart(day: number) { return dateOf(day).getUTCDate() === 1; }
export function fmtDuration(days: number) {
  if (days < 45) return `${Math.round(days)} days`;
  if (days < 730) return `${Math.round(days / 30.4)} months`;
  const y = days / 365.25; return `${y.toFixed(y < 10 ? 1 : 0)} years`;
}
