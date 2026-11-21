// BikeReg event search. Runs at build time (on GitHub Actions), never in the
// visitor's browser, so CORS does not apply.
//
// Documented at https://www.bikereg.com/api/EventSearchDoc.aspx. That page lists
// the query parameters (states, year, permit, startpage, ...) but not the endpoint
// address or the response fields, so field access below is deliberately tolerant.

export const BIKEREG_ENDPOINT = process.env.BIKEREG_ENDPOINT || 'https://www.bikereg.com/api/search';

const pick = (obj, ...patterns) => {
  for (const re of patterns) {
    const key = Object.keys(obj).find((k) => re.test(k));
    if (key && obj[key] != null && obj[key] !== '') return obj[key];
  }
  return '';
};

function toYMD(v) {
  if (!v) return '';
  const ms = String(v).match(/\/Date\((-?\d+)/); // ASP.NET "/Date(1712793600000)/"
  if (ms) return new Date(Number(ms[1])).toISOString().slice(0, 10);
  const iso = String(v).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const us = String(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  return '';
}

export function normalizeBikeReg(e) {
  const id = pick(e, /^EventId$/i, /eventid/i, /^id$/i);
  let url = pick(e, /^EventUrl$/i, /url/i);
  if (!url && id) url = `https://www.bikereg.com/${id}`;
  return {
    id: String(id || ''),
    name: String(pick(e, /^EventName$/i, /name/i) || ''),
    start: toYMD(pick(e, /^EventDate$/i, /startdate/i, /date/i)),
    end: toYMD(pick(e, /^EventEndDate$/i, /enddate/i)),
    permit: String(pick(e, /permit/i) || '').trim(),
    url: String(url || ''),
    city: String(pick(e, /city/i) || ''),
  };
}

export async function fetchBikeReg({ states, years }) {
  const all = [];
  for (const year of years) {
    for (let startpage = 1; startpage < 1000; startpage += 100) {
      const qs = new URLSearchParams({ states, year: String(year), startpage: String(startpage) });
      const res = await fetch(`${BIKEREG_ENDPOINT}?${qs}`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`BikeReg ${res.status} for ${year}`);
      const json = await res.json();
      const list = json.MatchingEvents || json.matchingEvents || [];
      all.push(...list);
      if (list.length < 100) break;
    }
  }
  return all.map(normalizeBikeReg);
}

const words = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
function similar(a, b) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}

// Adds registration links from BikeReg. Matches on USA Cycling permit number first,
// then on a BikeReg link already in the calendar entry, then on same start date + similar name.
// Returns a list of problems worth a human look.
export function enrich(races, bikereg) {
  const problems = [];
  const byPermit = new Map(bikereg.filter((b) => b.permit).map((b) => [b.permit, b]));
  for (const r of races) {
    let match = null;
    let how = '';
    if (r.permit && byPermit.has(r.permit)) { match = byPermit.get(r.permit); how = 'permit'; }
    if (!match && r.registration) {
      match = bikereg.find((b) => b.url && b.id && r.registration.includes(b.id)) || null;
      if (match) how = 'link';
    }
    if (!match) {
      match = bikereg.find((b) => b.start === r.start && similar(b.name, r.title) >= 0.5) || null;
      if (match) how = 'name';
    }
    if (!match) continue;
    r.registration = match.url || r.registration;
    r.bikeregName = match.name;
    r.matchedBy = how;
    if (match.start && match.start !== r.start) {
      problems.push(`**${r.title}**: IBRA calendar says ${r.start}, BikeReg ("${match.name}") says ${match.start}. Matched by ${how}.`);
    }
  }
  return problems;
}
