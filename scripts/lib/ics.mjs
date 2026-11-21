// Minimal iCalendar (.ics) parser for Google Calendar's public feed.
// Handles line folding, escaping, all-day and timed events, and multi-day spans.
import { addDays, dateInZone } from './util.mjs';

function unescapeText(v) {
  return v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
}

function parseProps(text) {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events = [];
  let cur = null;
  let depth = 0; // ignore nested blocks such as VALARM
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; depth = 0; continue; }
    if (!cur) continue;
    if (line === 'END:VEVENT') { events.push(cur); cur = null; continue; }
    if (line.startsWith('BEGIN:')) { depth++; continue; }
    if (line.startsWith('END:')) { depth--; continue; }
    if (depth > 0) continue;
    const m = line.match(/^([A-Za-z0-9-]+)((?:;[^:]*)?):(.*)$/);
    if (!m) continue;
    const name = m[1].toUpperCase();
    const params = {};
    for (const p of m[2].split(';').filter(Boolean)) {
      const [k, ...rest] = p.split('=');
      params[k.toUpperCase()] = rest.join('=').replace(/^"|"$/g, '');
    }
    if (!(name in cur)) cur[name] = { value: m[3], params };
  }
  return events;
}

// Returns { date: 'YYYY-MM-DD', allDay, midnight }
function parseWhen(prop, timeZone) {
  if (!prop) return null;
  const v = prop.value.trim();
  const isDate = prop.params.VALUE === 'DATE' || /^\d{8}$/.test(v);
  const ymd = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  if (isDate) return { date: ymd, allDay: true };
  const t = v.match(/^(\d{8})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!t) return { date: ymd, allDay: true };
  if (t[5] === 'Z') {
    const d = new Date(`${ymd}T${t[2]}:${t[3]}:${t[4]}Z`);
    const local = dateInZone(d, timeZone);
    const hm = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
    return { date: local, allDay: false, midnight: hm === '00:00' };
  }
  // Local time with TZID, or floating time: the date part is already local.
  return { date: ymd, allDay: false, midnight: t[2] === '00' && t[3] === '00' };
}

// Latest date a repeating event (RRULE) can reach, as YYYY-MM-DD, or '9999-12-31' if it
// never ends. COUNT is estimated generously (31-day months), which only errs toward warning.
export function seriesEnd(start, rrule) {
  const rule = Object.fromEntries(String(rrule).split(';').map((kv) => kv.split('=')));
  if (rule.UNTIL) return `${rule.UNTIL.slice(0, 4)}-${rule.UNTIL.slice(4, 6)}-${rule.UNTIL.slice(6, 8)}`;
  if (!rule.COUNT) return '9999-12-31';
  const step = { DAILY: 1, WEEKLY: 7, MONTHLY: 31, YEARLY: 366 }[rule.FREQ] || 366;
  return addDays(start, step * (Number(rule.INTERVAL) || 1) * Number(rule.COUNT));
}

export function parseICS(text, { timeZone = 'America/Chicago' } = {}) {
  const out = [];
  let skippedRecurring = 0;
  for (const p of parseProps(text)) {
    const start = parseWhen(p.DTSTART, timeZone);
    if (!start) continue;
    const endRaw = parseWhen(p.DTEND, timeZone);
    let end = start.date;
    if (endRaw) {
      // All-day DTEND is exclusive; so is a timed event ending exactly at midnight.
      end = endRaw.allDay || endRaw.midnight ? addDays(endRaw.date, -1) : endRaw.date;
      if (end < start.date) end = start.date;
    }
    if (p.RRULE) skippedRecurring++;
    const text = (k) => (p[k] ? unescapeText(p[k].value).trim() : '');
    out.push({
      uid: text('UID'),
      summary: text('SUMMARY'),
      description: text('DESCRIPTION'),
      location: text('LOCATION'),
      url: text('URL'),
      status: text('STATUS').toUpperCase(),
      start: start.date,
      end,
      recurring: Boolean(p.RRULE),
      rrule: p.RRULE ? p.RRULE.value : '',
    });
  }
  return { events: out, skippedRecurring };
}
