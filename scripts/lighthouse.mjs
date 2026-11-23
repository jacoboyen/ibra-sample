#!/usr/bin/env node
// Lighthouse performance check of the live site.
//
//   node scripts/lighthouse.mjs [site URL]     default http://localhost:8080/ (npm run serve)
//
// Runs the home page and the calendar on mobile (Lighthouse's default throttled phone) and
// desktop, 3 times each, and reports the median run, since single runs vary by several points.
// Writes .cache/lighthouse-report.md. Always exits 0: this reports, it doesn't gate.
//
// Not needed to build the site. Install only to run this check:
//   npm install --no-save --no-package-lock lighthouse@13.6.0
// Lighthouse needs Chrome or Chromium; set CHROME_PATH if it can't find one.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const run = promisify(execFile);
const bin = join('node_modules', '.bin', 'lighthouse');
if (!existsSync(bin)) {
  console.error('Missing Lighthouse. Run: npm install --no-save --no-package-lock lighthouse@13.6.0');
  process.exit(2);
}

const base = new URL((process.argv[2] || process.env.LIGHTHOUSE_URL || 'http://localhost:8080/').replace(/\/?$/, '/'));
const RUNS = Number(process.env.LIGHTHOUSE_RUNS || 3);
const PAGES = [['Home', base.href], ['Calendar', new URL('calendar/', base).href]];
const DEVICES = [['Mobile', []], ['Desktop', ['--preset=desktop']]];
const tmp = join('.cache', 'lighthouse');
await mkdir(tmp, { recursive: true });

async function lighthouse(url, extra, i) {
  const out = join(tmp, `run-${i}.json`);
  await run(bin, [
    url, ...extra,
    '--only-categories=performance', '--output=json', `--output-path=${out}`, '--quiet',
    '--chrome-flags=--headless=new --no-sandbox --disable-gpu',
  ], { maxBuffer: 64 * 1024 * 1024, timeout: 180_000 });
  const lhr = JSON.parse(await readFile(out, 'utf8'));
  const a = (id) => lhr.audits[id] || {};
  return {
    score: Math.round((lhr.categories.performance.score ?? 0) * 100),
    fcp: a('first-contentful-paint').numericValue,
    lcp: a('largest-contentful-paint').numericValue,
    tbt: a('total-blocking-time').numericValue,
    cls: a('cumulative-layout-shift').numericValue,
    si: a('speed-index').numericValue,
    weight: a('total-byte-weight').numericValue,
    opportunities: Object.values(lhr.audits)
      .filter((x) => x.details?.type === 'opportunity' && (x.details.overallSavingsMs || 0) >= 100)
      .sort((x, y) => y.details.overallSavingsMs - x.details.overallSavingsMs)
      .slice(0, 3)
      .map((x) => `${x.title} (≈${(x.details.overallSavingsMs / 1000).toFixed(1)} s)`),
  };
}

const rows = [];
let n = 0;
for (const [page, url] of PAGES) {
  for (const [device, extra] of DEVICES) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      try { runs.push(await lighthouse(url, extra, n++)); } catch (err) { console.error(`! ${page} ${device} run ${i + 1} failed: ${err.message.split('\n')[0]}`); }
    }
    runs.sort((a, b) => a.score - b.score);
    const median = runs[Math.floor(runs.length / 2)];
    rows.push({ page, device, url, median, runs: runs.map((r) => r.score) });
    console.log(`• ${page} (${device}): ${median ? `${median.score} (runs: ${runs.map((r) => r.score).join(', ')})` : 'failed'}`);
  }
}
await rm(tmp, { recursive: true, force: true });

// ---------- report ----------
// Thresholds are Lighthouse's own "good" limits (mobile): LCP 2.5 s, TBT 200 ms, CLS 0.1, FCP 1.8 s.
const s = (ms) => (ms == null ? '–' : `${(ms / 1000).toFixed(1)} s`);
const ms = (v) => (v == null ? '–' : `${Math.round(v)} ms`);
const grade = (score) => (score >= 90 ? 'Good' : score >= 50 ? 'Needs work' : 'Poor');
const kb = (b) => (b == null ? '–' : `${Math.round(b / 1024)} KB`);

let md = `## Lighthouse performance\n\n${base.href} · ${RUNS === 1 ? '1 run' : `median of ${RUNS} runs`} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC\n\n`;
md += '| Page | Device | Score | LCP | FCP | TBT | CLS | Speed Index | Page weight |\n|---|---|---|---|---|---|---|---|---|\n';
for (const r of rows) {
  const m = r.median;
  md += m
    ? `| [${r.page}](${r.url}) | ${r.device} | **${m.score}** ${grade(m.score)} | ${s(m.lcp)} | ${s(m.fcp)} | ${ms(m.tbt)} | ${m.cls?.toFixed(3) ?? '–'} | ${s(m.si)} | ${kb(m.weight)} |\n`
    : `| [${r.page}](${r.url}) | ${r.device} | failed | | | | | | |\n`;
}
const ideas = [...new Set(rows.flatMap((r) => (r.median?.opportunities || []).map((o) => `${r.page} (${r.device}): ${o}`)))];
md += ideas.length ? `\n**Biggest savings Lighthouse suggests**\n\n${ideas.map((i) => `- ${i}`).join('\n')}\n` : '\nNo improvement worth 0.1 s or more was suggested.\n';
md += `\nScores per run: ${rows.map((r) => `${r.page} ${r.device.toLowerCase()} ${r.runs.join('/')}`).join(' · ')}. Mobile uses Lighthouse's throttled mid-range phone on a slow 4G connection, so it scores lower than desktop.\n`;

await mkdir('.cache', { recursive: true });
await writeFile('.cache/lighthouse-report.md', md);
