#!/usr/bin/env node
// Builds the IBRA site into ./dist.
//
// Data sources:
//   1. Google Calendar public feed (the official race list)  -> content/site.json "calendar_ics"
//   2. BikeReg event search (registration links)              -> matched by USAC permit number
//   3. content/*.json (board, documents, page copy)           -> edited through Pages CMS
//
// Each run saves every season's races to data/seasons/YYYY.json. Past seasons are
// read from those files, so they stay intact even if old events leave the calendar.
//
// Environment overrides (for local testing):
//   ICS_FILE=path       read the calendar from a file instead of Google
//   BIKEREG_FILE=path   read BikeReg results from a JSON file
//   SKIP_BIKEREG=1      don't call BikeReg
//   TODAY=YYYY-MM-DD    pretend it's a different day
//   DATA_DIR=path       save season snapshots somewhere other than data/seasons
//   SITE_URL=https://example.org/sub   public address (set automatically on GitHub Actions)

import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseICS, seriesEnd } from './lib/ics.mjs';
import { normalizeEvents } from './lib/events.mjs';
import { fetchBikeReg, enrich, normalizeBikeReg } from './lib/bikereg.mjs';
import { makeRenderer } from './lib/render.mjs';
import { todayIn, yearOf, rangeText } from './lib/util.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const readJSON = async (p, fallback) => (existsSync(join(root, p)) ? JSON.parse(await readFile(join(root, p), 'utf8')) : fallback);
const log = (...a) => console.log('•', ...a);
const warnings = [];
// On GitHub Actions, "::warning::" also shows the message on the run's summary page.
const warn = (m) => { warnings.push(m); console.warn(process.env.GITHUB_ACTIONS ? `::warning::${m}` : `! ${m}`); };

const site = await readJSON('content/site.json');
const board = await readJSON('content/board.json', { members: [] });
const documents = await readJSON('content/documents.json', { documents: [] });
const about = await readJSON('content/about.json', {});
const promoters = await readJSON('content/promoters.json', {});
const redirects = await readJSON('content/redirects.json', {});

const today = process.env.TODAY || todayIn(site.timezone);
const thisYear = yearOf(today);
const siteUrl = (process.env.SITE_URL || 'http://localhost:8080').replace(/\/+$/, '');
const base = new URL(siteUrl).pathname.replace(/\/+$/, '');

// ---------- 1. Calendar ----------
let live = null;
try {
  const icsText = process.env.ICS_FILE
    ? await readFile(join(root, process.env.ICS_FILE), 'utf8')
    : await (async () => {
        const res = await fetch(site.calendar_ics);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })();
  const { events } = parseICS(icsText, { timeZone: site.timezone });
  // Old repeating events can't affect frozen past seasons, so only flag ones that reach this season.
  const repeating = events.filter((e) => e.recurring && seriesEnd(e.start, e.rrule) >= `${thisYear}-01-01`);
  if (repeating.length) warn(`Repeating calendar event(s) found; only the first date of each is shown. Enter each date as its own event: ${repeating.map((e) => `"${e.summary}" (from ${e.start})`).join(', ')}.`);
  live = normalizeEvents(events, site.disciplines);
  log(`Calendar: ${live.length} events`);
} catch (err) {
  warn(`Could not read the Google Calendar feed (${err.message}). Building from saved season data.`);
}

// ---------- 2. Seasons: merge live data with saved snapshots ----------
const seasonDir = join(root, process.env.DATA_DIR || 'data/seasons');
await mkdir(seasonDir, { recursive: true });
const saved = new Map();
for (const f of await readdir(seasonDir)) {
  const m = f.match(/^(\d{4})\.json$/);
  if (m) saved.set(Number(m[1]), JSON.parse(await readFile(join(seasonDir, f), 'utf8')));
}
const liveByYear = new Map();
for (const r of live || []) {
  if (!liveByYear.has(r.year)) liveByYear.set(r.year, []);
  liveByYear.get(r.year).push(r);
}
if (!live && saved.size === 0 && !process.env.ALLOW_EMPTY) {
  console.error('No calendar data and no saved seasons: stopping so an empty calendar is not published. (Set ALLOW_EMPTY=1 to override.)');
  process.exit(1);
}
const seasons = new Map();
for (const y of new Set([...saved.keys(), ...liveByYear.keys()])) {
  // Past seasons are frozen once saved; current and future seasons follow the calendar.
  if (y < thisYear && saved.has(y)) seasons.set(y, saved.get(y));
  else if (live) seasons.set(y, liveByYear.get(y) || []);
  else if (saved.has(y)) seasons.set(y, saved.get(y));
}

// ---------- 3. BikeReg ----------
const active = [...seasons.entries()].filter(([y]) => y >= thisYear).flatMap(([, rs]) => rs);
let problems = [];
if (process.env.SKIP_BIKEREG !== '1' && active.length) {
  try {
    const years = [...new Set(active.map((r) => r.year))];
    const list = process.env.BIKEREG_FILE
      ? JSON.parse(await readFile(join(root, process.env.BIKEREG_FILE), 'utf8')).MatchingEvents.map(normalizeBikeReg)
      : await fetchBikeReg({ states: site.bikereg_states, years });
    problems = enrich(active, list);
    log(`BikeReg: ${list.length} events, ${active.filter((r) => r.matchedBy).length} matched`);
  } catch (err) {
    warn(`BikeReg lookup failed (${err.message}). Keeping registration links from the last successful run.`);
    for (const r of active) {
      const prev = (saved.get(r.year) || []).find((p) => p.uid === r.uid);
      if (prev && prev.registration && !r.registration) {
        Object.assign(r, { registration: prev.registration, matchedBy: prev.matchedBy, bikeregUrl: prev.bikeregUrl || '', logo: prev.logo || '' });
      }
    }
  }
}

