// HTML templates. Plain template strings; every dynamic value goes through esc().
import { esc, monthName, monShort, dowShort, dayNum, rangeText, dowRange, yearOf } from './util.mjs';

export function makeRenderer({ site, base, siteUrl, today, assetVersion }) {
  const u = (p) => (/^https?:|^mailto:/.test(p) ? p : `${base}${p}`);
  const abs = (p) => `${siteUrl}${p}`;

  const nav = [
    ['Calendar', '/calendar/'],
    ['Results', site.results_url],
    ['Promoters', '/promoters/'],
    ['About', '/about/'],
  ];

  function header(current) {
    const links = nav
      .map(([label, href]) => `<a href="${esc(u(href))}"${current === href ? ' aria-current="page"' : ''}>${label}</a>`)
      .join('\n');
    return `<header class="site-header"><div class="wrap">
<a class="logo" href="${u('/')}"><img src="${u('/images/ibra-logo.svg')}" alt="${esc(site.name)}, home" width="166" height="64"></a>
<nav class="main-nav" aria-label="Main">
${links}
<a class="btn-gold" href="${esc(site.start_racing_url)}">Start racing</a>
</nav>
</div></header>`;
  }

  function footer() {
    return `<footer class="site-footer"><div class="wrap">
<div class="footer-left">
<a href="${u('/')}"><img src="${u('/images/ibra-logo.svg')}" alt="${esc(site.name)}, home" width="187" height="72" loading="lazy"></a>
<div class="footer-contact">
<a href="mailto:${esc(site.email)}"><strong>${esc(site.email)}</strong></a>
${site.facebook ? `<a href="${esc(site.facebook)}">Facebook</a>` : ''}
<span class="copy">© ${yearOf(today)} ${esc(site.name)}</span>
</div>
</div>
<a class="usac" href="https://usacycling.org"><img src="${u('/images/usac-logo.png')}" alt="USA Cycling" width="60" height="80" loading="lazy"></a>
</div></footer>`;
  }

  function layout({ title, description, path, body, current, jsonld = [], ogImage, noindex = false }) {
    const fullTitle = path === '/' ? `${site.name} (${site.short_name})` : `${title} | ${site.short_name}`;
    const img = ogImage || abs('/images/og-default.png');
    const ld = jsonld.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n');
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(abs(path))}">
${noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(abs(path))}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#63666A">
<link rel="icon" href="${u('/favicon.ico')}" sizes="32x32">
<link rel="icon" href="${u('/favicon.svg')}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${u('/apple-touch-icon.png')}">
<link rel="alternate" type="application/json" href="${u('/races.json')}" title="IBRA races (JSON)">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${u('/styles.css')}?v=${assetVersion}">
${ld}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${header(current)}
<main id="main">
${body}
</main>
${footer()}
</body>
</html>
`;
  }

  // ---------- pieces ----------
  function dateBlock(ymd, withMonth = false) {
    return `<span class="date"><span class="dow">${dowShort(ymd).toUpperCase()}</span><span class="day">${dayNum(ymd)}</span>${
      withMonth ? `<span class="mon">${monShort(ymd).toUpperCase()}</span>` : ''
    }</span>`;
  }
  function dates(r, withMonth = false) {
    const crossMonth = r.start.slice(0, 7) !== r.end.slice(0, 7);
    if (r.start === r.end) return `<span class="dates" aria-hidden="true">${dateBlock(r.start, withMonth)}</span>`;
    return `<span class="dates" aria-hidden="true">${dateBlock(r.start, withMonth || crossMonth)}<span class="dash">–</span>${dateBlock(r.end, withMonth || crossMonth)}</span>`;
  }
  const meta = (r) => [r.city, r.days > 1 ? `${r.days} days` : '1 day'].filter(Boolean).join(' · ');
  const isPast = (r) => r.end < today;

  function eventRow(r, { past = false } = {}) {
    let side = '';
    if (r.cancelled) side = `<span class="pill pill-cancel">Cancelled</span>`;
    else if (past || isPast(r)) side = `<a href="${esc(site.results_url)}">Results ↗</a>`;
    else if (r.registration) side = `<a href="${esc(r.registration)}" aria-label="Register for ${esc(r.title)} on BikeReg">Register ↗</a>`;
    return `<div class="event${r.cancelled ? ' is-cancelled' : ''}" data-kind="${esc(r.kind)}">
${dates(r)}
<div class="event-body">
<a class="event-title" href="${u(r.path)}">${esc(r.title)}</a>
<div class="event-meta"><span class="sr-date">${esc(rangeText(r.start, r.end))}</span>${meta(r) ? ' · ' + esc(meta(r)) : ''}</div>
</div>
<span class="pill">${esc(r.kind)}</span>
<div class="event-side">${side}</div>
</div>`;
  }

  function monthGroups(races, opts) {
    const groups = [];
    for (const r of races) {
      const key = r.start.slice(0, 7);
      let g = groups[groups.length - 1];
      if (!g || g.key !== key) groups.push((g = { key, label: `${monthName(r.start)} ${yearOf(r.start)}`, races: [] }));
      g.races.push(r);
    }
    return groups
      .map((g) => `<section class="month" data-month>
<h2 class="display">${esc(g.label)}</h2>
${g.races.map((r) => eventRow(r, opts)).join('\n')}
</section>`)
      .join('\n');
  }

  function filterBar(races) {
    const kinds = [...new Set(races.map((r) => r.kind))];
    const order = site.disciplines.map((d) => d.label).concat('Other');
    kinds.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    if (kinds.length < 2) return '';
    return `<div class="filters" role="group" aria-label="Filter by discipline" data-filters hidden>
<button type="button" data-value="all" aria-pressed="true">All</button>
${kinds.map((k) => `<button type="button" data-value="${esc(k)}" aria-pressed="false">${esc(k)}</button>`).join('\n')}
</div>`;
  }

  // ---------- structured data ----------
  const orgLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsOrganization',
    '@id': abs('/#org'),
    name: site.name,
    alternateName: site.short_name,
    url: abs('/'),
    logo: abs('/images/ibra-logo.svg'),
    email: site.email,
    sport: 'Cycling',
    areaServed: { '@type': 'State', name: 'Iowa' },
    memberOf: { '@type': 'SportsOrganization', name: 'USA Cycling', url: 'https://usacycling.org' },
    sameAs: [site.facebook].filter(Boolean),
  };

  function eventLd(r) {
    const o = {
      '@context': 'https://schema.org',
      '@type': 'SportsEvent',
      name: r.title,
      sport: r.kind === 'Other' ? 'Cycling' : `Cycling (${r.kind})`,
      startDate: r.start,
      endDate: r.end,
      eventStatus: r.cancelled ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      url: abs(r.path),
      image: [abs('/images/og-default.png')],
      description: (r.description || `${r.kind} bicycle race in ${r.city || 'Iowa'}.`).slice(0, 500),
      organizer: { '@type': 'Organization', name: site.name, url: abs('/') },
    };
    if (r.location) {
      o.location = { '@type': 'Place', name: r.city || r.location, address: { '@type': 'PostalAddress', streetAddress: r.location, addressRegion: 'IA', addressCountry: 'US' } };
    } else {
      o.location = { '@type': 'Place', name: 'Iowa', address: { '@type': 'PostalAddress', addressRegion: 'IA', addressCountry: 'US' } };
    }
    if (r.registration) o.offers = { '@type': 'Offer', url: r.registration, availability: 'https://schema.org/InStock' };
    return o;
  }

  // ---------- pages ----------
  function home({ upcoming }) {
    const next = upcoming[0];
    const nextCard = next
      ? `<div class="next-card">
<p class="label">Next race</p>
<div class="row">
${dates(next, true)}
<div><p class="title"><a href="${u(next.path)}">${esc(next.title)}</a></p>
<p class="meta">${esc(rangeText(next.start, next.end))}${next.city ? ' · ' + esc(next.city) : ''}</p></div>
</div>
<p style="margin:20px 0 0"><a href="${u('/calendar/')}"><strong>Full calendar →</strong></a></p>
</div>`
      : `<div class="next-card"><p class="label">Next race</p><p class="meta">The next season's races will appear here as soon as they're on the calendar.</p></div>`;

    const list = upcoming.slice(0, 5);
    const body = `<section class="hero"><div class="wrap">
<div class="hero-main">
<p class="eyebrow">USA Cycling Local Association for Iowa</p>
<h1 class="display">${esc(site.hero_title)}</h1>
<p class="lede">${esc(site.hero_text)}</p>
<div class="actions">
<a class="btn btn-gold" href="${u('/calendar/')}">See the race calendar</a>
<a class="btn btn-ghost-light" href="${esc(site.results_url)}">Race results</a>
</div>
</div>
${nextCard}
</div></section>

<section class="wrap section">
<div class="section-head"><h2 class="display">Upcoming races</h2><a href="${u('/calendar/')}"><strong>View all →</strong></a></div>
<div class="event-list">
${list.length ? list.map((r) => eventRow(r)).join('\n') : '<p class="empty">No upcoming races are on the calendar yet.</p>'}
</div>
</section>

<section class="wrap section">
<div class="callout">
<div><h2 class="display">Race results</h2><p>Official results for every Iowa event are published by USA Cycling. Search by race, rider or team.</p></div>
<a class="btn btn-dark" href="${esc(site.results_url)}">Iowa results on USA Cycling ↗</a>
</div>
</section>

<section class="wrap section">
<div class="cards">
<a class="card" href="${esc(site.start_racing_url)}">
<svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#63666A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17" r="3.5"/><circle cx="18.5" cy="17" r="3.5"/><path d="M15 6h2l3 11M5.5 17 9 9h7l-4.5 8H5.5M9 9 8 6H6"/></svg>
<h3>New to racing?</h3><p>Get a USA Cycling license and find your first race.</p></a>
<a class="card" href="${u('/promoters/')}">
<svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#63666A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>
<h3>Put on a race</h3><p>Date requests, permits and promoter support.</p></a>
<a class="card" href="${u('/about/')}">
<svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#63666A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>
<h3>Board &amp; budget</h3><p>Who runs IBRA, meeting minutes and financial reports.</p></a>
</div>
</section>`;
    const itemList = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Upcoming Iowa bicycle races',
      itemListElement: list.map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(r.path), name: r.title })),
    };
    return layout({ title: site.name, description: site.description, path: '/', body, current: '/', jsonld: [orgLd, { '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: abs('/') }, itemList] });
  }

  function subscribeLinks() {
    const webcal = site.calendar_ics.replace(/^https:/, 'webcal:');
    const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(site.calendar_id)}`;
    return `<a class="btn btn-dark" href="${esc(google)}">Add to Google Calendar</a>
<a class="btn btn-ghost" href="${esc(webcal)}">Apple / Outlook</a>`;
  }

  function calendar({ upcoming, seasons }) {
    const pastSeasons = seasons.filter((y) => y < yearOf(today)).sort((a, b) => b - a);
    const body = `<section class="band"><div class="wrap">
<div class="section-head" style="margin:0">
<div>
<h1 class="display">Race calendar</h1>
<p class="lede">Every USA Cycling sanctioned race in Iowa. Start times are set by each promoter; check the event's registration page.</p>
</div>
<div class="actions" style="margin:0">${subscribeLinks()}</div>
</div>
${filterBar(upcoming)}
</div></section>
<div class="wrap">
${upcoming.length ? monthGroups(upcoming) : '<p class="empty">No upcoming races are on the calendar yet. Check back soon.</p>'}
<p class="empty" data-empty-filter hidden>No upcoming races in this discipline.</p>
<section class="section">
<h2 class="display" style="font-size:34px">Past seasons</h2>
${pastSeasons.length ? `<p class="subnav">${pastSeasons.map((y) => `<a href="${u(`/calendar/${y}/`)}">${y}</a>`).join(' ')}</p>` : '<p class="small">Past seasons will be listed here.</p>'}
<p class="small">Missing a race? <a href="${u('/promoters/')}">Request a date</a>.</p>
</section>
</div>
<script src="${u('/filters.js')}?v=${assetVersion}" defer></script>`;
    return layout({ title: 'Iowa bike race calendar', description: `Upcoming USA Cycling sanctioned bicycle races in Iowa: road, criterium, gravel, cyclocross, mountain bike and track.`, path: '/calendar/', body, current: '/calendar/' });
  }

  function season({ year, races, seasons }) {
    const others = seasons.filter((y) => y !== year).sort((a, b) => b - a);
    const body = `<section class="band"><div class="wrap">
<p class="breadcrumb"><a href="${u('/calendar/')}">Calendar</a> / ${year}</p>
<h1 class="display">${year} season</h1>
<p class="lede">${races.length} race${races.length === 1 ? '' : 's'} on the ${year} Iowa calendar.</p>
${filterBar(races)}
</div></section>
<div class="wrap">
${monthGroups(races)}
<p class="empty" data-empty-filter hidden>No races in this discipline.</p>
${others.length ? `<section class="section"><h2 class="display" style="font-size:34px">Other seasons</h2><p class="subnav">${others.map((y) => `<a href="${u(y >= yearOf(today) ? '/calendar/' : `/calendar/${y}/`)}">${y}</a>`).join(' ')}</p></section>` : ''}
</div>
<script src="${u('/filters.js')}?v=${assetVersion}" defer></script>`;
    return layout({ title: `${year} Iowa bike race calendar`, description: `All ${races.length} sanctioned bicycle races on the ${year} Iowa calendar.`, path: `/calendar/${year}/`, body, current: '/calendar/' });
  }

  function race(r) {
    const past = isPast(r);
    const facts = [
      ['When', rangeText(r.start, r.end)],
      ['Where', r.location || r.city],
      ['Discipline', r.kind],
      ['USAC permit', r.permit],
    ].filter(([, v]) => v);
    const mapLink = r.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.location)}` : '';
    const body = `<section class="band"><div class="wrap">
