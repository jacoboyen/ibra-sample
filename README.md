# Iowa Bicycle Racing Association website

Static site for IBRA, the USA Cycling Local Association for Iowa. It's hosted on GitHub Pages and rebuilds itself every 3 hours.

**Board members updating content: see [docs/EDITING.md](docs/EDITING.md).**

## How it works

| Data | Source | Edited in |
|---|---|---|
| Races | IBRA Google Calendar (public iCal feed) | Google Calendar |
| Registration links | BikeReg event search, matched by USAC permit number | BikeReg (by promoters) |
| Board, documents, page text | `content/*.json` | Pages CMS |
| Results | USA Cycling (linked, not copied) | n/a |

`scripts/build.mjs` reads all of it and writes plain HTML to `dist/`. It has **no npm dependencies**: Node 20+ is the only requirement.

GitHub Actions (`.github/workflows/deploy.yml`) runs the build on every push, every 3 hours, and on demand. Each run also:

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
```

## Known assumptions to check after the first live run

- **BikeReg endpoint and fields.** BikeReg documents the query parameters but not the endpoint address or the response fields. The code uses `https://www.bikereg.com/api/search` (override with the `BIKEREG_ENDPOINT` environment variable) and reads fields tolerantly. If the first Actions run warns that the BikeReg lookup failed, the site still builds; registration links then come only from BikeReg URLs pasted into calendar descriptions.
- **Permit matching** needs the permit number in the calendar description (`Permit: 2027-1234`) and in BikeReg. Without it, the build falls back to matching the same start date plus a similar name.

## SEO and AI crawlers

Every page has a title, description, canonical URL and Open Graph tags. Race pages include `SportsEvent` structured data (dates, location, registration offer, cancelled status), and the site publishes `sitemap.xml`, `robots.txt` (AI crawlers explicitly allowed), `llms.txt` and `races.json`. All content is plain HTML with no client-side rendering, so crawlers that don't run JavaScript see everything.
