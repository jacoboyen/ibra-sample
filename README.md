# Iowa Bicycle Racing Association website

Static site for IBRA, the USA Cycling Local Association for Iowa. It's hosted on GitHub Pages and rebuilds itself daily.

**Board members updating content: see [docs/EDITING.md](docs/EDITING.md).**

## How it works

| Data | Source | Edited in |
|---|---|---|
| Races | IBRA Google Calendar (public iCal feed) | Google Calendar |
| Registration links | BikeReg event search, matched by USAC permit number | BikeReg (by promoters) |
| Board, documents, page text | `content/*.json` | Pages CMS |
| Results | USA Cycling (linked, not copied) | n/a |

`scripts/build.mjs` reads all of it and writes plain HTML to `dist/`. It has **no npm dependencies**: Node 20+ is the only requirement.

GitHub Actions (`.github/workflows/deploy.yml`) runs the build on every push, daily at 10:17 UTC (early morning in Iowa), and on demand. Each run also:

- saves each season to `data/seasons/YYYY.json`, so past seasons survive even if old events are deleted from Google Calendar (past seasons are frozen once the year ends);
- updates `data/heartbeat.txt` once a month, so GitHub never pauses the schedule for inactivity;
- opens or updates a `calendar-sync` issue if the calendar and BikeReg disagree on a date.

Each calendar event gets a page at `/races/YYYY/slug/` automatically. Nobody creates or maintains these pages.

## One-time setup

1. **Settings → Pages → Source: GitHub Actions.**
2. **Settings → Actions → General → Workflow permissions: Read and write.**
3. Push to `main` (or run the workflow from the Actions tab).
4. Pages CMS: go to https://app.pagescms.org, sign in with GitHub, and add this repository. Give board members access by adding them as repository collaborators.
5. Optional custom domain: add it under Settings → Pages, then set a repository variable `SITE_URL` (e.g. `https://www.iowabicycleracing.org`) so canonical links, the sitemap and structured data use it. `robots.txt` only takes effect at a domain root, so a custom domain is recommended for SEO.

## Local development

```bash
npm test               # parser and matching tests
npm run build:sample   # build from test fixtures (no network needed)
npm run build          # build from the live Google Calendar and BikeReg
npm run serve          # preview dist/ at http://localhost:8080
npm run test:a11y      # WCAG 2.2 AA check of the running preview (see Accessibility)
npm run test:perf      # Lighthouse performance check of the running preview (see Performance)
```

## Known assumptions to check after the first live run

- **BikeReg** (checked Nov 2026): `https://www.bikereg.com/api/search?states=IA&year=YYYY` returns JSON with `EventId`, `EventName`, `EventDate`, `EventPermalink` and `Permit`. About half of Iowa events carry a permit. BikeReg formats it as `15418` or `<id>:15418`, so matching uses the trailing number: `Permit: 2027-15418` in the calendar matches either. The public `/events` page is behind a Cloudflare bot check and can't be used. Override the endpoint with `BIKEREG_ENDPOINT` if it ever moves.
- **Permit matching** needs the permit number in the calendar description and in BikeReg. Without it, the build falls back to matching the same start date plus a similar name.

## Accessibility

After a merged pull request is deployed, the `accessibility` job checks the live site against WCAG 2.2 AA with [axe-core](https://github.com/dequelabs/axe-core). It tests one page of each kind (home, calendar, a past season, an upcoming and a past race, about, promoters, 404) at desktop and phone widths. If anything fails, it opens or updates an issue labelled `accessibility`, and closes the issue once the check passes. It never blocks a deploy.

To run it locally (the test tools aren't needed for the build, so they aren't in `package.json`):

```bash
npm install --no-save --no-package-lock playwright@1.63.0 axe-core@4.14.0
npx playwright install chromium
npm run build && npm run serve      # in one terminal
npm run test:a11y                   # in another
```

Automated checks catch roughly a third to half of WCAG problems. Keyboard use, screen-reader flow and wording still need a person to check now and then.

## Performance

After a merged pull request is deployed, the `lighthouse` job runs [Lighthouse](https://developer.chrome.com/docs/lighthouse) on the live home page and calendar, on mobile and desktop, and reports the median of 3 runs: score, LCP, FCP, TBT, CLS, Speed Index and page weight. Results are posted as a comment on that pull request and on the workflow run's summary page. The check reports scores and never blocks a deploy.

Both post-deploy checks run **only when a deploy comes from a merged pull request**. Daily scheduled runs, manual "Run workflow" runs and Pages CMS edits (which commit straight to `main`) skip them; the `merged-pr` job decides. To test the live site without a merge, run the scripts locally (see above) against the live URL.

To run it locally against `npm run serve`:

```bash
npm install --no-save --no-package-lock lighthouse@13.6.0
npm run test:perf
```

## SEO and AI crawlers

Every page has a title, description, canonical URL and Open Graph tags. Race pages include `SportsEvent` structured data (dates, location, registration offer, cancelled status), and the site publishes `sitemap.xml`, `robots.txt` (AI crawlers explicitly allowed), `llms.txt` and `races.json`. All content is plain HTML with no client-side rendering, so crawlers that don't run JavaScript see everything.