<p class="breadcrumb"><a href="${u('/calendar/')}">Calendar</a> / <a href="${u(r.year >= yearOf(today) ? '/calendar/' : `/calendar/${r.year}/`)}">${r.year}</a></p>
<div class="race-head">
<div class="main">
<p style="margin:0 0 16px;display:flex;gap:8px;flex-wrap:wrap"><span class="pill">${esc(r.kind)}</span>${r.cancelled ? '<span class="pill pill-cancel">Cancelled</span>' : ''}</p>
<h1 class="display">${esc(r.title)}</h1>
<p class="lede">${esc(dowRange(r.start, r.end))}, ${esc(rangeText(r.start, r.end))}${r.city ? ' · ' + esc(r.city) : ''}</p>
<div class="actions">
${!past && !r.cancelled && r.registration ? `<a class="btn btn-dark" href="${esc(r.registration)}">Register on BikeReg ↗</a>` : ''}
${past ? `<a class="btn btn-dark" href="${esc(site.results_url)}">Results on USA Cycling ↗</a>` : ''}
${r.website ? `<a class="btn btn-ghost" href="${esc(r.website)}">Event website ↗</a>` : ''}
</div>
</div>
<div class="facts">
${dates(r, true)}
<dl>${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
${mapLink ? `<p style="margin:16px 0 0"><a href="${esc(mapLink)}">Open in Maps ↗</a></p>` : ''}
</div>
</div>
</div></section>
${r.description ? `<section class="wrap section"><h2 class="display" style="font-size:36px;margin-bottom:12px">Event details</h2><div class="prose">${esc(r.description)}</div></section>` : ''}
<section class="source-note" style="margin-top:56px"><div class="wrap">This page is built automatically from the IBRA race calendar${r.matchedBy ? ' and BikeReg' : ''}. To change it, update your BikeReg event or <a href="mailto:${esc(site.email)}">email IBRA</a>.</div></section>`;
    const desc = `${r.title}: ${r.kind === 'Other' ? 'bicycle race' : r.kind.toLowerCase() + ' race'} on ${rangeText(r.start, r.end)}${r.city ? ' in ' + r.city : ' in Iowa'}.${r.registration && !past ? ' Register on BikeReg.' : ''}`;
    const crumbs = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Calendar', item: abs('/calendar/') },
        { '@type': 'ListItem', position: 2, name: r.title, item: abs(r.path) },
      ],
    };
    return layout({ title: r.title, description: desc, path: r.path, body, current: '/calendar/', jsonld: [eventLd(r), crumbs] });
  }

  function about({ about, board, documents }) {
    const members = board.members || [];
    const term = (m) => (m.term_start && m.term_end ? `${m.term_start}–${m.term_end}` : m.term_end ? `Through ${m.term_end}` : 'To be confirmed');
    const docs = [...(documents.documents || [])].sort((a, b) => String(b.year).localeCompare(String(a.year)));
    const docRows = docs
      .map((d) => `<tr><td><strong>${esc(d.year)}</strong></td><td>${esc(d.title)}</td><td>${esc(d.type || '')}</td><td>${esc(d.approved || '')}</td><td class="r">${d.file ? `<a href="${esc(u(d.file))}"><strong>Download</strong></a>` : ''}</td></tr>`)
      .join('\n');
    const body = `<section class="band"><div class="wrap">
<h1 class="display">About IBRA</h1>
<p class="lede">${esc(about.intro)}</p>
<nav class="subnav" aria-label="On this page"><a href="#board">Board</a><a href="#documents">Budget &amp; documents</a><a href="#contact">Contact</a></nav>
</div></section>

<section class="wrap section" id="board">
<div class="section-head"><h2 class="display">Board of directors</h2>${board.next_election ? `<p class="small" style="margin:0">Next election: ${esc(board.next_election)}</p>` : ''}</div>
<div class="board">
${members.map((m) => `<div class="member"><div class="role">${esc(m.role)}</div><div class="name">${esc(m.name)}</div>${m.affiliation ? `<div class="small">${esc(m.affiliation)}</div>` : ''}<div class="term"><span>Term</span><span><strong>${esc(term(m))}</strong></span></div></div>`).join('\n')}
</div>
</section>

<section class="wrap section" id="documents">
<h2 class="display" style="margin-bottom:8px">Budget &amp; documents</h2>
<p style="margin:0 0 24px;color:var(--text-2)">${esc(about.budget_intro)}</p>
${docs.length ? `<div class="table-wrap"><table><thead><tr><th scope="col">Year</th><th scope="col">Document</th><th scope="col">Type</th><th scope="col">Approved</th><th scope="col" class="r">File</th></tr></thead><tbody>${docRows}</tbody></table></div>` : '<p class="empty">Documents will be posted here.</p>'}
</section>

<section class="wrap section" id="contact">
<div class="callout"><div><h2 class="display">Contact the board</h2><p>Questions about racing in Iowa, the board or the budget.</p></div><a class="btn btn-dark" href="mailto:${esc(site.email)}">${esc(site.email)}</a></div>
</section>`;
    return layout({ title: 'About IBRA: board and budget', description: `Who runs the ${site.name}: board members, terms, budgets and financial reports.`, path: '/about/', body, current: '/about/', jsonld: [orgLd] });
  }

  function promoters({ p }) {
    const body = `<section class="hero"><div class="wrap">
<div class="hero-main">
<h1 class="display">Put on a race<br>in Iowa.</h1>
<p class="lede">${esc(p.intro)}</p>
${p.fee_note ? `<p class="fee">${esc(p.fee_note)}</p>` : ''}
</div>
<div class="contact-card">
<p class="label">Promoter contact</p>
<p style="margin:0 0 4px;font-size:22px;font-weight:700">IBRA Board</p>
<a href="mailto:${esc(site.email)}" style="font-size:17px;font-weight:600">${esc(site.email)}</a>
${p.response_time ? `<p class="small" style="margin:14px 0 0">${esc(p.response_time)}</p>` : ''}
<p style="margin:20px 0 0"><a class="btn btn-gold" href="mailto:${esc(site.email)}?subject=${encodeURIComponent('Race date request')}">Request a race date</a></p>
</div>
</div></section>

<section class="wrap section">
<h2 class="display" style="margin-bottom:28px">How it works</h2>
<div class="steps">
${(p.steps || []).map((s, i) => `<div class="step"><div class="n">${String(i + 1).padStart(2, '0')}</div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>`).join('\n')}
</div>
</section>

<section class="wrap section">
<h2 class="display" style="margin-bottom:12px">Getting your race on the calendar</h2>
<p style="margin:0 0 8px;color:var(--text-2);max-width:760px">The IBRA calendar is the official list of Iowa races. Once your date is set, the board adds it. Make sure your BikeReg listing includes your USA Cycling permit number so the registration link appears here automatically.</p>
</section>

${(p.resources || []).length ? `<section class="wrap section">
<h2 class="display" style="margin-bottom:20px">Promoter resources</h2>
<div class="link-list" style="border-top:2px solid var(--gray)">
${p.resources.map((r) => `<a href="${esc(u(r.url))}"><span>${esc(r.title)}</span><span>${esc(r.note || '')}</span></a>`).join('\n')}
</div>
</section>` : ''}`;
    return layout({ title: 'Put on a bike race in Iowa', description: `How to promote a USA Cycling sanctioned bike race in Iowa: date requests, permits, officials and registration.`, path: '/promoters/', body, current: '/promoters/' });
  }

  function notFound() {
    const body = `<section class="band"><div class="wrap"><h1 class="display">Page not found</h1><p class="lede">That page doesn't exist. Try the <a href="${u('/calendar/')}">race calendar</a> or the <a href="${u('/')}">home page</a>.</p></div></section>`;
    return layout({ title: 'Page not found', description: 'Page not found.', path: '/404.html', body, noindex: true });
  }

  function redirect(to) {
    const target = u(to);
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Moved</title><meta http-equiv="refresh" content="0; url=${esc(target)}"><link rel="canonical" href="${esc(abs(to))}"><meta name="robots" content="noindex"></head><body><p>This page has moved to <a href="${esc(target)}">${esc(target)}</a>.</p></body></html>`;
  }

  return { home, calendar, season, race, about, promoters, notFound, redirect, eventLd };
}