// Save snapshots (only when the calendar was read successfully).
if (live) {
  for (const [y, rs] of seasons) {
    if (y < thisYear && saved.has(y)) continue;
    await writeFile(join(seasonDir, `${y}.json`), JSON.stringify(rs, null, 2) + '\n');
  }
}
// Monthly heartbeat: a small file that changes once a month so the scheduled
// workflow always has a commit to make (GitHub pauses schedules after 60 quiet days).
if (!process.env.DATA_DIR) await writeFile(join(root, 'data/heartbeat.txt'), `Last monthly check: ${today.slice(0, 7)}\n`);

// ---------- 4. Render ----------
const all = [...seasons.values()].flat().sort((a, b) => a.start.localeCompare(b.start));
const upcoming = all.filter((r) => r.end >= today);
const seasonYears = [...seasons.keys()].filter((y) => seasons.get(y).length).sort();
const assetVersion = Date.now().toString(36);
const R = makeRenderer({ site, base, siteUrl, today, assetVersion });

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(root, 'public'), dist, { recursive: true });
await cp(join(root, 'src/styles.css'), join(dist, 'styles.css'));

const pages = [];
const page = async (path, html, { sitemap = true } = {}) => {
  const file = path.endsWith('.html') ? join(dist, path) : join(dist, path, 'index.html');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html);
  if (sitemap) pages.push(path);
};

await page('/', R.home({ upcoming }));
await page('/calendar/', R.calendar({ upcoming, seasons: seasonYears }));
for (const y of seasonYears) if (y < thisYear) await page(`/calendar/${y}/`, R.season({ year: y, races: seasons.get(y), seasons: seasonYears }));
for (const r of all) await page(r.path, R.race(r));
await page('/about/', R.about({ about, board, documents }));
await page('/promoters/', R.promoters({ p: promoters }));
await page('/404.html', R.notFound(), { sitemap: false });
for (const [from, to] of Object.entries(redirects)) await page(from, R.redirect(to), { sitemap: false });

// ---------- 5. Machine-readable files ----------
const abs = (p) => `${siteUrl}${p}`;
await writeFile(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `<url><loc>${abs(p)}</loc></url>`).join('\n')}
</urlset>
`);
// Note: crawlers only read robots.txt at the root of a domain. It takes effect once the site has its own domain.
await writeFile(join(dist, 'robots.txt'), `# Search engines and AI assistants are welcome.
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

Sitemap: ${abs('/sitemap.xml')}
`);
const racesJson = upcoming.map((r) => ({
  name: r.title, discipline: r.kind, start_date: r.start, end_date: r.end, location: r.location || r.city,
  cancelled: r.cancelled, usac_permit: r.permit || null, registration_url: r.registration || null, url: abs(r.path),
}));
await writeFile(join(dist, 'races.json'), JSON.stringify({ updated: new Date().toISOString(), source: site.name, races: racesJson }, null, 2));
await writeFile(join(dist, 'llms.txt'), `# ${site.name} (${site.short_name})

> ${site.description}

IBRA is the USA Cycling Local Association for Iowa. Most races have dates but no start times; times are on each event's registration page. Official results are published by USA Cycling, not on this site.

## Key pages
- [Race calendar](${abs('/calendar/')}): upcoming sanctioned races in Iowa
- [Races as JSON](${abs('/races.json')}): machine-readable list of upcoming races, updated several times a day
- [Results](${site.results_url}): official Iowa results on USA Cycling
- [For promoters](${abs('/promoters/')}): how to put on a race in Iowa
- [About](${abs('/about/')}): board members, terms, budget documents

## Upcoming races
${upcoming.slice(0, 50).map((r) => `- [${r.title}](${abs(r.path)}): ${r.kind}, ${rangeText(r.start, r.end)}${r.city ? ', ' + r.city : ''}${r.cancelled ? ' (CANCELLED)' : ''}`).join('\n') || '- None on the calendar yet.'}

## Contact
${site.email}
`);
await writeFile(join(dist, '.nojekyll'), '');

// ---------- 6. Report for the board ----------
const report = [];
if (problems.length) report.push('## Calendar and BikeReg disagree\n', ...problems.map((p) => `- ${p}`), '');
if (warnings.length) report.push('## Build warnings\n', ...warnings.map((w) => `- ${w}`), '');
await mkdir(join(root, '.cache'), { recursive: true });
await writeFile(join(root, '.cache/sync-report.md'), report.join('\n'));
log(`Built ${pages.length} pages into dist/ (${upcoming.length} upcoming races, seasons: ${seasonYears.join(', ') || 'none'})`);
if (report.length) log('See .cache/sync-report.md');
