# Notes for working on this repo

- Zero-dependency static site. Do not add npm packages without a strong reason: the build must run on GitHub Actions with no install step, and board volunteers maintain it.
- Build: `npm run build:sample` (fixtures, offline) or `npm run build` (live). Tests: `npm test`. Preview: `npm run serve`. Accessibility: `npm run test:a11y` (WCAG 2.2 AA via axe-core; needs the test tools in README). Performance: `npm run test:perf` (Lighthouse). In CI both run only after a merged pull request is deployed (`merged-pr` job); Lighthouse comments on that PR.
- Code layout: `scripts/build.mjs` (pipeline), `scripts/lib/ics.mjs` (iCal parser), `events.mjs` (prefixes, permits, slugs), `bikereg.mjs` (fetch + matching), `render.mjs` (all HTML templates), `src/styles.css`.
- Content lives in `content/*.json` and is edited by non-technical people through Pages CMS (`.pages.yml`). If you add a content field, add it to `.pages.yml` too.
- `data/seasons/*.json` is written by the build and committed by the workflow. Past years are frozen. Don't hand-edit it unless you're fixing history on purpose.
- Every dynamic value in templates goes through `esc()`. Every internal link goes through `u()` so the GitHub Pages base path works.
- Brand: gray #63666A, gold #FFCD00 (from the logo), accent blue #8EB9FC only for focus rings and status. The IBRA logo only works on light backgrounds (the cyclist is a cut-out).
