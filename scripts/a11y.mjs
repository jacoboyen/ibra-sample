#!/usr/bin/env node
// WCAG 2.2 AA check with axe-core, run in a real browser (Playwright + Chromium).
//
//   node scripts/a11y.mjs [site URL]     default http://localhost:8080/ (npm run serve)
//
// Tests one page per template (home, calendar, a past season, an upcoming and a past race,
// about, promoters, 404) at desktop and phone widths. Writes .cache/a11y-report.md (empty
// when clean) and exits 1 if anything fails.
//
// These tools are NOT needed to build the site. Install them only to run this check:
//   npm install --no-save --no-package-lock playwright@1.63.0 axe-core@4.14.0
//   npx playwright install chromium
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
let chromium, axeSource;
try {
  ({ chromium } = require('playwright'));
  axeSource = require('axe-core').source;
} catch {
  console.error('Missing test tools. Run: npm install --no-save --no-package-lock playwright@1.63.0 axe-core@4.14.0');
  process.exit(2);
}

const base = new URL((process.argv[2] || process.env.A11Y_URL || 'http://localhost:8080/').replace(/\/?$/, '/'));
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const VIEWPORTS = [{ name: 'desktop', width: 1280, height: 900 }, { name: 'phone', width: 390, height: 844 }];

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

// ---------- pick one page per template by following the site's own links ----------
async function linksOn(url) {
  await page.goto(url, { waitUntil: 'load' });
  const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.href));
  return hrefs.filter((h) => h.startsWith(base.href)).map((h) => h.split('#')[0]);
}
const rel = (u) => '/' + u.slice(base.href.length);
const find = (list, re) => list.find((u) => re.test(rel(u)));

const home = base.href;
const fromHome = await linksOn(home);
const calendar = find(fromHome, /^\/calendar\/$/) || new URL('calendar/', base).href;
const fromCalendar = await linksOn(calendar);
const seasonPage = find(fromCalendar, /^\/calendar\/\d{4}\/$/);
const fromSeason = seasonPage ? await linksOn(seasonPage) : [];

const targets = [
  ['Home', home],
  ['Calendar', calendar],
  ['Past season', seasonPage],
  ['Upcoming race', find([...fromHome, ...fromCalendar], /^\/races\/\d{4}\//)],
  ['Past race', find(fromSeason, /^\/races\/\d{4}\//)],
  ['About', find(fromHome, /^\/about\/$/) || new URL('about/', base).href],
  ['Promoters', find(fromHome, /^\/promoters\/$/) || new URL('promoters/', base).href],
  ['404 page', new URL('404.html', base).href],
].filter(([, url]) => url);

// ---------- run axe ----------
const byRule = new Map();
let checked = 0;
for (const vp of VIEWPORTS) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  for (const [label, url] of targets) {
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(300); // let fonts settle; colour contrast depends on them
    await page.addScriptTag({ content: axeSource });
    const result = await page.evaluate((tags) => window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] }), TAGS);
    checked++;
    for (const v of result.violations) {
      if (!byRule.has(v.id)) byRule.set(v.id, { id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, wcag: v.tags.filter((t) => /^wcag\d{3,}$/.test(t)), pages: new Set(), nodes: new Map() });
      const r = byRule.get(v.id);
      r.pages.add(`${label} (${vp.name})`);
      for (const n of v.nodes) {
        const key = n.target.join(' ');
        if (!r.nodes.has(key)) r.nodes.set(key, { target: key, html: n.html, summary: n.failureSummary, page: rel(url) });
      }
    }
  }
}
await browser.close();

// ---------- report ----------
const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const rules = [...byRule.values()].sort((a, b) => order[a.impact] - order[b.impact]);
const sc = (t) => t.replace(/^wcag(\d)(\d)(\d+)$/, '$1.$2.$3');
const clip = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);

let md = '';
if (rules.length) {
  md += `## WCAG 2.2 AA check: ${rules.length} problem${rules.length === 1 ? '' : 's'}\n\n`;
  md += `Checked ${targets.length} page types at desktop and phone widths on ${base.href} with axe-core.\n\n`;
  md += '| Problem | Impact | WCAG | Elements |\n|---|---|---|---|\n';
  for (const r of rules) md += `| [${r.help}](${r.helpUrl}) | ${r.impact} | ${r.wcag.map(sc).join(', ')} | ${r.nodes.size} |\n`;
  for (const r of rules) {
    md += `\n### ${r.help} (\`${r.id}\`)\n\nSeen on: ${[...r.pages].join(', ')}\n\n`;
    for (const n of [...r.nodes.values()].slice(0, 5)) {
      md += `- \`${clip(n.target, 120)}\` on \`${n.page}\`\n  \`\`\`html\n  ${clip(n.html.replace(/\s+/g, ' '), 300)}\n  \`\`\`\n  ${clip(n.summary.replace(/\s+/g, ' '), 400)}\n`;
    }
    if (r.nodes.size > 5) md += `- …and ${r.nodes.size - 5} more\n`;
  }
  md += '\nThis issue updates on every build and closes itself when the check passes.\n';
}
await mkdir('.cache', { recursive: true });
await writeFile('.cache/a11y-report.md', md);

console.log(`• Accessibility: checked ${checked} page views (${targets.map(([l]) => l).join(', ')})`);
if (!rules.length) console.log('• WCAG 2.2 AA: no problems found');
for (const r of rules) console.log(`! ${r.impact.padEnd(8)} ${r.id}: ${r.help} (${r.nodes.size} element${r.nodes.size === 1 ? '' : 's'})`);
process.exit(rules.length ? 1 : 0);
