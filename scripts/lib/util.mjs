// Small helpers shared by the build. No dependencies.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function slugify(s) {
  const slug = String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug || 'event';
}

// Dates are plain 'YYYY-MM-DD' strings throughout (races rarely have times).
const toUTC = (ymd) => new Date(`${ymd}T00:00:00Z`);

export function addDays(ymd, n) {
  const d = toUTC(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}

const fmt = (opts) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts });
const fMonth = fmt({ month: 'long' });
const fMon = fmt({ month: 'short' });
const fDow = fmt({ weekday: 'short' });
const fDowLong = fmt({ weekday: 'long' });

export const monthName = (ymd) => fMonth.format(toUTC(ymd));
export const monShort = (ymd) => fMon.format(toUTC(ymd));
export const dowShort = (ymd) => fDow.format(toUTC(ymd));
export const dowLong = (ymd) => fDowLong.format(toUTC(ymd));
export const dayNum = (ymd) => String(Number(ymd.slice(8, 10)));
export const yearOf = (ymd) => Number(ymd.slice(0, 4));

// "May 15–17, 2027", "May 30 – Jun 1, 2027", "Dec 31, 2026 – Jan 2, 2027"
export function rangeText(start, end) {
  if (!end || end === start) return `${monShort(start)} ${dayNum(start)}, ${yearOf(start)}`;
  if (yearOf(start) !== yearOf(end))
    return `${monShort(start)} ${dayNum(start)}, ${yearOf(start)} – ${monShort(end)} ${dayNum(end)}, ${yearOf(end)}`;
  if (start.slice(5, 7) === end.slice(5, 7))
    return `${monShort(start)} ${dayNum(start)}–${dayNum(end)}, ${yearOf(start)}`;
  return `${monShort(start)} ${dayNum(start)} – ${monShort(end)} ${dayNum(end)}, ${yearOf(start)}`;
}

export function dowRange(start, end) {
  if (!end || end === start) return dowLong(start);
  return `${dowLong(start)}–${dowLong(end)}`;
}

export function todayIn(timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function dateInZone(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
