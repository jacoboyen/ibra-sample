// BikeReg event search. Runs at build time (on GitHub Actions), never in the
// visitor's browser, so CORS does not apply.
//
// Endpoint confirmed working (Nov 2026): returns JSON { MatchingEvents, ResultCount }.
// Fields seen: EventId, EventName, EventDate/EventEndDate ("/Date(ms-0500)/"), EventCity,
// EventState, EventPermalink, EventUrl, EventWebsite, Permit. Access stays tolerant anyway.
// Don't switch to the public /events page: it sits behind a Cloudflare bot challenge.

export const BIKEREG_ENDPOINT = process.env.BIKEREG_ENDPOINT || 'https://www.bikereg.com/api/search';

// USA Cycling permits appear in several shapes: "2027-15418" in the calendar, and
// "15418" or "<guid>:15418" from BikeReg. The trailing number is the stable part.
export function permitKey(v) {
  const m = String(v || '').match(/(\d+)\s*$/);
  return m ? String(Number(m[1])) : '';
}

// EventLogo is a site-relative path like "/BR/VirtualImages/EventLogos/<id>.png".
function bikeregLogo(e) {
  const v = String(pick(e, /^EventLogo$/i) || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v.replace(/^http:/i, 'https:');
  return `https://www.bikereg.com${v.startsWith('/') ? '' : '/'}${v}`;
}

// BikeReg's EventUrl is sometimes malformed ("http://www.BikeReg.comhttp://other.site/").
function bikeregUrl(e, id) {
  const ok = (u) => /^https?:\/\/[^/]*bikereg\.com\/[^:]+$/i.test(String(u || ''));
  const url = [pick(e, /^EventPermalink$/i), pick(e, /^EventUrl$/i)].find(ok);
  if (url) return String(url).replace(/^http:\/\/www\.bikereg\.com/i, 'https://www.bikereg.com');
  return id ? `https://www.bikereg.com/${id}` : '';
}

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
  return {
    id: String(id || ''),
    name: String(pick(e, /^EventName$/i, /name/i) || ''),
    start: toYMD(pick(e, /^EventDate$/i, /startdate/i, /date/i)),
    end: toYMD(pick(e, /^EventEndDate$/i, /enddate/i)),
    permit: String(pick(e, /permit/i) || '').trim(),
    url: bikeregUrl(e, id),
    logo: bikeregLogo(e),
    city: String(pick(e, /city/i) || ''),
  };
}

export async function fetchBikeReg({ states, years }) {
  const all = [];
  for (const year of years) {
    for (let startpage = 1; startpage < 1000; startpage += 100) {
      const qs = new URLSearchParams({ states, year: String(year), startpage: String(startpage) });
      const res = await fetch(`${BIKEREG_ENDPOINT}?${qs}`, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; static-site-build/1.0)' } });
      if (!res.ok) throw new Error(`BikeReg HTTP ${res.status} for ${year}`);
      if (!/json/i.test(res.headers.get('content-type') || '')) throw new Error(`BikeReg returned ${res.headers.get('content-type') || 'no content type'} instead of JSON for ${year} (likely a bot check)`);
      const json = await res.json();
      const list = json.MatchingEvents || json.matchingEvents || [];
      all.push(...list);
      if (list.length < 100) break;
    }
  }
  return all.map(normalizeBikeReg);
}

// Words too common in Iowa race names to count as evidence of a match
// (e.g. "Iowa Games TT" must not match "Iowa Valley RAGBRAI Charter").
const STOP = new Set(['iowa', 'race', 'races', 'the', 'and', 'series']);
const words = (s) => new Set(s.toLowerCase().replace(/(\w)-(\w)/g, '$1$2').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w)));
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
  const byPermit = new Map(bikereg.filter((b) => permitKey(b.permit)).map((b) => [permitKey(b.permit), b]));
  for (const r of races) {
    let match = null;
    let how = '';
    const key = permitKey(r.permit);
    if (key && byPermit.has(key)) { match = byPermit.get(key); how = 'permit'; }
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
    r.bikeregUrl = match.url || '';
    r.logo = match.logo || '';
    r.bikeregName = match.name;
    r.matchedBy = how;
    if (match.start && match.start !== r.start) {
      problems.push(`**${r.title}**: IBRA calendar says ${r.start}, BikeReg ("${match.name}") says ${match.start}. Matched by ${how}.`);
    }
  }
  return problems;
}
